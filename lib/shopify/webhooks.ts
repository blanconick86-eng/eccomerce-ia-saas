import crypto from "node:crypto";
import {
  SHOPIFY_API_VERSION,
  getAppBaseUrl,
  safeEqualStrings,
} from "@/lib/shopify/client";

export const SHOPIFY_WEBHOOK_TOPICS = [
  "products/create",
  "products/update",
  "products/delete",
] as const;

export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];

export function getShopifyWebhookAddress(): string {
  return `${getAppBaseUrl()}/api/integrations/shopify/webhooks`;
}

export function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  secret: string
): boolean {
  if (!hmacHeader || !secret) {
    return false;
  }

  const trimmedHeader = hmacHeader.trim();
  if (!trimmedHeader) {
    return false;
  }

  const expectedDigest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  return safeEqualStrings(expectedDigest, trimmedHeader);
}

type ExistingShopifyWebhook = {
  id?: number | string;
  topic?: string | null;
  address?: string | null;
};

export async function registerShopifyWebhooks(
  shopDomain: string,
  accessToken: string
): Promise<{
  registered: string[];
  existing: string[];
  failed: Array<{ topic: string; error: string }>;
}> {
  const address = getShopifyWebhookAddress();
  const baseUrl = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`;

  const registered: string[] = [];
  const existing: string[] = [];
  const failed: Array<{ topic: string; error: string }> = [];

  const existingTopics = new Set<string>();

  try {
    const listRes = await fetch(`${baseUrl}?limit=250`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (listRes.ok) {
      const listPayload = (await listRes.json()) as {
        webhooks?: ExistingShopifyWebhook[];
      };
      for (const hook of listPayload.webhooks ?? []) {
        if (
          typeof hook.topic === "string" &&
          typeof hook.address === "string" &&
          hook.address.replace(/\/+$/, "") === address
        ) {
          existingTopics.add(hook.topic);
        }
      }
    }
  } catch (error) {
    console.warn("[Shopify Webhooks] Could not list existing webhooks:", error);
  }

  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    if (existingTopics.has(topic)) {
      existing.push(topic);
      continue;
    }

    try {
      const createRes = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          webhook: {
            topic,
            address,
            format: "json",
          },
        }),
        cache: "no-store",
      });

      if (createRes.ok) {
        registered.push(topic);
        continue;
      }

      const bodyText = await createRes.text().catch(() => "");
      if (
        createRes.status === 422 &&
        /already\s+been\s+taken|for\s+this\s+topic\s+has\s+already/i.test(
          bodyText
        )
      ) {
        existing.push(topic);
        continue;
      }

      failed.push({
        topic,
        error: `HTTP ${createRes.status}: ${bodyText.slice(0, 200)}`,
      });
    } catch (error) {
      failed.push({
        topic,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failed.length > 0) {
    console.warn("[Shopify Webhooks] Some webhooks failed to register:", {
      shopDomain,
      failed,
    });
  }

  return { registered, existing, failed };
}
