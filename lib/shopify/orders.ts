import type { SupabaseClient } from "@supabase/supabase-js";
import { SHOPIFY_API_VERSION } from "@/lib/shopify/client";

export type ShopifyOrderItemSummary = {
  title: string;
  quantity: number;
};

export type ShopifyOrderSummary = {
  order_number: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string;
  total_price: string;
  currency: string;
  tracking_number: string | null;
  tracking_url: string | null;
  items: ShopifyOrderItemSummary[];
};

type RawShopifyFulfillment = {
  status?: string | null;
  tracking_number?: string | null;
  tracking_numbers?: string[] | null;
  tracking_url?: string | null;
  tracking_urls?: string[] | null;
};

type RawShopifyLineItem = {
  title?: string | null;
  name?: string | null;
  quantity?: number | null;
};

type RawShopifyOrder = {
  id: number | string;
  name?: string | null;
  order_number?: number | string | null;
  created_at?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  total_price?: string | number | null;
  currency?: string | null;
  fulfillments?: RawShopifyFulfillment[] | null;
  line_items?: RawShopifyLineItem[] | null;
};

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const HASH_ORDER_REGEX = /#(\d{3,10})\b/;
const CONTEXTUAL_ORDER_REGEX =
  /\b(?:pedido|orden|order|compra|n[uú]mero|nro|no\.?)\s*(?:n[uú]mero|nro|no\.?|de\s+pedido|de\s+orden|#|:)?\s*#?(\d{3,10})\b/i;

const ORDER_INTENT_REGEX =
  /\b(pedido|pedidos|orden|ordenes|órdenes|compra|compras|seguimiento|tracking|envio|envío|envios|envíos|paquete|despacho|entrega|entregado|enviado|llega|estado|order|orders|shipment|shipping|delivery|package|track|status|reembolso|refund|cancel|cancelar)\b/i;

function normalizeOrderNumber(digits: string): string {
  const cleaned = digits.replace(/^#+/, "").trim();
  return cleaned ? `#${cleaned}` : "";
}

export function parseOrdersQuery(rawQuery: string | null | undefined): {
  orderName: string | null;
  email: string | null;
} {
  const trimmed = rawQuery?.trim() ?? "";
  if (!trimmed) {
    return { orderName: null, email: null };
  }

  const emailMatch = trimmed.match(EMAIL_REGEX);
  const email = emailMatch ? emailMatch[0].toLowerCase() : null;

  const hashMatch = trimmed.match(HASH_ORDER_REGEX);
  if (hashMatch?.[1]) {
    return { orderName: normalizeOrderNumber(hashMatch[1]), email };
  }

  const contextualMatch = trimmed.match(CONTEXTUAL_ORDER_REGEX);
  if (contextualMatch?.[1]) {
    return { orderName: normalizeOrderNumber(contextualMatch[1]), email };
  }

  // If the entire query is just digits (e.g., "1001" or "#1001"), treat it as an order number.
  const bareDigits = trimmed.replace(/^#+/, "");
  if (/^\d{3,10}$/.test(bareDigits)) {
    return { orderName: normalizeOrderNumber(bareDigits), email };
  }

  return { orderName: null, email };
}

export function extractOrderLookupSignals(params: {
  message: string;
  senderEmail?: string | null;
  history?: Array<{ role: string; content: string }>;
}): {
  shouldLookup: boolean;
  orderName: string | null;
  email: string | null;
} {
  const { message, senderEmail, history = [] } = params;

  const currentHash = message.match(HASH_ORDER_REGEX);
  const currentContextual = message.match(CONTEXTUAL_ORDER_REGEX);
  let orderName = currentHash?.[1]
    ? normalizeOrderNumber(currentHash[1])
    : currentContextual?.[1]
      ? normalizeOrderNumber(currentContextual[1])
      : null;

  const hasOrderIntent = ORDER_INTENT_REGEX.test(message);

  // If the user follows up without repeating the order number, check recent customer history.
  if (!orderName && hasOrderIntent && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const entry = history[i];
      if (entry.role !== "customer" && entry.role !== "user") continue;
      const histHash = entry.content.match(HASH_ORDER_REGEX);
      const histCtx = entry.content.match(CONTEXTUAL_ORDER_REGEX);
      if (histHash?.[1]) {
        orderName = normalizeOrderNumber(histHash[1]);
        break;
      }
      if (histCtx?.[1]) {
        orderName = normalizeOrderNumber(histCtx[1]);
        break;
      }
    }
  }

  const emailInMessage = message.match(EMAIL_REGEX)?.[0]?.toLowerCase() ?? null;
  const normalizedSenderEmail =
    senderEmail && EMAIL_REGEX.test(senderEmail.trim())
      ? senderEmail.trim().toLowerCase()
      : null;
  const email = emailInMessage || normalizedSenderEmail;

  const shouldLookup =
    Boolean(currentHash) ||
    (hasOrderIntent && Boolean(orderName || email));

  return {
    shouldLookup,
    orderName,
    email,
  };
}

function mapRawShopifyOrder(order: RawShopifyOrder): ShopifyOrderSummary {
  const orderNumber =
    typeof order.name === "string" && order.name.trim()
      ? order.name.trim()
      : order.order_number !== null && order.order_number !== undefined
        ? `#${String(order.order_number).replace(/^#+/, "")}`
        : `#${order.id}`;

  const fulfillments = Array.isArray(order.fulfillments)
    ? order.fulfillments
    : [];
  const activeFulfillments = fulfillments.filter(
    (f) => f.status !== "cancelled"
  );
  const latestWithTracking =
    [...activeFulfillments]
      .reverse()
      .find(
        (f) =>
          Boolean(f.tracking_number?.trim()) ||
          Boolean(f.tracking_numbers?.length) ||
          Boolean(f.tracking_url?.trim()) ||
          Boolean(f.tracking_urls?.length)
      ) ?? activeFulfillments[activeFulfillments.length - 1];

  const trackingNumber =
    latestWithTracking?.tracking_number?.trim() ||
    latestWithTracking?.tracking_numbers?.find((t) => Boolean(t?.trim()))?.trim() ||
    null;

  const trackingUrl =
    latestWithTracking?.tracking_url?.trim() ||
    latestWithTracking?.tracking_urls?.find((u) => Boolean(u?.trim()))?.trim() ||
    null;

  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const items: ShopifyOrderItemSummary[] = lineItems.map((item) => ({
    title:
      item.title?.trim() || item.name?.trim() || "Producto sin nombre",
    quantity: Number.isFinite(Number(item.quantity))
      ? Math.max(1, Math.trunc(Number(item.quantity)))
      : 1,
  }));

  return {
    order_number: orderNumber,
    created_at: order.created_at ?? "",
    financial_status: order.financial_status?.trim() || "pending",
    fulfillment_status: order.fulfillment_status?.trim() || "unfulfilled",
    total_price:
      order.total_price !== null && order.total_price !== undefined
        ? String(order.total_price)
        : "0.00",
    currency: order.currency?.trim().toUpperCase() || "USD",
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
    items,
  };
}

export async function fetchShopifyOrders(params: {
  shopDomain: string;
  accessToken: string;
  orderName?: string | null;
  email?: string | null;
  limit?: number;
}): Promise<ShopifyOrderSummary[]> {
  const { shopDomain, accessToken, orderName, email, limit = 5 } = params;

  const url = new URL(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`
  );
  url.searchParams.set("status", "any");
  url.searchParams.set("limit", String(Math.min(Math.max(1, limit), 10)));

  if (orderName) {
    url.searchParams.set("name", normalizeOrderNumber(orderName));
  } else if (email) {
    url.searchParams.set("email", email.trim().toLowerCase());
  }

  const res = await fetch(url.toString(), {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `Shopify Orders API returned ${res.status}${errorText ? `: ${errorText.slice(0, 200)}` : ""}`
    );
  }

  const payload = (await res.json()) as { orders?: RawShopifyOrder[] };
  const rawOrders = Array.isArray(payload.orders) ? payload.orders : [];
  return rawOrders.map(mapRawShopifyOrder);
}

export async function lookupShopifyOrdersForStore(params: {
  supabase: SupabaseClient;
  storeId: string;
  orderName?: string | null;
  email?: string | null;
  limit?: number;
}): Promise<{
  connected: boolean;
  shopDomain: string | null;
  orders: ShopifyOrderSummary[];
  queryUsed: string | null;
}> {
  const { supabase, storeId, orderName, email, limit = 5 } = params;

  const { data: integration, error } = await supabase
    .from("shopify_integrations")
    .select("shop_domain, access_token, status")
    .eq("store_id", storeId)
    .eq("status", "connected")
    .maybeSingle();

  if (error || !integration || !integration.access_token) {
    return {
      connected: false,
      shopDomain: null,
      orders: [],
      queryUsed: null,
    };
  }

  let queryUsed: string | null = null;
  let orders: ShopifyOrderSummary[] = [];

  if (orderName) {
    queryUsed = normalizeOrderNumber(orderName);
    orders = await fetchShopifyOrders({
      shopDomain: integration.shop_domain,
      accessToken: integration.access_token,
      orderName: queryUsed,
      limit,
    });
  }

  if (orders.length === 0 && email) {
    queryUsed = email.trim().toLowerCase();
    orders = await fetchShopifyOrders({
      shopDomain: integration.shop_domain,
      accessToken: integration.access_token,
      email: queryUsed,
      limit,
    });
  }

  return {
    connected: true,
    shopDomain: integration.shop_domain,
    orders,
    queryUsed,
  };
}

export function formatShopifyOrdersContext(params: {
  orders: ShopifyOrderSummary[];
  attempted: boolean;
  queryUsed?: string | null;
}): string {
  const { orders, attempted, queryUsed } = params;

  if (!attempted && orders.length === 0) {
    return "No live order lookup was needed for this message.";
  }

  if (orders.length === 0) {
    return queryUsed
      ? `Live Shopify order lookup was executed for "${queryUsed}", and 0 matching orders were found.`
      : "Live Shopify order lookup was executed, and 0 matching orders were found.";
  }

  return orders
    .map((order) => {
      const itemsSummary =
        order.items.length > 0
          ? order.items
              .map((item) => `${item.quantity}x ${item.title}`)
              .join(", ")
          : "No items listed";
      const trackingParts = [
        order.tracking_number
          ? `tracking_number: ${order.tracking_number}`
          : null,
        order.tracking_url ? `tracking_url: ${order.tracking_url}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      return `- Order ${order.order_number} | created_at: ${order.created_at} | financial_status: ${order.financial_status} | fulfillment_status: ${order.fulfillment_status} | total: ${order.total_price} ${order.currency} | items: ${itemsSummary}${trackingParts ? ` | ${trackingParts}` : " | tracking: not available yet"}`;
    })
    .join("\n");
}
