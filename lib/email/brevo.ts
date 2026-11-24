export const DEFAULT_SENDER_NAME = "StoreOne Soporte";
export const DEFAULT_FROM_EMAIL = "StoreOne Soporte";
export const INBOUND_EMAIL_WEBHOOK_URL =
  "https://storeonlyinone.vercel.app/api/webhooks/email";

const BREVO_SMTP_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

export type EmailChannelCredentials = {
  support_email: string;
  from_email: string;
};

export type EmailThreadMeta = {
  fromEmail: string;
  subject: string;
};

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

  if (!supportEmail) {
    return null;
  }

  return {
    support_email: supportEmail,
    from_email: fromEmail,
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
