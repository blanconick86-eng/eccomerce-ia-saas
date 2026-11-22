"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquare,
  ShieldAlert,
  X,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import {
  ASSISTANT_TOPICS,
  type AiLanguage,
  type AiTone,
  type AssistantTopic,
  type ResponseMode,
} from "@/lib/validation/ai";

type AiSettingsPayload = {
  store_id?: string;
  response_mode: ResponseMode;
  tone: AiTone;
  language: AiLanguage;
  allowed_topics: AssistantTopic[];
  restricted_topics: AssistantTopic[];
};

function subscribeNoop() {
  return () => {};
}

function getOriginSnapshot() {
  return window.location.origin;
}

function getOriginServerSnapshot() {
  return "";
}

export default function AiSettingsPage() {
  const { t } = useLanguage();
  const [storeId, setStoreId] = useState<string>("");
  const [responseMode, setResponseMode] = useState<ResponseMode>("approval");
  const [tone, setTone] = useState<AiTone>("friendly");
  const [aiLanguage, setAiLanguage] = useState<AiLanguage>("auto");
  const [allowedTopics, setAllowedTopics] = useState<AssistantTopic[]>([
    "products",
    "shipping",
    "returns",
    "payments",
  ]);
  const [restrictedTopics, setRestrictedTopics] = useState<AssistantTopic[]>([
    "refund_execution",
    "order_changes",
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [isBubblePreviewOpen, setIsBubblePreviewOpen] = useState(false);
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
    if (!isBubblePreviewOpen) return;

    const handleMessage = (event: MessageEvent) => {
      if (
        origin &&
        event.origin === origin &&
        event.data &&
        typeof event.data === "object" &&
        (event.data as { type?: string }).type === "storemind:close"
      ) {
        setIsBubblePreviewOpen(false);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isBubblePreviewOpen, origin]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/ai-settings")
      .then(async (res) => {
        const payload = (await res.json()) as {
          store?: { id: string; name: string; language: string };
          settings?: AiSettingsPayload;
          error?: string;
        };
        if (!res.ok || !payload.settings) {
          throw new Error(payload.error || t.dashboard.aiSettings.loadError);
        }
        return {
          resolvedStoreId: payload.store?.id ?? payload.settings.store_id ?? "",
          settings: payload.settings,
        };
      })
      .then(({ resolvedStoreId, settings }) => {
        if (cancelled) return;
        setStoreId(resolvedStoreId);
        setResponseMode(settings.response_mode);
        setTone(settings.tone);
        setAiLanguage(settings.language);
        setAllowedTopics(settings.allowed_topics);
        setRestrictedTopics(settings.restricted_topics);
        setErrorMessage(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : t.dashboard.aiSettings.loadError
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
  }, [t.dashboard.aiSettings.loadError]);

  const setTopicPolicy = (
    topic: AssistantTopic,
    state: "allowed" | "neutral" | "restricted"
  ) => {
    setSavedBanner(false);
    setAllowedTopics((prev) => {
      const without = prev.filter((item) => item !== topic);
      return state === "allowed" ? [...without, topic] : without;
    });
    setRestrictedTopics((prev) => {
      const without = prev.filter((item) => item !== topic);
      return state === "restricted" ? [...without, topic] : without;
    });
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSavedBanner(false);

    try {
      const response = await fetch("/api/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_mode: responseMode,
          tone,
          language: aiLanguage,
          allowed_topics: allowedTopics,
          restricted_topics: restrictedTopics,
        }),
      });

      const payload = (await response.json()) as {
        store?: { id: string; name: string; language: string };
        settings?: AiSettingsPayload;
        error?: string;
      };

      if (!response.ok || !payload.settings) {
        setErrorMessage(payload.error || t.dashboard.aiSettings.saveError);
        return;
      }

      const resolvedStoreId =
        payload.store?.id ?? payload.settings.store_id ?? "";
      if (resolvedStoreId) {
        setStoreId(resolvedStoreId);
      }
      setResponseMode(payload.settings.response_mode);
      setTone(payload.settings.tone);
      setAiLanguage(payload.settings.language);
      setAllowedTopics(payload.settings.allowed_topics);
      setRestrictedTopics(payload.settings.restricted_topics);
      setSavedBanner(true);
    } catch {
      setErrorMessage(t.dashboard.aiSettings.saveError);
    } finally {
      setIsSaving(false);
    }
  };

  const scriptBaseUrl = origin || "https://TU_URL";
  const resolvedStoreIdForSnippet = storeId || "STORE_ID";
  const embedSnippet = `<script src="${scriptBaseUrl}/widget.js" data-store-id="${resolvedStoreIdForSnippet}" async></script>`;

  const handleCopySnippet = async () => {
    if (!storeId) return;
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(embedSnippet);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = embedSnippet;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      document.body.removeChild(textarea);
    }

    if (copied) {
      setCopiedSnippet(true);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopiedSnippet(false);
      }, 2200);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>{t.dashboard.aiSettings.loading}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t.dashboard.aiSettings.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t.dashboard.aiSettings.subtitle}
          </p>
        </div>

        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {isSaving && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          <span>
            {isSaving ? t.dashboard.aiSettings.saving : t.common.save}
          </span>
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {savedBanner && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t.dashboard.aiSettings.savedMessage}</span>
        </div>
      )}

      {/* Response Mode */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-base font-semibold text-slate-900">
          {t.dashboard.aiSettings.modeTitle}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {t.dashboard.aiSettings.modes.map((modeOption) => {
            const selected = responseMode === modeOption.id;
            return (
              <button
                key={modeOption.id}
                type="button"
                onClick={() => {
                  setResponseMode(modeOption.id as ResponseMode);
                  setSavedBanner(false);
                }}
                className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {modeOption.title}
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      selected
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-300 text-transparent"
                    }`}
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {modeOption.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Tone */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-base font-semibold text-slate-900">
          {t.dashboard.aiSettings.toneTitle}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {t.dashboard.aiSettings.tones.map((option) => {
            const selected = tone === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setTone(option.id as AiTone);
                  setSavedBanner(false);
                }}
                className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {option.name}
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      selected
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-300 text-transparent"
                    }`}
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {option.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Language */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-base font-semibold text-slate-900">
          {t.dashboard.aiSettings.languageTitle}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {t.dashboard.aiSettings.languageOptions.map((langOption) => {
            const selected = aiLanguage === langOption.id;
            return (
              <button
                key={langOption.id}
                type="button"
                onClick={() => {
                  setAiLanguage(langOption.id as AiLanguage);
                  setSavedBanner(false);
                }}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                  selected
                    ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-1 ring-indigo-600"
                    : "border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
              >
                <span>{langOption.label}</span>
                {selected && (
                  <Check
                    className="h-4 w-4 shrink-0 text-indigo-600"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Allowed & Restricted Topics */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-start gap-2.5">
          <ShieldAlert
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t.dashboard.aiSettings.topicsTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t.dashboard.aiSettings.topicsSubtitle}
            </p>
          </div>
        </div>

        <div className="mt-5 divide-y divide-slate-100">
          {ASSISTANT_TOPICS.map((topic) => {
            const isRestricted = restrictedTopics.includes(topic);
            const isAllowed = !isRestricted && allowedTopics.includes(topic);
            const currentState = isRestricted
              ? "restricted"
              : isAllowed
                ? "allowed"
                : "neutral";

            return (
              <div
                key={topic}
                className="flex flex-col justify-between gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
              >
                <span className="text-sm font-medium text-slate-900">
                  {t.dashboard.aiSettings.topicLabels[topic]}
                </span>

                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setTopicPolicy(topic, "allowed")}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      currentState === "allowed"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.dashboard.aiSettings.allowedBadge}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopicPolicy(topic, "neutral")}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      currentState === "neutral"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.dashboard.aiSettings.neutralBadge}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopicPolicy(topic, "restricted")}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      currentState === "restricted"
                        ? "bg-rose-600 text-white"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.dashboard.aiSettings.restrictedBadge}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Install Widget on Store */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="flex items-start gap-2.5">
            <Code2
              className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {t.dashboard.aiSettings.widgetInstall.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {t.dashboard.aiSettings.widgetInstall.subtitle}
              </p>
            </div>
          </div>

          {storeId && (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              <span>{t.dashboard.aiSettings.widgetInstall.storeIdLabel}:</span>
              <code className="font-mono text-slate-900">{storeId}</code>
            </span>
          )}
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-2 rounded-t-xl border border-b-0 border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-300">
            <span>{t.dashboard.aiSettings.widgetInstall.snippetLabel}</span>
            <button
              type="button"
              onClick={handleCopySnippet}
              disabled={!storeId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {copiedSnippet ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span>{t.dashboard.aiSettings.widgetInstall.copiedBtn}</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.dashboard.aiSettings.widgetInstall.copyBtn}</span>
                </>
              )}
            </button>
          </div>
          <pre className="overflow-x-auto rounded-b-xl border border-slate-800 bg-slate-950 px-4 py-3.5 font-mono text-xs leading-relaxed text-indigo-200">
            <code>{embedSnippet}</code>
          </pre>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          {t.dashboard.aiSettings.widgetInstall.modeNote}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {storeId && (
            <a
              href={`/widget/${storeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <span>{t.dashboard.aiSettings.widgetInstall.previewTabBtn}</span>
            </a>
          )}

          <button
            type="button"
            disabled={!storeId}
            onClick={() => setIsBubblePreviewOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-200 transition-colors hover:bg-indigo-100 disabled:opacity-50"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span>
              {isBubblePreviewOpen
                ? t.dashboard.aiSettings.widgetInstall.closePreviewBubbleBtn
                : t.dashboard.aiSettings.widgetInstall.previewBubbleBtn}
            </span>
          </button>
        </div>
      </section>

      {isBubblePreviewOpen && storeId && (
        <div
          className="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-3"
          aria-live="polite"
        >
          <div className="h-[540px] w-[380px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <iframe
              src={`/widget/${storeId}`}
              title="StoreMind AI Live Preview"
              className="h-full w-full border-0"
            />
          </div>
          <button
            type="button"
            onClick={() => setIsBubblePreviewOpen(false)}
            aria-label={t.dashboard.aiSettings.widgetInstall.closePreviewBubbleBtn}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-indigo-700"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
