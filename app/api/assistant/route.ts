import { NextResponse, type NextRequest } from "next/server";
import { runStoreAssistant } from "@/lib/ai/assistant-service";
import { isGroqConfigured } from "@/lib/ai/groq";
import { getAuthenticatedStore } from "@/lib/supabase/store";
import { assistantRequestSchema } from "@/lib/validation/ai";

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  if (!isGroqConfigured()) {
    console.error("[Assistant API] GROQ_API_KEY is not configured on the server.");
    return NextResponse.json(
      { error: "GROQ_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const { supabase, store } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      { status: 400 }
    );
  }

  const { conversationId, message } = parsed.data;
  const result = await runStoreAssistant({
    supabase,
    store,
    message,
    conversationId,
    usageEventType: "assistant_reply",
    includeUnapprovedHistory: true,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  const {
    conversation,
    customerMessage,
    assistantMessage,
    classification,
    decision,
    retrievedProductsCount,
    policiesCount,
  } = result.data;

  return NextResponse.json({
    conversation,
    customerMessage,
    assistantMessage,
    classification,
    decision: {
      status: decision.messageStatus,
      reasons: decision.reasons,
    },
    retrievedProductsCount,
    policiesCount,
  });
}
