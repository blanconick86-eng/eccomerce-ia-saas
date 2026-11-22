"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileUp,
  Loader2,
  MessageSquare,
  Package,
  Store,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";

type AnalyticsOverview = {
  totalProducts: number;
  availableProducts: number;
  totalPolicies: number;
  totalConversations: number;
  totalQueries: number;
  totalAssistantReplies: number;
  approvedResponses: number;
  approvedManual: number;
  autoSentResponses: number;
  pendingResponses: number;
  rejectedResponses: number;
  totalUsageQuantity: number;
  totalUsageEventsCount: number;
};

type RecentActivityItem = {
  id: string;
  language: string;
  createdAt: string;
  queryPreview: string;
  replyStatus: string;
  messagesCount: number;
};

type DashboardAnalyticsPayload = {
  store: {
    name: string;
    language: string;
  };
  overview: AnalyticsOverview;
  recentActivity: RecentActivityItem[];
  error?: string;
};

const ACTIVITY_STATUS_STYLES: Record<string, string> = {
  approved: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  auto_sent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending_approval: "bg-amber-50 text-amber-800 ring-amber-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  open: "bg-slate-100 text-slate-700 ring-slate-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export default function DashboardPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardAnalyticsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/analytics?range=30d", { signal: controller.signal })
      .then(async (res) => {
        const payload = (await res.json()) as DashboardAnalyticsPayload;
        if (!res.ok) {
          throw new Error(payload.error || t.dashboard.overview.loadError);
        }
        return payload;
      })
      .then((payload) => {
        setData(payload);
        setErrorMessage(null);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setErrorMessage(
          err instanceof Error ? err.message : t.dashboard.overview.loadError
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [refreshTick, t.dashboard.overview.loadError]);

  const overview = data?.overview;

  const summaryCards = [
    {
      key: "products",
      label: t.dashboard.overview.cards.products.label,
      value: overview ? overview.totalProducts.toLocaleString() : "—",
      delta: overview
        ? `${overview.availableProducts.toLocaleString()} ${t.dashboard.overview.cards.products.availableSuffix}`
        : "",
      helper: t.dashboard.overview.cards.products.helper,
      icon: Package,
      iconBg: "bg-indigo-50 text-indigo-600",
    },
    {
      key: "queries",
      label: t.dashboard.overview.cards.queries.label,
      value: overview ? overview.totalQueries.toLocaleString() : "—",
      delta: overview
        ? `${overview.totalConversations.toLocaleString()} ${t.dashboard.overview.cards.queries.conversationsSuffix}`
        : "",
      helper: overview
        ? `${overview.totalUsageQuantity.toLocaleString()} ${t.dashboard.overview.cards.queries.usageSuffix}`
        : "",
      icon: MessageSquare,
      iconBg: "bg-sky-50 text-sky-600",
    },
    {
      key: "approved",
      label: t.dashboard.overview.cards.approved.label,
      value: overview ? overview.approvedResponses.toLocaleString() : "—",
      delta: overview
        ? `${overview.approvedManual} ${t.dashboard.overview.cards.approved.manualLabel}`
        : "",
      helper: overview
        ? `${overview.autoSentResponses} ${t.dashboard.overview.cards.approved.autoLabel}`
        : "",
      icon: CheckCircle2,
      iconBg: "bg-emerald-50 text-emerald-600",
    },
    {
      key: "pending",
      label: t.dashboard.overview.cards.pending.label,
      value: overview ? overview.pendingResponses.toLocaleString() : "—",
      delta: overview
        ? `${overview.rejectedResponses} ${t.dashboard.overview.cards.pending.rejectedLabel}`
        : "",
      helper: t.dashboard.overview.cards.pending.helper,
      icon: Clock,
      iconBg: "bg-amber-50 text-amber-600",
    },
  ];

  const getStatusLabel = (status: string) => {
    const labels = t.dashboard.conversations.statusLabels;
    if (status in labels) {
      return labels[status as keyof typeof labels];
    }
    return status;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          {data?.store.name && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              <Store className="h-3 w-3" aria-hidden="true" />
              <span>{data.store.name}</span>
            </div>
          )}
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {t.dashboard.overview.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t.dashboard.overview.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/dashboard/import"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
          >
            <FileUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span>{t.dashboard.overview.ctaImport}</span>
          </Link>
          <Link
            href="/dashboard/conversations"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span>{t.dashboard.overview.ctaConversations}</span>
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
        >
          <span className="flex items-center gap-2">
            <AlertCircle
              className="h-4 w-4 shrink-0 text-rose-600"
              aria-hidden="true"
            />
            <span>{errorMessage}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setRefreshTick((prev) => prev + 1);
            }}
            className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100/50"
          >
            {t.dashboard.overview.retry}
          </button>
        </div>
      )}

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-600">
                  {card.label}
                </p>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.iconBg}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                {isLoading && !overview ? (
                  <Loader2
                    className="h-6 w-6 animate-spin text-slate-400"
                    aria-hidden="true"
                  />
                ) : (
                  card.value
                )}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-700">{card.delta}</span>
                <span className="text-slate-500">{card.helper}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity Table */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t.dashboard.overview.activityTitle}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {t.dashboard.overview.activitySubtitle}
            </p>
          </div>
          <Link
            href="/dashboard/conversations"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            {t.dashboard.nav.conversations} →
          </Link>
        </div>

        {isLoading && !data ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t.dashboard.overview.loading}</span>
          </div>
        ) : !data || data.recentActivity.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-slate-500">
              {t.dashboard.overview.activityEmpty}
            </p>
            <Link
              href="/dashboard/conversations"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.dashboard.overview.activityEmptyCta}</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">
                    {t.dashboard.overview.columns.query}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.overview.columns.language}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.overview.columns.messages}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.overview.columns.status}
                  </th>
                  <th className="px-6 py-3 text-right">
                    {t.dashboard.overview.columns.when}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentActivity.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="max-w-md px-6 py-4">
                      <Link
                        href="/dashboard/conversations"
                        className="line-clamp-2 font-medium text-slate-900 hover:text-indigo-600"
                      >
                        {row.queryPreview || row.id}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium uppercase text-slate-700">
                        {row.language}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-600">
                      {row.messagesCount}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          ACTIVITY_STATUS_STYLES[row.replyStatus] ??
                          ACTIVITY_STATUS_STYLES.open
                        }`}
                      >
                        {getStatusLabel(row.replyStatus)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-mono text-xs text-slate-500">
                      {row.createdAt.slice(0, 16).replace("T", " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
