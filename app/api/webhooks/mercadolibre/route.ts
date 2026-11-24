import { NextResponse, type NextRequest } from "next/server";
import { runStoreAssistant } from "@/lib/ai/assistant-service";
import { isGroqConfigured } from "@/lib/ai/groq";
import {
  encodeMercadoLibreThreadMeta,
  formatMercadoLibreQuestionMessage,
} from "@/lib/mercadolibre/simulated";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { mercadoLibreWebhookRequestSchema } from "@/lib/validation/channel";

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
    ...(obj.simulated !== undefined ? { simulated: obj.simulated } : {}),
    storeId: obj.storeId ?? obj.store_id,
    channelId: obj.channelId ?? obj.channel_id,
    buyerNickname: obj.buyerNickname ?? obj.buyer_nickname,
    itemTitle: obj.itemTitle ?? obj.item_title,
    questionText: obj.questionText ?? obj.question_text ?? obj.question,
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

  if (!isGroqConfigured()) {
    console.error(
      "[Mercado Libre Webhook API] GROQ_API_KEY is not configured on the server."
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

  const parsed = mercadoLibreWebhookRequestSchema.safeParse(
    normalizeWebhookInput(rawBody)
  );
  if (!parsed.success) {
    return jsonCors(
      {
        error:
          parsed.error.issues[0]?.message ?? "Invalid Mercado Libre payload",
      },
      400
    );
  }

  if (parsed.data.simulated !== true) {
    return jsonCors(
      {
        error:
          "Only simulated Mercado Libre questions (simulated: true) are currently supported.",
      },
      501
    );
  }

  const {
    storeId,
    channelId,
    buyerNickname,
    itemTitle,
    questionText,
    conversationId,
  } = parsed.data;
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
      .eq("type", "mercadolibre")
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
      { error: "Mercado Libre channel not found for this store" },
      404
    );
  }

  const store = storeResult.data;
  const formattedCustomerMessage = formatMercadoLibreQuestionMessage({
    itemTitle,
    questionText,
  });
  const externalThreadId = encodeMercadoLibreThreadMeta({
    itemTitle,
    buyerNickname,
    mode: "simulated",
  });

  const result = await runStoreAssistant({
    supabase,
    store,
    message: formattedCustomerMessage,
    conversationId,
    channelId: channelResult.data.id,
    externalThreadId,
    usageEventType: "mercadolibre_reply",
    includeUnapprovedHistory: false,
  });

  if (!result.ok) {
    return jsonCors({ error: result.error }, result.status);
  }

  const { conversation, assistantMessage, classification, decision } =
    result.data;

  return jsonCors({
    simulated: true,
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    status: decision.messageStatus,
    reply: assistantMessage.content,
    metadata: {
      item_title: itemTitle,
      buyer_nickname: buyerNickname,
      mode: "simulated",
    },
    classification,
    decision: {
      status: decision.messageStatus,
      reasons: decision.reasons,
    },
    mercadoLibreDelivery: {
      simulated: true,
      sent: decision.messageStatus === "auto_sent",
      buyerNickname,
      itemTitle,
    },
  });
}
