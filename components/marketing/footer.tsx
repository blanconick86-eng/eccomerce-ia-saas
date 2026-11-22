"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { useLanguage } from "@/lib/i18n/language-context";

export function MarketingFooter() {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          <div className="md:col-span-6">
            <BrandLogo href="/" />
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
              {t.footer.tagline}
            </p>
          </div>

          <div className="md:col-span-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t.footer.productHeading}
            </h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <Link
                  href="/features"
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {t.nav.features}
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {t.nav.pricing}
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {t.nav.dashboardDemo}
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:col-span-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t.footer.accountHeading}
            </h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <Link
                  href="/login"
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {t.nav.login}
                </Link>
              </li>
              <li>
                <Link
                  href="/signup"
                  className="text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {t.nav.signup}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-slate-100 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>{t.footer.copyright}</p>
          <p>{t.common.demoBadge}</p>
        </div>
      </div>
    </footer>
  );
}
