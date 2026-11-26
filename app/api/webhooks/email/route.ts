import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runStoreAssistant } from "@/lib/ai/assistant-service";
import { isGroqConfigured } from "@/lib/ai/groq";
import {
  buildStoreInboundEmail,
  buildStoreInboundSlug,
  DEFAULT_FROM_EMAIL,
  encodeEmailThreadMeta,
  extractEmailAddress,
  formatReplySubject,
  getInboundEmailDomain,
  parseEmailCredentials,
  parseEmailParts,
  parseEmailThreadMeta,
  sendStoreEmailReply,
  slugifyStoreName,
} from "@/lib/email/brevo";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import {
  brevoInboundWebhookSchema,
  emailWebhookRequestSchema,
  type BrevoInboundItem,
} from "@/lib/validation/channel";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORWARDING_HEADER_KEYS = new Set([
  "delivered-to",
  "x-forwarded-to",
  "x-original-to",
  "envelope-to",
]);

type StoreRow = {
  id: string;
  name: string;
  language: string;
};

type EmailChannelRow = {
  id: string;
  store_id: string;
  name: string;
  type: string;
  credentials: unknown;
};

function jsonCors(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function normalizeWebhookInput(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const obj = raw as Record<string, unknown>;
  return {
    storeId: obj.storeId ?? obj.store_id,
    channelId: obj.channelId ?? obj.channel_id,
    fromEmail: obj.fromEmail ?? obj.from_email ?? obj.from,
    subject: obj.subject,
    body: obj.body ?? obj.text,
    conversationId: obj.conversationId ?? obj.conversation_id,
  };
}

function isBrevoInboundPayload(raw: unknown): boolean {
  return Boolean(
    raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      Array.isArray((raw as { items?: unknown }).items)
  );
}

function stripHtmlTags(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBrevoMessageBody(item: BrevoInboundItem): string {
  const candidates = [
    item.ExtractedMarkdownMessage?.trim(),
    item.RawTextBody?.trim(),
    stripHtmlTags(item.RawHtmlBody),
  ];
  const content = candidates.find((c) => Boolean(c && c.length > 0)) ?? "";
  return content.slice(0, 8000).trim();
}

function normalizeSubjectForThread(subject: string): string {
  return subject
    .trim()
    .replace(/^(?:(?:re|fwd|rv)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

function extractHeaderEmails(headers: Record<string, unknown> | undefined): string[] {
  if (!headers) return [];
  const found: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (!FORWARDING_HEADER_KEYS.has(key.toLowerCase())) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      if (typeof entry !== "string") continue;
      for (const part of entry.split(",")) {
        const addr = extractEmailAddress(part);
        if (BASIC_EMAIL_REGEX.test(addr)) {
          found.push(addr);
        }
      }
    }
  }
  return found;
}

function collectCandidateRecipients(
  item: BrevoInboundItem,
  inboundDomain: string
): string[] {
  const toAddresses = (item.To ?? [])
    .map((entry) => extractEmailAddress(entry.Address ?? ""))
    .filter((addr) => BASIC_EMAIL_REGEX.test(addr));
  const ccAddresses = (item.Cc ?? [])
    .map((entry) => extractEmailAddress(entry.Address ?? ""))
    .filter((addr) => BASIC_EMAIL_REGEX.test(addr));
  const headerAddresses = extractHeaderEmails(item.Headers);

  const matchesInboundDomain = (email: string) =>
    email.endsWith(`@${inboundDomain}`);

  const prioritized = [
    ...toAddresses.filter(matchesInboundDomain),
    ...headerAddresses.filter(matchesInboundDomain),
    ...ccAddresses.filter(matchesInboundDomain),
    ...toAddresses,
    ...headerAddresses,
    ...ccAddresses,
  ];

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const addr of prioritized) {
    if (!seen.has(addr)) {
      seen.add(addr);
      unique.push(addr);
    }
  }
  return unique;
}

async function ensureEmailChannelForStore(params: {
  supabase: SupabaseClient;
  store: StoreRow;
  channels: EmailChannelRow[];
}): Promise<EmailChannelRow | null> {
  const existing = params.channels.find((ch) => ch.store_id === params.store.id);
  if (existing) {
    return existing;
  }

  const inboundSlug = buildStoreInboundSlug(params.store);
  const inboundEmail = buildStoreInboundEmail(params.store);

  const { data: created, error } = await params.supabase
    .from("channels")
    .insert({
      store_id: params.store.id,
      name: "Soporte Email",
      type: "email",
      credentials: {
        support_email: inboundEmail,
        from_email: DEFAULT_FROM_EMAIL,
        inbound_slug: inboundSlug,
        inbound_email: inboundEmail,
      },
    })
    .select("id, store_id, name, type, credentials")
    .single();

  if (error || !created) {
    console.error(
      "[Email Webhook] Failed to auto-create email channel for store:",
      params.store.id,
      error?.message
    );
    return null;
  }

  const channelRow = created as EmailChannelRow;
  params.channels.unshift(channelRow);
  return channelRow;
}

async function resolveStoreAndChannelForRecipients(params: {
  supabase: SupabaseClient;
  recipients: string[];
  stores: StoreRow[];
  channels: EmailChannelRow[];
}): Promise<{ store: StoreRow; channel: EmailChannelRow } | null> {
  const { supabase, recipients, stores, channels } = params;
  const storesById = new Map(stores.map((s) => [s.id, s]));

  for (const recipient of recipients) {
    const parts = parseEmailParts(recipient);
    if (!parts) continue;

    // 1. Match channel by stored inbound_slug or inbound_email
    const channelByInbound = channels.find((ch) => {
      const creds = parseEmailCredentials(ch.credentials);
      return (
        creds?.inbound_slug?.toLowerCase() === parts.baseSlug ||
        creds?.inbound_email?.toLowerCase() === parts.email
      );
    });
    if (channelByInbound) {
      const store = storesById.get(channelByInbound.store_id);
      if (store) {
        return { store, channel: channelByInbound };
      }
    }

    // 2. Match store by deterministic slug or full UUID
    let matchedStore =
      stores.find((s) => buildStoreInboundSlug(s) === parts.baseSlug) ??
      stores.find((s) => s.id.toLowerCase() === parts.baseSlug);

    // 3. Match store by 8-hex-char suffix/prefix from slug (e.g. mitienda-a1b2c3d4 or a1b2c3d4)
    if (!matchedStore) {
      const suffixMatch = parts.baseSlug.match(/(?:^|-)([0-9a-f]{8})$/);
      if (suffixMatch) {
        const hexPrefix = suffixMatch[1];
        matchedStore = stores.find((s) =>
          s.id.replace(/-/g, "").toLowerCase().startsWith(hexPrefix)
        );
      }
    }

    // 4. Match store by slugified store name (unique match)
    if (!matchedStore) {
      const nameMatches = stores.filter((s) => {
        const slug = slugifyStoreName(s.name);
        return (
          slug === parts.baseSlug ||
          (slug && slug.replace(/-/g, "") === parts.baseSlug.replace(/-/g, ""))
        );
      });
      if (nameMatches.length === 1) {
        matchedStore = nameMatches[0];
      }
    }

    if (matchedStore) {
      const channel = await ensureEmailChannelForStore({
        supabase,
        store: matchedStore,
        channels,
      });
      if (channel) {
        return { store: matchedStore, channel };
      }
    }

    // 5. Fallback: match channel by configured support_email
    const channelBySupport = channels.find((ch) => {
      const creds = parseEmailCredentials(ch.credentials);
      return creds?.support_email.toLowerCase() === parts.email;
    });
    if (channelBySupport) {
      const store = storesById.get(channelBySupport.store_id);
      if (store) {
        return { store, channel: channelBySupport };
      }
    }
  }

  return null;
}

async function findExistingEmailConversationId(params: {
  supabase: SupabaseClient;
  storeId: string;
  channelId: string;
  fromEmail: string;
  subject: string;
}): Promise<string | undefined> {
  const targetSubject = normalizeSubjectForThread(params.subject);
  const targetFrom = params.fromEmail.trim().toLowerCase();

  const { data, error } = await params.supabase
    .from("conversations")
    .select("id, external_thread_id")
    .eq("store_id", params.storeId)
    .eq("channel_id", params.channelId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return undefined;
  }

  for (const row of data as Array<{
    id: string;
    external_thread_id?: string | null;
  }>) {
    const meta = parseEmailThreadMeta(row.external_thread_id);
    if (!meta) continue;
    if (
      meta.fromEmail.trim().toLowerCase() === targetFrom &&
      normalizeSubjectForThread(meta.subject) === targetSubject
    ) {
      return row.id;
    }
  }

  return undefined;
}

async function processBrevoInboundWebhook(
  supabase: SupabaseClient,
  rawBody: unknown
) {
  const parsed = brevoInboundWebhookSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonCors(
      {
        error:
          parsed.error.issues[0]?.message ??
          "Invalid Brevo Inbound Parsing payload",
      },
      400
    );
  }

  const [storesResult, channelsResult] = await Promise.all([
    supabase.from("stores").select("id, name, language"),
    supabase
      .from("channels")
      .select("id, store_id, name, type, credentials")
      .eq("type", "email")
      .order("created_at", { ascending: false }),
  ]);

  if (storesResult.error) {
    return jsonCors({ error: storesResult.error.message }, 500);
  }
  if (channelsResult.error) {
    return jsonCors({ error: channelsResult.error.message }, 500);
  }

  const stores = (storesResult.data ?? []) as StoreRow[];
  const channels = (channelsResult.data ?? []) as EmailChannelRow[];
  const inboundDomain = getInboundEmailDomain();
  const configuredSender =
    process.env.BREVO_SENDER_EMAIL?.trim().toLowerCase() ?? "";

  const results: Array<Record<string, unknown>> = [];
  let processed = 0;

  for (const item of parsed.data.items) {
    const fromEmail = extractEmailAddress(
      item.From?.Address || item.ReplyTo?.Address || ""
    );

    if (!BASIC_EMAIL_REGEX.test(fromEmail)) {
      results.push({
        status: "ignored",
        reason: "Missing valid sender address",
      });
      continue;
    }

    if (
      (configuredSender && fromEmail === configuredSender) ||
      fromEmail.endsWith(`@${inboundDomain}`)
    ) {
      results.push({
        status: "ignored",
        reason: "Ignored self-sent inbound message to prevent loop",
        fromEmail,
      });
      continue;
    }

    const recipients = collectCandidateRecipients(item, inboundDomain);
    const resolved = await resolveStoreAndChannelForRecipients({
      supabase,
      recipients,
      stores,
      channels,
    });

    if (!resolved) {
      console.warn(
        "[Email Webhook] No store matched Brevo inbound recipients:",
        recipients
      );
      results.push({
        status: "ignored",
        reason: "Store not found for recipient",
        recipients,
      });
      continue;
    }

    const { store, channel } = resolved;
    const rawSubject = item.Subject?.trim() || "Sin asunto";
    const subject = rawSubject.slice(0, 300);
    const body = extractBrevoMessageBody(item);

    if (!body) {
      results.push({
        status: "ignored",
        reason: "Empty email body",
        storeId: store.id,
        channelId: channel.id,
      });
      continue;
    }

    const isReply = Boolean(item.InReplyTo?.trim()) || /^re:/i.test(subject);
    const existingConversationId = isReply
      ? await findExistingEmailConversationId({
          supabase,
          storeId: store.id,
          channelId: channel.id,
          fromEmail,
          subject,
        })
      : undefined;

    const formattedCustomerMessage = `Asunto: ${subject}\n\n${body}`;
    const externalThreadId = encodeEmailThreadMeta({ fromEmail, subject });

    const assistantResult = await runStoreAssistant({
      supabase,
      store,
      message: formattedCustomerMessage,
      conversationId: existingConversationId,
      channelId: channel.id,
      externalThreadId,
      usageEventType: "email_reply",
      includeUnapprovedHistory: false,
    });

    if (!assistantResult.ok) {
      console.error("[Email Webhook] Assistant failed for Brevo inbound item:", {
        storeId: store.id,
        error: assistantResult.error,
      });
      results.push({
        status: "error",
        storeId: store.id,
        channelId: channel.id,
        error: assistantResult.error,
      });
      continue;
    }

    const { conversation, assistantMessage, classification, decision } =
      assistantResult.data;
    const replySubject = formatReplySubject(subject);
    const replyToEmail = buildStoreInboundEmail(store, channel.credentials);
    let sent = false;
    let deliveryId: string | null = null;
    let deliveryError: string | null = null;

    if (decision.messageStatus === "auto_sent") {
      const sendResult = await sendStoreEmailReply({
        to: fromEmail,
        subject,
        bodyText: assistantMessage.content,
        replyTo: replyToEmail,
      });
      sent = sendResult.ok;
      deliveryId = sendResult.ok ? sendResult.id : null;
      deliveryError = sendResult.ok
        ? null
        : `Failed to send email via Brevo: ${sendResult.error}`;
      if (!sendResult.ok) {
        console.error(
          "[Email Webhook] Failed to send email via Brevo:",
          sendResult.error
        );
      }
    }

    processed += 1;
    results.push({
      status: decision.messageStatus,
      storeId: store.id,
      channelId: channel.id,
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      classification,
      emailDelivery: {
        sent,
        to: fromEmail,
        replyTo: replyToEmail,
        subject: replySubject,
        id: deliveryId,
        error: deliveryError,
      },
    });
  }

  return jsonCors(
    {
      ok: true,
      mode: "brevo_inbound",
      processed,
      total: results.length,
      results,
    },
    200
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return jsonCors(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server." },
      500
    );
  }

  if (!isGroqConfigured()) {
    console.error(
      "[Email Webhook API] GROQ_API_KEY is not configured on the server."
    );
    return jsonCors(
      { error: "GROQ_API_KEY is not configured on the server." },
      500
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonCors({ error: "Invalid JSON payload" }, 400);
  }

  const supabase = createAdminClient();

  if (isBrevoInboundPayload(rawBody)) {
    return await processBrevoInboundWebhook(supabase, rawBody);
  }

  const parsed = emailWebhookRequestSchema.safeParse(
    normalizeWebhookInput(rawBody)
  );
  if (!parsed.success) {
    return jsonCors(
      { error: parsed.error.issues[0]?.message ?? "Invalid email payload" },
      400
    );
  }

  const { storeId, channelId, fromEmail, subject, body, conversationId } =
    parsed.data;

  const [storeResult, channelResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, language")
      .eq("id", storeId)
      .maybeSingle(),
    supabase
      .from("channels")
      .select("id, store_id, name, type, credentials")
      .eq("id", channelId)
      .eq("store_id", storeId)
      .eq("type", "email")
      .maybeSingle(),
  ]);

  if (storeResult.error) {
    return jsonCors({ error: storeResult.error.message }, 500);
  }

  if (!storeResult.data) {
    return jsonCors({ error: "Store not found" }, 404);
  }

  if (channelResult.error) {
    return jsonCors({ error: channelResult.error.message }, 500);
  }

  if (!channelResult.data) {
    return jsonCors(
      { error: "Email channel not found for this store" },
      404
    );
  }

  const store = storeResult.data;
  const channel = channelResult.data;

  const formattedCustomerMessage = `Asunto: ${subject}\n\n${body}`;
  const externalThreadId = encodeEmailThreadMeta({ fromEmail, subject });

  const result = await runStoreAssistant({
    supabase,
    store,
    message: formattedCustomerMessage,
    conversationId,
    channelId: channel.id,
    externalThreadId,
    usageEventType: "email_reply",
    includeUnapprovedHistory: false,
  });

  if (!result.ok) {
    return jsonCors({ error: result.error }, result.status);
  }

  const { conversation, assistantMessage, classification, decision } =
    result.data;
  const replySubject = formatReplySubject(subject);
  const replyToEmail = buildStoreInboundEmail(store, channel.credentials);

  if (decision.messageStatus === "auto_sent") {
    const sendResult = await sendStoreEmailReply({
      to: fromEmail,
      subject,
      bodyText: assistantMessage.content,
      replyTo: replyToEmail,
    });

    if (!sendResult.ok) {
      console.error(
        "[Email Webhook] Failed to send email via Brevo:",
        sendResult.error
      );
    }

    return jsonCors({
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      status: "auto_sent",
      reply: assistantMessage.content,
      classification,
      decision: {
        status: decision.messageStatus,
        reasons: decision.reasons,
      },
      emailDelivery: {
        sent: sendResult.ok,
        to: fromEmail,
        replyTo: replyToEmail,
        subject: replySubject,
        id: sendResult.ok ? sendResult.id : null,
        error: sendResult.ok
          ? null
          : `Failed to send email via Brevo: ${sendResult.error}`,
      },
    });
  }

  return jsonCors({
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    status: "pending_approval",
    reply: assistantMessage.content,
    classification,
    decision: {
      status: decision.messageStatus,
      reasons: decision.reasons,
    },
    emailDelivery: {
      sent: false,
      to: fromEmail,
      replyTo: replyToEmail,
      subject: replySubject,
      id: null,
      error: null,
    },
  });
}
