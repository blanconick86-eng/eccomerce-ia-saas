import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedStore } from "@/lib/supabase/store";
import {
  createPolicySchema,
  deletePolicySchema,
  updatePolicySchema,
} from "@/lib/validation/policy";

export async function GET() {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  const { data, error } = await supabase
    .from("policies")
    .select("id, store_id, type, content, language, updated_at")
    .eq("store_id", store.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ policies: data ?? [] });
}

export async function POST(request: NextRequest) {
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

  const parsed = createPolicySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid policy payload" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("policies")
    .insert({
      store_id: store.id,
      type: parsed.data.type,
      language: parsed.data.language,
      content: parsed.data.content,
    })
    .select("id, store_id, type, content, language, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ policy: data }, { status: 201 });
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

  const parsed = updatePolicySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid policy update payload" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("policies")
    .update({
      type: parsed.data.type,
      language: parsed.data.language,
      content: parsed.data.content,
    })
    .eq("id", parsed.data.id)
    .eq("store_id", store.id)
    .select("id, store_id, type, content, language, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  return NextResponse.json({ policy: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  let idParam = request.nextUrl.searchParams.get("id");

  if (!idParam) {
    try {
      const body = (await request.json()) as { id?: unknown };
      if (typeof body?.id === "string") {
        idParam = body.id;
      }
    } catch {
      // Ignore empty body
    }
  }

  const parsed = deletePolicySchema.safeParse({ id: idParam });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid policy id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("policies")
    .delete()
    .eq("id", parsed.data.id)
    .eq("store_id", store.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, id: data.id });
}
