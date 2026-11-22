"use client";

import { Check, Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { Locale } from "@/types/mock";

type LanguageSwitcherProps = {
  variant?: "compact" | "card";
};

export function LanguageSwitcher({
  variant = "compact",
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useLanguage();

  if (variant === "card") {
    const options: { code: Locale; title: string; description: string }[] = [
      {
        code: "es",
        title: t.dashboard.settings.esTitle,
        description: t.dashboard.settings.esDesc,
      },
      {
        code: "en",
        title: t.dashboard.settings.enTitle,
        description: t.dashboard.settings.enDesc,
      },
    ];

    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const isSelected = locale === option.code;
          return (
            <button
              key={option.code}
              type="button"
              onClick={() => setLocale(option.code)}
              aria-pressed={isSelected}
              className={`flex items-start justify-between rounded-xl border p-4 text-left transition-colors ${
                isSelected
                  ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {option.title}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {option.description}
                </p>
              </div>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-transparent"
                }`}
              >
                <Check className="h-3 w-3" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Language selector"
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/80 p-0.5"
    >
      <Globe
        className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-slate-500"
        aria-hidden="true"
      />
      {(["es", "en"] as const).map((code) => {
        const isActive = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={isActive}
            className={`rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide transition-all ${
              isActive
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
