"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  MessageCircle,
  MessageSquare,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { Channel } from "@/types/database";

function subscribeNoop() {
  return () => {};
}

function getOriginSnapshot() {
  return window.location.origin;
}

function getOriginServerSnapshot() {
  return "";
}

const UPCOMING_ICON_MAP = {
  mercadolibre: ShoppingBag,
  amazon: Package,
  whatsapp: MessageCircle,
} as const;

const UPCOMING_COLOR_MAP = {
  mercadolibre: "bg-amber-50 text-amber-600 ring-amber-200",
  amazon: "bg-orange-50 text-orange-600 ring-orange-200",
  whatsapp: "bg-emerald-50 text-emerald-600 ring-emerald-200",
} as const;

export default function ChannelsPage() {
  const { t } = useLanguage();
  const [storeId, setStoreId] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [copiedChannelId, setCopiedChannelId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewChannelId, setPreviewChannelId] = useState<string | null>(null);

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
        (event.data as { type?: string }).type === "storemind:close"
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
          store?: { id: string; name: string; language: string };
          channels?: Channel[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(payload.error || t.dashboard.channels.loadError);
        }
        return {
          resolvedStoreId: payload.store?.id ?? "",
          channels: payload.channels ?? [],
        };
      })
      .then(({ resolvedStoreId, channels: loadedChannels }) => {
        if (!cancelled) {
          setStoreId(resolvedStoreId);
          setChannels(loadedChannels);
          setErrorMessage(null);
        }
      })
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
    } catch {
      setErrorMessage(t.dashboard.channels.deleteError);
    } finally {
      setDeletingId(null);
    }
  };

  const buildChannelSnippet = (channelId: string) => {
    const baseUrl = origin || "https://TU_URL";
    const resolvedStore = storeId || "STORE_ID";
    return `<script src="${baseUrl}/widget.js" data-store-id="${resolvedStore}" data-channel-id="${channelId}" async></script>`;
  };

  const handleCopySnippet = async (channelId: string) => {
    if (!storeId) return;
    const snippet = buildChannelSnippet(channelId);
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = snippet;
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
      setCopiedChannelId(channelId);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopiedChannelId(null);
      }, 2200);
    }
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

      {/* Create new Web Widget channel */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
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

        <form
          onSubmit={handleCreate}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
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
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
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

      {/* Connected Web Widget Channels */}
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
              const snippet = buildChannelSnippet(channel.id);
              const isCopied = copiedChannelId === channel.id;
              const isConfirmingDelete = confirmDeleteId === channel.id;
              const isDeletingThis = deletingId === channel.id;
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
                        onClick={() => handleCopySnippet(channel.id)}
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
              title="StoreMind AI Channel Preview"
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
