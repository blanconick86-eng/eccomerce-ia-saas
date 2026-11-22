"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { UsageEvent } from "@/types/database";

type RangeKey = "7d" | "30d" | "90d";

type AnalyticsResponse = {
  overview: {
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
  rangeMetrics: {
    range: RangeKey;
    queriesInRange: number;
    conversationsInRange: number;
    assistantRepliesInRange: number;
    approvedInRange: number;
    approvedManualInRange: number;
    autoSentInRange: number;
    pendingInRange: number;
    rejectedInRange: number;
    usageQuantityInRange: number;
    usageEventsInRange: number;
    approvalRate: number;
    autoSentRate: number;
    timeline: {
      label: string;
      total: number;
      approved: number;
      pending: number;
    }[];
    statusBreakdown: {
      status: string;
      count: number;
      share: number;
    }[];
    languageBreakdown: {
      language: string;
      count: number;
      share: number;
    }[];
    usageByEventType: {
      eventType: string;
      totalQuantity: number;
      count: number;
    }[];
    recentUsageEvents: UsageEvent[];
  };
  error?: string;
};

const STATUS_BAR_COLOR: Record<string, string> = {
  auto_sent: "bg-emerald-500",
  approved: "bg-indigo-600",
  pending_approval: "bg-amber-500",
  rejected: "bg-rose-500",
};

export default function AnalyticsPage() {
  const { t } = useLanguage();
  const [range, setRange] = useState<RangeKey>("30d");
  const [refreshTick, setRefreshTick] = useState(0);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/analytics?range=${range}`, { signal: controller.signal })
      .then(async (res) => {
        const payload = (await res.json()) as AnalyticsResponse;
        if (!res.ok) {
          throw new Error(payload.error || t.dashboard.analytics.loadError);
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
          err instanceof Error
            ? err.message
            : t.dashboard.analytics.loadError
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
  }, [range, refreshTick, t.dashboard.analytics.loadError]);

  const overview = data?.overview;
  const rm = data?.rangeMetrics;

  const maxVolume = Math.max(
    ...(rm?.timeline.map((item) => item.total) ?? [0]),
    1
  );

  const kpiCards = [
    {
      label: t.dashboard.analytics.kpis.totalProducts,
      value: overview ? overview.totalProducts.toLocaleString() : "—",
      helper: overview
        ? `${overview.availableProducts} ${t.dashboard.analytics.kpiHelpers.available} · ${overview.totalPolicies} ${t.dashboard.analytics.kpiHelpers.policies}`
        : "",
    },
    {
      label: t.dashboard.analytics.kpis.queries,
      value: rm ? rm.queriesInRange.toLocaleString() : "—",
      helper: rm
        ? `${rm.conversationsInRange} ${t.dashboard.analytics.kpiHelpers.conversations}`
        : "",
    },
    {
      label: t.dashboard.analytics.kpis.approved,
      value: rm ? rm.approvedInRange.toLocaleString() : "—",
      helper: rm
        ? `${rm.approvalRate}% ${t.dashboard.analytics.kpiHelpers.approvalRate}`
        : "",
    },
    {
      label: t.dashboard.analytics.kpis.pending,
      value: rm ? rm.pendingInRange.toLocaleString() : "—",
      helper: rm
        ? `${rm.rejectedInRange} ${t.dashboard.analytics.kpiHelpers.rejected}`
        : "",
    },
    {
      label: t.dashboard.analytics.kpis.usageEvents,
      value: rm ? rm.usageQuantityInRange.toLocaleString() : "—",
      helper: overview
        ? `${overview.totalUsageEventsCount} ${t.dashboard.analytics.kpiHelpers.eventsRecorded}`
        : "",
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
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t.dashboard.analytics.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t.dashboard.analytics.subtitle}
          </p>
        </div>

        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
          {(["7d", "30d", "90d"] as const).map((key) => {
            const active = range === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (range !== key) {
                    setIsLoading(true);
                    setRange(key);
                  }
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.dashboard.analytics.ranges[key]}
              </button>
            );
          })}
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
            {t.dashboard.analytics.retry}
          </button>
        </div>
      )}

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
          >
            <p className="text-xs font-medium text-slate-600">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {isLoading && !data ? (
                <Loader2
                  className="h-5 w-5 animate-spin text-slate-400"
                  aria-hidden="true"
                />
              ) : (
                card.value
              )}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">{card.helper}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              {t.dashboard.analytics.volumeTitle}
            </h2>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-200" />
                {t.dashboard.analytics.totalLegend}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-indigo-600" />
                {t.dashboard.analytics.approvedLegend}
              </span>
            </div>
          </div>

          {isLoading && !rm ? (
            <div className="flex h-56 items-center justify-center text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
          ) : !rm || rm.assistantRepliesInRange === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-slate-500">
              {t.dashboard.analytics.noDataPeriod}
            </div>
          ) : (
            <div className="mt-8 flex h-56 items-end justify-between gap-3 border-b border-slate-200 pb-3">
              {rm.timeline.map((bar) => {
                const totalHeight = Math.round((bar.total / maxVolume) * 100);
                const approvedHeight = Math.round(
                  (bar.approved / maxVolume) * 100
                );

                return (
                  <div
                    key={bar.label}
                    className="flex flex-1 flex-col items-center gap-2"
                  >
                    <div className="flex h-44 w-full max-w-[52px] items-end justify-center gap-1">
                      <div
                        className="w-1/2 rounded-t-md bg-slate-200 transition-all"
                        style={{ height: `${totalHeight}%` }}
                        title={`${t.dashboard.analytics.totalLegend}: ${bar.total}`}
                      />
                      <div
                        className="w-1/2 rounded-t-md bg-indigo-600 transition-all"
                        style={{ height: `${approvedHeight}%` }}
                        title={`${t.dashboard.analytics.approvedLegend}: ${bar.approved}`}
                      />
                    </div>
                    <div className="text-center">
                      <p className="font-mono text-[11px] font-medium text-slate-700">
                        {bar.label}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {bar.total}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Status & Language Breakdown */}
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-1">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t.dashboard.analytics.statusTitle}
            </h2>
            <div className="mt-4 space-y-3.5">
              {(rm?.statusBreakdown ?? []).map((item) => (
                <div key={item.status}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">
                      {getStatusLabel(item.status)}
                    </span>
                    <span className="font-mono text-slate-500">
                      {item.share}% ({item.count})
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        STATUS_BAR_COLOR[item.status] ?? "bg-indigo-600"
                      }`}
                      style={{ width: `${item.share}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">
              {t.dashboard.analytics.languageTitle}
            </h3>
            {!rm || rm.languageBreakdown.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                {t.dashboard.analytics.noDataPeriod}
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {rm.languageBreakdown.map((item) => (
                  <span
                    key={item.language}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-medium text-slate-700"
                  >
                    {item.language.toUpperCase()}: {item.count} ({item.share}%)
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Real Usage Events Log */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t.dashboard.analytics.usageTitle}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {t.dashboard.analytics.usageSubtitle}
            </p>
          </div>
          {rm && rm.usageByEventType.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rm.usageByEventType.map((item) => (
                <span
                  key={item.eventType}
                  className="rounded-full bg-indigo-50 px-3 py-1 font-mono text-xs font-medium text-indigo-700"
                >
                  {item.eventType}: {item.totalQuantity}
                </span>
              ))}
            </div>
          )}
        </div>

        {!rm || rm.recentUsageEvents.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            {t.dashboard.analytics.usageEmpty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">
                    {t.dashboard.analytics.usageCols.eventType}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.analytics.usageCols.quantity}
                  </th>
                  <th className="px-6 py-3 text-right">
                    {t.dashboard.analytics.usageCols.date}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rm.recentUsageEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-6 py-3.5 font-mono text-xs font-medium text-slate-900">
                      {ev.event_type}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3.5 font-mono text-slate-700">
                      {ev.quantity}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3.5 text-right font-mono text-xs text-slate-500">
                      {ev.created_at.slice(0, 16).replace("T", " ")}
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
