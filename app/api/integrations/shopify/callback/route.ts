import { connection, NextResponse, type NextRequest } from "next/server";
import {
  SHOPIFY_OAUTH_STATE_COOKIE,
  SHOPIFY_SCOPES,
  decodeAndVerifySignedOAuthState,
  getAppBaseUrl,
  getShopifyConfig,
  normalizeShopDomain,
  safeEqualStrings,
  verifyShopifyHmac,
} from "@/lib/shopify/client";
import { getAuthenticatedStore } from "@/lib/supabase/store";

function buildChannelsRedirect(params: Record<string, string>): NextResponse {
  const target = new URL("/dashboard/channels", getAppBaseUrl());
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(target.toString());
  response.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function GET(request: NextRequest) {
  await connection();

  const { clientId, clientSecret } = getShopifyConfig();
  if (!clientId || !clientSecret) {
    return buildChannelsRedirect({
      shopify: "error",
      reason: "missing_config",
    });
  }

  const searchParams = request.nextUrl.searchParams;
  const normalizedShop = normalizeShopDomain(searchParams.get("shop"));
  const code = searchParams.get("code")?.trim() ?? "";
  const state = searchParams.get("state")?.trim() ?? "";
  const hmac = searchParams.get("hmac")?.trim() ?? "";

  if (!normalizedShop || !code || !state || !hmac) {
    return buildChannelsRedirect({
      shopify: "error",
      reason: "missing_params",
    });
  }

  const rawStateCookie = request.cookies.get(SHOPIFY_OAUTH_STATE_COOKIE)?.value;
  const verifiedCookie = decodeAndVerifySignedOAuthState(
    rawStateCookie,
    clientSecret
  );

  if (
    !verifiedCookie ||
    !safeEqualStrings(verifiedCookie.state, state) ||
    verifiedCookie.shop !== normalizedShop
  ) {
    return buildChannelsRedirect({
      shopify: "error",
      reason: "invalid_state",
    });
  }

  if (!verifyShopifyHmac(searchParams, clientSecret)) {
    return buildChannelsRedirect({
      shopify: "error",
      reason: "invalid_hmac",
    });
  }

  const auth = await getAuthenticatedStore();
  if (
    "errorResponse" in auth ||
    auth.user.id !== verifiedCookie.userId ||
    auth.store.id !== verifiedCookie.storeId
  ) {
    return buildChannelsRedirect({
      shopify: "error",
      reason: "unauthorized",
    });
  }

  let accessToken = "";
  let grantedScopes = SHOPIFY_SCOPES;

  try {
    const tokenRes = await fetch(
      `https://${normalizedShop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
        cache: "no-store",
      }
    );

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text().catch(() => "");
      console.error("[Shopify Callback] Token exchange failed:", {
        status: tokenRes.status,
        body: errorText.slice(0, 300),
      });
      return buildChannelsRedirect({
        shopify: "error",
        reason: "token_exchange_failed",
      });
    }

    const tokenPayload = (await tokenRes.json()) as {
      access_token?: unknown;
      scope?: unknown;
    };

    if (
      typeof tokenPayload.access_token !== "string" ||
      !tokenPayload.access_token.trim()
    ) {
      return buildChannelsRedirect({
        shopify: "error",
        reason: "token_exchange_failed",
      });
    }

    accessToken = tokenPayload.access_token.trim();
    if (typeof tokenPayload.scope === "string" && tokenPayload.scope.trim()) {
      grantedScopes = tokenPayload.scope.trim();
    }
  } catch (error) {
    console.error("[Shopify Callback] Token exchange request threw:", error);
    return buildChannelsRedirect({
      shopify: "error",
      reason: "token_exchange_failed",
    });
  }

  const { error: upsertError } = await auth.supabase
    .from("shopify_integrations")
    .upsert(
      {
        store_id: auth.store.id,
        user_id: auth.user.id,
        shop_domain: normalizedShop,
        access_token: accessToken,
        scopes: grantedScopes,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id" }
    );

  if (upsertError) {
    console.error(
      "[Shopify Callback] Failed to persist integration in Supabase:",
      upsertError.message
    );
    return buildChannelsRedirect({
      shopify: "error",
      reason: "db_error",
    });
  }

  return buildChannelsRedirect({ shopify: "connected" });
}
