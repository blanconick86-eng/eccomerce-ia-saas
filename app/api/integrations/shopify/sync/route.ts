import { NextResponse } from "next/server";
import {
  fetchAllShopifyProducts,
  fetchShopCurrency,
  type ShopifyProduct,
} from "@/lib/shopify/client";
import { upsertShopifyProductsForStore } from "@/lib/shopify/products";
import { registerShopifyWebhooks } from "@/lib/shopify/webhooks";
import { getAuthenticatedStore } from "@/lib/supabase/store";

export async function POST() {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;

  const { data: integration, error: integrationError } = await supabase
    .from("shopify_integrations")
    .select("id, shop_domain, access_token, status")
    .eq("store_id", store.id)
    .eq("status", "connected")
    .maybeSingle();

  if (integrationError) {
    return NextResponse.json(
      { error: integrationError.message },
      { status: 500 }
    );
  }

  if (!integration || !integration.access_token) {
    return NextResponse.json(
      { error: "Shopify store is not connected" },
      { status: 404 }
    );
  }

  let shopifyProducts: ShopifyProduct[];
  let shopCurrency = "USD";

  try {
    const [fetchedProducts, fetchedCurrency] = await Promise.all([
      fetchAllShopifyProducts(integration.shop_domain, integration.access_token),
      fetchShopCurrency(integration.shop_domain, integration.access_token),
      registerShopifyWebhooks(
        integration.shop_domain,
        integration.access_token
      ).catch((webhookErr) => {
        console.warn(
          "[Shopify Sync] Non-fatal webhook registration failure:",
          webhookErr
        );
        return null;
      }),
    ]);
    shopifyProducts = fetchedProducts;
    shopCurrency = fetchedCurrency;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch products from Shopify";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let syncedCount = 0;
  try {
    const result = await upsertShopifyProductsForStore({
      supabase,
      storeId: store.id,
      shopifyProducts,
      currency: shopCurrency,
    });
    syncedCount = result.upsertedCount;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save synced products in Supabase";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const syncedAt = new Date().toISOString();
  const { error: updateSyncError } = await supabase
    .from("shopify_integrations")
    .update({
      last_synced_at: syncedAt,
      updated_at: syncedAt,
    })
    .eq("store_id", store.id);

  if (updateSyncError) {
    console.warn(
      "[Shopify Sync] Products synced, but failed to update last_synced_at:",
      updateSyncError.message
    );
  }

  return NextResponse.json({
    ok: true,
    syncedCount,
    lastSyncedAt: syncedAt,
  });
}
