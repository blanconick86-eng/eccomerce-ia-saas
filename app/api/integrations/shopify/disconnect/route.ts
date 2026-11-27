import { NextResponse } from "next/server";
import { getAuthenticatedStore } from "@/lib/supabase/store";

export async function DELETE() {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  const { error } = await supabase
    .from("shopify_integrations")
    .delete()
    .eq("store_id", store.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, disconnected: true });
}
