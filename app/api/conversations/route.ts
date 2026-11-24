import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_FROM_EMAIL,
  formatReplySubject,
  parseEmailCredentials,
  parseEmailThreadMeta,
  sendStoreEmailReply,
} from "@/lib/email/resend";
import {
  isSimulatedMercadoLibreChannel,
  parseMercadoLibreThreadMeta,
} from "@/lib/mercadolibre/simulated";
import { getAuthenticatedStore } from "@/lib/supabase/store";
import { messageModerationSchema } from "@/lib/validation/ai";
import type { ChannelSummary, Conversation, Message } from "@/types/database";

type ChannelWithCreds = ChannelSummary & {
  credentials?: unknown;
};

type RawConversationRow = Conversation & {
  channels?: ChannelSummary | ChannelSummary[] | null;
};

function normalizeChannelWithCreds(relation: unknown): ChannelWithCreds | null {
  if (!relation) return null;
  const candidate = Array.isArray(relation) ? relation[0] : relation;
  if (
    candidate &&
    typeof candidate === "object" &&
    typeof (candidate as { id?: unknown }).id === "string" &&
    typeof (candidate as { name?: unknown }).name === "string" &&
    typeof (candidate as { type?: unknown }).type === "string"
  ) {
    const row = candidate as {
      id: string;
      name: string;
      type: string;
      credentials?: unknown;
    };
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      credentials: row.credentials,
    };
  }
  return null;
}

function normalizeChannelRelation(
  relation: RawConversationRow["channels"]
): ChannelSummary | null {
  const full = normalizeChannelWithCreds(relation);
  if (!full) return null;
  return {
    id: full.id,
    name: full.name,
    type: full.type,
  };
}

export async function GET() {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  const [conversationsResult, channelsResult] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "id, store_id, channel_id, external_thread_id, status, language, created_at, channels(id, name, type)"
      )
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("channels")
      .select("id, name, type")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false }),
  ]);

  if (conversationsResult.error) {
    return NextResponse.json(
      { error: conversationsResult.error.message },
      { status: 500 }
    );
  }

  if (channelsResult.error) {
    return NextResponse.json(
      { error: channelsResult.error.message },
      { status: 500 }
    );
  }

  const rawConversations = (conversationsResult.data ??
    []) as RawConversationRow[];
  const channels = (channelsResult.data ?? []) as ChannelSummary[];

  if (rawConversations.length === 0) {
    return NextResponse.json({ conversations: [], channels });
  }

  const convIds = rawConversations.map((c) => c.id);
  const { data: messagesData, error: msgError } = await supabase
    .from("messages")
    .select("id, conversation_id, role, content, status, created_at")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: true });

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  const messagesByConv = new Map<string, Message[]>();
  for (const msg of (messagesData ?? []) as Message[]) {
    const list = messagesByConv.get(msg.conversation_id) ?? [];
    list.push(msg);
    messagesByConv.set(msg.conversation_id, list);
  }

  const enriched = rawConversations.map((row) => ({
    id: row.id,
    store_id: row.store_id,
    channel_id: row.channel_id ?? null,
    external_thread_id: row.external_thread_id ?? null,
    status: row.status,
    language: row.language,
    created_at: row.created_at,
    channel: normalizeChannelRelation(row.channels),
    messages: messagesByConv.get(row.id) ?? [],
  }));

  return NextResponse.json({ conversations: enriched, channels });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = messageModerationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid moderation payload" },
      { status: 400 }
    );
  }

  const { messageId, action, content } = parsed.data;
  if (action === "edit_and_approve" && !content) {
    return NextResponse.json(
      { error: "Edited message content is required" },
      { status: 400 }
    );
  }

  const { data: targetMessage, error: lookupError } = await supabase
    .from("messages")
    .select("id, conversation_id, role, content, status, created_at")
    .eq("id", messageId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  if (!targetMessage) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const { data: ownerConv, error: convLookupError } = await supabase
    .from("conversations")
    .select(
      "id, store_id, channel_id, external_thread_id, channels(id, name, type, credentials)"
    )
    .eq("id", targetMessage.conversation_id)
    .eq("store_id", store.id)
    .maybeSingle();

  if (convLookupError) {
    return NextResponse.json(
      { error: convLookupError.message },
      { status: 500 }
    );
  }

  if (!ownerConv) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (targetMessage.role !== "assistant") {
    return NextResponse.json(
      { error: "Only assistant messages can be moderated" },
      { status: 400 }
    );
  }

  const nextMessageStatus = action === "reject" ? "rejected" : "approved";
  const nextConversationStatus =
    action === "reject" ? "rejected" : "resolved";

  const convChannel = normalizeChannelWithCreds(
    (ownerConv as { channels?: unknown }).channels
  );

  let emailDelivery:
    | { sent: true; to: string; subject: string; id: string | null }
    | undefined;
  let mercadoLibreDelivery:
    | {
        sent: true;
        simulated: true;
        buyerNickname: string | null;
        itemTitle: string | null;
      }
    | undefined;

  if (
    (action === "approve" || action === "edit_and_approve") &&
    convChannel?.type === "email"
  ) {
    const threadMeta = parseEmailThreadMeta(
      (ownerConv as { external_thread_id?: string | null }).external_thread_id
    );
    if (!threadMeta?.fromEmail) {
      return NextResponse.json(
        { error: "Conversation is missing recipient email metadata" },
        { status: 400 }
      );
    }

    const emailCreds = parseEmailCredentials(convChannel.credentials);
    const finalContent =
      action === "edit_and_approve" && content
        ? content
        : targetMessage.content;

    const sendResult = await sendStoreEmailReply({
      to: threadMeta.fromEmail,
      from: emailCreds?.from_email ?? DEFAULT_FROM_EMAIL,
      replyTo: emailCreds?.support_email,
      subject: threadMeta.subject,
      bodyText: finalContent,
    });

    if (!sendResult.ok) {
      return NextResponse.json(
        { error: `Failed to send email via Resend: ${sendResult.error}` },
        { status: 502 }
      );
    }

    emailDelivery = {
      sent: true,
      to: threadMeta.fromEmail,
      subject: formatReplySubject(threadMeta.subject),
      id: sendResult.id,
    };
  } else if (
    (action === "approve" || action === "edit_and_approve") &&
    convChannel?.type === "mercadolibre"
  ) {
    if (!isSimulatedMercadoLibreChannel(convChannel.credentials)) {
      return NextResponse.json(
        {
          error:
            "Mercado Libre live OAuth delivery is not configured yet. Use simulated mode.",
        },
        { status: 501 }
      );
    }

    const mlMeta = parseMercadoLibreThreadMeta(
      (ownerConv as { external_thread_id?: string | null }).external_thread_id
    );

    mercadoLibreDelivery = {
      sent: true,
      simulated: true,
      buyerNickname: mlMeta?.buyer_nickname || null,
      itemTitle: mlMeta?.item_title || null,
    };
  }

  const updateFields =
    action === "edit_and_approve" && content
      ? { status: nextMessageStatus, content }
      : { status: nextMessageStatus };

  const { data: updatedMessage, error: updateMsgError } = await supabase
    .from("messages")
    .update(updateFields)
    .eq("id", messageId)
    .eq("conversation_id", ownerConv.id)
    .select("id, conversation_id, role, content, status, created_at")
    .single();

  if (updateMsgError) {
    return NextResponse.json(
      { error: updateMsgError.message },
      { status: 500 }
    );
  }

  const { error: updateConvError } = await supabase
    .from("conversations")
    .update({ status: nextConversationStatus })
    .eq("id", targetMessage.conversation_id)
    .eq("store_id", store.id);

  if (updateConvError) {
    return NextResponse.json(
      { error: updateConvError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: updatedMessage,
    conversationStatus: nextConversationStatus,
    ...(emailDelivery ? { emailDelivery } : {}),
    ...(mercadoLibreDelivery ? { mercadoLibreDelivery } : {}),
  });
}
