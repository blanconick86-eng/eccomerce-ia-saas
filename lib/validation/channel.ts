import { z } from "zod";
import { DEFAULT_FROM_EMAIL } from "@/lib/email/resend";

export const CHANNEL_TYPES = [
  "web_widget",
  "email",
  "mercadolibre",
  "amazon",
  "whatsapp",
] as const;

export const ACTIVE_CHANNEL_TYPES = ["web_widget", "email"] as const;

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
