import { NextResponse, type NextRequest } from "next/server";
import { runStoreAssistant } from "@/lib/ai/assistant-service";
import { isGroqConfigured } from "@/lib/ai/groq";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { widgetChatRequestSchema } from "@/lib/validation/ai";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

function jsonCors(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
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
    console.error("[Widget Chat API] GROQ_API_KEY is not configured on the server.");
    return jsonCors(
      { error: "GROQ_API_KEY is not configured on the server." },
      500
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonCors({ error: "Invalid JSON payload" }, 400);
  }

  const parsed = widgetChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonCors(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      400
    );
  }

  const { storeId, channelId, conversationId, message } = parsed.data;
  const supabase = createAdminClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, language")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError) {
    return jsonCors({ error: storeError.message }, 500);
  }

  if (!store) {
    return jsonCors({ error: "Store not found" }, 404);
  }

  let verifiedChannelId: string | null = null;
  if (channelId) {
    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id")
      .eq("id", channelId)
      .eq("store_id", store.id)
      .maybeSingle();

    if (channelError) {
      return jsonCors({ error: channelError.message }, 500);
    }

    if (!channel) {
      return jsonCors({ error: "Channel not found for this store" }, 404);
    }

    verifiedChannelId = channel.id;
  }

  const result = await runStoreAssistant({
    supabase,
    store,
    message,
    conversationId,
    channelId: verifiedChannelId,
    usageEventType: "widget_reply",
    includeUnapprovedHistory: false,
  });

  if (!result.ok) {
    return jsonCors({ error: result.error }, result.status);
  }

  const { conversation, assistantMessage, decision, effectiveLanguage } =
    result.data;

  if (decision.messageStatus === "auto_sent") {
    return jsonCors({
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      status: "auto_sent",
      language: effectiveLanguage,
      reply: assistantMessage.content,
    });
  }

  // The draft is stored in messages with status='pending_approval' for owner review.
  // Never expose unapproved drafts to the end customer; return a polite waiting message.
  const waitingReply =
    effectiveLanguage === "en"
      ? "Thank you for your question. A store advisor will reply to you shortly."
      : "Gracias por tu consulta, un asesor de la tienda te responderá a la brevedad.";

  return jsonCors({
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    status: "pending_approval",
    language: effectiveLanguage,
    reply: waitingReply,
  });
}
