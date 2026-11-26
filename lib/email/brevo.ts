export const DEFAULT_SENDER_NAME = "StoreOne Soporte";
export const DEFAULT_FROM_EMAIL = "StoreOne Soporte";
export const DEFAULT_INBOUND_EMAIL_DOMAIN = "inbox.storeone.app";
export const INBOUND_EMAIL_WEBHOOK_URL =
  "https://storeonlyinone.vercel.app/api/webhooks/email";

const BREVO_SMTP_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

export type EmailChannelCredentials = {
  support_email: string;
  from_email: string;
  inbound_slug?: string;
  inbound_email?: string;
};

export type EmailThreadMeta = {
  fromEmail: string;
  subject: string;
};

export function getInboundEmailDomain(): string {
  const configured = process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN
    ?.trim()
    .replace(/^@+/, "")
    .toLowerCase();
  return configured || DEFAULT_INBOUND_EMAIL_DOMAIN;
}

export function slugifyStoreName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
}

export function buildStoreInboundSlug(store: {
  id: string;
  name?: string | null;
}): string {
  const shortId = store.id.replace(/-/g, "").slice(0, 8).toLowerCase();
  const cleanName = slugifyStoreName(store.name);
  if (cleanName && shortId) {
    return `${cleanName}-${shortId}`;
  }
  return cleanName || (shortId ? `store-${shortId}` : "store");
}

export function getStoreInboundSlug(
  store: { id: string; name?: string | null },
  credentials?: unknown
): string {
  if (credentials && typeof credentials === "object" && !Array.isArray(credentials)) {
    const rawSlug = (credentials as Record<string, unknown>).inbound_slug;
    if (typeof rawSlug === "string") {
      const sanitized = rawSlug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (sanitized) {
        return sanitized;
      }
    }
  }
  return buildStoreInboundSlug(store);
}

export function buildStoreInboundEmail(
  store: { id: string; name?: string | null },
  credentials?: unknown
): string {
  if (!store.id) return "";
  return `${getStoreInboundSlug(store, credentials)}@${getInboundEmailDomain()}`;
}

export function extractEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const angleMatch = trimmed.match(/<([^<>]+)>/);
  const candidate = angleMatch ? angleMatch[1] : trimmed;
  return candidate.trim().toLowerCase();
}

export function parseEmailParts(email: string): {
  email: string;
  localPart: string;
  baseSlug: string;
  domain: string;
} | null {
  const normalized = extractEmailAddress(email);
  const atIdx = normalized.lastIndexOf("@");
  if (atIdx <= 0 || atIdx === normalized.length - 1) {
    return null;
  }
  const localPart = normalized.slice(0, atIdx);
  const domain = normalized.slice(atIdx + 1);
  if (!localPart || !domain || !domain.includes(".")) {
    return null;
  }
  const plusIdx = localPart.indexOf("+");
  const baseSlug = (plusIdx > 0 ? localPart.slice(0, plusIdx) : localPart).trim();
  return {
    email: normalized,
    localPart,
    baseSlug,
    domain,
  };
}

export function isBrevoConfigured(): boolean {
  return Boolean(
    process.env.BREVO_API_KEY?.trim() && process.env.BREVO_SENDER_EMAIL?.trim()
  );
}

export function parseEmailCredentials(
  raw: unknown
): EmailChannelCredentials | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const supportEmail =
    typeof record.support_email === "string"
      ? record.support_email.trim()
      : "";
  const fromEmail =
    typeof record.from_email === "string" && record.from_email.trim()
      ? record.from_email.trim()
      : DEFAULT_FROM_EMAIL;
  const inboundSlug =
    typeof record.inbound_slug === "string" && record.inbound_slug.trim()
      ? record.inbound_slug.trim()
      : undefined;
  const inboundEmail =
    typeof record.inbound_email === "string" && record.inbound_email.trim()
      ? record.inbound_email.trim()
      : undefined;

  if (!supportEmail) {
    return null;
  }

  return {
    support_email: supportEmail,
    from_email: fromEmail,
    ...(inboundSlug ? { inbound_slug: inboundSlug } : {}),
    ...(inboundEmail ? { inbound_email: inboundEmail } : {}),
  };
}

export function encodeEmailThreadMeta(meta: EmailThreadMeta): string {
  return JSON.stringify({
    fromEmail: meta.fromEmail.trim(),
    subject: meta.subject.trim(),
  });
}

export function parseEmailThreadMeta(
  raw: string | null | undefined
): EmailThreadMeta | null {
  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const fromEmail =
      typeof record.fromEmail === "string" ? record.fromEmail.trim() : "";
    const subject =
      typeof record.subject === "string" ? record.subject.trim() : "";

    if (!fromEmail) {
      return null;
    }

    return {
      fromEmail,
      subject: subject || "Consulta StoreOne",
    };
  } catch {
    return null;
  }
}

export function formatReplySubject(subject: string): string {
  const trimmed = subject.trim();
  if (!trimmed) {
    return "Re: Consulta StoreOne";
  }
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

export async function sendStoreEmailReply(params: {
  to: string;
  subject: string;
  bodyText: string;
  replyTo?: string | null;
  replyToName?: string | null;
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) {
    console.error("[Brevo] BREVO_API_KEY is not configured on the server.");
    return {
      ok: false,
      error: "BREVO_API_KEY is not configured on the server.",
    };
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  if (!senderEmail) {
    console.error(
      "[Brevo] BREVO_SENDER_EMAIL is not configured on the server."
    );
    return {
      ok: false,
      error: "BREVO_SENDER_EMAIL is not configured on the server.",
    };
  }

  const senderName =
    process.env.BREVO_SENDER_NAME?.trim() || DEFAULT_SENDER_NAME;

  const recipient = params.to.trim();
  if (!recipient) {
    return { ok: false, error: "Recipient email address is missing." };
  }

  const subject = formatReplySubject(params.subject);
  const replyToEmail = params.replyTo?.trim();
  const replyToName = params.replyToName?.trim();

  try {
    const response = await fetch(BREVO_SMTP_EMAIL_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail,
        },
        to: [{ email: recipient }],
        ...(replyToEmail
          ? {
              replyTo: replyToName
                ? { email: replyToEmail, name: replyToName }
                : { email: replyToEmail },
            }
          : {}),
        subject,
        textContent: params.bodyText,
      }),
    });

    const rawResponseText = await response.text();

    if (!response.ok) {
      const errorDetail = rawResponseText.trim()
        ? `Brevo API error (${response.status}): ${rawResponseText.trim()}`
        : `Brevo API error (${response.status} ${response.statusText})`;

      console.error("[Brevo] Email send failed:", {
        status: response.status,
        statusText: response.statusText,
        body: rawResponseText,
        to: recipient,
        subject,
      });

      return {
        ok: false,
        error: errorDetail,
      };
    }

    let messageId: string | null = null;
    if (rawResponseText.trim()) {
      try {
        const data = JSON.parse(rawResponseText) as { messageId?: unknown };
        if (typeof data?.messageId === "string") {
          messageId = data.messageId;
        }
      } catch {
        messageId = null;
      }
    }

    return { ok: true, id: messageId };
  } catch (err: unknown) {
    console.error("[Brevo] Unexpected fetch error:", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Unexpected error sending email with Brevo.",
    };
  }
}
