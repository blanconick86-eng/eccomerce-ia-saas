"use client";

import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  FileSpreadsheet,
  Globe,
  MessageSquareText,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";

const STEP_ICONS = [
  FileSpreadsheet,
  BrainCircuit,
  MessageSquareText,
  ShieldCheck,
];

const PILLAR_ICONS = [PackageCheck, UserCheck, Globe];

export default function MarketingHomePage() {
  const { t } = useLanguage();

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200/70">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-gradient-to-b from-indigo-50/70 via-white to-white"
        />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-3 py-1 text-xs font-medium text-indigo-700">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.home.badge}</span>
              </div>

              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:leading-[1.12]">
                {t.home.headline}
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                {t.home.subheadline}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
                >
                  <span>{t.home.primaryCta}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/features"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span>{t.home.secondaryCta}</span>
                </Link>
                <Link
                  href="/dashboard"
                  className="px-2 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  {t.home.demoLink}
                </Link>
              </div>

              <p className="mt-5 text-xs font-medium text-slate-500">
                {t.home.trustLine}
              </p>
            </div>

            {/* Grounded Assistant Preview */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/50 sm:p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {t.home.preview.headerTitle}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t.home.preview.storeLabel}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200/70">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.home.preview.confidenceLabel}
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t.home.preview.customerLabel}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-800">
                      {t.home.preview.customerQuestion}
                    </p>
                  </div>

                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t.home.preview.aiLabel}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-800">
                      {t.home.preview.aiDraft}
                    </p>

                    <div className="mt-3.5 border-t border-indigo-100 pt-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        {t.home.preview.sourcesLabel}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <span className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                          {t.home.preview.sourceProduct}
                        </span>
                        <span className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                          {t.home.preview.sourcePolicy}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">
                    {t.home.preview.editBtn}
                  </span>
                  <Link
                    href="/dashboard/conversations"
                    className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                  >
                    {t.home.preview.approveBtn}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Step Workflow */}
      <section className="border-b border-slate-200/70 bg-slate-50/70 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
              {t.home.workflow.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {t.home.workflow.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              {t.home.workflow.subtitle}
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {t.home.workflow.steps.map((step, index) => {
              const Icon = STEP_ICONS[index];
              return (
                <div
                  key={step.number}
                  className="relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-400">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Value Pillars */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
              {t.home.pillars.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {t.home.pillars.title}
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {t.home.pillars.items.map((item, idx) => {
              const Icon = PILLAR_ICONS[idx];
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white p-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="pb-20 pt-4">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-indigo-200/80 bg-indigo-50/60 p-8 sm:p-10 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {t.home.bottomCta.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">
                {t.home.bottomCta.subtitle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
              >
                <span>{t.home.bottomCta.button}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/pricing"
                className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {t.home.bottomCta.secondary}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
