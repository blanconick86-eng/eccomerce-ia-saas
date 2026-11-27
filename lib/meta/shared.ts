export const META_WEBHOOK_URL =
  "https://storeoneapp.online/api/integrations/meta/webhook";

export const DEFAULT_META_GRAPH_VERSION = "v25.0";
export const DEFAULT_WHATSAPP_CHANNEL_NAME = "WhatsApp";
export const WHATSAPP_ATTACHMENT_PLACEHOLDER = "[Archivo adjunto]";

export type WhatsAppThreadMeta = {
  platform: "whatsapp";
  from: string;
  contact_name: string | null;
  phone_number_id: string | null;
  last_message_id: string | null;
  processed_message_ids: string[];
};

export type MetaWhatsAppStatusSummary = {
  configured: boolean;
  hasPhoneNumberId: boolean;
  hasAccessToken: boolean;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  phoneNumberIdPreview: string | null;
  graphVersion: string;
  webhookUrl: string;
};

export function normalizeWhatsAppPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[^\d]/g, "").trim();
}

export function formatWhatsAppPhoneDisplay(
  raw: string | null | undefined
): string {
  const digits = normalizeWhatsAppPhone(raw);
  if (!digits) return "";
  return `+${digits}`;
}

export function encodeWhatsAppThreadMeta(meta: {
  from: string;
  contactName?: string | null;
  phoneNumberId?: string | null;
  lastMessageId?: string | null;
  processedMessageIds?: string[];
}): string {
  const normalizedFrom = normalizeWhatsAppPhone(meta.from);
  const uniqueIds = Array.from(
    new Set(
      (meta.processedMessageIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )
  ).slice(-50);

  return JSON.stringify({
    platform: "whatsapp",
    from: normalizedFrom,
    contact_name: meta.contactName?.trim() || null,
    phone_number_id: meta.phoneNumberId?.trim() || null,
    last_message_id: meta.lastMessageId?.trim() || null,
    processed_message_ids: uniqueIds,
  } satisfies WhatsAppThreadMeta);
}

export function parseWhatsAppThreadMeta(
  raw: string | null | undefined
): WhatsAppThreadMeta | null {
  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    if (record.platform !== "whatsapp") {
      return null;
    }

    const from =
      typeof record.from === "string"
        ? normalizeWhatsAppPhone(record.from)
        : "";
    if (!from) {
      return null;
    }

    const contactName =
      typeof record.contact_name === "string" && record.contact_name.trim()
        ? record.contact_name.trim()
        : null;
    const phoneNumberId =
      typeof record.phone_number_id === "string" &&
      record.phone_number_id.trim()
        ? record.phone_number_id.trim()
        : null;
    const lastMessageId =
      typeof record.last_message_id === "string" &&
      record.last_message_id.trim()
        ? record.last_message_id.trim()
        : null;

    const processedMessageIds = Array.isArray(record.processed_message_ids)
      ? record.processed_message_ids
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    return {
      platform: "whatsapp",
      from,
      contact_name: contactName,
      phone_number_id: phoneNumberId,
      last_message_id: lastMessageId,
      processed_message_ids: processedMessageIds,
    };
  } catch {
    return null;
  }
}
