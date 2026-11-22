import { z } from "zod";

export const RESPONSE_MODES = ["approval", "automatic"] as const;
export const AI_TONES = ["friendly", "professional", "concise"] as const;
export const AI_LANGUAGES = ["auto", "es", "en"] as const;
export const ASSISTANT_TOPICS = [
  "products",
  "shipping",
  "returns",
  "payments",
  "refund_execution",
  "order_changes",
  "other",
] as const;

export type ResponseMode = (typeof RESPONSE_MODES)[number];
export type AiTone = (typeof AI_TONES)[number];
export type AiLanguage = (typeof AI_LANGUAGES)[number];
export type AssistantTopic = (typeof ASSISTANT_TOPICS)[number];

export const aiSettingsUpdateSchema = z.object({
  response_mode: z.enum(RESPONSE_MODES),
  tone: z.enum(AI_TONES),
  language: z.enum(AI_LANGUAGES),
  confidence_threshold: z.number().min(0).max(1).optional(),
  allowed_topics: z.array(z.enum(ASSISTANT_TOPICS)).default([]),
  restricted_topics: z.array(z.enum(ASSISTANT_TOPICS)).default([]),
});

export const assistantRequestSchema = z.object({
  conversationId: z.string().uuid("Invalid conversationId").optional(),
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(4000, "Message is too long"),
});

export const widgetStoreIdSchema = z.string().uuid("Invalid storeId");
export const widgetChannelIdSchema = z.string().uuid("Invalid channelId");

export const widgetChatRequestSchema = z.object({
  storeId: widgetStoreIdSchema,
  channelId: widgetChannelIdSchema.optional(),
  conversationId: z.string().uuid("Invalid conversationId").optional(),
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(4000, "Message is too long"),
});

export const classificationSchema = z.object({
  topic: z.enum(ASSISTANT_TOPICS),
  language: z.enum(["es", "en"]),
  has_sufficient_info: z.boolean(),
  requires_human: z.boolean(),
});

export type QueryClassification = z.infer<typeof classificationSchema>;

export const messageModerationSchema = z.object({
  messageId: z.string().uuid("Invalid messageId"),
  action: z.enum(["approve", "edit_and_approve", "reject"]),
  content: z.string().trim().min(1).max(8000).optional(),
});
