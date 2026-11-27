import { NextResponse, type NextRequest } from "next/server";
import {
  SHOPIFY_OAUTH_STATE_COOKIE,
  SHOPIFY_OAUTH_STATE_TTL_SECONDS,
  SHOPIFY_SCOPES,
  createOAuthStateToken,
  encodeSignedOAuthState,
  getAppBaseUrl,
  getShopifyConfig,
  normalizeShopDomain,
} from "@/lib/shopify/client";
import { getAuthenticatedStore } from "@/lib/supabase/store";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { clientId, clientSecret } = getShopifyConfig();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Shopify OAuth environment variables are not configured" },
      { status: 500 }
    );
  }

  const rawShop = request.nextUrl.searchParams.get("shop");
  const shop = normalizeShopDomain(rawShop);

  if (!shop) {
    return NextResponse.json(
      {
        error:
          "Invalid Shopify domain. Expected format: your-store.myshopify.com",
      },
      { status: 400 }
    );
  }

  const state = createOAuthStateToken();
  const redirectUri = `${getAppBaseUrl()}/api/integrations/shopify/callback`;

  const authorizeUrl = new URL(`https://${shop}/admin/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", SHOPIFY_SCOPES);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  const signedStateCookie = encodeSignedOAuthState(
    {
      state,
      shop,
      userId: auth.user.id,
      storeId: auth.store.id,
    },
    clientSecret
  );

  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, signedStateCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SHOPIFY_OAUTH_STATE_TTL_SECONDS,
  });

  return response;
}
