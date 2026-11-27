import { NextResponse } from "next/server";
import { getMetaWhatsAppStatusSummary } from "@/lib/meta/whatsapp";
import { getAuthenticatedStore } from "@/lib/supabase/store";

export async function GET() {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  return NextResponse.json(getMetaWhatsAppStatusSummary());
}
