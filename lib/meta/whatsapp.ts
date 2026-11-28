import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runStoreAssistant } from "@/lib/ai/assistant-service";
import { isGroqConfigured } from "@/lib/ai/groq";
import {
  DEFAULT_META_GRAPH_VERSION,
  DEFAULT_WHATSAPP_CHANNEL_NAME,
  META_WEBHOOK_URL,
  WHATSAPP_ATTACHMENT_PLACEHOLDER,
  encodeWhatsAppThreadMeta,
  normalizeWhatsAppPhone,
  parseWhatsAppThreadMeta,
  type MetaWhatsAppStatusSummary,
  type WhatsAppThreadMeta,
} from "@/lib/meta/shared";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import type { Conversation } from "@/types/database";

export {
  DEFAULT_META_GRAPH_VERSION,
  DEFAULT_WHATSAPP_CHANNEL_NAME,
  META_WEBHOOK_URL,
  WHATSAPP_ATTACHMENT_PLACEHOLDER,
  encodeWhatsAppThreadMeta,
  normalizeWhatsAppPhone,
  parseWhatsAppThreadMeta,
  type MetaWhatsAppStatusSummary,
  type WhatsAppThreadMeta,
};

type StoreRow = {
  id: string;
  name: string;
  language: string;
};

type WhatsAppChannelRow = {
  id: string;
  store_id: string;
  name: string;
  type: string;
  credentials: Record<string, unknown> | null;
};

export type MetaWhatsAppContact = {
  wa_id?: string;
  profile?: {
    name?: string | null;
  } | null;
};

export type MetaWhatsAppInboundMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: {
    body?: string | null;
  } | null;
  button?: {
    text?: string | null;
    payload?: string | null;
  } | null;
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string | null } | null;
    list_reply?: {
      id?: string;
      title?: string | null;
      description?: string | null;
    } | null;
  } | null;
  image?: { id?: string; caption?: string | null; mime_type?: string } | null;
  video?: { id?: string; caption?: string | null; mime_type?: string } | null;
  document?: {
    id?: string;
    caption?: string | null;
    filename?: string | null;
  } | null;
  audio?: { id?: string; voice?: boolean } | null;
  sticker?: { id?: string } | null;
};

export type MetaWhatsAppChangeValue = {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string | null;
    phone_number_id?: string | null;
  } | null;
  contacts?: MetaWhatsAppContact[] | null;
  messages?: MetaWhatsAppInboundMessage[] | null;
  statuses?: Array<Record<string, unknown>> | null;
};

export type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{
      field?: string;
      value?: MetaWhatsAppChangeValue | null;
    }> | null;
    messaging?: Array<Record<string, unknown>> | null;
  }> | null;
};

export type ProcessedWhatsAppMessageSummary = {
  messageId: string | null;
  from: string;
  status: "replied" | "saved_pending" | "duplicate" | "ignored" | "error";
  conversationId?: string;
  sentViaWhatsApp?: boolean;
  reason?: string;
};

const MAX_WHATSAPP_TEXT_LENGTH = 4096;
const GRAPH_FETCH_TIMEOUT_MS = 12_000;

// In-process guards against duplicate parallel webhook deliveries on the same warm instance
const inFlightMessageIds = new Set<string>();
const recentProcessedMessageIds = new Set<string>();
let externalMessageIdColumnSupported: boolean | null = null;

function rememberProcessedMessageId(messageId: string) {
  if (!messageId) return;
  if (recentProcessedMessageIds.size >= 500) {
    const oldest = recentProcessedMessageIds.values().next().value;
    if (oldest) {
      recentProcessedMessageIds.delete(oldest);
    }
  }
  recentProcessedMessageIds.add(messageId);
}

export function getMetaWhatsAppConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  const verifyToken = process.env.META_VERIFY_TOKEN?.trim() ?? "";
  const appSecret = process.env.META_APP_SECRET?.trim() ?? "";
  const graphVersion =
    process.env.META_GRAPH_VERSION?.trim() || DEFAULT_META_GRAPH_VERSION;

  return {
    phoneNumberId,
    accessToken,
    verifyToken,
    appSecret,
    graphVersion,
    isConfigured: Boolean(phoneNumberId && accessToken),
  };
}

export function getMetaWhatsAppStatusSummary(): MetaWhatsAppStatusSummary {
  const cfg = getMetaWhatsAppConfig();
  const preview =
    cfg.phoneNumberId.length > 6
      ? `${cfg.phoneNumberId.slice(0, 4)}••••${cfg.phoneNumberId.slice(-3)}`
      : cfg.phoneNumberId || null;

  return {
    configured: cfg.isConfigured,
    hasPhoneNumberId: Boolean(cfg.phoneNumberId),
    hasAccessToken: Boolean(cfg.accessToken),
    hasVerifyToken: Boolean(cfg.verifyToken),
    hasAppSecret: Boolean(cfg.appSecret),
    phoneNumberIdPreview: preview,
    graphVersion: cfg.graphVersion,
    webhookUrl: META_WEBHOOK_URL,
  };
}

/**
 * Validates Meta's `X-Hub-Signature-256: sha256=<hex>` header against the raw request body
 * using HMAC-SHA256 and constant-time comparison (`crypto.timingSafeEqual`).
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret = process.env.META_APP_SECRET
): boolean {
  const secret = appSecret?.trim();
  if (!secret || !signatureHeader) {
    return false;
  }

  const trimmed = signatureHeader.trim();
  if (!trimmed.toLowerCase().startsWith("sha256=")) {
    return false;
  }

  const providedHex = trimmed.slice("sha256=".length).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(providedHex)) {
    return false;
  }

  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex")
    .toLowerCase();

  const providedBuffer = Buffer.from(providedHex, "hex");
  const expectedBuffer = Buffer.from(expectedHex, "hex");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function isMissingExternalMessageIdColumnError(error: {
  code?: string;
  message?: string;
}): boolean {
  const msg = error.message ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /external_message_id/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

async function isMessageIdStoredInMessagesTable(
  supabase: SupabaseClient,
  wamid: string
): Promise<boolean> {
  if (!wamid || externalMessageIdColumnSupported === false) {
    return false;
  }

  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("external_message_id", wamid)
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingExternalMessageIdColumnError(error)) {
      externalMessageIdColumnSupported = false;
      return false;
    }
    console.warn(
      "[WhatsApp Helper] Deduplication query on messages.external_message_id failed:",
      error.message
    );
    return false;
  }

  externalMessageIdColumnSupported = true;
  return Boolean(data?.id);
}

async function attachExternalMessageIdIfSupported(
  supabase: SupabaseClient,
  messageRowId: string,
  externalMessageId: string | null | undefined
): Promise<void> {
  const trimmedExtId = externalMessageId?.trim();
  if (
    !messageRowId ||
    !trimmedExtId ||
    externalMessageIdColumnSupported === false
  ) {
    return;
  }

  const { error } = await supabase
    .from("messages")
    .update({ external_message_id: trimmedExtId })
    .eq("id", messageRowId);

  if (error) {
    if (isMissingExternalMessageIdColumnError(error)) {
      externalMessageIdColumnSupported = false;
      return;
    }
    console.warn(
      "[WhatsApp Helper] Could not attach external_message_id to message:",
      error.message
    );
    return;
  }

  externalMessageIdColumnSupported = true;
}

function extractContactName(
  contacts: MetaWhatsAppContact[],
  senderPhone: string
): string | null {
  const matched =
    contacts.find(
      (c) => normalizeWhatsAppPhone(c.wa_id) === senderPhone
    ) ?? (contacts.length === 1 ? contacts[0] : undefined);

  const name = matched?.profile?.name?.trim();
  return name || null;
}

function extractIncomingMessageContent(
  msg: MetaWhatsAppInboundMessage
): string | null {
  const msgType = (msg.type ?? "").toLowerCase();

  if (msgType === "text") {
    const body = msg.text?.body?.trim() ?? "";
    return body ? body.slice(0, 8000) : null;
  }

  if (msgType === "button") {
    const text = msg.button?.text?.trim() || msg.button?.payload?.trim() || "";
    return (text || WHATSAPP_ATTACHMENT_PLACEHOLDER).slice(0, 8000);
  }

  if (msgType === "interactive") {
    const replyTitle =
      msg.interactive?.button_reply?.title?.trim() ||
      msg.interactive?.list_reply?.title?.trim() ||
      "";
    const replyDesc = msg.interactive?.list_reply?.description?.trim() || "";
    const combined =
      replyTitle && replyDesc ? `${replyTitle} (${replyDesc})` : replyTitle;
    return (combined || WHATSAPP_ATTACHMENT_PLACEHOLDER).slice(0, 8000);
  }

  // Non-text messages (audio, image, video, document, sticker, location, contacts, etc.)
  const caption =
    msg.image?.caption?.trim() ||
    msg.video?.caption?.trim() ||
    msg.document?.caption?.trim() ||
    "";

  if (caption) {
    return `${WHATSAPP_ATTACHMENT_PLACEHOLDER}\n${caption}`.slice(0, 8000);
  }

  return WHATSAPP_ATTACHMENT_PLACEHOLDER;
}

async function resolveStoreAndWhatsAppChannel(params: {
  supabase: SupabaseClient;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
}): Promise<{ store: StoreRow; channel: WhatsAppChannelRow | null } | null> {
  const { supabase, phoneNumberId, displayPhoneNumber } = params;
  const configuredStoreId = process.env.WHATSAPP_STORE_ID?.trim() ?? "";

  const [storesRes, channelsRes, shopifyRes] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, language")
      .order("created_at", { ascending: true }),
    supabase
      .from("channels")
      .select("id, store_id, name, type, credentials")
      .eq("type", "whatsapp")
      .order("created_at", { ascending: false }),
    supabase
      .from("shopify_integrations")
      .select("store_id")
      .eq("status", "connected")
      .limit(5),
  ]);

  if (storesRes.error) {
    console.error(
      "[WhatsApp Helper] Failed to load stores:",
      storesRes.error.message
    );
    return null;
  }

  const stores = (storesRes.data ?? []) as StoreRow[];
  if (stores.length === 0) {
    console.warn("[WhatsApp Helper] No stores exist in Supabase yet.");
    return null;
  }

  const storesById = new Map(stores.map((s) => [s.id, s]));
  const waChannels = (channelsRes.data ?? []) as WhatsAppChannelRow[];

  // 1. Match channel explicitly configured for this Meta phone_number_id
  if (phoneNumberId) {
    const channelByPhoneId = waChannels.find((ch) => {
      const credPhoneId =
        ch.credentials && typeof ch.credentials.phone_number_id === "string"
          ? ch.credentials.phone_number_id.trim()
          : "";
      return credPhoneId === phoneNumberId;
    });

    if (channelByPhoneId) {
      const matchedStore = storesById.get(channelByPhoneId.store_id);
      if (matchedStore) {
        return { store: matchedStore, channel: channelByPhoneId };
      }
    }
  }

  // 2. Match explicit WHATSAPP_STORE_ID override if set
  let targetStore: StoreRow | undefined = configuredStoreId
    ? storesById.get(configuredStoreId)
    : undefined;

  // 3. Match store from any existing WhatsApp channel
  if (!targetStore && waChannels.length > 0) {
    for (const ch of waChannels) {
      const found = storesById.get(ch.store_id);
      if (found) {
        return { store: found, channel: ch };
      }
    }
  }

  // 4. Prefer store with connected Shopify integration, otherwise primary store
  if (!targetStore && !shopifyRes.error && (shopifyRes.data?.length ?? 0) > 0) {
    for (const row of shopifyRes.data ?? []) {
      const candidate = storesById.get(
        (row as { store_id: string }).store_id
      );
      if (candidate) {
        targetStore = candidate;
        break;
      }
    }
  }

  if (!targetStore) {
    targetStore = stores[0];
  }

  const existingStoreWaChannel = waChannels.find(
    (ch) => ch.store_id === targetStore!.id
  );
  if (existingStoreWaChannel) {
    return { store: targetStore, channel: existingStoreWaChannel };
  }

  // Auto-create the `whatsapp` channel row for the unified inbox
  const { data: createdChannel, error: createChannelErr } = await supabase
    .from("channels")
    .insert({
      store_id: targetStore.id,
      name: DEFAULT_WHATSAPP_CHANNEL_NAME,
      type: "whatsapp",
      credentials: {
        provider: "meta_cloud_api",
        ...(phoneNumberId ? { phone_number_id: phoneNumberId } : {}),
        ...(displayPhoneNumber
          ? { display_phone_number: displayPhoneNumber }
          : {}),
      },
    })
    .select("id, store_id, name, type, credentials")
    .single();

  if (createChannelErr || !createdChannel) {
    console.warn(
      "[WhatsApp Helper] Could not auto-create whatsapp channel row; continuing without channel_id:",
      createChannelErr?.message
    );
    return { store: targetStore, channel: null };
  }

  return {
    store: targetStore,
    channel: createdChannel as WhatsAppChannelRow,
  };
}

async function findOrCreateWhatsAppConversation(params: {
  supabase: SupabaseClient;
  store: StoreRow;
  channelId: string | null;
  senderPhone: string;
  contactName: string | null;
  phoneNumberId: string | null;
  wamid: string | null;
}): Promise<
  | { duplicate: true; conversation: Conversation }
  | { duplicate: false; conversation: Conversation; externalThreadId: string }
  | { error: string }
> {
  const {
    supabase,
    store,
    channelId,
    senderPhone,
    contactName,
    phoneNumberId,
    wamid,
  } = params;

  const { data: candidates, error: searchErr } = await supabase
    .from("conversations")
    .select(
      "id, store_id, channel_id, external_thread_id, status, language, created_at"
    )
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (searchErr) {
    return { error: searchErr.message };
  }

  let matchedConv: Conversation | null = null;
  let existingMeta: WhatsAppThreadMeta | null = null;

  for (const row of (candidates ?? []) as Conversation[]) {
    const meta = parseWhatsAppThreadMeta(row.external_thread_id);
    if (!meta) continue;
    if (meta.from === senderPhone) {
      matchedConv = row;
      existingMeta = meta;
      break;
    }
  }

  if (
    wamid &&
    existingMeta &&
    (existingMeta.last_message_id === wamid ||
      existingMeta.processed_message_ids.includes(wamid))
  ) {
    return { duplicate: true, conversation: matchedConv! };
  }

  const nextProcessedIds = [
    ...(existingMeta?.processed_message_ids ?? []),
    ...(wamid ? [wamid] : []),
  ];

  const externalThreadId = encodeWhatsAppThreadMeta({
    from: senderPhone,
    contactName: contactName || existingMeta?.contact_name || null,
    phoneNumberId: phoneNumberId || existingMeta?.phone_number_id || null,
    lastMessageId: wamid || existingMeta?.last_message_id || null,
    processedMessageIds: nextProcessedIds,
  });

  if (matchedConv) {
    const { data: updated, error: updateErr } = await supabase
      .from("conversations")
      .update({
        external_thread_id: externalThreadId,
        ...(channelId && !matchedConv.channel_id ? { channel_id: channelId } : {}),
      })
      .eq("id", matchedConv.id)
      .eq("store_id", store.id)
      .select(
        "id, store_id, channel_id, external_thread_id, status, language, created_at"
      )
      .single();

    if (updateErr || !updated) {
      return {
        error: updateErr?.message ?? "Failed to update WhatsApp conversation",
      };
    }

    return {
      duplicate: false,
      conversation: updated as Conversation,
      externalThreadId,
    };
  }

  const { data: created, error: createErr } = await supabase
    .from("conversations")
    .insert({
      store_id: store.id,
      status: "open",
      language: store.language === "en" ? "en" : "es",
      ...(channelId ? { channel_id: channelId } : {}),
      external_thread_id: externalThreadId,
    })
    .select(
      "id, store_id, channel_id, external_thread_id, status, language, created_at"
    )
    .single();

  if (createErr || !created) {
    return {
      error: createErr?.message ?? "Failed to create WhatsApp conversation",
    };
  }

  return {
    duplicate: false,
    conversation: created as Conversation,
    externalThreadId,
  };
}

async function postWhatsAppGraphMessage(params: {
  graphVersion: string;
  phoneNumberId: string;
  accessToken: string;
  to: string;
  bodyText: string;
}): Promise<
  | { ok: true; externalMessageId: string | null }
  | { ok: false; status: number; errorCode?: number; error: string }
> {
  const url = `https://graph.facebook.com/${params.graphVersion}/${params.phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: params.to,
      type: "text",
      text: {
        body: params.bodyText.slice(0, MAX_WHATSAPP_TEXT_LENGTH),
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(GRAPH_FETCH_TIMEOUT_MS),
  });

  const rawText = await response.text().catch(() => "");
  if (!response.ok) {
    let errorCode: number | undefined;
    let errorDetail = rawText.trim() || `HTTP ${response.status}`;

    try {
      const parsedErr = JSON.parse(rawText) as {
        error?: { message?: string; code?: number };
      };
      if (typeof parsedErr.error?.code === "number") {
        errorCode = parsedErr.error.code;
      }
      if (parsedErr.error?.message) {
        errorDetail = parsedErr.error.message;
      }
    } catch {
      // Keep rawText
    }

    return {
      ok: false,
      status: response.status,
      errorCode,
      error: `WhatsApp Cloud API (${response.status}): ${errorDetail}`,
    };
  }

  let externalMessageId: string | null = null;
  try {
    const data = JSON.parse(rawText) as {
      messages?: Array<{ id?: string }>;
    };
    const msgId = data.messages?.[0]?.id;
    if (typeof msgId === "string" && msgId.trim()) {
      externalMessageId = msgId.trim();
    }
  } catch {
    externalMessageId = null;
  }

  return { ok: true, externalMessageId };
}

const ARGENTINA_THREE_DIGIT_AREA_CODES = new Set([
  "220",
  "221",
  "223",
  "230",
  "236",
  "237",
  "249",
  "260",
  "261",
  "263",
  "264",
  "266",
  "280",
  "291",
  "294",
  "297",
  "298",
  "299",
  "336",
  "341",
  "342",
  "343",
  "345",
  "348",
  "351",
  "353",
  "358",
  "362",
  "364",
  "370",
  "376",
  "379",
  "380",
  "381",
  "383",
  "385",
  "387",
  "388",
]);

const ARGENTINA_OVERLAPPING_FOUR_DIGIT_AREA_CODES = new Set([
  "2202",
  "2302",
  "2940",
  "2942",
  "2945",
  "2946",
  "2948",
  "2972",
  "2982",
  "2983",
  "3435",
  "3436",
  "3437",
  "3438",
  "3454",
  "3455",
  "3456",
  "3458",
  "3482",
  "3483",
  "3487",
  "3489",
  "3532",
  "3533",
  "3537",
  "3582",
  "3583",
  "3584",
  "3585",
  "3832",
  "3835",
  "3837",
  "3838",
  "3854",
  "3855",
  "3856",
  "3857",
  "3858",
  "3873",
  "3876",
  "3877",
  "3878",
  "3885",
  "3886",
  "3887",
  "3888",
]);

/**
 * Normalizes Argentine 13-digit mobile numbers (`549` + 10-digit national number)
 * for outbound WhatsApp Cloud API delivery by removing the `9` after `54` and
 * inserting `15` after the area code (2, 3, or 4 digits):
 * - `54911xxxxxxxx` -> `541115xxxxxxxx`
 * - `5493434556507` -> `54343154556507`
 */
export function normalizeArgentinaWhatsAppPhone(
  raw: string | null | undefined
): string {
  const digits = normalizeWhatsAppPhone(raw);
  const match = /^549(\d{10})$/.exec(digits);
  if (!match) {
    return digits;
  }

  const national = match[1];
  let areaCodeLength: number;

  if (national.startsWith("11")) {
    areaCodeLength = 2;
  } else {
    const prefix3 = national.slice(0, 3);
    const prefix4 = national.slice(0, 4);

    if (
      ARGENTINA_OVERLAPPING_FOUR_DIGIT_AREA_CODES.has(prefix4) &&
      national[4] >= "4"
    ) {
      areaCodeLength = 4;
    } else if (ARGENTINA_THREE_DIGIT_AREA_CODES.has(prefix3)) {
      areaCodeLength = 3;
    } else {
      areaCodeLength = 4;
    }
  }

  const areaCode = national.slice(0, areaCodeLength);
  const localNumber = national.slice(areaCodeLength);
  return `54${areaCode}15${localNumber}`;
}

/**
 * Sends an outbound text message through Meta's WhatsApp Cloud API.
 */
export async function sendWhatsAppTextMessage(params: {
  to: string;
  body: string;
  phoneNumberId?: string | null;
}): Promise<
  | { ok: true; externalMessageId: string | null; recipientUsed: string }
  | { ok: false; error: string }
> {
  const cfg = getMetaWhatsAppConfig();
  const effectivePhoneNumberId =
    cfg.phoneNumberId || params.phoneNumberId?.trim() || "";

  if (!effectivePhoneNumberId) {
    return {
      ok: false,
      error: "WHATSAPP_PHONE_NUMBER_ID is not configured on the server.",
    };
  }

  if (!cfg.accessToken) {
    return {
      ok: false,
      error: "WHATSAPP_ACCESS_TOKEN is not configured on the server.",
    };
  }

  const rawDigits = normalizeWhatsAppPhone(params.to);
  if (!rawDigits) {
    return {
      ok: false,
      error: "Missing valid WhatsApp recipient phone number.",
    };
  }

  const outboundTo = normalizeArgentinaWhatsAppPhone(rawDigits);

  const trimmedBody = params.body.trim();
  if (!trimmedBody) {
    return { ok: false, error: "WhatsApp reply body is empty." };
  }

  try {
    const primaryAttempt = await postWhatsAppGraphMessage({
      graphVersion: cfg.graphVersion,
      phoneNumberId: effectivePhoneNumberId,
      accessToken: cfg.accessToken,
      to: outboundTo,
      bodyText: trimmedBody,
    });

    if (primaryAttempt.ok) {
      return {
        ok: true,
        externalMessageId: primaryAttempt.externalMessageId,
        recipientUsed: outboundTo,
      };
    }

    // Fallback to original `549...` format if Meta's allow-list rejects the `15` variant
    if (primaryAttempt.errorCode === 131030 && outboundTo !== rawDigits) {
      const fallbackAttempt = await postWhatsAppGraphMessage({
        graphVersion: cfg.graphVersion,
        phoneNumberId: effectivePhoneNumberId,
        accessToken: cfg.accessToken,
        to: rawDigits,
        bodyText: trimmedBody,
      });

      if (fallbackAttempt.ok) {
        return {
          ok: true,
          externalMessageId: fallbackAttempt.externalMessageId,
          recipientUsed: rawDigits,
        };
      }
    }

    console.error("[WhatsApp Helper] Outbound message failed:", {
      to: outboundTo,
      error: primaryAttempt.error,
    });
    return { ok: false, error: primaryAttempt.error };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Unexpected network error calling WhatsApp Cloud API.";
    console.error("[WhatsApp Helper] Graph API fetch exception:", err);
    return { ok: false, error: message };
  }
}

/**
 * Processes an incoming `whatsapp_business_account` webhook payload from Meta:
 * deduplicates `wamid`, saves the conversation & customer message in Supabase,
 * runs StoreOne's grounded AI engine (catalog + policies + Shopify live orders),
 * replies via WhatsApp Cloud API, and persists the outgoing AI reply.
 */
export async function processWhatsAppBusinessWebhook(
  payload: MetaWebhookPayload
): Promise<ProcessedWhatsAppMessageSummary[]> {
  if (!isSupabaseAdminConfigured()) {
    console.error(
      "[WhatsApp Webhook] SUPABASE_SERVICE_ROLE_KEY is not configured on the server."
    );
    return [];
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  if (entries.length === 0) {
    return [];
  }

  const supabase = createAdminClient();
  const cfg = getMetaWhatsAppConfig();
  const summaries: ProcessedWhatsAppMessageSummary[] = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change.value;
      if (!value) continue;

      const messages = Array.isArray(value.messages) ? value.messages : [];
      // Ignore status-only events (`delivered`, `read`, `sent`, `failed`) to prevent loops
      if (messages.length === 0) {
        continue;
      }

      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const metadataPhoneNumberId =
        value.metadata?.phone_number_id?.trim() || cfg.phoneNumberId || null;
      const displayPhoneDigits = normalizeWhatsAppPhone(
        value.metadata?.display_phone_number
      );

      const resolved = await resolveStoreAndWhatsAppChannel({
        supabase,
        phoneNumberId: metadataPhoneNumberId,
        displayPhoneNumber: value.metadata?.display_phone_number?.trim() || null,
      });

      if (!resolved) {
        summaries.push({
          messageId: null,
          from: "",
          status: "error",
          reason: "No store available to attach incoming WhatsApp messages",
        });
        continue;
      }

      const { store, channel } = resolved;

      for (const msg of messages) {
        const wamid = typeof msg.id === "string" ? msg.id.trim() : "";
        const senderPhone = normalizeWhatsAppPhone(msg.from);

        if (!senderPhone) {
          summaries.push({
            messageId: wamid || null,
            from: "",
            status: "ignored",
            reason: "Missing sender phone number",
          });
          continue;
        }

        if (displayPhoneDigits && senderPhone === displayPhoneDigits) {
          summaries.push({
            messageId: wamid || null,
            from: senderPhone,
            status: "ignored",
            reason: "Ignored self-sent business number message",
          });
          continue;
        }

        const content = extractIncomingMessageContent(msg);
        if (!content) {
          summaries.push({
            messageId: wamid || null,
            from: senderPhone,
            status: "ignored",
            reason: "Empty incoming message body",
          });
          continue;
        }

        // Deduplication Step 1: In-flight & warm-memory check
        if (
          wamid &&
          (inFlightMessageIds.has(wamid) || recentProcessedMessageIds.has(wamid))
        ) {
          summaries.push({
            messageId: wamid,
            from: senderPhone,
            status: "duplicate",
            reason: "Duplicate wamid skipped (memory)",
          });
          continue;
        }

        if (wamid) {
          inFlightMessageIds.add(wamid);
        }

        try {
          // Deduplication Step 2: Check `messages.external_message_id` in Supabase
          if (
            wamid &&
            (await isMessageIdStoredInMessagesTable(supabase, wamid))
          ) {
            rememberProcessedMessageId(wamid);
            summaries.push({
              messageId: wamid,
              from: senderPhone,
              status: "duplicate",
              reason: "Duplicate wamid already stored in messages",
            });
            continue;
          }

          const contactName = extractContactName(contacts, senderPhone);

          // Deduplication Step 3 + Unified Inbox conversation lookup/creation
          const convOutcome = await findOrCreateWhatsAppConversation({
            supabase,
            store,
            channelId: channel?.id ?? null,
            senderPhone,
            contactName,
            phoneNumberId: metadataPhoneNumberId,
            wamid: wamid || null,
          });

          if ("error" in convOutcome) {
            console.error(
              "[WhatsApp Webhook] Conversation lookup/create failed:",
              convOutcome.error
            );
            summaries.push({
              messageId: wamid || null,
              from: senderPhone,
              status: "error",
              reason: convOutcome.error,
            });
            continue;
          }

          if (convOutcome.duplicate) {
            if (wamid) rememberProcessedMessageId(wamid);
            summaries.push({
              messageId: wamid || null,
              from: senderPhone,
              conversationId: convOutcome.conversation.id,
              status: "duplicate",
              reason: "Duplicate wamid already recorded in conversation thread",
            });
            continue;
          }

          const { conversation, externalThreadId } = convOutcome;

          // Fallback persistence if GROQ_API_KEY is missing
          if (!isGroqConfigured()) {
            console.error(
              "[WhatsApp Webhook] GROQ_API_KEY is not configured; saving customer message without AI reply."
            );
            const { data: savedIncoming } = await supabase
              .from("messages")
              .insert({
                conversation_id: conversation.id,
                role: "customer",
                content,
                status: "received",
              })
              .select("id")
              .maybeSingle();

            if (savedIncoming?.id && wamid) {
              await attachExternalMessageIdIfSupported(
                supabase,
                savedIncoming.id,
                wamid
              );
            }
            if (wamid) rememberProcessedMessageId(wamid);

            summaries.push({
              messageId: wamid || null,
              from: senderPhone,
              conversationId: conversation.id,
              status: "saved_pending",
              sentViaWhatsApp: false,
              reason: "GROQ_API_KEY not configured",
            });
            continue;
          }

          // Invoke StoreOne's unified AI assistant (catalog + policies + Shopify live orders)
          const assistantResult = await runStoreAssistant({
            supabase,
            store,
            message: content,
            conversationId: conversation.id,
            channelId: channel?.id ?? null,
            externalThreadId,
            usageEventType: "whatsapp_reply",
            includeUnapprovedHistory: false,
          });

          if (!assistantResult.ok) {
            console.error("[WhatsApp Webhook] Store assistant failed:", {
              storeId: store.id,
              conversationId: conversation.id,
              error: assistantResult.error,
            });

            // Still persist the incoming customer message so nothing is lost
            const { data: savedIncoming } = await supabase
              .from("messages")
              .insert({
                conversation_id: conversation.id,
                role: "customer",
                content,
                status: "received",
              })
              .select("id")
              .maybeSingle();

            if (savedIncoming?.id && wamid) {
              await attachExternalMessageIdIfSupported(
                supabase,
                savedIncoming.id,
                wamid
              );
            }
            if (wamid) rememberProcessedMessageId(wamid);

            summaries.push({
              messageId: wamid || null,
              from: senderPhone,
              conversationId: conversation.id,
              status: "error",
              sentViaWhatsApp: false,
              reason: assistantResult.error,
            });
            continue;
          }

          const { customerMessage, assistantMessage, classification } =
            assistantResult.data;
          const aiReply = assistantMessage.content;

          if (wamid) {
            await attachExternalMessageIdIfSupported(
              supabase,
              customerMessage.id,
              wamid
            );
            rememberProcessedMessageId(wamid);
          }

          // Send AI reply back to the customer via WhatsApp Cloud API
          const sendResult = await sendWhatsAppTextMessage({
            to: senderPhone,
            body: aiReply,
            phoneNumberId: cfg.phoneNumberId || metadataPhoneNumberId,
          });

          if (sendResult.ok) {
            if (assistantMessage.status !== "auto_sent") {
              await supabase
                .from("messages")
                .update({ status: "auto_sent" })
                .eq("id", assistantMessage.id);
            }

            const nextConvStatus = classification.requires_human
              ? "open"
              : "resolved";
            if (conversation.status !== nextConvStatus) {
              await supabase
                .from("conversations")
                .update({ status: nextConvStatus })
                .eq("id", conversation.id)
                .eq("store_id", store.id);
            }

            if (sendResult.externalMessageId) {
              await attachExternalMessageIdIfSupported(
                supabase,
                assistantMessage.id,
                sendResult.externalMessageId
              );
            }

            summaries.push({
              messageId: wamid || null,
              from: senderPhone,
              conversationId: conversation.id,
              status: "replied",
              sentViaWhatsApp: true,
            });
          } else {
            // Keep assistant draft queued as pending_approval so owner can send from dashboard
            if (assistantMessage.status !== "pending_approval") {
              await supabase
                .from("messages")
                .update({ status: "pending_approval" })
                .eq("id", assistantMessage.id);
            }
            await supabase
              .from("conversations")
              .update({ status: "pending_approval" })
              .eq("id", conversation.id)
              .eq("store_id", store.id);

            summaries.push({
              messageId: wamid || null,
              from: senderPhone,
              conversationId: conversation.id,
              status: "saved_pending",
              sentViaWhatsApp: false,
              reason: sendResult.error,
            });
          }
        } finally {
          if (wamid) {
            inFlightMessageIds.delete(wamid);
          }
        }
      }
    }
  }

  return summaries;
}
