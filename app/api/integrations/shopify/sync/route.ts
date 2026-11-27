import { NextResponse } from "next/server";
import {
  fetchAllShopifyProducts,
  fetchShopCurrency,
  stripHtml,
  type ShopifyProduct,
} from "@/lib/shopify/client";
import { getAuthenticatedStore } from "@/lib/supabase/store";

const BATCH_SIZE = 500;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function resolveProductPrice(product: ShopifyProduct): number {
  const rawPrice = product.variants?.[0]?.price;
  if (typeof rawPrice === "number") {
    return Number.isFinite(rawPrice) && rawPrice >= 0
      ? Number(rawPrice.toFixed(2))
      : 0;
  }
  if (typeof rawPrice === "string" && rawPrice.trim() !== "") {
    const parsed = Number(rawPrice.trim());
    return Number.isFinite(parsed) && parsed >= 0
      ? Number(parsed.toFixed(2))
      : 0;
  }
  return 0;
}

function resolveProductStock(product: ShopifyProduct): {
  stockQuantity: number;
  stockStatus: "available" | "out_of_stock";
} {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length === 0) {
    return { stockQuantity: 0, stockStatus: "out_of_stock" };
  }

  const totalStock = variants.reduce((sum, variant) => {
    const qty = Number(variant.inventory_quantity);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);

  const allUntracked = variants.every(
    (variant) =>
      variant.inventory_management === null ||
      variant.inventory_management === undefined ||
      variant.inventory_management === ""
  );

  const stockStatus =
    totalStock > 0 || allUntracked ? "available" : "out_of_stock";

  return {
    stockQuantity: Math.max(0, Math.trunc(totalStock)),
    stockStatus,
  };
}

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

  const { data: existingProducts, error: existingError } = await supabase
    .from("products")
    .select("sku, source, external_id")
    .eq("store_id", store.id);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  // Track SKUs owned by non-matching products so we respect unique (store_id, sku)
  const existingSkuOwners = new Map<string, string>();
  for (const row of existingProducts ?? []) {
    const ownerKey =
      row.source === "shopify" && row.external_id
        ? `shopify:${row.external_id}`
        : `other:${row.sku}`;
    existingSkuOwners.set(row.sku, ownerKey);
  }

  const usedSkusInBatch = new Set<string>();

  const mappedRows = shopifyProducts.map((product) => {
    const externalId = String(product.id);
    const currentOwnerKey = `shopify:${externalId}`;
    const candidateSku =
      product.variants?.find(
        (v) => typeof v.sku === "string" && v.sku.trim().length > 0
      )?.sku?.trim() ?? "";

    const fallbackSku = `SHOPIFY-${externalId}`;
    let resolvedSku = fallbackSku;

    if (candidateSku) {
      const existingOwner = existingSkuOwners.get(candidateSku);
      const canUseCandidate =
        (!existingOwner || existingOwner === currentOwnerKey) &&
        !usedSkusInBatch.has(candidateSku);
      if (canUseCandidate) {
        resolvedSku = candidateSku;
      }
    }

    if (usedSkusInBatch.has(resolvedSku)) {
      resolvedSku = `SHOPIFY-${externalId}-${usedSkusInBatch.size + 1}`;
    }
    usedSkusInBatch.add(resolvedSku);

    const { stockQuantity, stockStatus } = resolveProductStock(product);
    const imageUrl =
      product.image?.src?.trim() || product.images?.[0]?.src?.trim() || null;

    return {
      store_id: store.id,
      source: "shopify",
      external_id: externalId,
      sku: resolvedSku,
      name: product.title?.trim() || `Shopify Product ${externalId}`,
      description: stripHtml(product.body_html),
      price: resolveProductPrice(product),
      currency: shopCurrency,
      stock_quantity: stockQuantity,
      stock_status: stockStatus,
      category: product.product_type?.trim() || null,
      image_url: imageUrl,
    };
  });

  for (const batch of chunkArray(mappedRows, BATCH_SIZE)) {
    const { error: upsertError } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "store_id,source,external_id" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
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
    syncedCount: mappedRows.length,
    lastSyncedAt: syncedAt,
  });
}
