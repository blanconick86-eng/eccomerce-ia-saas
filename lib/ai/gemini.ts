import { GoogleGenAI } from "@google/genai";
import {
  ASSISTANT_TOPICS,
  classificationSchema,
  type AiTone,
  type AssistantTopic,
  type QueryClassification,
  type ResponseMode,
} from "@/lib/validation/ai";
import type { Message, Policy, Product } from "@/types/database";

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
export const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

const STOPWORDS = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "al",
  "en",
  "y",
  "o",
  "que",
  "como",
  "cual",
  "cuales",
  "para",
  "por",
  "con",
  "sin",
  "sobre",
  "hay",
  "tiene",
  "tienen",
  "esta",
  "estan",
  "hola",
  "buenas",
  "queria",
  "quiero",
  "saber",
  "cuanto",
  "cuesta",
  "sale",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "do",
  "does",
  "did",
  "for",
  "and",
  "or",
  "to",
  "in",
  "on",
  "of",
  "with",
  "you",
  "your",
  "my",
  "me",
  "hi",
  "hello",
  "what",
  "how",
  "much",
  "have",
  "can",
  "about",
]);

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable.");
  }
  return new GoogleGenAI({ apiKey });
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function extractKeywords(query: string): string[] {
  const normalized = normalizeText(query);
  const rawTokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const keywords = rawTokens.filter(
    (token) => token.length >= 2 && !STOPWORDS.has(token)
  );
  return Array.from(new Set(keywords));
}

export function retrieveRelevantProducts(
  products: Product[],
  query: string
): {
  products: Product[];
  matchedByKeywords: boolean;
} {
  if (products.length === 0) {
    return { products: [], matchedByKeywords: false };
  }

  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return {
      products: products.slice(0, 5),
      matchedByKeywords: false,
    };
  }

  const scored = products
    .map((product) => {
      const skuNorm = normalizeText(product.sku);
      const nameNorm = normalizeText(product.name);
      const categoryNorm = normalizeText(product.category ?? "");
      const descNorm = normalizeText(product.description ?? "");

      let score = 0;
      for (const kw of keywords) {
        if (skuNorm.includes(kw)) score += 4;
        if (nameNorm.includes(kw)) score += 3;
        if (categoryNorm.includes(kw)) score += 2;
        if (descNorm.includes(kw)) score += 1;
      }

      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      products: products.slice(0, 5),
      matchedByKeywords: false,
    };
  }

  return {
    products: scored.slice(0, 8).map((entry) => entry.product),
    matchedByKeywords: true,
  };
}

function formatProductsContext(products: Product[]): string {
  if (products.length === 0) {
    return "No products are currently registered in the store catalog.";
  }

  return products
    .map((p) => {
      const desc = p.description ? ` | description: ${p.description}` : "";
      const cat = p.category ? ` | category: ${p.category}` : "";
      return `- SKU: ${p.sku} | name: ${p.name} | price: ${p.price} ${p.currency} | stock_status: ${p.stock_status}${cat}${desc}`;
    })
    .join("\n");
}

function formatPoliciesContext(policies: Policy[]): string {
  if (policies.length === 0) {
    return "No store policies have been configured yet.";
  }

  return policies
    .map(
      (policy) =>
        `- [${policy.type}] (lang: ${policy.language}): ${policy.content}`
    )
    .join("\n");
}

function inferFallbackLanguage(
  message: string,
  storeLanguage?: string
): "es" | "en" {
  const lower = message.toLowerCase();
  if (/[áéíóúñ¿¡]/.test(lower)) return "es";
  if (/\b(the|what|how|shipping|return|refund|order|price|stock)\b/.test(lower)) {
    return "en";
  }
  return storeLanguage === "en" ? "en" : "es";
}

function stripJsonFences(text: string): string {
  const withoutFences = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return withoutFences.slice(firstBrace, lastBrace + 1);
  }

  return withoutFences;
}

export function formatGeminiErrorMessage(error: unknown): string {
  const rawMessage =
    error instanceof Error ? error.message : String(error ?? "Unknown error");

  const trimmed = rawMessage.trim();
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
        error?: { message?: string };
      };
      if (typeof parsed?.error?.message === "string" && parsed.error.message) {
        return parsed.error.message;
      }
    } catch {
      // Fall back to rawMessage when message is not JSON
    }
  }

  return trimmed || "Unknown Gemini API error";
}

export async function classifyCustomerQuery(params: {
  message: string;
  products: Product[];
  policies: Policy[];
  matchedByKeywords: boolean;
  storeLanguage?: string;
}): Promise<QueryClassification> {
  const { message, products, policies, matchedByKeywords, storeLanguage } =
    params;
  const fallbackLanguage = inferFallbackLanguage(message, storeLanguage);

  const ai = getGeminiClient();

  const classificationPrompt = [
    "Classify the customer support message for an e-commerce store and return JSON only.",
    "",
    "Allowed topic values:",
    "- products: product availability, price, specs, sizing, recommendations, catalog items",
    "- shipping: delivery times, shipping fees, coverage areas, tracking rules",
    "- returns: return window, exchange policy, return conditions",
    "- payments: accepted payment methods, currency, invoices",
    "- refund_execution: customer requesting an actual refund, chargeback, or money back on an existing order",
    "- order_changes: customer asking to cancel, edit address, modify items, or change an existing order",
    "- other: greetings, general questions, or topics outside the categories above",
    "",
    "Rules for booleans:",
    "- language: 'es' if the customer wrote in Spanish, 'en' if in English.",
    "- has_sufficient_info: true ONLY if the provided catalog products and/or policies contain enough verified facts to answer accurately without guessing; false if key product/policy information is missing or ambiguous.",
    "- requires_human: true if the customer wants refund_execution, order_changes, reports a damaged/missing order, expresses anger/complaint, asks for exceptions/discounts, or needs human verification; false otherwise.",
    "",
    `Keyword product match found: ${matchedByKeywords ? "yes" : "no (showing reference sample only)"}`,
    "",
    "Retrieved Store Products:",
    formatProductsContext(products),
    "",
    "Store Policies:",
    formatPoliciesContext(policies),
    "",
    `Customer message: """${message}"""`,
  ].join("\n");

  let responseText = "";
  try {
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: classificationPrompt,
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            topic: { type: "string", enum: [...ASSISTANT_TOPICS] },
            language: { type: "string", enum: ["es", "en"] },
            has_sufficient_info: { type: "boolean" },
            requires_human: { type: "boolean" },
          },
          required: [
            "topic",
            "language",
            "has_sufficient_info",
            "requires_human",
          ],
          additionalProperties: false,
        },
        systemInstruction:
          "You are a strict JSON classifier for e-commerce customer support triage. Never guess missing information.",
      },
    });
    responseText = response.text ?? "";
  } catch (apiError) {
    console.error("[Gemini Classifier] Gemini API error:", apiError);
    throw apiError;
  }

  try {
    const cleanedJson = stripJsonFences(responseText);
    const parsedJson: unknown = JSON.parse(cleanedJson);
    const validated = classificationSchema.safeParse(parsedJson);

    if (validated.success) {
      return validated.data;
    }

    console.error(
      "[Gemini Classifier] Classification schema validation failed:",
      validated.error.issues
    );
  } catch (parseError) {
    console.error("[Gemini Classifier] Failed to parse structured JSON:", {
      parseError,
      responseText,
    });
  }

  return {
    topic: "other",
    language: fallbackLanguage,
    has_sufficient_info: false,
    requires_human: true,
  };
}

export type SafetyReason =
  | "restricted_topic"
  | "insufficient_info"
  | "requires_human"
  | "approval_mode";

export function evaluateAssistantStatus(params: {
  classification: QueryClassification;
  responseMode: ResponseMode;
  restrictedTopics: AssistantTopic[];
}): {
  messageStatus: "pending_approval" | "auto_sent";
  reasons: SafetyReason[];
} {
  const { classification, responseMode, restrictedTopics } = params;
  const reasons: SafetyReason[] = [];

  if (restrictedTopics.includes(classification.topic)) {
    reasons.push("restricted_topic");
  }
  if (!classification.has_sufficient_info) {
    reasons.push("insufficient_info");
  }
  if (classification.requires_human) {
    reasons.push("requires_human");
  }

  // Deterministic safety guard: any risk factor forces pending_approval even in automatic mode.
  if (reasons.length > 0) {
    return { messageStatus: "pending_approval", reasons };
  }

  if (responseMode === "automatic") {
    return { messageStatus: "auto_sent", reasons: [] };
  }

  return { messageStatus: "pending_approval", reasons: ["approval_mode"] };
}

export async function generateAssistantReply(params: {
  message: string;
  history: Message[];
  products: Product[];
  policies: Policy[];
  classification: QueryClassification;
  tone: AiTone;
  configuredLanguage: "auto" | "es" | "en";
  storeName: string;
}): Promise<string> {
  const {
    message,
    history,
    products,
    policies,
    classification,
    tone,
    configuredLanguage,
    storeName,
  } = params;

  const targetLanguage =
    configuredLanguage === "auto"
      ? classification.language
      : configuredLanguage;

  const toneDirective =
    tone === "friendly"
      ? "Warm, approachable, and empathetic."
      : tone === "professional"
        ? "Polite, structured, and formal."
        : "Direct, brief, and to the point.";

  const historyText =
    history.length > 0
      ? history
          .slice(-6)
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n")
      : "None";

  const systemInstruction = [
    `You are the AI customer support assistant for "${storeName}".`,
    `Write your reply strictly in ${targetLanguage === "en" ? "English" : "Spanish"}.`,
    `Tone: ${toneDirective}`,
    "",
    "MANDATORY SAFETY RULES (NEVER VIOLATE):",
    "1. Use ONLY the provided Store Products and Store Policies below as facts.",
    "2. NEVER invent prices, currencies, stock availability, discounts, or product specifications.",
    "3. NEVER promise shipping times, shipping rates, or delivery dates that are not explicitly documented in the Store Policies.",
    "4. NEVER confirm, promise, or execute refunds, return approvals, or order changes/cancellations. Politely state that a human support specialist will review and handle the request.",
    "5. If the customer asks about a product, SKU, price, or policy detail that is NOT in the provided context, clearly and honestly admit that you do not have that information in the store's records.",
    "6. When referencing a product from the catalog, cite its exact SKU and exact listed price/stock status.",
  ].join("\n");

  const prompt = [
    `Classification: topic=${classification.topic}, has_sufficient_info=${classification.has_sufficient_info}, requires_human=${classification.requires_human}`,
    "",
    "Retrieved Store Products:",
    formatProductsContext(products),
    "",
    "Store Policies:",
    formatPoliciesContext(policies),
    "",
    "Recent Conversation History:",
    historyText,
    "",
    `Latest Customer Message: """${message}"""`,
    "",
    "Draft the final customer-facing response following all mandatory rules:",
  ].join("\n");

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: getGeminiModel(),
    contents: prompt,
    config: {
      temperature: 0.2,
      systemInstruction,
    },
  });

  const text = response.text?.trim();
  if (text) {
    return text;
  }

  return targetLanguage === "en"
    ? "Thank you for contacting us. A human support specialist will review your request and follow up shortly."
    : "Gracias por escribirnos. Un especialista de soporte revisará tu consulta y te responderá a la brevedad.";
}
