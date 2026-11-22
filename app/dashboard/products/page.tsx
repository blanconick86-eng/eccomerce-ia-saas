"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, FileUp, Loader2, Search, Trash2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { Product } from "@/types/database";

type ProductsPayload = {
  products: Product[];
  categories: string[];
  totalCount: number;
  error?: string;
};

export default function ProductsPage() {
  const { t } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (selectedCategory) params.set("category", selectedCategory);

      const url = `/api/products${params.toString() ? `?${params.toString()}` : ""}`;

      fetch(url, { signal: controller.signal })
        .then(async (res) => {
          const payload = (await res.json()) as ProductsPayload;
          if (!res.ok) {
            throw new Error(payload.error || t.dashboard.products.loadError);
          }
          return payload;
        })
        .then((payload) => {
          setProducts(payload.products ?? []);
          setCategories(payload.categories ?? []);
          setTotalCount(payload.totalCount ?? 0);
          setErrorMessage(null);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          setErrorMessage(
            err instanceof Error ? err.message : t.dashboard.products.loadError
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedCategory, refreshTick, t.dashboard.products.loadError]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `/api/products?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(payload.error || t.dashboard.products.deleteError);
        return;
      }

      setConfirmDeleteId(null);
      setProducts((prev) => prev.filter((item) => item.id !== id));
      setTotalCount((prev) => Math.max(0, prev - 1));
      setRefreshTick((prev) => prev + 1);
    } catch {
      setErrorMessage(t.dashboard.products.deleteError);
    } finally {
      setDeletingId(null);
    }
  };

  const getStockBadge = (status: string) => {
    if (status === "out_of_stock") {
      return {
        label: t.dashboard.products.stockLabels.out_of_stock,
        style: "bg-rose-50 text-rose-700 ring-rose-200",
      };
    }
    return {
      label: t.dashboard.products.stockLabels.available,
      style: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t.dashboard.products.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t.dashboard.products.subtitle}
          </p>
        </div>
        <Link
          href="/dashboard/import"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
        >
          <FileUp className="h-4 w-4" aria-hidden="true" />
          <span>{t.dashboard.products.importButton}</span>
        </Link>
      </div>

      {/* Search & Category Controls */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setIsLoading(true);
              setQuery(e.target.value);
            }}
            placeholder={t.dashboard.products.searchPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label={t.dashboard.products.columns.category}
            value={selectedCategory}
            onChange={(e) => {
              setIsLoading(true);
              setSelectedCategory(e.target.value);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">{t.dashboard.products.allCategories}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
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
            {t.dashboard.products.retry}
          </button>
        </div>
      )}

      {/* Catalog Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-3 text-xs font-medium text-slate-500">
          <span>
            {products.length} {t.dashboard.products.showingCount} ({totalCount}{" "}
            {t.dashboard.products.totalInStore})
          </span>
          {isLoading && (
            <span className="inline-flex items-center gap-1.5 text-indigo-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>{t.dashboard.products.loading}</span>
            </span>
          )}
        </div>

        {isLoading && products.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{t.dashboard.products.loading}</span>
          </div>
        ) : products.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-slate-500">
              {t.dashboard.products.empty}
            </p>
            <Link
              href="/dashboard/import"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.dashboard.products.emptyCta}</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">
                    {t.dashboard.products.columns.product}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.products.columns.category}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.products.columns.price}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.products.columns.stock}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.products.columns.updated}
                  </th>
                  <th className="px-6 py-3 text-right">
                    {t.dashboard.products.columns.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => {
                  const badge = getStockBadge(product.stock_status);
                  const isConfirming = confirmDeleteId === product.id;
                  const isDeleting = deletingId === product.id;

                  return (
                    <tr key={product.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-4">
                        <p className="font-medium text-slate-900">
                          {product.name}
                        </p>
                        <p className="font-mono text-xs text-slate-500">
                          {product.sku}
                        </p>
                        {product.description && (
                          <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">
                            {product.description}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                        {product.category || (
                          <span className="text-slate-400">
                            {t.dashboard.products.noCategory}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">
                        {Number(product.price).toFixed(2)} {product.currency}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.style}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-xs text-slate-500">
                        {product.updated_at.slice(0, 10)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        {isConfirming ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleDelete(product.id)}
                              className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                            >
                              {isDeleting
                                ? t.dashboard.products.deletingLabel
                                : t.dashboard.products.confirmDelete}
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              {t.common.cancel}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(product.id)}
                            aria-label={`${t.dashboard.products.deleteLabel} ${product.name}`}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t.dashboard.products.deleteLabel}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
