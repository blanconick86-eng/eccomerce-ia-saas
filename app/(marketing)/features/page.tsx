"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  FileSpreadsheet,
  MessageSquareCheck,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";

const FEATURE_ICONS = [
  FileSpreadsheet,
  BookOpen,
  Sparkles,
  MessageSquareCheck,
  ShieldAlert,
  BarChart3,
];

export default function FeaturesPage() {
  const { t } = useLanguage();

  return (
    <div className="bg-white">
      <section className="border-b border-slate-200/70 bg-gradient-to-b from-slate-50/80 to-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
              {t.features.eyebrow}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              {t.features.title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
              {t.features.subtitle}
            </p>
          </div>
        </div>
      </section>

      {/* Feature Blocks */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {t.features.blocks.map((block, idx) => {
              const Icon = FEATURE_ICONS[idx];
              return (
                <article
                  key={block.title}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">
                    {block.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {block.description}
                  </p>
                  <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm text-slate-700">
                    {block.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600"
                          aria-hidden="true"
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Plan Limits Block */}
      <section className="border-t border-slate-200/70 bg-slate-50/70 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {t.features.limitsSection.title}
              </h2>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                {t.features.limitsSection.subtitle}
              </p>
            </div>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <span>{t.features.limitsSection.cta}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-6 py-3.5">
                    {t.features.limitsSection.planLabel}
                  </th>
                  <th className="px-6 py-3.5">Starter</th>
                  <th className="px-6 py-3.5 text-indigo-700">Growth</th>
                  <th className="px-6 py-3.5">Scale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.pricing.limitRows.map((row) => (
                  <tr key={row.label} className="hover:bg-slate-50/60">
                    <td className="px-6 py-3.5 font-medium text-slate-900">
                      {row.label}
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">{row.starter}</td>
                    <td className="px-6 py-3.5 font-medium text-slate-900">
                      {row.growth}
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">{row.scale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
