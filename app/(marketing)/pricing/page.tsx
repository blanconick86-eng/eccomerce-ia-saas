"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";

export default function PricingPage() {
  const { t } = useLanguage();
  const [annual, setAnnual] = useState(true);

  return (
    <div className="bg-white">
      <section className="border-b border-slate-200/70 bg-gradient-to-b from-slate-50/80 to-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            {t.pricing.eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {t.pricing.title}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
            {t.pricing.subtitle}
          </p>

          <div className="mt-8 inline-flex items-center rounded-xl border border-slate-200 bg-slate-100/80 p-1">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                !annual
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.pricing.monthly}
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                annual
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>{t.pricing.annual}</span>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                {t.pricing.annualBadge}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Plan Cards */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {t.pricing.plans.map((plan) => {
              const price = annual ? plan.annualPrice : plan.monthlyPrice;
              const isHighlighted = "highlighted" in plan && plan.highlighted;

              return (
                <div
                  key={plan.id}
                  className={`flex flex-col justify-between rounded-2xl border bg-white p-8 ${
                    isHighlighted
                      ? "border-indigo-600 shadow-md ring-1 ring-indigo-600"
                      : "border-slate-200 shadow-xs"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">
                        {plan.name}
                      </h2>
                      {isHighlighted && (
                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                          {t.pricing.mostPopular}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {plan.description}
                    </p>

                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-4xl font-semibold tracking-tight text-slate-900">
                        ${price}
                      </span>
                      <span className="text-sm text-slate-500">
                        USD{t.pricing.perMonth}
                      </span>
                    </div>
                    {annual && (
                      <p className="mt-1 text-xs text-slate-500">
                        {t.pricing.billedAnnually}
                      </p>
                    )}

                    <ul className="mt-6 space-y-3 border-t border-slate-100 pt-6 text-sm text-slate-700">
                      {plan.limits.map((limit) => (
                        <li key={limit} className="flex items-start gap-2.5">
                          <Check
                            className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600"
                            aria-hidden="true"
                          />
                          <span>{limit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href="/signup"
                    className={`mt-8 block w-full rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                      isHighlighted
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {t.pricing.choosePlan} {plan.name}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison Matrix */}
      <section className="border-t border-slate-200/70 bg-slate-50/70 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t.pricing.comparisonTitle}
          </h2>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
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

          {/* FAQs */}
          <div className="mt-14">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              {t.pricing.faqTitle}
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
              {t.pricing.faqs.map((faq) => (
                <div
                  key={faq.q}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <h3 className="text-sm font-semibold text-slate-900">
                    {faq.q}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
