import { NextResponse, type NextRequest } from "next/server";
import {
  processWhatsAppBusinessWebhook,
  verifyMetaWebhookSignature,
  type MetaWebhookPayload,
} from "@/lib/meta/whatsapp";

/**
 * Meta Unified Webhook Verification (WhatsApp Cloud API, Instagram, Messenger)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedVerifyToken = process.env.META_VERIFY_TOKEN?.trim();

  if (
    mode === "subscribe" &&
    Boolean(expectedVerifyToken) &&
    verifyToken === expectedVerifyToken &&
    challenge !== null
  ) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    { error: "Webhook verification failed" },
    { status: 403 }
  );
}

/**
 * Meta Unified Real-Time Event Receiver (`whatsapp_business_account`, `instagram`, `page`)
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  if (!verifyMetaWebhookSignature(rawBody, signatureHeader)) {
    return NextResponse.json(
      { error: "Missing or invalid X-Hub-Signature-256 header" },
      { status: 401 }
    );
  }

  let payload: MetaWebhookPayload;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Invalid Meta webhook JSON payload" },
        { status: 400 }
      );
    }
    payload = parsed as MetaWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body" },
      { status: 400 }
    );
  }

  try {
    switch (payload.object) {
      case "whatsapp_business_account": {
        await processWhatsAppBusinessWebhook(payload);
        break;
      }

      case "instagram": {
        // Stub ready for Instagram Direct Messaging integration
        console.log("[Meta Webhook] Instagram event received (stub):", {
          entries: payload.entry?.length ?? 0,
        });
        break;
      }

      case "page": {
        // Stub ready for Facebook Messenger integration
        console.log("[Meta Webhook] Messenger page event received (stub):", {
          entries: payload.entry?.length ?? 0,
        });
        break;
      }

      default: {
        console.log("[Meta Webhook] Unhandled Meta object type:", {
          object: payload.object ?? "unknown",
        });
        break;
      }
    }
  } catch (error) {
    // Log internally while still returning 200 OK so Meta does not retry indefinitely
    console.error("[Meta Webhook] Unexpected processing error:", error);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
