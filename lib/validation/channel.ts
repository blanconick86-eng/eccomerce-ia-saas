import { z } from "zod";

export const CHANNEL_TYPES = [
  "web_widget",
  "mercadolibre",
  "amazon",
  "whatsapp",
] as const;

export const ACTIVE_CHANNEL_TYPES = ["web_widget"] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];
export type ActiveChannelType = (typeof ACTIVE_CHANNEL_TYPES)[number];

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Channel name is required")
    .max(80, "Channel name is too long"),
  type: z.enum(ACTIVE_CHANNEL_TYPES).default("web_widget"),
});

export const deleteChannelSchema = z.object({
  id: z.string().uuid("Invalid channel id"),
});
