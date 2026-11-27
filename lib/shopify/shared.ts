export const SHOPIFY_SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Normalizes a Shopify store domain input (strips protocol, trailing slashes, and paths)
 * and validates that it matches `<subdomain>.myshopify.com`.
 */
export function normalizeShopDomain(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;

  let cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;

  cleaned = cleaned.replace(/^https?:\/\//, "");
  cleaned = cleaned.split(/[/?#]/)[0]?.replace(/\/+$/, "") ?? "";

  if (!SHOPIFY_SHOP_DOMAIN_REGEX.test(cleaned)) {
    return null;
  }

  return cleaned;
}
