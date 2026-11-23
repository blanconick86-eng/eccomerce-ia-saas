import { Resend } from "resend";

export const DEFAULT_FROM_EMAIL = "StoreOne <onboarding@resend.dev>";
export const INBOUND_EMAIL_WEBHOOK_URL =
  "https://storeonlyinone.vercel.app/api/webhooks/email";

export type EmailChannelCredentials = {
  support_email: string;
  from_email: string;
};

export type EmailThreadMeta = {
  fromEmail: string;
  subject: string;
};

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
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
  from?: string;
  replyTo?: string;
  subject: string;
  bodyText: string;
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "RESEND_API_KEY is not configured on the server.",
    };
  }

  const recipient = params.to.trim();
  if (!recipient) {
    return { ok: false, error: "Recipient email address is missing." };
  }

  const resend = new Resend(apiKey);
  const from = params.from?.trim() || DEFAULT_FROM_EMAIL;
  const replyTo = params.replyTo?.trim();
  const subject = formatReplySubject(params.subject);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: [recipient],
      subject,
      text: params.bodyText,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      return {
        ok: false,
        error: error.message || "Resend API rejected the email request.",
      };
    }

    return { ok: true, id: data?.id ?? null };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Unexpected error sending email with Resend.",
    };
  }
}
