import { NextResponse } from "next/server";
import { getAuthenticatedStore } from "@/lib/supabase/store";

export async function GET() {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  const { data, error } = await supabase
    .from("shopify_integrations")
    .select(
      "id, store_id, shop_domain, scopes, status, last_synced_at, updated_at"
    )
    .eq("store_id", store.id)
    .eq("status", "connected")
    .maybeSingle();

  if (error) {
    const missingTable =
      error.code === "42P01" ||
      error.message.includes("shopify_integrations") ||
      error.message.includes("schema cache");

    if (missingTable) {
      return NextResponse.json({
        connected: false,
        integration: null,
        migrationRequired: true,
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    connected: Boolean(data),
    integration: data ?? null,
  });
}
