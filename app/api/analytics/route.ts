import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedStore } from "@/lib/supabase/store";
import type { Conversation, Message, UsageEvent } from "@/types/database";

type RangeKey = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<RangeKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const BUCKET_COUNT: Record<RangeKey, number> = {
  "7d": 7,
  "30d": 6,
  "90d": 6,
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function formatUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(5, 10);
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  const rawRange = request.nextUrl.searchParams.get("range");
  const range: RangeKey =
    rawRange === "7d" || rawRange === "30d" || rawRange === "90d"
      ? rawRange
      : "30d";

  const [productsRes, policiesRes, conversationsRes, usageRes] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, stock_status")
        .eq("store_id", store.id),
      supabase
        .from("policies")
        .select("id", { count: "exact", head: true })
        .eq("store_id", store.id),
      supabase
        .from("conversations")
        .select("id, store_id, status, language, created_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("usage_events")
        .select("id, store_id, event_type, quantity, created_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  if (productsRes.error) {
    return NextResponse.json(
      { error: productsRes.error.message },
      { status: 500 }
    );
  }
  if (policiesRes.error) {
    return NextResponse.json(
      { error: policiesRes.error.message },
      { status: 500 }
    );
  }
  if (conversationsRes.error) {
    return NextResponse.json(
      { error: conversationsRes.error.message },
      { status: 500 }
    );
  }
  if (usageRes.error) {
    return NextResponse.json(
      { error: usageRes.error.message },
      { status: 500 }
    );
  }

  const products = productsRes.data ?? [];
  const totalProducts = products.length;
  const availableProducts = products.filter(
    (p) => p.stock_status !== "out_of_stock"
  ).length;
  const totalPolicies = policiesRes.count ?? 0;

  const conversations = (conversationsRes.data ?? []) as Conversation[];
  const usageEvents = (usageRes.data ?? []) as UsageEvent[];

  const messages: Message[] = [];
  if (conversations.length > 0) {
    const convIds = conversations.map((c) => c.id);
    for (const chunk of chunkArray(convIds, 500)) {
      const { data: msgChunk, error: msgError } = await supabase
        .from("messages")
        .select("id, conversation_id, role, content, status, created_at")
        .in("conversation_id", chunk)
        .order("created_at", { ascending: true });

      if (msgError) {
        return NextResponse.json(
          { error: msgError.message },
          { status: 500 }
        );
      }

      if (msgChunk) {
        messages.push(...(msgChunk as Message[]));
      }
    }
  }

  const messagesByConv = new Map<string, Message[]>();
  for (const msg of messages) {
    const list = messagesByConv.get(msg.conversation_id) ?? [];
    list.push(msg);
    messagesByConv.set(msg.conversation_id, list);
  }

  const customerMessages = messages.filter((m) => m.role === "customer");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  const approvedManual = assistantMessages.filter(
    (m) => m.status === "approved"
  ).length;
  const autoSentResponses = assistantMessages.filter(
    (m) => m.status === "auto_sent"
  ).length;
  const approvedResponses = approvedManual + autoSentResponses;
  const pendingResponses = assistantMessages.filter(
    (m) => m.status === "pending_approval"
  ).length;
  const rejectedResponses = assistantMessages.filter(
    (m) => m.status === "rejected"
  ).length;

  const totalUsageQuantity = usageEvents.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  // Recent Activity (up to 10 most recent conversations)
  const recentActivity = conversations.slice(0, 10).map((conv) => {
    const convMessages = messagesByConv.get(conv.id) ?? [];
    const customerMsgs = convMessages.filter((m) => m.role === "customer");
    const assistantMsgs = convMessages.filter((m) => m.role === "assistant");
    const latestCustomer = customerMsgs[customerMsgs.length - 1];
    const latestAssistant = assistantMsgs[assistantMsgs.length - 1];

    return {
      id: conv.id,
      language: conv.language,
      createdAt: conv.created_at,
      queryPreview: latestCustomer?.content ?? convMessages[0]?.content ?? "",
      replyStatus: latestAssistant?.status ?? conv.status,
      messagesCount: convMessages.length,
    };
  });

  // Range-scoped metrics
  const days = RANGE_DAYS[range];
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();
  const endUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  const startUtcMs = endUtcMs - days * dayMs;

  const inRange = (isoDate: string) => {
    const ts = Date.parse(isoDate);
    return Number.isFinite(ts) && ts >= startUtcMs && ts < endUtcMs;
  };

  const conversationsInRange = conversations.filter((c) =>
    inRange(c.created_at)
  );
  const customerMsgsInRange = customerMessages.filter((m) =>
    inRange(m.created_at)
  );
  const assistantMsgsInRange = assistantMessages.filter((m) =>
    inRange(m.created_at)
  );
  const usageInRange = usageEvents.filter((u) => inRange(u.created_at));

  const approvedManualInRange = assistantMsgsInRange.filter(
    (m) => m.status === "approved"
  ).length;
  const autoSentInRange = assistantMsgsInRange.filter(
    (m) => m.status === "auto_sent"
  ).length;
  const approvedInRange = approvedManualInRange + autoSentInRange;
  const pendingInRange = assistantMsgsInRange.filter(
    (m) => m.status === "pending_approval"
  ).length;
  const rejectedInRange = assistantMsgsInRange.filter(
    (m) => m.status === "rejected"
  ).length;
  const usageQuantityInRange = usageInRange.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  const totalRepliesInRange = assistantMsgsInRange.length;
  const approvalRate =
    totalRepliesInRange > 0
      ? Number(((approvedInRange / totalRepliesInRange) * 100).toFixed(1))
      : 0;
  const autoSentRate =
    totalRepliesInRange > 0
      ? Number(((autoSentInRange / totalRepliesInRange) * 100).toFixed(1))
      : 0;

  // Timeline buckets
  const bucketCount = BUCKET_COUNT[range];
  const bucketSpanMs = (days * dayMs) / bucketCount;
  const timeline = Array.from({ length: bucketCount }, (_, idx) => {
    const bStart = startUtcMs + idx * bucketSpanMs;
    const bEnd = startUtcMs + (idx + 1) * bucketSpanMs;
    const label =
      range === "7d"
        ? formatUtcDay(bStart)
        : `${formatUtcDay(bStart)}–${formatUtcDay(bEnd - dayMs)}`;

    const bucketMsgs = assistantMsgsInRange.filter((m) => {
      const ts = Date.parse(m.created_at);
      return Number.isFinite(ts) && ts >= bStart && ts < bEnd;
    });

    const approved = bucketMsgs.filter(
      (m) => m.status === "approved" || m.status === "auto_sent"
    ).length;
    const pending = bucketMsgs.filter(
      (m) => m.status === "pending_approval"
    ).length;

    return {
      label,
      total: bucketMsgs.length,
      approved,
      pending,
    };
  });

  // Status breakdown
  const statusCounts = [
    { status: "auto_sent", count: autoSentInRange },
    { status: "approved", count: approvedManualInRange },
    { status: "pending_approval", count: pendingInRange },
    { status: "rejected", count: rejectedInRange },
  ];
  const statusBreakdown = statusCounts.map((item) => ({
    ...item,
    share:
      totalRepliesInRange > 0
        ? Math.round((item.count / totalRepliesInRange) * 100)
        : 0,
  }));

  // Language breakdown
  const langMap = new Map<string, number>();
  for (const conv of conversationsInRange) {
    const lang = (conv.language || "es").toLowerCase();
    langMap.set(lang, (langMap.get(lang) ?? 0) + 1);
  }
  const convCountInRange = conversationsInRange.length;
  const languageBreakdown = Array.from(langMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => ({
      language,
      count,
      share:
        convCountInRange > 0 ? Math.round((count / convCountInRange) * 100) : 0,
    }));

  // Usage by event type (all-time from fetched usage events)
  const usageMap = new Map<string, { totalQuantity: number; count: number }>();
  for (const event of usageInRange) {
    const current = usageMap.get(event.event_type) ?? {
      totalQuantity: 0,
      count: 0,
    };
    usageMap.set(event.event_type, {
      totalQuantity: current.totalQuantity + (Number(event.quantity) || 0),
      count: current.count + 1,
    });
  }
  const usageByEventType = Array.from(usageMap.entries()).map(
    ([eventType, stats]) => ({
      eventType,
      ...stats,
    })
  );

  return NextResponse.json({
    store: {
      name: store.name,
      language: store.language,
    },
    overview: {
      totalProducts,
      availableProducts,
      totalPolicies,
      totalConversations: conversations.length,
      totalQueries: customerMessages.length,
      totalAssistantReplies: assistantMessages.length,
      approvedResponses,
      approvedManual,
      autoSentResponses,
      pendingResponses,
      rejectedResponses,
      totalUsageQuantity,
      totalUsageEventsCount: usageEvents.length,
    },
    recentActivity,
    rangeMetrics: {
      range,
      queriesInRange: customerMsgsInRange.length,
      conversationsInRange: conversationsInRange.length,
      assistantRepliesInRange: totalRepliesInRange,
      approvedInRange,
      approvedManualInRange,
      autoSentInRange,
      pendingInRange,
      rejectedInRange,
      usageQuantityInRange,
      usageEventsInRange: usageInRange.length,
      approvalRate,
      autoSentRate,
      timeline,
      statusBreakdown,
      languageBreakdown,
      usageByEventType,
      recentUsageEvents: usageEvents.slice(0, 15),
    },
  });
}
