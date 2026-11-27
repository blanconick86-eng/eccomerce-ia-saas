import { NextResponse, type NextRequest } from "next/server";
import {
  fetchShopifyOrders,
  parseOrdersQuery,
  type ShopifyOrderSummary,
} from "@/lib/shopify/orders";
import { getAuthenticatedStore } from "@/lib/supabase/store";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  const searchParams = request.nextUrl.searchParams;
  const rawQuery = searchParams.get("query");
  const explicitName = searchParams.get("name")?.trim() || null;
  const explicitEmail = searchParams.get("email")?.trim().toLowerCase() || null;
  const rawLimit = Number(searchParams.get("limit") ?? "5");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, Math.trunc(rawLimit)), 10)
    : 5;

  const parsed = parseOrdersQuery(rawQuery);
  const orderName = explicitName
    ? `#${explicitName.replace(/^#+/, "")}`
    : parsed.orderName;
  const email = explicitEmail || parsed.email;

  if (!orderName && !email && rawQuery?.trim()) {
    return NextResponse.json(
      {
        error:
          "Query must include an order number (e.g. #1001) or customer email.",
      },
      { status: 400 }
    );
  }

  const { data: integration, error: integrationError } = await supabase
    .from("shopify_integrations")
    .select("shop_domain, access_token, status")
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

  try {
    let orders: ShopifyOrderSummary[] = [];

    if (orderName) {
      orders = await fetchShopifyOrders({
        shopDomain: integration.shop_domain,
        accessToken: integration.access_token,
        orderName,
        limit,
      });
    }

    if (orders.length === 0 && email) {
      orders = await fetchShopifyOrders({
        shopDomain: integration.shop_domain,
        accessToken: integration.access_token,
        email,
        limit,
      });
    }

    if (!orderName && !email) {
      orders = await fetchShopifyOrders({
        shopDomain: integration.shop_domain,
        accessToken: integration.access_token,
        limit,
      });
    }

    return NextResponse.json({
      ok: true,
      shopDomain: integration.shop_domain,
      orders,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch orders from Shopify";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
