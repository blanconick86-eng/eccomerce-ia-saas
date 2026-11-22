import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function getAuthenticatedStore() {
  if (!isSupabaseConfigured()) {
    return {
      errorResponse: NextResponse.json(
        { error: "Supabase environment variables are not configured" },
        { status: 500 }
      ),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, language")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (storeError) {
    return {
      errorResponse: NextResponse.json(
        { error: storeError.message },
        { status: 500 }
      ),
    };
  }

  if (!store) {
    return {
      errorResponse: NextResponse.json(
        { error: "No store found for the authenticated user" },
        { status: 404 }
      ),
    };
  }

  return { supabase, user, store };
}
