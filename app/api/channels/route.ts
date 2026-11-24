import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_FROM_EMAIL } from "@/lib/email/resend";
import { DEFAULT_MELI_SELLER_NICKNAME } from "@/lib/mercadolibre/simulated";
import { getAuthenticatedStore } from "@/lib/supabase/store";
import {
  createChannelSchema,
  deleteChannelSchema,
} from "@/lib/validation/channel";

export async function GET() {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  const { data, error } = await supabase
    .from("channels")
    .select("id, store_id, name, type, credentials, created_at")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    store: {
      id: store.id,
      name: store.name,
      language: store.language,
    },
    channels: data ?? [],
  });
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

  const parsed = createChannelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid channel payload" },
      { status: 400 }
    );
  }

  const credentials =
    parsed.data.type === "email"
      ? {
          support_email: parsed.data.credentials!.support_email!.trim(),
          from_email:
            parsed.data.credentials?.from_email?.trim() || DEFAULT_FROM_EMAIL,
        }
      : parsed.data.type === "mercadolibre"
        ? {
            mode: "simulated" as const,
            seller_nickname:
              parsed.data.credentials?.seller_nickname?.trim() ||
              DEFAULT_MELI_SELLER_NICKNAME,
          }
        : undefined;

  const { data, error } = await supabase
    .from("channels")
    .insert({
      store_id: store.id,
      name: parsed.data.name,
      type: parsed.data.type,
      ...(credentials ? { credentials } : {}),
    })
    .select("id, store_id, name, type, credentials, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ channel: data }, { status: 201 });
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

  const parsed = deleteChannelSchema.safeParse({ id: idParam });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid channel id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("channels")
    .delete()
    .eq("id", parsed.data.id)
    .eq("store_id", store.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, id: data.id });
}
