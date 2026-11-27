import type { SupabaseClient } from "@supabase/supabase-js";
import { stripHtml, type ShopifyProduct } from "@/lib/shopify/client";

const BATCH_SIZE = 500;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function resolveShopifyProductPrice(product: ShopifyProduct): number {
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

export function resolveShopifyProductStock(product: ShopifyProduct): {
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

export async function upsertShopifyProductsForStore(params: {
  supabase: SupabaseClient;
  storeId: string;
  shopifyProducts: ShopifyProduct[];
  currency: string;
}): Promise<{ upsertedCount: number }> {
  const { supabase, storeId, shopifyProducts, currency } = params;

  if (shopifyProducts.length === 0) {
    return { upsertedCount: 0 };
  }

  const { data: existingProducts, error: existingError } = await supabase
    .from("products")
    .select("sku, source, external_id")
    .eq("store_id", storeId);

  if (existingError) {
    throw new Error(existingError.message);
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

    const { stockQuantity, stockStatus } = resolveShopifyProductStock(product);
    const imageUrl =
      product.image?.src?.trim() || product.images?.[0]?.src?.trim() || null;

    return {
      store_id: storeId,
      source: "shopify",
      external_id: externalId,
      sku: resolvedSku,
      name: product.title?.trim() || `Shopify Product ${externalId}`,
      description: stripHtml(product.body_html),
      price: resolveShopifyProductPrice(product),
      currency,
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
      throw new Error(upsertError.message);
    }
  }

  return { upsertedCount: mappedRows.length };
}

export async function deleteShopifyProductForStore(params: {
  supabase: SupabaseClient;
  storeId: string;
  externalId: string;
}): Promise<{ deletedCount: number }> {
  const { supabase, storeId, externalId } = params;

  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("store_id", storeId)
    .eq("source", "shopify")
    .eq("external_id", externalId)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return { deletedCount: data?.length ?? 0 };
}
