"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Package,
  Plus,
  Send,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { buildStoreInboundEmail } from "@/lib/email/brevo";
import { useLanguage } from "@/lib/i18n/language-context";
import {
  DEFAULT_MELI_CHANNEL_NAME,
  DEFAULT_MELI_SELLER_NICKNAME,
  parseMercadoLibreCredentials,
} from "@/lib/mercadolibre/simulated";
import type { Channel } from "@/types/database";

const DEFAULT_FROM_EMAIL = "StoreOne Soporte";

function subscribeNoop() {
  return () => {};
}

function getOriginSnapshot() {
  return window.location.origin;
}

function getOriginServerSnapshot() {
  return "";
}

function readEmailCredentials(credentials: Channel["credentials"]): {
  supportEmail: string;
  fromEmail: string;
} {
  if (!credentials || typeof credentials !== "object") {
    return { supportEmail: "", fromEmail: DEFAULT_FROM_EMAIL };
  }
  const supportEmail =
    typeof credentials.support_email === "string"
      ? credentials.support_email
      : "";
  const fromEmail =
    typeof credentials.from_email === "string" && credentials.from_email.trim()
      ? credentials.from_email
      : DEFAULT_FROM_EMAIL;
  return { supportEmail, fromEmail };
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}

type EmailTestResponse = {
  conversationId?: string;
  messageId?: string;
  status?: "auto_sent" | "pending_approval";
  reply?: string;
  emailDelivery?: {
    sent?: boolean;
    to?: string;
    subject?: string;
    id?: string | null;
    error?: string | null;
  };
  error?: string;
};

type MercadoLibreSimResponse = {
  simulated?: boolean;
  conversationId?: string;
  messageId?: string;
  status?: "auto_sent" | "pending_approval";
  reply?: string;
  metadata?: {
    item_title?: string;
    buyer_nickname?: string;
    mode?: string;
  };
  error?: string;
};

const UPCOMING_ICON_MAP = {
  amazon: Package,
  whatsapp: MessageCircle,
} as const;

const UPCOMING_COLOR_MAP = {
  amazon: "bg-orange-50 text-orange-600 ring-orange-200",
  whatsapp: "bg-emerald-50 text-emerald-600 ring-emerald-200",
} as const;

export default function ChannelsPage() {
  const { t } = useLanguage();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeInboundEmail, setStoreInboundEmail] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Web widget creation
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Email channel creation & forwarding UI
  const [emailName, setEmailName] = useState("Soporte Email");
  const [supportEmail, setSupportEmail] = useState("");
  const [fromEmail, setFromEmail] = useState(DEFAULT_FROM_EMAIL);
  const [isCreatingEmail, setIsCreatingEmail] = useState(false);
  const [isGmailGuideOpen, setIsGmailGuideOpen] = useState(false);
  const [emailCardTab, setEmailCardTab] = useState<"setup" | "test">("setup");

  // Mercado Libre (simulated) channel creation & simulator
  const [mlName, setMlName] = useState(DEFAULT_MELI_CHANNEL_NAME);
  const [mlSellerNickname, setMlSellerNickname] = useState(
    DEFAULT_MELI_SELLER_NICKNAME
  );
  const [isCreatingMeli, setIsCreatingMeli] = useState(false);
  const [mlBuyerNickname, setMlBuyerNickname] = useState("COMPRADOR_AR");
  const [mlItemTitle, setMlItemTitle] = useState(
    "Zapatillas Running Pro Talle 42"
  );
  const [mlQuestionText, setMlQuestionText] = useState(
    "Hola! Tenés stock en talle 42? Hacen envíos a Córdoba?"
  );
  const [isSendingMeliSim, setIsSendingMeliSim] = useState(false);
  const [mlSimResult, setMlSimResult] =
    useState<MercadoLibreSimResponse | null>(null);
  const [mlSimError, setMlSimError] = useState<string | null>(null);

  // Copy & delete & widget preview state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewChannelId, setPreviewChannelId] = useState<string | null>(null);

  // Inbound email tester state
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [testFromEmail, setTestFromEmail] = useState("");
  const [testSubject, setTestSubject] = useState(
    "Consulta sobre stock y envíos"
  );
  const [testBody, setTestBody] = useState(
    "Hola, quería consultar si tienen productos disponibles en stock y cuánto demora el envío."
  );
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<EmailTestResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const origin = useSyncExternalStore(
    subscribeNoop,
    getOriginSnapshot,
    getOriginServerSnapshot
  );

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!previewChannelId) return;

    const handleMessage = (event: MessageEvent) => {
      if (
        origin &&
        event.origin === origin &&
        event.data &&
        typeof event.data === "object" &&
        ((event.data as { type?: string }).type === "storeone:close" ||
          (event.data as { type?: string }).type === "storemind:close")
      ) {
        setPreviewChannelId(null);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [previewChannelId, origin]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/channels")
      .then(async (res) => {
        const payload = (await res.json()) as {
          store?: {
            id: string;
            name: string;
            language: string;
            inbound_slug?: string;
            inbound_email?: string;
          };
          channels?: Channel[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(payload.error || t.dashboard.channels.loadError);
        }
        return {
          resolvedStoreId: payload.store?.id ?? "",
          resolvedStoreName: payload.store?.name ?? "",
          resolvedInboundEmail: payload.store?.inbound_email ?? "",
          channels: payload.channels ?? [],
        };
      })
      .then(
        ({
          resolvedStoreId,
          resolvedStoreName,
          resolvedInboundEmail,
          channels: loadedChannels,
        }) => {
          if (!cancelled) {
            setStoreId(resolvedStoreId);
            setStoreName(resolvedStoreName);
            setStoreInboundEmail(resolvedInboundEmail);
            setChannels(loadedChannels);
            setErrorMessage(null);
          }
        }
      )
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : t.dashboard.channels.loadError
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [t.dashboard.channels.loadError]);

  const markCopied = (key: string) => {
    setCopiedKey(key);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedKey(null);
    }, 2200);
  };

  const handleCopyValue = async (key: string, value: string) => {
    const ok = await copyTextToClipboard(value);
    if (ok) {
      markCopied(key);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || isCreating) return;

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          type: "web_widget",
        }),
      });

      const payload = (await response.json()) as {
        channel?: Channel;
        error?: string;
      };

      if (!response.ok || !payload.channel) {
        setErrorMessage(payload.error || t.dashboard.channels.createError);
        return;
      }

      setChannels((prev) => [payload.channel!, ...prev]);
      setNewName("");
    } catch {
      setErrorMessage(t.dashboard.channels.createError);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = emailName.trim();
    const trimmedSupport = supportEmail.trim();
    const trimmedFrom = fromEmail.trim() || DEFAULT_FROM_EMAIL;
    if (!trimmedName || !trimmedSupport || isCreatingEmail) return;

    setIsCreatingEmail(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          type: "email",
          credentials: {
            support_email: trimmedSupport,
            from_email: trimmedFrom,
          },
        }),
      });

      const payload = (await response.json()) as {
        channel?: Channel;
        error?: string;
      };

      if (!response.ok || !payload.channel) {
        setErrorMessage(payload.error || t.dashboard.channels.createError);
        return;
      }

      setChannels((prev) => [payload.channel!, ...prev]);
      setSupportEmail("");
      if (!testFromEmail) {
        setTestFromEmail(trimmedSupport);
      }
    } catch {
      setErrorMessage(t.dashboard.channels.createError);
    } finally {
      setIsCreatingEmail(false);
    }
  };

  const activeEmailChannel =
    channels.find((ch) => ch.type === "email") ?? null;
  const resolvedStoreForwardingEmail =
    storeInboundEmail ||
    (storeId
      ? buildStoreInboundEmail(
          { id: storeId, name: storeName },
          activeEmailChannel?.credentials
        )
      : "");

  const activeMeliChannel =
    channels.find((ch) => ch.type === "mercadolibre") ?? null;

  const handleCreateMercadoLibre = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isCreatingMeli || activeMeliChannel) return;

    const trimmedName = mlName.trim() || DEFAULT_MELI_CHANNEL_NAME;
    const trimmedSeller =
      mlSellerNickname.trim() || DEFAULT_MELI_SELLER_NICKNAME;

    setIsCreatingMeli(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          type: "mercadolibre",
          credentials: {
            mode: "simulated",
            seller_nickname: trimmedSeller,
          },
        }),
      });

      const payload = (await response.json()) as {
        channel?: Channel;
        error?: string;
      };

      if (!response.ok || !payload.channel) {
        setErrorMessage(payload.error || t.dashboard.channels.createError);
        return;
      }

      setChannels((prev) => [payload.channel!, ...prev]);
    } catch {
      setErrorMessage(t.dashboard.channels.createError);
    } finally {
      setIsCreatingMeli(false);
    }
  };

  const handleSimulateMercadoLibre = async (
    event: FormEvent<HTMLFormElement>,
    channelId: string
  ) => {
    event.preventDefault();
    if (
      !storeId ||
      !mlBuyerNickname.trim() ||
      !mlItemTitle.trim() ||
      !mlQuestionText.trim() ||
      isSendingMeliSim
    ) {
      return;
    }

    setIsSendingMeliSim(true);
    setMlSimResult(null);
    setMlSimError(null);

    try {
      const response = await fetch("/api/webhooks/mercadolibre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          simulated: true,
          storeId,
          channelId,
          buyerNickname: mlBuyerNickname.trim(),
          itemTitle: mlItemTitle.trim(),
          questionText: mlQuestionText.trim(),
        }),
      });

      const payload = (await response.json()) as MercadoLibreSimResponse;
      if (!response.ok) {
        setMlSimError(
          payload.error || t.dashboard.channels.mercadoLibreSection.simError
        );
        return;
      }

      setMlSimResult(payload);
    } catch {
      setMlSimError(t.dashboard.channels.mercadoLibreSection.simError);
    } finally {
      setIsSendingMeliSim(false);
    }
  };

  const handleDelete = async (channelId: string) => {
    if (deletingId) return;
    setDeletingId(channelId);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/channels?id=${encodeURIComponent(channelId)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json()) as {
        deleted?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.deleted) {
        setErrorMessage(payload.error || t.dashboard.channels.deleteError);
        return;
      }

      setChannels((prev) => prev.filter((item) => item.id !== channelId));
      if (confirmDeleteId === channelId) {
        setConfirmDeleteId(null);
      }
      if (previewChannelId === channelId) {
        setPreviewChannelId(null);
      }
      if (testingChannelId === channelId) {
        setTestingChannelId(null);
        setTestResult(null);
        setTestError(null);
      }
      if (activeMeliChannel?.id === channelId) {
        setMlSimResult(null);
        setMlSimError(null);
      }
    } catch {
      setErrorMessage(t.dashboard.channels.deleteError);
    } finally {
      setDeletingId(null);
    }
  };

  const handleTestInboundEmail = async (
    event: FormEvent<HTMLFormElement>,
    channelId: string
  ) => {
    event.preventDefault();
    if (!storeId || !testFromEmail.trim() || !testSubject.trim() || !testBody.trim() || isSendingTest) {
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);
    setTestError(null);

    try {
      const response = await fetch("/api/webhooks/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          channelId,
          fromEmail: testFromEmail.trim(),
          subject: testSubject.trim(),
          body: testBody.trim(),
        }),
      });

      const payload = (await response.json()) as EmailTestResponse;
      if (!response.ok) {
        setTestError(payload.error || t.dashboard.channels.emailSection.testError);
        return;
      }

      setTestResult(payload);
    } catch {
      setTestError(t.dashboard.channels.emailSection.testError);
    } finally {
      setIsSendingTest(false);
    }
  };

  const buildChannelSnippet = (channelId: string) => {
    const baseUrl = origin || "https://TU_URL";
    const resolvedStore = storeId || "STORE_ID";
    return `<script src="${baseUrl}/widget.js" data-store-id="${resolvedStore}" data-channel-id="${channelId}" async></script>`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t.dashboard.channels.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t.dashboard.channels.subtitle}
        </p>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          <AlertCircle
            className="h-4 w-4 shrink-0 text-rose-600"
            aria-hidden="true"
          />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Channel setup cards: Web Widget & Email (Brevo) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Create new Web Widget channel */}
        <section className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Globe className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {t.dashboard.channels.createTitle}
                </h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  {t.dashboard.channels.createSubtitle}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleCreate} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="channel-name"
                className="block text-sm font-medium text-slate-700"
              >
                {t.dashboard.channels.nameLabel}
              </label>
              <input
                id="channel-name"
                type="text"
                required
                maxLength={80}
                disabled={isCreating}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t.dashboard.channels.namePlaceholder}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
              />
            </div>

            <button
              type="submit"
              disabled={isCreating || !newName.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isCreating
                  ? t.dashboard.channels.creating
                  : t.dashboard.channels.createBtn}
              </span>
            </button>
          </form>
        </section>

        {/* Active Email (Brevo) channel setup */}
        <section className="rounded-2xl border border-teal-200/90 bg-white p-6 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-200">
                <Mail className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {t.dashboard.channels.emailSection.title}
                </h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  {t.dashboard.channels.emailSection.subtitle}
                </p>
              </div>
            </div>

            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-200">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              <span>{t.dashboard.channels.emailSection.activeBadge}</span>
            </span>
          </div>

          {/* Per-store unique forwarding address */}
          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/60 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-teal-900">
                {t.dashboard.channels.emailSection.forwardingTitle}
              </span>
              <button
                type="button"
                disabled={!resolvedStoreForwardingEmail}
                onClick={() =>
                  handleCopyValue(
                    "forwarding-global",
                    resolvedStoreForwardingEmail
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 shadow-2xs transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copiedKey === "forwarding-global" ? (
                  <>
                    <Check
                      className="h-3.5 w-3.5 text-emerald-600"
                      aria-hidden="true"
                    />
                    <span>
                      {t.dashboard.channels.emailSection.copiedAddressBtn}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {t.dashboard.channels.emailSection.copyAddressBtn}
                    </span>
                  </>
                )}
              </button>
            </div>
            <p className="mt-1.5 break-all rounded-lg border border-teal-200/80 bg-white px-3 py-2 font-mono text-xs font-medium text-slate-900">
              {resolvedStoreForwardingEmail || "..."}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-teal-900/80">
              {t.dashboard.channels.emailSection.forwardingHelper}
            </p>
          </div>

          {/* Collapsible Gmail forwarding guide */}
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70">
            <button
              type="button"
              aria-expanded={isGmailGuideOpen}
              onClick={() => setIsGmailGuideOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 transition-colors hover:text-slate-900"
            >
              <span>{t.dashboard.channels.emailSection.guideToggleLabel}</span>
              {isGmailGuideOpen ? (
                <ChevronUp
                  className="h-4 w-4 shrink-0 text-slate-500"
                  aria-hidden="true"
                />
              ) : (
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-slate-500"
                  aria-hidden="true"
                />
              )}
            </button>

            {isGmailGuideOpen && (
              <ol className="space-y-1.5 border-t border-slate-200 px-3.5 py-3 text-xs leading-relaxed text-slate-700">
                <li>
                  <span className="font-semibold text-teal-800">1.</span>{" "}
                  {t.dashboard.channels.emailSection.guideStep1}
                </li>
                <li>
                  <span className="font-semibold text-teal-800">2.</span>{" "}
                  {t.dashboard.channels.emailSection.guideStep2}
                </li>
                <li>
                  <span className="font-semibold text-teal-800">3.</span>{" "}
                  {t.dashboard.channels.emailSection.guideStep3}
                </li>
              </ol>
            )}
          </div>

          {/* Setup / Test email tabs */}
          <div
            role="tablist"
            className="mt-4 inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={emailCardTab === "setup"}
              onClick={() => setEmailCardTab("setup")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                emailCardTab === "setup"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.dashboard.channels.emailSection.tabSetup}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={emailCardTab === "test"}
              onClick={() => {
                setEmailCardTab("test");
                if (!testFromEmail) {
                  const creds = activeEmailChannel
                    ? readEmailCredentials(activeEmailChannel.credentials)
                    : null;
                  if (creds?.supportEmail) {
                    setTestFromEmail(creds.supportEmail);
                  }
                }
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                emailCardTab === "test"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.dashboard.channels.emailSection.tabTest}
            </button>
          </div>

          {emailCardTab === "setup" ? (
            <form onSubmit={handleCreateEmail} className="mt-4 space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="email-channel-name"
                    className="block text-xs font-medium text-slate-700"
                  >
                    {t.dashboard.channels.emailSection.nameLabel}
                  </label>
                  <input
                    id="email-channel-name"
                    type="text"
                    required
                    maxLength={80}
                    disabled={isCreatingEmail}
                    value={emailName}
                    onChange={(e) => setEmailName(e.target.value)}
                    placeholder={
                      t.dashboard.channels.emailSection.namePlaceholder
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email-support-address"
                    className="block text-xs font-medium text-slate-700"
                  >
                    {t.dashboard.channels.emailSection.supportEmailLabel}
                  </label>
                  <input
                    id="email-support-address"
                    type="email"
                    required
                    disabled={isCreatingEmail}
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder={
                      t.dashboard.channels.emailSection.supportEmailPlaceholder
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="email-from-address"
                  className="block text-xs font-medium text-slate-700"
                >
                  {t.dashboard.channels.emailSection.fromEmailLabel}
                </label>
                <input
                  id="email-from-address"
                  type="text"
                  maxLength={160}
                  disabled={isCreatingEmail}
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  {t.dashboard.channels.emailSection.fromEmailHelper}
                </p>
              </div>

              <button
                type="submit"
                disabled={
                  isCreatingEmail || !emailName.trim() || !supportEmail.trim()
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreatingEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Mail className="h-4 w-4" aria-hidden="true" />
                )}
                <span>
                  {isCreatingEmail
                    ? t.dashboard.channels.emailSection.connecting
                    : t.dashboard.channels.emailSection.connectBtn}
                </span>
              </button>
            </form>
          ) : !activeEmailChannel ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
              <p>{t.dashboard.channels.emailSection.connectFirstNotice}</p>
              <button
                type="button"
                onClick={() => setEmailCardTab("setup")}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
              >
                {t.dashboard.channels.emailSection.tabSetup}
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
              <p className="text-xs text-slate-600">
                {t.dashboard.channels.emailSection.testSimulatorHint}
              </p>
              <form
                onSubmit={(e) =>
                  handleTestInboundEmail(e, activeEmailChannel.id)
                }
                className="mt-3 space-y-3"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      {t.dashboard.channels.emailSection.testFromLabel}
                    </label>
                    <input
                      type="email"
                      required
                      disabled={isSendingTest}
                      value={testFromEmail}
                      onChange={(e) => setTestFromEmail(e.target.value)}
                      placeholder={
                        t.dashboard.channels.emailSection.testFromPlaceholder
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700">
                      {t.dashboard.channels.emailSection.testSubjectLabel}
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={300}
                      disabled={isSendingTest}
                      value={testSubject}
                      onChange={(e) => setTestSubject(e.target.value)}
                      placeholder={
                        t.dashboard.channels.emailSection.testSubjectPlaceholder
                      }
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    {t.dashboard.channels.emailSection.testBodyLabel}
                  </label>
                  <textarea
                    rows={3}
                    required
                    maxLength={8000}
                    disabled={isSendingTest}
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
                    placeholder={
                      t.dashboard.channels.emailSection.testBodyPlaceholder
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="submit"
                    disabled={
                      isSendingTest ||
                      !testFromEmail.trim() ||
                      !testSubject.trim() ||
                      !testBody.trim()
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-700 disabled:opacity-60"
                  >
                    {isSendingTest ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {isSendingTest
                        ? t.dashboard.channels.emailSection.sendingTest
                        : t.dashboard.channels.emailSection.sendTestBtn}
                    </span>
                  </button>
                </div>
              </form>

              {testError && (
                <div
                  role="alert"
                  className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                >
                  <AlertCircle
                    className="h-4 w-4 shrink-0 text-rose-600"
                    aria-hidden="true"
                  />
                  <span>{testError}</span>
                </div>
              )}

              {testResult && (
                <div className="mt-3 space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 font-semibold ring-1 ring-inset ${
                        testResult.status === "auto_sent"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-amber-50 text-amber-800 ring-amber-200"
                      }`}
                    >
                      {testResult.status}
                    </span>

                    <Link
                      href="/dashboard/conversations"
                      className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                    >
                      {t.dashboard.channels.emailSection.goToConversationsBtn} →
                    </Link>
                  </div>

                  {testResult.status === "auto_sent" ? (
                    testResult.emailDelivery?.sent ? (
                      <p className="font-medium text-emerald-700">
                        {t.dashboard.channels.emailSection.testSuccessAutoSent}{" "}
                        ({testResult.emailDelivery.to})
                      </p>
                    ) : (
                      <p className="font-medium text-amber-800">
                        {
                          t.dashboard.channels.emailSection
                            .testEmailFailedPrefix
                        }{" "}
                        {testResult.emailDelivery?.error ??
                          "Unknown Brevo error"}
                      </p>
                    )
                  ) : (
                    <p className="font-medium text-amber-800">
                      {t.dashboard.channels.emailSection.testSuccessPending}
                    </p>
                  )}

                  {testResult.reply && (
                    <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800">
                      {testResult.reply}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Mercado Libre (Simulated Mode) Card */}
      <section className="rounded-2xl border border-amber-300/90 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-300">
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {t.dashboard.channels.mercadoLibreSection.title}
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">
                {t.dashboard.channels.mercadoLibreSection.subtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-300">
              <span>
                {t.dashboard.channels.mercadoLibreSection.simulatedBadge}
              </span>
            </span>
            {activeMeliChannel && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                <span>{t.dashboard.channels.connectedBadge}</span>
              </span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t.dashboard.channels.loading}</span>
          </div>
        ) : !activeMeliChannel ? (
          <form onSubmit={handleCreateMercadoLibre} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="meli-channel-name"
                  className="block text-xs font-medium text-slate-700"
                >
                  {t.dashboard.channels.mercadoLibreSection.nameLabel}
                </label>
                <input
                  id="meli-channel-name"
                  type="text"
                  required
                  maxLength={80}
                  disabled={isCreatingMeli}
                  value={mlName}
                  onChange={(e) => setMlName(e.target.value)}
                  placeholder={
                    t.dashboard.channels.mercadoLibreSection.namePlaceholder
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50"
                />
              </div>

              <div>
                <label
                  htmlFor="meli-seller-nickname"
                  className="block text-xs font-medium text-slate-700"
                >
                  {t.dashboard.channels.mercadoLibreSection.sellerNicknameLabel}
                </label>
                <input
                  id="meli-seller-nickname"
                  type="text"
                  maxLength={80}
                  disabled={isCreatingMeli}
                  value={mlSellerNickname}
                  onChange={(e) => setMlSellerNickname(e.target.value)}
                  placeholder={
                    t.dashboard.channels.mercadoLibreSection
                      .sellerNicknamePlaceholder
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isCreatingMeli}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-xs transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isCreatingMeli ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isCreatingMeli
                  ? t.dashboard.channels.mercadoLibreSection.activating
                  : t.dashboard.channels.mercadoLibreSection.activateBtn}
              </span>
            </button>
          </form>
        ) : (
          (() => {
            const meliCreds = parseMercadoLibreCredentials(
              activeMeliChannel.credentials
            );
            return (
              <div className="mt-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-950">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      <strong>{activeMeliChannel.name}</strong>
                    </span>
                    <span>
                      <strong>
                        {t.dashboard.channels.mercadoLibreSection.sellerLabel}:
                      </strong>{" "}
                      <code className="font-mono">
                        {meliCreds?.seller_nickname ??
                          DEFAULT_MELI_SELLER_NICKNAME}
                      </code>
                    </span>
                    <span className="text-amber-800/80">
                      {t.dashboard.channels.channelIdLabel}:{" "}
                      <code className="font-mono">{activeMeliChannel.id}</code>
                    </span>
                  </div>
                  <Link
                    href="/dashboard/conversations"
                    className="font-semibold text-amber-900 underline-offset-2 hover:underline"
                  >
                    {
                      t.dashboard.channels.mercadoLibreSection
                        .goToConversationsBtn
                    }{" "}
                    →
                  </Link>
                </div>

                <p className="text-xs text-slate-600">
                  {t.dashboard.channels.mercadoLibreSection.activeHelper}
                </p>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t.dashboard.channels.mercadoLibreSection.simFormTitle}
                  </h3>

                  <form
                    onSubmit={(e) =>
                      handleSimulateMercadoLibre(e, activeMeliChannel.id)
                    }
                    className="mt-3 space-y-3"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="meli-buyer-nickname"
                          className="block text-xs font-medium text-slate-700"
                        >
                          {
                            t.dashboard.channels.mercadoLibreSection
                              .simBuyerLabel
                          }
                        </label>
                        <input
                          id="meli-buyer-nickname"
                          type="text"
                          required
                          maxLength={80}
                          disabled={isSendingMeliSim}
                          value={mlBuyerNickname}
                          onChange={(e) => setMlBuyerNickname(e.target.value)}
                          placeholder={
                            t.dashboard.channels.mercadoLibreSection
                              .simBuyerPlaceholder
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="meli-item-title"
                          className="block text-xs font-medium text-slate-700"
                        >
                          {
                            t.dashboard.channels.mercadoLibreSection
                              .simItemTitleLabel
                          }
                        </label>
                        <input
                          id="meli-item-title"
                          type="text"
                          required
                          maxLength={300}
                          disabled={isSendingMeliSim}
                          value={mlItemTitle}
                          onChange={(e) => setMlItemTitle(e.target.value)}
                          placeholder={
                            t.dashboard.channels.mercadoLibreSection
                              .simItemTitlePlaceholder
                          }
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="meli-question-text"
                        className="block text-xs font-medium text-slate-700"
                      >
                        {
                          t.dashboard.channels.mercadoLibreSection
                            .simQuestionLabel
                        }
                      </label>
                      <textarea
                        id="meli-question-text"
                        rows={3}
                        required
                        maxLength={8000}
                        disabled={isSendingMeliSim}
                        value={mlQuestionText}
                        onChange={(e) => setMlQuestionText(e.target.value)}
                        placeholder={
                          t.dashboard.channels.mercadoLibreSection
                            .simQuestionPlaceholder
                        }
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="submit"
                        disabled={
                          isSendingMeliSim ||
                          !storeId ||
                          !mlBuyerNickname.trim() ||
                          !mlItemTitle.trim() ||
                          !mlQuestionText.trim()
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-xs transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSendingMeliSim ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Send className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>
                          {isSendingMeliSim
                            ? t.dashboard.channels.mercadoLibreSection
                                .simSubmitting
                            : t.dashboard.channels.mercadoLibreSection
                                .simSubmitBtn}
                        </span>
                      </button>
                    </div>
                  </form>

                  {mlSimError && (
                    <div
                      role="alert"
                      className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                    >
                      <AlertCircle
                        className="h-4 w-4 shrink-0 text-rose-600"
                        aria-hidden="true"
                      />
                      <span>{mlSimError}</span>
                    </div>
                  )}

                  {mlSimResult && (
                    <div className="mt-3 space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 font-semibold ring-1 ring-inset ${
                            mlSimResult.status === "auto_sent"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-amber-100 text-amber-900 ring-amber-300"
                          }`}
                        >
                          {mlSimResult.status}
                        </span>

                        <Link
                          href="/dashboard/conversations"
                          className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                          {
                            t.dashboard.channels.mercadoLibreSection
                              .goToConversationsBtn
                          }{" "}
                          →
                        </Link>
                      </div>

                      <p
                        className={`font-medium ${
                          mlSimResult.status === "auto_sent"
                            ? "text-emerald-700"
                            : "text-amber-900"
                        }`}
                      >
                        {mlSimResult.status === "auto_sent"
                          ? t.dashboard.channels.mercadoLibreSection
                              .simSuccessAutoSent
                          : t.dashboard.channels.mercadoLibreSection
                              .simSuccessPending}
                      </p>

                      {mlSimResult.reply && (
                        <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800">
                          {mlSimResult.reply}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        )}
      </section>

      {/* Connected Channels List */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t.dashboard.channels.connectedTitle}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {t.dashboard.channels.connectedSubtitle}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t.dashboard.channels.loading}</span>
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Code2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">
              {t.dashboard.channels.emptyTitle}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
              {t.dashboard.channels.emptySubtitle}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {channels.map((channel) => {
              const isEmailChannel = channel.type === "email";
              const isMercadoLibreChannel = channel.type === "mercadolibre";
              const isConfirmingDelete = confirmDeleteId === channel.id;
              const isDeletingThis = deletingId === channel.id;

              if (isMercadoLibreChannel) {
                const meliCreds = parseMercadoLibreCredentials(
                  channel.credentials
                );

                return (
                  <article
                    key={channel.id}
                    className="rounded-2xl border border-amber-300/90 bg-white p-6 shadow-xs"
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-900">
                            {channel.name}
                          </h3>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-300">
                            <ShoppingBag
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            <span>
                              {
                                t.dashboard.channels.mercadoLibreSection
                                  .channelBadge
                              }
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                            <span>
                              {
                                t.dashboard.channels.mercadoLibreSection
                                  .simulatedBadge
                              }
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            <CheckCircle2
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            <span>{t.dashboard.channels.connectedBadge}</span>
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                          <span>
                            <strong>
                              {
                                t.dashboard.channels.mercadoLibreSection
                                  .sellerLabel
                              }
                              :
                            </strong>{" "}
                            <code className="font-mono text-slate-700">
                              {meliCreds?.seller_nickname ??
                                DEFAULT_MELI_SELLER_NICKNAME}
                            </code>
                          </span>
                          <span className="text-slate-400">
                            {t.dashboard.channels.channelIdLabel}:{" "}
                            <code className="font-mono text-slate-600">
                              {channel.id}
                            </code>
                          </span>
                          <span className="text-slate-400">
                            {t.dashboard.channels.createdLabel}:{" "}
                            {channel.created_at.slice(0, 10)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href="/dashboard/conversations"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 transition-colors hover:bg-amber-200/80"
                        >
                          <MessageSquare
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          <span>
                            {
                              t.dashboard.channels.mercadoLibreSection
                                .goToConversationsBtn
                            }
                          </span>
                        </Link>

                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isDeletingThis}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              {t.common.cancel}
                            </button>
                            <button
                              type="button"
                              disabled={isDeletingThis}
                              onClick={() => handleDelete(channel.id)}
                              className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                            >
                              {isDeletingThis && (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              <span>
                                {isDeletingThis
                                  ? t.dashboard.channels.deleting
                                  : t.dashboard.channels.confirmDelete}
                              </span>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(channel.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t.dashboard.channels.deleteBtn}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              }

              if (isEmailChannel) {
                const emailCreds = readEmailCredentials(channel.credentials);
                const isTestingThis = testingChannelId === channel.id;
                const channelForwardingEmail =
                  (storeId
                    ? buildStoreInboundEmail(
                        { id: storeId, name: storeName },
                        channel.credentials
                      )
                    : "") || resolvedStoreForwardingEmail;

                return (
                  <article
                    key={channel.id}
                    className="rounded-2xl border border-teal-200/80 bg-white p-6 shadow-xs"
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-900">
                            {channel.name}
                          </h3>
                          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-200">
                            <Mail className="h-3 w-3" aria-hidden="true" />
                            <span>
                              {t.dashboard.channels.emailSection.channelBadge}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            <CheckCircle2
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            <span>{t.dashboard.channels.connectedBadge}</span>
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                          {emailCreds.supportEmail && (
                            <span>
                              <strong>Support:</strong> {emailCreds.supportEmail}
                            </span>
                          )}
                          <span>
                            <strong>From:</strong> {emailCreds.fromEmail}
                          </span>
                          <span className="text-slate-400">
                            {t.dashboard.channels.channelIdLabel}:{" "}
                            <code className="font-mono text-slate-600">
                              {channel.id}
                            </code>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (isTestingThis) {
                              setTestingChannelId(null);
                            } else {
                              setTestingChannelId(channel.id);
                              setTestResult(null);
                              setTestError(null);
                              if (!testFromEmail && emailCreds.supportEmail) {
                                setTestFromEmail(emailCreds.supportEmail);
                              }
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 ring-1 ring-teal-200 transition-colors hover:bg-teal-100"
                        >
                          <Send className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>
                            {isTestingThis
                              ? t.dashboard.channels.emailSection.closeTestBtn
                              : t.dashboard.channels.emailSection.testInboundBtn}
                          </span>
                        </button>

                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isDeletingThis}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              {t.common.cancel}
                            </button>
                            <button
                              type="button"
                              disabled={isDeletingThis}
                              onClick={() => handleDelete(channel.id)}
                              className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                            >
                              {isDeletingThis && (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              <span>
                                {isDeletingThis
                                  ? t.dashboard.channels.deleting
                                  : t.dashboard.channels.confirmDelete}
                              </span>
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(channel.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t.dashboard.channels.deleteBtn}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Copyable per-store forwarding address */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200/80 bg-teal-50/50 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-teal-800">
                          {t.dashboard.channels.emailSection.forwardingTitle}
                        </span>
                        <code className="break-all font-mono text-xs text-slate-800">
                          {channelForwardingEmail || "..."}
                        </code>
                      </div>
                      <button
                        type="button"
                        disabled={!channelForwardingEmail}
                        onClick={() =>
                          handleCopyValue(
                            `forwarding-${channel.id}`,
                            channelForwardingEmail
                          )
                        }
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-2.5 py-1 text-xs font-medium text-teal-800 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {copiedKey === `forwarding-${channel.id}` ? (
                          <>
                            <Check
                              className="h-3.5 w-3.5 text-emerald-600"
                              aria-hidden="true"
                            />
                            <span>
                              {t.dashboard.channels.emailSection.copiedAddressBtn}
                            </span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {t.dashboard.channels.emailSection.copyAddressBtn}
                            </span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Test inbound email drawer */}
                    {isTestingThis && (
                      <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
                        <h4 className="text-sm font-semibold text-slate-900">
                          {t.dashboard.channels.emailSection.testFormTitle}
                        </h4>

                        <form
                          onSubmit={(e) =>
                            handleTestInboundEmail(e, channel.id)
                          }
                          className="mt-3 space-y-3"
                        >
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-xs font-medium text-slate-700">
                                {t.dashboard.channels.emailSection.testFromLabel}
                              </label>
                              <input
                                type="email"
                                required
                                disabled={isSendingTest}
                                value={testFromEmail}
                                onChange={(e) =>
                                  setTestFromEmail(e.target.value)
                                }
                                placeholder={
                                  t.dashboard.channels.emailSection
                                    .testFromPlaceholder
                                }
                                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-700">
                                {
                                  t.dashboard.channels.emailSection
                                    .testSubjectLabel
                                }
                              </label>
                              <input
                                type="text"
                                required
                                maxLength={300}
                                disabled={isSendingTest}
                                value={testSubject}
                                onChange={(e) => setTestSubject(e.target.value)}
                                placeholder={
                                  t.dashboard.channels.emailSection
                                    .testSubjectPlaceholder
                                }
                                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700">
                              {t.dashboard.channels.emailSection.testBodyLabel}
                            </label>
                            <textarea
                              rows={3}
                              required
                              maxLength={8000}
                              disabled={isSendingTest}
                              value={testBody}
                              onChange={(e) => setTestBody(e.target.value)}
                              placeholder={
                                t.dashboard.channels.emailSection
                                  .testBodyPlaceholder
                              }
                              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                            />
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="submit"
                              disabled={
                                isSendingTest ||
                                !testFromEmail.trim() ||
                                !testSubject.trim() ||
                                !testBody.trim()
                              }
                              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-60 transition-colors"
                            >
                              {isSendingTest ? (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              <span>
                                {isSendingTest
                                  ? t.dashboard.channels.emailSection.sendingTest
                                  : t.dashboard.channels.emailSection.sendTestBtn}
                              </span>
                            </button>
                          </div>
                        </form>

                        {testError && (
                          <div
                            role="alert"
                            className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                          >
                            <AlertCircle
                              className="h-4 w-4 shrink-0 text-rose-600"
                              aria-hidden="true"
                            />
                            <span>{testError}</span>
                          </div>
                        )}

                        {testResult && (
                          <div className="mt-3 space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 font-semibold ring-1 ring-inset ${
                                  testResult.status === "auto_sent"
                                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                    : "bg-amber-50 text-amber-800 ring-amber-200"
                                }`}
                              >
                                {testResult.status}
                              </span>

                              <Link
                                href="/dashboard/conversations"
                                className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                              >
                                {
                                  t.dashboard.channels.emailSection
                                    .goToConversationsBtn
                                }{" "}
                                →
                              </Link>
                            </div>

                            {testResult.status === "auto_sent" ? (
                              testResult.emailDelivery?.sent ? (
                                <p className="font-medium text-emerald-700">
                                  {
                                    t.dashboard.channels.emailSection
                                      .testSuccessAutoSent
                                  }{" "}
                                  ({testResult.emailDelivery.to})
                                </p>
                              ) : (
                                <p className="font-medium text-amber-800">
                                  {
                                    t.dashboard.channels.emailSection
                                      .testEmailFailedPrefix
                                  }{" "}
                                  {testResult.emailDelivery?.error ??
                                    "Unknown Brevo error"}
                                </p>
                              )
                            ) : (
                              <p className="font-medium text-amber-800">
                                {
                                  t.dashboard.channels.emailSection
                                    .testSuccessPending
                                }
                              </p>
                            )}

                            {testResult.reply && (
                              <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-800">
                                {testResult.reply}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              }

              const snippet = buildChannelSnippet(channel.id);
              const isCopied = copiedKey === `snippet-${channel.id}`;
              const isPreviewOpen = previewChannelId === channel.id;

              return (
                <article
                  key={channel.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">
                          {channel.name}
                        </h3>
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-200">
                          <Globe className="h-3 w-3" aria-hidden="true" />
                          <span>{t.dashboard.channels.webWidgetBadge}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          <CheckCircle2
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          <span>{t.dashboard.channels.connectedBadge}</span>
                        </span>
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>
                          {t.dashboard.channels.channelIdLabel}:{" "}
                          <code className="font-mono text-slate-700">
                            {channel.id}
                          </code>
                        </span>
                        <span>
                          {t.dashboard.channels.createdLabel}:{" "}
                          {channel.created_at.slice(0, 10)}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {storeId && (
                        <a
                          href={`/widget/${storeId}?channelId=${channel.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
                        >
                          <ExternalLink
                            className="h-3.5 w-3.5 text-slate-500"
                            aria-hidden="true"
                          />
                          <span>{t.dashboard.channels.previewBtn}</span>
                        </a>
                      )}

                      <button
                        type="button"
                        disabled={!storeId}
                        onClick={() =>
                          setPreviewChannelId((prev) =>
                            prev === channel.id ? null : channel.id
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                      >
                        <MessageSquare
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        <span>
                          {isPreviewOpen
                            ? t.dashboard.channels.closeBubbleBtn
                            : t.dashboard.channels.bubblePreviewBtn}
                        </span>
                      </button>

                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            {t.common.cancel}
                          </button>
                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() => handleDelete(channel.id)}
                            className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                          >
                            {isDeletingThis && (
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            )}
                            <span>
                              {isDeletingThis
                                ? t.dashboard.channels.deleting
                                : t.dashboard.channels.confirmDelete}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(channel.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t.dashboard.channels.deleteBtn}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-2 rounded-t-xl border border-b-0 border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300">
                      <span>{t.dashboard.channels.snippetLabel}</span>
                      <button
                        type="button"
                        disabled={!storeId}
                        onClick={() =>
                          handleCopyValue(`snippet-${channel.id}`, snippet)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
                      >
                        {isCopied ? (
                          <>
                            <Check
                              className="h-3.5 w-3.5 text-emerald-400"
                              aria-hidden="true"
                            />
                            <span>{t.dashboard.channels.copiedBtn}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t.dashboard.channels.copyBtn}</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="overflow-x-auto rounded-b-xl border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-xs leading-relaxed text-indigo-200">
                      <code>{snippet}</code>
                    </pre>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Upcoming Multichannel Integrations */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t.dashboard.channels.upcomingTitle}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {t.dashboard.channels.upcomingSubtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {t.dashboard.channels.upcomingCards.map((card) => {
            const Icon = UPCOMING_ICON_MAP[card.id];
            const colorClasses = UPCOMING_COLOR_MAP[card.id];

            return (
              <div
                key={card.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ${colorClasses}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                      {t.dashboard.channels.comingSoonBadge}
                    </span>
                  </div>

                  <h3 className="mt-4 text-sm font-semibold text-slate-900">
                    {card.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    {card.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {previewChannelId && storeId && (
        <div
          className="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-3"
          aria-live="polite"
        >
          <div className="h-[540px] w-[380px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <iframe
              src={`/widget/${storeId}?channelId=${encodeURIComponent(previewChannelId)}`}
              title="StoreOne Channel Preview"
              className="h-full w-full border-0"
            />
          </div>
          <button
            type="button"
            onClick={() => setPreviewChannelId(null)}
            aria-label={t.dashboard.channels.closeBubbleBtn}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-indigo-700"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
