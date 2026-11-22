import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedStore } from "@/lib/supabase/store";
import {
  AI_LANGUAGES,
  AI_TONES,
  ASSISTANT_TOPICS,
  RESPONSE_MODES,
  aiSettingsUpdateSchema,
  type AiLanguage,
  type AiTone,
  type AssistantTopic,
  type ResponseMode,
} from "@/lib/validation/ai";

const DEFAULT_ALLOWED_TOPICS: AssistantTopic[] = [
  "products",
  "shipping",
  "returns",
  "payments",
];

const DEFAULT_RESTRICTED_TOPICS: AssistantTopic[] = [
  "refund_execution",
  "order_changes",
];

function sanitizeTopics(input: unknown): AssistantTopic[] {
  if (!Array.isArray(input)) return [];
  const validSet = new Set<string>(ASSISTANT_TOPICS);
  return Array.from(
    new Set(
      input.filter((item): item is AssistantTopic =>
        typeof item === "string" && validSet.has(item)
      )
    )
  );
}

function normalizeSettings(
  storeId: string,
  row: {
    response_mode?: string;
    tone?: string;
    language?: string;
    confidence_threshold?: number;
    allowed_topics?: unknown;
    restricted_topics?: unknown;
  } | null
) {
  const responseMode: ResponseMode = RESPONSE_MODES.includes(
    row?.response_mode as ResponseMode
  )
    ? (row!.response_mode as ResponseMode)
    : "approval";

  const tone: AiTone = AI_TONES.includes(row?.tone as AiTone)
    ? (row!.tone as AiTone)
    : "friendly";

  const language: AiLanguage = AI_LANGUAGES.includes(row?.language as AiLanguage)
    ? (row!.language as AiLanguage)
    : "auto";

  const restricted = row
    ? sanitizeTopics(row.restricted_topics)
    : DEFAULT_RESTRICTED_TOPICS;

  const restrictedSet = new Set(restricted);
  const allowedRaw = row
    ? sanitizeTopics(row.allowed_topics)
    : DEFAULT_ALLOWED_TOPICS;
  const allowed = allowedRaw.filter((t) => !restrictedSet.has(t));

  return {
    store_id: storeId,
    response_mode: responseMode,
    tone,
    language,
    confidence_threshold:
      typeof row?.confidence_threshold === "number"
        ? row.confidence_threshold
        : 0.85,
    allowed_topics: allowed,
    restricted_topics: restricted,
  };
}

export async function GET() {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  const { data, error } = await supabase
    .from("ai_settings")
    .select(
      "store_id, response_mode, tone, language, confidence_threshold, allowed_topics, restricted_topics"
    )
    .eq("store_id", store.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    store: {
      id: store.id,
      name: store.name,
      language: store.language,
    },
    settings: normalizeSettings(store.id, data),
  });
}

export async function PUT(request: NextRequest) {
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

  const parsed = aiSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid AI settings payload" },
      { status: 400 }
    );
  }

  const restrictedSet = new Set(parsed.data.restricted_topics);
  const allowed = Array.from(new Set(parsed.data.allowed_topics)).filter(
    (topic) => !restrictedSet.has(topic)
  );
  const restricted = Array.from(restrictedSet);

  const { data, error } = await supabase
    .from("ai_settings")
    .upsert(
      {
        store_id: store.id,
        response_mode: parsed.data.response_mode,
        tone: parsed.data.tone,
        language: parsed.data.language,
        ...(parsed.data.confidence_threshold !== undefined
          ? { confidence_threshold: parsed.data.confidence_threshold }
          : {}),
        allowed_topics: allowed,
        restricted_topics: restricted,
      },
      { onConflict: "store_id" }
    )
    .select(
      "store_id, response_mode, tone, language, confidence_threshold, allowed_topics, restricted_topics"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    store: {
      id: store.id,
      name: store.name,
      language: store.language,
    },
    settings: normalizeSettings(store.id, data),
  });
}
