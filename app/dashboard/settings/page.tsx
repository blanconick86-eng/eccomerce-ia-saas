"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Globe } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLanguage } from "@/lib/i18n/language-context";

export default function SettingsPage() {
  const { t } = useLanguage();
  const [storeName, setStoreName] = useState("Nordica Store");
  const [websiteUrl, setWebsiteUrl] = useState("https://nordicastore.example");
  const [supportEmail, setSupportEmail] = useState(
    "support@nordicastore.example"
  );
  const [currency, setCurrency] = useState("USD");
  const [saved, setSaved] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t.dashboard.settings.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t.dashboard.settings.subtitle}
        </p>
      </div>

      {/* Language Selector */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900">
            {t.dashboard.settings.languageTitle}
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {t.dashboard.settings.languageDescription}
        </p>
        <div className="mt-4">
          <LanguageSwitcher variant="card" />
        </div>
      </section>

      {/* Store Profile */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
      >
        <h2 className="text-base font-semibold text-slate-900">
          {t.dashboard.settings.profileTitle}
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="store-name"
              className="block text-sm font-medium text-slate-700"
            >
              {t.dashboard.settings.storeName}
            </label>
            <input
              id="store-name"
              type="text"
              value={storeName}
              onChange={(e) => {
                setStoreName(e.target.value);
                setSaved(false);
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="store-url"
              className="block text-sm font-medium text-slate-700"
            >
              {t.dashboard.settings.websiteUrl}
            </label>
            <input
              id="store-url"
              type="url"
              value={websiteUrl}
              onChange={(e) => {
                setWebsiteUrl(e.target.value);
                setSaved(false);
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="support-email"
              className="block text-sm font-medium text-slate-700"
            >
              {t.dashboard.settings.supportEmail}
            </label>
            <input
              id="support-email"
              type="email"
              value={supportEmail}
              onChange={(e) => {
                setSupportEmail(e.target.value);
                setSaved(false);
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="store-currency"
              className="block text-sm font-medium text-slate-700"
            >
              {t.dashboard.settings.currency}
            </label>
            <select
              id="store-currency"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setSaved(false);
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="ARS">ARS</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t.common.saved}
              </span>
            )}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
          >
            {t.common.save}
          </button>
        </div>
      </form>

      {/* Plan Usage & Infrastructure Placeholders */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-semibold text-slate-900">
                {t.dashboard.settings.planTitle}
              </h2>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                {t.dashboard.settings.planBadge}
              </span>
            </div>
            <Link
              href="/pricing"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {t.dashboard.settings.upgradeLink} →
            </Link>
          </div>

          <div className="mt-5 space-y-4 text-xs">
            <div>
              <div className="flex justify-between font-medium text-slate-700">
                <span>{t.dashboard.settings.usageProducts}</span>
                <span className="font-mono">248 / 5,000</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                <div className="h-full w-[5%] rounded-full bg-indigo-600" />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-medium text-slate-700">
                <span>{t.dashboard.settings.usageQueries}</span>
                <span className="font-mono">1,420 / 10,000</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                <div className="h-full w-[14%] rounded-full bg-indigo-600" />
              </div>
            </div>

            <div>
              <div className="flex justify-between font-medium text-slate-700">
                <span>{t.dashboard.settings.usageDocs}</span>
                <span className="font-mono">6 / 100</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                <div className="h-full w-[6%] rounded-full bg-indigo-600" />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-base font-semibold text-slate-900">
            {t.dashboard.settings.integrationsTitle}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {t.dashboard.settings.integrationsSubtitle}
          </p>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <span className="text-sm font-medium text-slate-800">
                Supabase (Auth & DB)
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                {t.dashboard.settings.connectedAuth}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <span className="text-sm font-medium text-slate-800">
                Groq AI API
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                {t.dashboard.settings.connectedGemini}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
