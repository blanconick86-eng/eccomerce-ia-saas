"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  FileUp,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Settings,
  SlidersHorizontal,
  Store,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useLanguage } from "@/lib/i18n/language-context";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type SessionAccount = {
  email: string | null;
  fullName: string | null;
};

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [account, setAccount] = useState<SessionAccount | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      const metaName = data.user.user_metadata?.full_name;
      setAccount({
        email: data.user.email ?? null,
        fullName: typeof metaName === "string" && metaName.trim() ? metaName : null,
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const user = session?.user;
      if (!user) {
        setAccount(null);
        return;
      }
      const metaName = user.user_metadata?.full_name;
      setAccount({
        email: user.email ?? null,
        fullName: typeof metaName === "string" && metaName.trim() ? metaName : null,
      });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  const navItems = [
    {
      href: "/dashboard",
      label: t.dashboard.nav.dashboard,
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/dashboard/products",
      label: t.dashboard.nav.products,
      icon: Package,
    },
    {
      href: "/dashboard/import",
      label: t.dashboard.nav.import,
      icon: FileUp,
    },
    {
      href: "/dashboard/conversations",
      label: t.dashboard.nav.conversations,
      icon: MessageSquare,
    },
    {
      href: "/dashboard/channels",
      label: t.dashboard.nav.channels,
      icon: Globe,
    },
    {
      href: "/dashboard/knowledge",
      label: t.dashboard.nav.knowledge,
      icon: BookOpen,
    },
    {
      href: "/dashboard/ai-settings",
      label: t.dashboard.nav.aiSettings,
      icon: SlidersHorizontal,
    },
    {
      href: "/dashboard/analytics",
      label: t.dashboard.nav.analytics,
      icon: BarChart3,
    },
    {
      href: "/dashboard/settings",
      label: t.dashboard.nav.settings,
      icon: Settings,
    },
  ];

  const isRouteActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const renderSidebarContent = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <BrandLogo href="/dashboard" />
          {onNavigate && (
            <button
              type="button"
              onClick={onNavigate}
              aria-label={t.common.closeMenu}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <nav className="space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-indigo-50 font-medium text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? "text-indigo-600" : "text-slate-400"
                    }`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 border-t border-slate-200 p-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-xs ring-1 ring-slate-200">
            <Store className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {account?.fullName || t.dashboard.workspaceName}
            </p>
            <p className="truncate text-xs text-slate-500">
              {account?.email || t.dashboard.workspacePlan}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60 transition-colors"
        >
          <span>{signingOut ? t.dashboard.signingOut : t.dashboard.signOut}</span>
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <Link
          href="/"
          className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <span>{t.common.publicSite}</span>
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white">
        {renderSidebarContent()}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <BrandLogo href="/dashboard" />
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label={t.common.openMenu}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            {renderSidebarContent(() => setMobileMenuOpen(false))}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
