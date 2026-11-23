import { NextResponse, type NextRequest } from "next/server";
import { runStoreAssistant } from "@/lib/ai/assistant-service";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import {
  DEFAULT_FROM_EMAIL,
  encodeEmailThreadMeta,
  formatReplySubject,
  parseEmailCredentials,
  sendStoreEmailReply,
} from "@/lib/email/resend";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { emailWebhookRequestSchema } from "@/lib/validation/channel";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
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

  if (!isGeminiConfigured()) {
    return jsonCors(
      { error: "GEMINI_API_KEY is not configured on the server." },
      500
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonCors({ error: "Invalid JSON payload" }, 400);
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
  const supabase = createAdminClient();

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

  if (decision.messageStatus === "auto_sent") {
    const emailCreds = parseEmailCredentials(channel.credentials);
    const sendResult = await sendStoreEmailReply({
      to: fromEmail,
      from: emailCreds?.from_email ?? DEFAULT_FROM_EMAIL,
      replyTo: emailCreds?.support_email,
      subject,
      bodyText: assistantMessage.content,
    });

    if (!sendResult.ok) {
      console.error("[Email Webhook] Resend send failed:", sendResult.error);
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
        subject: replySubject,
        id: sendResult.ok ? sendResult.id : null,
        error: sendResult.ok ? null : sendResult.error,
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
      subject: replySubject,
      id: null,
      error: null,
    },
  });
}
