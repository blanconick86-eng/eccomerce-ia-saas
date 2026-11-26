import { z } from "zod";
import { DEFAULT_FROM_EMAIL } from "@/lib/email/brevo";
import { DEFAULT_MELI_SELLER_NICKNAME } from "@/lib/mercadolibre/simulated";

export const CHANNEL_TYPES = [
  "web_widget",
  "email",
  "mercadolibre",
  "amazon",
  "whatsapp",
] as const;

export const ACTIVE_CHANNEL_TYPES = [
  "web_widget",
  "email",
  "mercadolibre",
] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];
export type ActiveChannelType = (typeof ACTIVE_CHANNEL_TYPES)[number];

export const emailChannelCredentialsSchema = z.object({
  support_email: z.string().trim().email("Valid support email is required"),
  from_email: z
    .string()
    .trim()
    .max(160, "Sender email is too long")
    .optional()
    .transform((val) => val || DEFAULT_FROM_EMAIL),
  inbound_slug: z.string().trim().max(80).optional(),
  inbound_email: z.string().trim().max(160).optional(),
});

export const mercadoLibreChannelCredentialsSchema = z.object({
  mode: z.literal("simulated").default("simulated"),
  seller_nickname: z
    .string()
    .trim()
    .max(80, "Seller nickname is too long")
    .optional()
    .transform((val) => val || DEFAULT_MELI_SELLER_NICKNAME),
});

export const createChannelSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Channel name is required")
      .max(80, "Channel name is too long"),
    type: z.enum(ACTIVE_CHANNEL_TYPES).default("web_widget"),
    credentials: z
      .object({
        support_email: z.string().trim().optional(),
        from_email: z.string().trim().optional(),
        inbound_slug: z.string().trim().optional(),
        inbound_email: z.string().trim().optional(),
        mode: z.string().trim().optional(),
        seller_nickname: z.string().trim().optional(),
      })
      .optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "email") {
      const check = emailChannelCredentialsSchema.safeParse(
        val.credentials ?? {}
      );
      if (!check.success) {
        for (const issue of check.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: ["credentials", ...issue.path],
          });
        }
      }
    } else if (val.type === "mercadolibre") {
      const check = mercadoLibreChannelCredentialsSchema.safeParse(
        val.credentials ?? {}
      );
      if (!check.success) {
        for (const issue of check.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: ["credentials", ...issue.path],
          });
        }
      }
    }
  });

export const deleteChannelSchema = z.object({
  id: z.string().uuid("Invalid channel id"),
});

export const emailWebhookRequestSchema = z.object({
  storeId: z.string().uuid("Invalid storeId"),
  channelId: z.string().uuid("Invalid channelId"),
  fromEmail: z.string().trim().email("Valid sender email is required"),
  subject: z
    .string()
    .trim()
    .min(1, "Email subject is required")
    .max(300, "Subject is too long"),
  body: z
    .string()
    .trim()
    .min(1, "Email body is required")
    .max(8000, "Email body is too long"),
  conversationId: z.string().uuid("Invalid conversationId").optional(),
});

export const brevoInboundAddressSchema = z
  .object({
    Name: z.string().nullable().optional(),
    Address: z.string().nullable().optional(),
  })
  .passthrough();

export const brevoInboundItemSchema = z
  .object({
    From: brevoInboundAddressSchema.nullable().optional(),
    To: z.array(brevoInboundAddressSchema).optional(),
    Cc: z.array(brevoInboundAddressSchema).optional(),
    ReplyTo: brevoInboundAddressSchema.nullable().optional(),
    Subject: z.string().nullable().optional(),
    RawTextBody: z.string().nullable().optional(),
    RawHtmlBody: z.string().nullable().optional(),
    ExtractedMarkdownMessage: z.string().nullable().optional(),
    InReplyTo: z.string().nullable().optional(),
    MessageId: z.string().nullable().optional(),
    Headers: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const brevoInboundWebhookSchema = z
  .object({
    items: z
      .array(brevoInboundItemSchema)
      .min(1, "Brevo items array is empty"),
  })
  .passthrough();

export type BrevoInboundItem = z.infer<typeof brevoInboundItemSchema>;

export const mercadoLibreWebhookRequestSchema = z.object({
  simulated: z.boolean().default(true),
  storeId: z.string().uuid("Invalid storeId"),
  channelId: z.string().uuid("Invalid channelId"),
  buyerNickname: z
    .string()
    .trim()
    .min(1, "Buyer nickname is required")
    .max(80, "Buyer nickname is too long"),
  itemTitle: z
    .string()
    .trim()
    .min(1, "Item title is required")
    .max(300, "Item title is too long"),
  questionText: z
    .string()
    .trim()
    .min(1, "Question text is required")
    .max(8000, "Question text is too long"),
  conversationId: z.string().uuid("Invalid conversationId").optional(),
});
