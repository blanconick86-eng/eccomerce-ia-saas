"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Edit3,
  Globe,
  Loader2,
  Mail,
  MessageCircle,
  Package,
  Send,
  ShoppingBag,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { SafetyReason } from "@/lib/ai/groq";
import type { QueryClassification } from "@/lib/validation/ai";
import type {
  ChannelSummary,
  Conversation,
  Message,
} from "@/types/database";

type ConversationWithMessages = Conversation & {
  channel?: ChannelSummary | null;
  messages: Message[];
};

type SimulationResponse = {
  conversation: Conversation;
  customerMessage: Message;
  assistantMessage: Message;
  classification: QueryClassification;
  decision: {
    status: "pending_approval" | "auto_sent";
    reasons: SafetyReason[];
  };
  retrievedProductsCount: number;
  policiesCount: number;
  error?: string;
};

type StatusFilter =
  | "all"
  | "pending_approval"
  | "auto_sent"
  | "approved"
  | "rejected";

function parseEmailThreadMeta(
  raw: string | null | undefined
): { fromEmail: string; subject: string } | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    const fromEmail =
      typeof obj.fromEmail === "string" ? obj.fromEmail.trim() : "";
    const subject =
      typeof obj.subject === "string" ? obj.subject.trim() : "";
    if (!fromEmail) return null;
    return { fromEmail, subject };
  } catch {
    return null;
  }
}

const STATUS_STYLE_MAP: Record<string, string> = {
  pending_approval: "bg-amber-50 text-amber-800 ring-amber-200",
  auto_sent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  approved: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  received: "bg-slate-100 text-slate-600 ring-slate-200",
  open: "bg-slate-100 text-slate-700 ring-slate-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export default function ConversationsPage() {
  const { t } = useLanguage();

  const [conversations, setConversations] = useState<
    ConversationWithMessages[]
  >([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Simulator state
  const [simInput, setSimInput] = useState("");
  const [continueSelected, setContinueSelected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [lastSimResult, setLastSimResult] = useState<SimulationResponse | null>(
    null
  );

  // Moderation state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [emailSentBanner, setEmailSentBanner] = useState<{
    to: string;
    subject: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/conversations")
      .then(async (res) => {
        const payload = (await res.json()) as {
          conversations?: ConversationWithMessages[];
          channels?: ChannelSummary[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(
            payload.error || t.dashboard.conversations.loadError
          );
        }
        return {
          conversations: payload.conversations ?? [],
          channels: payload.channels ?? [],
        };
      })
      .then(({ conversations: list, channels: channelList }) => {
        if (!cancelled) {
          setConversations(list);
          setChannels(channelList);
          if (list.length > 0) {
            setSelectedId(list[0].id);
          }
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : t.dashboard.conversations.loadError
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
  }, [t.dashboard.conversations.loadError]);

  const handleSimulate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!simInput.trim() || isSimulating) return;

    setIsSimulating(true);
    setSimError(null);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(continueSelected && selectedId
            ? { conversationId: selectedId }
            : {}),
          message: simInput.trim(),
        }),
      });

      const payload = (await response.json()) as SimulationResponse;
      if (!response.ok) {
        setSimError(payload.error || t.dashboard.conversations.simulatorError);
        return;
      }

      setLastSimResult(payload);
      setSimInput("");

      setConversations((prev) => {
        const existingIndex = prev.findIndex(
          (c) => c.id === payload.conversation.id
        );
        if (existingIndex >= 0) {
          const updated = prev.map((c) =>
            c.id === payload.conversation.id
              ? {
                  ...payload.conversation,
                  channel: c.channel ?? null,
                  messages: [
                    ...c.messages,
                    payload.customerMessage,
                    payload.assistantMessage,
                  ],
                }
              : c
          );
          return updated;
        }

        const newConv: ConversationWithMessages = {
          ...payload.conversation,
          channel: null,
          messages: [payload.customerMessage, payload.assistantMessage],
        };
        return [newConv, ...prev];
      });

      setSelectedId(payload.conversation.id);
    } catch {
      setSimError(t.dashboard.conversations.simulatorError);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleModerate = async (
    messageId: string,
    action: "approve" | "edit_and_approve" | "reject",
    content?: string
  ) => {
    if (moderatingId) return;
    setModeratingId(messageId);
    setActionError(null);
    setEmailSentBanner(null);

    try {
      const response = await fetch("/api/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          action,
          ...(content !== undefined ? { content } : {}),
        }),
      });

      const payload = (await response.json()) as {
        message?: Message;
        conversationStatus?: string;
        emailDelivery?: {
          sent?: boolean;
          to?: string;
          subject?: string;
        };
        error?: string;
      };

      if (!response.ok || !payload.message) {
        setActionError(payload.error || t.dashboard.conversations.actionError);
        return;
      }

      if (payload.emailDelivery?.sent && payload.emailDelivery.to) {
        setEmailSentBanner({
          to: payload.emailDelivery.to,
          subject: payload.emailDelivery.subject ?? "",
        });
      }

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== payload.message!.conversation_id) return conv;
          return {
            ...conv,
            status: payload.conversationStatus ?? conv.status,
            messages: conv.messages.map((m) =>
              m.id === payload.message!.id ? payload.message! : m
            ),
          };
        })
      );

      setEditingMessageId(null);
      setEditedContent("");
    } catch {
      setActionError(t.dashboard.conversations.actionError);
    } finally {
      setModeratingId(null);
    }
  };

  const getChannelTypeLabel = (type: string) => {
    const labels = t.dashboard.conversations.channelTypeLabels;
    if (type in labels) {
      return labels[type as keyof typeof labels];
    }
    return type;
  };

  const renderChannelBadge = (channel?: ChannelSummary | null) => {
    if (!channel) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
          <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{t.dashboard.conversations.simulatorChannel}</span>
        </span>
      );
    }

    const typeLabel = getChannelTypeLabel(channel.type);

    if (channel.type === "mercadolibre") {
      return (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
          <ShoppingBag className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {typeLabel} · {channel.name}
          </span>
        </span>
      );
    }

    if (channel.type === "amazon") {
      return (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-800 ring-1 ring-inset ring-orange-200">
          <Package className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {typeLabel} · {channel.name}
          </span>
        </span>
      );
    }

    if (channel.type === "whatsapp") {
      return (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
          <MessageCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {typeLabel} · {channel.name}
          </span>
        </span>
      );
    }

    if (channel.type === "email") {
      return (
        <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800 ring-1 ring-inset ring-teal-200">
          <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {typeLabel} · {channel.name}
          </span>
        </span>
      );
    }

    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-inset ring-sky-200">
        <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {typeLabel} · {channel.name}
        </span>
      </span>
    );
  };

  const getStatusLabel = (status: string) => {
    const labels = t.dashboard.conversations.statusLabels;
    if (status in labels) {
      return labels[status as keyof typeof labels];
    }
    return status;
  };

  const getConversationDisplayStatus = (conv: ConversationWithMessages) => {
    const assistantMessages = conv.messages.filter(
      (m) => m.role === "assistant"
    );
    const latestAssistant = assistantMessages[assistantMessages.length - 1];
    return latestAssistant?.status ?? conv.status;
  };

  const filteredConversations = conversations.filter((conv) => {
    if (channelFilter === "simulator") {
      if (conv.channel_id || conv.channel) return false;
    } else if (channelFilter !== "all") {
      const convChannelId = conv.channel?.id ?? conv.channel_id ?? null;
      if (convChannelId !== channelFilter) return false;
    }

    if (statusFilter === "all") return true;
    const displayStatus = getConversationDisplayStatus(conv);
    return displayStatus === statusFilter;
  });

  const activeConversation =
    filteredConversations.find((c) => c.id === selectedId) ??
    filteredConversations[0] ??
    null;

  const filterOptions: { id: StatusFilter; label: string }[] = [
    { id: "all", label: t.dashboard.conversations.filterAll },
    {
      id: "pending_approval",
      label: t.dashboard.conversations.statusLabels.pending_approval,
    },
    {
      id: "auto_sent",
      label: t.dashboard.conversations.statusLabels.auto_sent,
    },
    {
      id: "approved",
      label: t.dashboard.conversations.statusLabels.approved,
    },
    {
      id: "rejected",
      label: t.dashboard.conversations.statusLabels.rejected,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t.dashboard.conversations.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t.dashboard.conversations.subtitle}
        </p>
      </div>

      {/* Customer Simulator */}
      <section className="rounded-2xl border border-indigo-200/80 bg-white p-6 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t.dashboard.conversations.simulatorTitle}
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {t.dashboard.conversations.simulatorSubtitle}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">
            {t.dashboard.conversations.quickPromptsLabel}
          </span>
          {t.dashboard.conversations.quickPrompts.map((promptText) => (
            <button
              key={promptText}
              type="button"
              onClick={() => setSimInput(promptText)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
            >
              {promptText}
            </button>
          ))}
        </div>

        <form onSubmit={handleSimulate} className="mt-4 space-y-3">
          <textarea
            rows={2}
            required
            disabled={isSimulating}
            value={simInput}
            onChange={(e) => setSimInput(e.target.value)}
            placeholder={t.dashboard.conversations.simulatorPlaceholder}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            {selectedId ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={continueSelected}
                  onChange={(e) => setContinueSelected(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{t.dashboard.conversations.continueSelectedLabel}</span>
              </label>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={isSimulating || !simInput.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              {isSimulating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isSimulating
                  ? t.dashboard.conversations.sendingSimulator
                  : t.dashboard.conversations.sendSimulator}
              </span>
            </button>
          </div>
        </form>

        {simError && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
          >
            <AlertCircle
              className="h-4 w-4 shrink-0 text-rose-600"
              aria-hidden="true"
            />
            <span>{simError}</span>
          </div>
        )}

        {lastSimResult && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {t.dashboard.conversations.lastResultTitle}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                  STATUS_STYLE_MAP[lastSimResult.decision.status] ??
                  STATUS_STYLE_MAP.open
                }`}
              >
                {t.dashboard.conversations.decisionLabel}:{" "}
                {getStatusLabel(lastSimResult.decision.status)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-lg bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                {t.dashboard.conversations.topicLabel}:{" "}
                <span className="font-mono">
                  {lastSimResult.classification.topic}
                </span>
              </span>
              <span className="rounded-lg bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                {t.dashboard.conversations.languageLabel}:{" "}
                <span className="font-mono uppercase">
                  {lastSimResult.classification.language}
                </span>
              </span>
              <span className="rounded-lg bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                {t.dashboard.conversations.sufficientInfoLabel}:{" "}
                {lastSimResult.classification.has_sufficient_info
                  ? t.dashboard.conversations.yesLabel
                  : t.dashboard.conversations.noLabel}
              </span>
              <span className="rounded-lg bg-white px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-200">
                {t.dashboard.conversations.requiresHumanLabel}:{" "}
                {lastSimResult.classification.requires_human
                  ? t.dashboard.conversations.yesLabel
                  : t.dashboard.conversations.noLabel}
              </span>
            </div>

            {lastSimResult.decision.reasons.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-500">
                  {t.dashboard.conversations.reasonsLabel}:
                </span>
                {lastSimResult.decision.reasons.map((reason) => (
                  <span
                    key={reason}
                    className="rounded-md bg-amber-100/80 px-2 py-0.5 font-medium text-amber-900"
                  >
                    {t.dashboard.conversations.reasonLabels[reason]}
                  </span>
                ))}
              </div>
            )}

            <p className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3.5 text-sm leading-relaxed text-slate-800">
              {lastSimResult.assistantMessage.content}
            </p>
          </div>
        )}
      </section>

      {/* Conversation History Header + Filters */}
      <div className="space-y-3">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h2 className="text-lg font-semibold text-slate-900">
            {t.dashboard.conversations.historyTitle}
          </h2>

          <div className="flex flex-wrap items-center gap-1.5">
            {filterOptions.map((item) => {
              const active = statusFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStatusFilter(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Channel origin filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-slate-500">
            {t.dashboard.conversations.channelFilterLabel}:
          </span>
          <button
            type="button"
            onClick={() => setChannelFilter("all")}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              channelFilter === "all"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {t.dashboard.conversations.allChannels}
          </button>

          {channels.map((ch) => {
            const active = channelFilter === ch.id;
            const FilterIcon = ch.type === "email" ? Mail : Globe;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => setChannelFilter(ch.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <FilterIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>
                  {getChannelTypeLabel(ch.type)} · {ch.name}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setChannelFilter("simulator")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              channelFilter === "simulator"
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{t.dashboard.conversations.simulatorChannel}</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {emailSentBanner && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          <CheckCircle2
            className="h-4 w-4 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
          <span>
            {t.dashboard.conversations.emailSentSuccess}{" "}
            <strong className="font-semibold">{emailSentBanner.to}</strong>
            {emailSentBanner.subject ? ` (${emailSentBanner.subject})` : ""}.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{t.dashboard.conversations.loading}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Conversations List */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-4">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {t.dashboard.conversations.emptyList}
              </div>
            ) : (
              <div className="max-h-[540px] divide-y divide-slate-100 overflow-y-auto">
                {filteredConversations.map((conv) => {
                  const displayStatus = getConversationDisplayStatus(conv);
                  const firstCustomerMsg = conv.messages.find(
                    (m) => m.role === "customer"
                  );
                  const preview =
                    firstCustomerMsg?.content ??
                    conv.messages[0]?.content ??
                    conv.id;
                  const isSelected = activeConversation?.id === conv.id;

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(conv.id);
                        setEditingMessageId(null);
                      }}
                      className={`w-full p-4 text-left transition-colors ${
                        isSelected
                          ? "bg-indigo-50/70"
                          : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          {renderChannelBadge(conv.channel)}
                        </div>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] uppercase text-slate-600">
                          {conv.language}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs font-medium text-slate-800">
                        {preview}
                      </p>
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                            STATUS_STYLE_MAP[displayStatus] ??
                            STATUS_STYLE_MAP.open
                          }`}
                        >
                          {getStatusLabel(displayStatus)}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {conv.created_at.slice(0, 16).replace("T", " ")} ·{" "}
                          {conv.messages.length} msgs
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Conversation Thread & Moderation */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-8">
            {!activeConversation ? (
              <div className="py-16 text-center text-sm text-slate-500">
                {t.dashboard.conversations.emptyList}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {renderChannelBadge(activeConversation.channel)}
                      <span className="font-mono text-xs text-slate-400">
                        {activeConversation.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {activeConversation.created_at
                        .slice(0, 16)
                        .replace("T", " ")}{" "}
                      · {activeConversation.language.toUpperCase()}
                    </p>
                    {(() => {
                      const emailMeta =
                        activeConversation.channel?.type === "email"
                          ? parseEmailThreadMeta(
                              activeConversation.external_thread_id
                            )
                          : null;
                      if (!emailMeta) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-teal-200/80 bg-teal-50/60 px-2.5 py-1 text-xs text-teal-900">
                          <span>
                            <strong>
                              {t.dashboard.conversations.emailFromLabel}:
                            </strong>{" "}
                            {emailMeta.fromEmail}
                          </span>
                          {emailMeta.subject && (
                            <span>
                              <strong>
                                {t.dashboard.conversations.emailSubjectLabel}:
                              </strong>{" "}
                              {emailMeta.subject}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      STATUS_STYLE_MAP[activeConversation.status] ??
                      STATUS_STYLE_MAP.open
                    }`}
                  >
                    {getStatusLabel(activeConversation.status)}
                  </span>
                </div>

                <div className="space-y-3">
                  {activeConversation.messages.map((msg) => {
                    const isAssistant = msg.role === "assistant";
                    const isPending =
                      isAssistant && msg.status === "pending_approval";
                    const isEditingThis = editingMessageId === msg.id;
                    const isModeratingThis = moderatingId === msg.id;

                    return (
                      <div
                        key={msg.id}
                        className={`rounded-xl border p-4 ${
                          isAssistant
                            ? "border-indigo-200/80 bg-indigo-50/30"
                            : "border-slate-200 bg-slate-50/70"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                            {isAssistant ? (
                              <Bot
                                className="h-3.5 w-3.5 text-indigo-600"
                                aria-hidden="true"
                              />
                            ) : (
                              <User
                                className="h-3.5 w-3.5 text-slate-500"
                                aria-hidden="true"
                              />
                            )}
                            <span>
                              {isAssistant
                                ? t.dashboard.conversations.roleLabels.assistant
                                : t.dashboard.conversations.roleLabels.customer}
                            </span>
                          </span>

                          <div className="flex items-center gap-2">
                            {isAssistant && (
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                                  STATUS_STYLE_MAP[msg.status] ??
                                  STATUS_STYLE_MAP.received
                                }`}
                              >
                                {getStatusLabel(msg.status)}
                              </span>
                            )}
                            <span className="font-mono text-[11px] text-slate-400">
                              {msg.created_at.slice(11, 16)}
                            </span>
                          </div>
                        </div>

                        {isEditingThis ? (
                          <div className="mt-3 space-y-3">
                            <textarea
                              rows={4}
                              value={editedContent}
                              onChange={(e) => setEditedContent(e.target.value)}
                              className="w-full rounded-xl border border-indigo-300 bg-white p-3 text-sm leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                disabled={isModeratingThis}
                                onClick={() => setEditingMessageId(null)}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                {t.common.cancel}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  isModeratingThis || !editedContent.trim()
                                }
                                onClick={() =>
                                  handleModerate(
                                    msg.id,
                                    "edit_and_approve",
                                    editedContent.trim()
                                  )
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                              >
                                {isModeratingThis && (
                                  <Loader2
                                    className="h-3.5 w-3.5 animate-spin"
                                    aria-hidden="true"
                                  />
                                )}
                                <span>
                                  {
                                    t.dashboard.conversations
                                      .saveEditedApproveBtn
                                  }
                                </span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                            {msg.content}
                          </p>
                        )}

                        {isPending && !isEditingThis && (
                          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-indigo-100 pt-3">
                            <button
                              type="button"
                              disabled={isModeratingThis}
                              onClick={() => handleModerate(msg.id, "reject")}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{t.dashboard.conversations.rejectBtn}</span>
                            </button>

                            <button
                              type="button"
                              disabled={isModeratingThis}
                              onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditedContent(msg.content);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              <Edit3
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>
                                {t.dashboard.conversations.editApproveBtn}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={isModeratingThis}
                              onClick={() => handleModerate(msg.id, "approve")}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                            >
                              {isModeratingThis ? (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Check
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              <span>
                                {t.dashboard.conversations.approveBtn}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
