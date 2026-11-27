import crypto from "node:crypto";
import {
  SHOPIFY_SHOP_DOMAIN_REGEX,
  normalizeShopDomain,
} from "@/lib/shopify/shared";

export { SHOPIFY_SHOP_DOMAIN_REGEX, normalizeShopDomain };

export const SHOPIFY_API_VERSION = "2024-10";
export const SHOPIFY_SCOPES = "read_products,read_orders";
export const SHOPIFY_OAUTH_STATE_COOKIE = "shopify_oauth_state";
export const SHOPIFY_OAUTH_STATE_TTL_SECONDS = 600;

export type OAuthStatePayload = {
  state: string;
  shop: string;
  userId: string;
  storeId: string;
};

export type ShopifyVariant = {
  id: number | string;
  sku?: string | null;
  price?: string | number | null;
  inventory_quantity?: number | null;
  inventory_management?: string | null;
};

export type ShopifyImage = {
  id?: number | string;
  src?: string | null;
};

export type ShopifyProduct = {
  id: number | string;
  title?: string | null;
  body_html?: string | null;
  product_type?: string | null;
  variants?: ShopifyVariant[] | null;
  image?: ShopifyImage | null;
  images?: ShopifyImage[] | null;
};

export function getAppBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://storeoneapp.online")
    .trim()
    .replace(/\/+$/, "");
}

export function getShopifyConfig(): {
  clientId: string;
  clientSecret: string;
} {
  return {
    clientId: process.env.SHOPIFY_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET?.trim() ?? "",
  };
}

export function createOAuthStateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function encodeSignedOAuthState(
  payload: OAuthStatePayload,
  secret: string
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("hex");
  return `${encodedPayload}.${sig}`;
}

export function decodeAndVerifySignedOAuthState(
  cookieValue: string | undefined,
  secret: string
): OAuthStatePayload | null {
  if (!cookieValue) return null;
  const dotIndex = cookieValue.indexOf(".");
  if (dotIndex <= 0) return null;

  const encodedPayload = cookieValue.slice(0, dotIndex);
  const providedSig = cookieValue.slice(dotIndex + 1);
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("hex");

  if (!safeEqualStrings(providedSig.toLowerCase(), expectedSig.toLowerCase())) {
    return null;
  }

  try {
    const json = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<OAuthStatePayload>;
    if (
      typeof parsed.state === "string" &&
      parsed.state.length > 0 &&
      typeof parsed.shop === "string" &&
      parsed.shop.length > 0 &&
      typeof parsed.userId === "string" &&
      parsed.userId.length > 0 &&
      typeof parsed.storeId === "string" &&
      parsed.storeId.length > 0
    ) {
      return {
        state: parsed.state,
        shop: parsed.shop,
        userId: parsed.userId,
        storeId: parsed.storeId,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function verifyShopifyHmac(
  searchParams: URLSearchParams,
  secret: string
): boolean {
  const hmac = searchParams.get("hmac");
  if (!hmac || !/^[a-f0-9]{64}$/i.test(hmac)) {
    return false;
  }

  const entries: [string, string][] = [];
  searchParams.forEach((value, key) => {
    if (key !== "hmac" && key !== "signature") {
      entries.push([key, value]);
    }
  });

  entries.sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0));
  const message = entries.map(([key, value]) => `${key}=${value}`).join("&");

  const digest = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  return safeEqualStrings(digest.toLowerCase(), hmac.toLowerCase());
}

export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|blockquote)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

export async function fetchShopCurrency(
  shopDomain: string,
  accessToken: string
): Promise<string> {
  try {
    const res = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json?fields=currency`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return "USD";
    }

    const payload = (await res.json()) as {
      shop?: { currency?: string | null };
    };
    const currency = payload.shop?.currency?.trim().toUpperCase();
    return currency && /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  } catch {
    return "USD";
  }
}

function parseNextPageUrl(
  linkHeader: string | null,
  expectedHost: string
): string | null {
  if (!linkHeader) return null;

  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/i);
    if (!match?.[1]) continue;

    try {
      const parsed = new URL(match[1]);
      if (parsed.protocol === "https:" && parsed.hostname === expectedHost) {
        return parsed.toString();
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function fetchAllShopifyProducts(
  shopDomain: string,
  accessToken: string
): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let nextUrl: string | null =
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;

  const maxPages = 20;
  for (let page = 0; page < maxPages && nextUrl; page += 1) {
    const res = await fetch(nextUrl, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(
        `Shopify API returned ${res.status}${errorText ? `: ${errorText.slice(0, 200)}` : ""}`
      );
    }

    const payload = (await res.json()) as { products?: ShopifyProduct[] };
    if (Array.isArray(payload.products)) {
      products.push(...payload.products);
    }

    nextUrl = parseNextPageUrl(res.headers.get("link"), shopDomain);
  }

  return products;
}
