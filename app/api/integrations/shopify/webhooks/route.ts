import { NextResponse, type NextRequest } from "next/server";
import {
  fetchShopCurrency,
  getShopifyConfig,
  normalizeShopDomain,
  type ShopifyProduct,
} from "@/lib/shopify/client";
import {
  deleteShopifyProductForStore,
  upsertShopifyProductsForStore,
} from "@/lib/shopify/products";
import { verifyShopifyWebhookHmac } from "@/lib/shopify/webhooks";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const { clientSecret } = getShopifyConfig();
  if (!clientSecret) {
    return NextResponse.json(
      { error: "SHOPIFY_CLIENT_SECRET is not configured on the server" },
      { status: 500 }
    );
  }

  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyWebhookHmac(rawBody, hmacHeader, clientSecret)) {
    return NextResponse.json(
      { error: "Invalid Shopify webhook signature" },
      { status: 401 }
    );
  }

  const shopDomain = normalizeShopDomain(
    request.headers.get("x-shopify-shop-domain")
  );
  const topic = request.headers.get("x-shopify-topic")?.trim().toLowerCase() ?? "";

  if (!shopDomain || !topic) {
    return NextResponse.json(
      { error: "Missing X-Shopify-Shop-Domain or X-Shopify-Topic header" },
      { status: 400 }
    );
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Invalid Shopify webhook JSON object" },
        { status: 400 }
      );
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid Shopify webhook JSON body" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: integrations, error: integrationError } = await supabase
    .from("shopify_integrations")
    .select("id, store_id, access_token")
    .eq("shop_domain", shopDomain)
    .eq("status", "connected");

  if (integrationError) {
    console.error(
      "[Shopify Webhooks] Failed to lookup shop integration:",
      integrationError.message
    );
    return NextResponse.json(
      { error: integrationError.message },
      { status: 500 }
    );
  }

  if (!integrations || integrations.length === 0) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "No active integration found for shop domain",
    });
  }

  const rawProductId = payload.id;
  const externalId =
    typeof rawProductId === "number" || typeof rawProductId === "string"
      ? String(rawProductId).trim()
      : "";

  if (topic === "products/create" || topic === "products/update") {
    if (!externalId) {
      return NextResponse.json(
        { error: "Missing product id in webhook payload" },
        { status: 400 }
      );
    }

    const shopifyProduct = payload as unknown as ShopifyProduct;
    const nowIso = new Date().toISOString();

    for (const integration of integrations) {
      let currency = "USD";

      const { data: existingCurrencyRow } = await supabase
        .from("products")
        .select("currency")
        .eq("store_id", integration.store_id)
        .eq("source", "shopify")
        .limit(1)
        .maybeSingle();

      if (existingCurrencyRow?.currency) {
        currency = existingCurrencyRow.currency;
      } else if (integration.access_token) {
        currency = await fetchShopCurrency(
          shopDomain,
          integration.access_token
        );
      }

      await upsertShopifyProductsForStore({
        supabase,
        storeId: integration.store_id,
        shopifyProducts: [shopifyProduct],
        currency,
      });

      await supabase
        .from("shopify_integrations")
        .update({ last_synced_at: nowIso, updated_at: nowIso })
        .eq("id", integration.id);
    }

    return NextResponse.json({
      ok: true,
      topic,
      shopDomain,
      externalId,
    });
  }

  if (topic === "products/delete") {
    if (!externalId) {
      return NextResponse.json(
        { error: "Missing product id in delete webhook payload" },
        { status: 400 }
      );
    }

    for (const integration of integrations) {
      await deleteShopifyProductForStore({
        supabase,
        storeId: integration.store_id,
        externalId,
      });
    }

    return NextResponse.json({
      ok: true,
      topic,
      shopDomain,
      externalId,
      deleted: true,
    });
  }

  return NextResponse.json({
    ok: true,
    ignored: true,
    topic,
    shopDomain,
  });
}
