import type { SupabaseClient } from "@supabase/supabase-js";
import {
  classifyCustomerQuery,
  evaluateAssistantStatus,
  formatGroqErrorMessage,
  generateAssistantReply,
  retrieveRelevantProducts,
  type SafetyReason,
} from "@/lib/ai/groq";
import {
  AI_LANGUAGES,
  AI_TONES,
  ASSISTANT_TOPICS,
  RESPONSE_MODES,
  type AiLanguage,
  type AiTone,
  type AssistantTopic,
  type QueryClassification,
  type ResponseMode,
} from "@/lib/validation/ai";
import type { Conversation, Message, Policy, Product } from "@/types/database";

export type AssistantStoreContext = {
  id: string;
  name: string;
  language: string;
};

export type RunStoreAssistantResult =
  | {
      ok: true;
      data: {
        conversation: Conversation;
        customerMessage: Message;
        assistantMessage: Message;
        classification: QueryClassification;
        decision: {
          messageStatus: "pending_approval" | "auto_sent";
          reasons: SafetyReason[];
        };
        retrievedProductsCount: number;
        policiesCount: number;
        effectiveLanguage: "es" | "en";
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

/**
 * Runs the full store-grounded retrieval, Groq classification, deterministic safety
 * evaluation, reply generation, and Supabase persistence pipeline.
 */
export async function runStoreAssistant(params: {
  supabase: SupabaseClient;
  store: AssistantStoreContext;
  message: string;
  conversationId?: string;
  channelId?: string | null;
  externalThreadId?: string | null;
  usageEventType?: string;
  includeUnapprovedHistory?: boolean;
}): Promise<RunStoreAssistantResult> {
  const {
    supabase,
    store,
    message,
    conversationId,
    channelId,
    externalThreadId,
    usageEventType = "assistant_reply",
    includeUnapprovedHistory = true,
  } = params;

  let existingConversation: Conversation | null = null;
  let historyMessages: Message[] = [];

  if (conversationId) {
    const { data: convData, error: convError } = await supabase
      .from("conversations")
      .select(
        "id, store_id, channel_id, external_thread_id, status, language, created_at"
      )
      .eq("id", conversationId)
      .eq("store_id", store.id)
      .maybeSingle();

    if (convError) {
      return { ok: false, status: 500, error: convError.message };
    }

    if (!convData) {
      return { ok: false, status: 404, error: "Conversation not found" };
    }

    existingConversation = convData as Conversation;

    const { data: msgHistory } = await supabase
      .from("messages")
      .select("id, conversation_id, role, content, status, created_at")
      .eq("conversation_id", existingConversation.id)
      .order("created_at", { ascending: true })
      .limit(20);

    const rawHistory = (msgHistory ?? []) as Message[];
    historyMessages = includeUnapprovedHistory
      ? rawHistory
      : rawHistory.filter(
          (m) =>
            m.role !== "assistant" ||
            m.status === "auto_sent" ||
            m.status === "approved"
        );
  }

  const [productsResult, policiesResult, settingsResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, store_id, sku, name, description, price, currency, stock_status, category, created_at, updated_at"
      )
      .eq("store_id", store.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("policies")
      .select("id, store_id, type, content, language, updated_at")
      .eq("store_id", store.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("ai_settings")
      .select(
        "store_id, response_mode, tone, language, confidence_threshold, allowed_topics, restricted_topics"
      )
      .eq("store_id", store.id)
      .maybeSingle(),
  ]);

  if (productsResult.error) {
    return { ok: false, status: 500, error: productsResult.error.message };
  }
  if (policiesResult.error) {
    return { ok: false, status: 500, error: policiesResult.error.message };
  }
  if (settingsResult.error) {
    return { ok: false, status: 500, error: settingsResult.error.message };
  }

  const allProducts = (productsResult.data ?? []) as Product[];
  const storePolicies = (policiesResult.data ?? []) as Policy[];
  const rawSettings = settingsResult.data;

  const responseMode: ResponseMode = RESPONSE_MODES.includes(
    rawSettings?.response_mode as ResponseMode
  )
    ? (rawSettings!.response_mode as ResponseMode)
    : "approval";

  const tone: AiTone = AI_TONES.includes(rawSettings?.tone as AiTone)
    ? (rawSettings!.tone as AiTone)
    : "friendly";

  const configuredLanguage: AiLanguage = AI_LANGUAGES.includes(
    rawSettings?.language as AiLanguage
  )
    ? (rawSettings!.language as AiLanguage)
    : "auto";

  const validTopicSet = new Set<string>(ASSISTANT_TOPICS);
  const restrictedTopics: AssistantTopic[] = Array.isArray(
    rawSettings?.restricted_topics
  )
    ? rawSettings.restricted_topics.filter((t: unknown): t is AssistantTopic =>
        typeof t === "string" && validTopicSet.has(t)
      )
    : ["refund_execution", "order_changes"];

  // Step A: Retrieval (up to 8 matching products, or up to 5 reference products)
  const { products: retrievedProducts, matchedByKeywords } =
    retrieveRelevantProducts(allProducts, message);

  // Steps B-D: Classification, deterministic safety evaluation, and grounded generation
  let classification: QueryClassification;
  let decision: {
    messageStatus: "pending_approval" | "auto_sent";
    reasons: SafetyReason[];
  };
  let replyText: string;

  try {
    classification = await classifyCustomerQuery({
      message,
      products: retrievedProducts,
      policies: storePolicies,
      matchedByKeywords,
      storeLanguage: store.language,
    });

    decision = evaluateAssistantStatus({
      classification,
      responseMode,
      restrictedTopics,
    });

    replyText = await generateAssistantReply({
      message,
      history: historyMessages,
      products: retrievedProducts,
      policies: storePolicies,
      classification,
      tone,
      configuredLanguage,
      storeName: store.name,
    });
  } catch (error) {
    console.error("[Assistant Service] Groq request failed:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      error,
    });
    const publicError =
      process.env.NODE_ENV !== "production"
        ? formatGroqErrorMessage(error)
        : "Failed to generate assistant reply with Groq.";

    return { ok: false, status: 502, error: publicError };
  }

  const nextConversationStatus =
    decision.messageStatus === "auto_sent" ? "resolved" : "pending_approval";

  let activeConversation: Conversation;
  if (existingConversation) {
    const { data: updatedConv, error: convUpdateErr } = await supabase
      .from("conversations")
      .update({
        status: nextConversationStatus,
        language: classification.language,
      })
      .eq("id", existingConversation.id)
      .eq("store_id", store.id)
      .select(
        "id, store_id, channel_id, external_thread_id, status, language, created_at"
      )
      .single();

    if (convUpdateErr) {
      return { ok: false, status: 500, error: convUpdateErr.message };
    }
    activeConversation = updatedConv as Conversation;
  } else {
    const { data: createdConv, error: convCreateErr } = await supabase
      .from("conversations")
      .insert({
        store_id: store.id,
        status: nextConversationStatus,
        language: classification.language,
        ...(channelId ? { channel_id: channelId } : {}),
        ...(externalThreadId ? { external_thread_id: externalThreadId } : {}),
      })
      .select(
        "id, store_id, channel_id, external_thread_id, status, language, created_at"
      )
      .single();

    if (convCreateErr) {
      return { ok: false, status: 500, error: convCreateErr.message };
    }
    activeConversation = createdConv as Conversation;
  }

  const { data: insertedMessages, error: msgInsertErr } = await supabase
    .from("messages")
    .insert([
      {
        conversation_id: activeConversation.id,
        role: "customer",
        content: message,
        status: "received",
      },
      {
        conversation_id: activeConversation.id,
        role: "assistant",
        content: replyText,
        status: decision.messageStatus,
      },
    ])
    .select("id, conversation_id, role, content, status, created_at");

  if (msgInsertErr || !insertedMessages || insertedMessages.length < 2) {
    return {
      ok: false,
      status: 500,
      error: msgInsertErr?.message ?? "Failed to save messages",
    };
  }

  const savedMessages = (insertedMessages ?? []) as Message[];
  const customerMessage =
    savedMessages.find((m) => m.role === "customer") ?? savedMessages[0];
  const assistantMessage =
    savedMessages.find((m) => m.role === "assistant") ?? savedMessages[1];

  // Log usage event (non-blocking if insert fails)
  const { error: usageErr } = await supabase.from("usage_events").insert({
    store_id: store.id,
    event_type: usageEventType,
    quantity: 1,
  });

  if (usageErr) {
    console.warn("[Assistant] Failed to record usage_event:", usageErr.message);
  }

  const effectiveLanguage: "es" | "en" =
    configuredLanguage === "auto"
      ? classification.language
      : configuredLanguage;

  return {
    ok: true,
    data: {
      conversation: activeConversation,
      customerMessage,
      assistantMessage,
      classification,
      decision,
      retrievedProductsCount: retrievedProducts.length,
      policiesCount: storePolicies.length,
      effectiveLanguage,
    },
  };
}
