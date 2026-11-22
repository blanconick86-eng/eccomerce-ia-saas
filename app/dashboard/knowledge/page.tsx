"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  BookOpen,
  Edit3,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import {
  POLICY_LANGUAGES,
  POLICY_TYPES,
  type PolicyLanguage,
  type PolicyType,
} from "@/lib/validation/policy";
import type { Policy } from "@/types/database";

type TypeFilter = "all" | PolicyType;
type LangFilter = "all" | PolicyLanguage;

export default function KnowledgePage() {
  const { t } = useLanguage();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [langFilter, setLangFilter] = useState<LangFilter>("all");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newType, setNewType] = useState<PolicyType>("shipping");
  const [newLanguage, setNewLanguage] = useState<PolicyLanguage>("es");
  const [newContent, setNewContent] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<PolicyType>("shipping");
  const [editLanguage, setEditLanguage] = useState<PolicyLanguage>("es");
  const [editContent, setEditContent] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/policies")
      .then(async (res) => {
        const payload = (await res.json()) as {
          policies?: Policy[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(payload.error || t.dashboard.knowledge.loadError);
        }
        return payload.policies ?? [];
      })
      .then((data) => {
        if (!cancelled) {
          setPolicies(data);
          setErrorMessage(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : t.dashboard.knowledge.loadError
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [t.dashboard.knowledge.loadError]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newContent.trim() || isCreating) return;

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newType,
          language: newLanguage,
          content: newContent.trim(),
        }),
      });
      const payload = (await response.json()) as {
        policy?: Policy;
        error?: string;
      };

      if (!response.ok || !payload.policy) {
        setErrorMessage(payload.error || t.dashboard.knowledge.saveError);
        return;
      }

      setPolicies((prev) => [payload.policy!, ...prev]);
      setNewContent("");
      setShowCreateForm(false);
    } catch {
      setErrorMessage(t.dashboard.knowledge.saveError);
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (policy: Policy) => {
    setEditingId(policy.id);
    setEditType(
      POLICY_TYPES.includes(policy.type as PolicyType)
        ? (policy.type as PolicyType)
        : "other"
    );
    setEditLanguage(policy.language === "en" ? "en" : "es");
    setEditContent(policy.content);
    setConfirmDeleteId(null);
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId || !editContent.trim() || isUpdating) return;

    setIsUpdating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/policies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          type: editType,
          language: editLanguage,
          content: editContent.trim(),
        }),
      });
      const payload = (await response.json()) as {
        policy?: Policy;
        error?: string;
      };

      if (!response.ok || !payload.policy) {
        setErrorMessage(payload.error || t.dashboard.knowledge.saveError);
        return;
      }

      setPolicies((prev) =>
        prev.map((item) => (item.id === editingId ? payload.policy! : item))
      );
      setEditingId(null);
    } catch {
      setErrorMessage(t.dashboard.knowledge.saveError);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/policies?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setErrorMessage(payload.error || t.dashboard.knowledge.deleteError);
        return;
      }

      setPolicies((prev) => prev.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
    } catch {
      setErrorMessage(t.dashboard.knowledge.deleteError);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredPolicies = policies.filter((policy) => {
    const matchesType = typeFilter === "all" || policy.type === typeFilter;
    const matchesLang = langFilter === "all" || policy.language === langFilter;
    const normalized = query.trim().toLowerCase();
    const matchesQuery =
      normalized === "" ||
      policy.content.toLowerCase().includes(normalized) ||
      policy.type.toLowerCase().includes(normalized);
    return matchesType && matchesLang && matchesQuery;
  });

  const getTypeLabel = (type: string) => {
    if (type in t.dashboard.knowledge.typeLabels) {
      return t.dashboard.knowledge.typeLabels[type as PolicyType];
    }
    return type;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t.dashboard.knowledge.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t.dashboard.knowledge.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
        >
          {showCreateForm ? (
            <>
              <X className="h-4 w-4" aria-hidden="true" />
              <span>{t.common.cancel}</span>
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t.dashboard.knowledge.newPolicy}</span>
            </>
          )}
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Create Policy Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-6 shadow-xs"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="policy-type"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                {t.dashboard.knowledge.typeLabel}
              </label>
              <select
                id="policy-type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as PolicyType)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {POLICY_TYPES.map((typeOption) => (
                  <option key={typeOption} value={typeOption}>
                    {t.dashboard.knowledge.typeLabels[typeOption]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="policy-lang"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                {t.dashboard.knowledge.languageLabel}
              </label>
              <select
                id="policy-lang"
                value={newLanguage}
                onChange={(e) =>
                  setNewLanguage(e.target.value as PolicyLanguage)
                }
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {POLICY_LANGUAGES.map((langOption) => (
                  <option key={langOption} value={langOption}>
                    {t.dashboard.knowledge.languageLabels[langOption]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="policy-content"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              {t.dashboard.knowledge.contentLabel}
            </label>
            <textarea
              id="policy-content"
              rows={4}
              required
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={t.dashboard.knowledge.contentPlaceholder}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {isCreating && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              <span>
                {isCreating
                  ? t.dashboard.knowledge.saving
                  : t.dashboard.knowledge.createBtn}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center">
        <div className="relative flex-1 lg:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.common.search}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", ...POLICY_TYPES] as const).map((item) => {
              const active = typeFilter === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTypeFilter(item)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                  }`}
                >
                  {item === "all"
                    ? t.common.all
                    : t.dashboard.knowledge.typeLabels[item]}
                </button>
              );
            })}
          </div>

          <select
            aria-label={t.dashboard.knowledge.languageLabel}
            value={langFilter}
            onChange={(e) => setLangFilter(e.target.value as LangFilter)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">{t.common.all}</option>
            {POLICY_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Policies List */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{t.dashboard.knowledge.loading}</span>
        </div>
      ) : filteredPolicies.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          {t.dashboard.knowledge.empty}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {filteredPolicies.map((policy) => {
            const isEditing = editingId === policy.id;
            const isConfirmingDelete = confirmDeleteId === policy.id;
            const isDeleting = deletingId === policy.id;

            return (
              <article
                key={policy.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs"
              >
                {isEditing ? (
                  <form onSubmit={handleUpdate} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">
                        {t.dashboard.knowledge.editPolicy}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700"
                      >
                        {t.common.cancel}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={editType}
                        onChange={(e) =>
                          setEditType(e.target.value as PolicyType)
                        }
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                      >
                        {POLICY_TYPES.map((typeOpt) => (
                          <option key={typeOpt} value={typeOpt}>
                            {t.dashboard.knowledge.typeLabels[typeOpt]}
                          </option>
                        ))}
                      </select>

                      <select
                        value={editLanguage}
                        onChange={(e) =>
                          setEditLanguage(e.target.value as PolicyLanguage)
                        }
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                      >
                        {POLICY_LANGUAGES.map((langOpt) => (
                          <option key={langOpt} value={langOpt}>
                            {t.dashboard.knowledge.languageLabels[langOpt]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <textarea
                      rows={4}
                      required
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 p-3 text-sm leading-relaxed text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        type="submit"
                        disabled={isUpdating}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {isUpdating && (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        <span>{t.dashboard.knowledge.updateBtn}</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{getTypeLabel(policy.type)}</span>
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-medium uppercase text-slate-600">
                          {policy.language}
                        </span>
                      </div>

                      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                        {policy.content}
                      </p>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                      <span className="font-mono">
                        {t.dashboard.knowledge.updatedLabel}:{" "}
                        {policy.updated_at.slice(0, 10)}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditing(policy)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t.dashboard.knowledge.editBtn}</span>
                        </button>

                        {isConfirmingDelete ? (
                          <>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleDelete(policy.id)}
                              className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                            >
                              {t.dashboard.knowledge.confirmDelete}
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              {t.common.cancel}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(policy.id)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t.dashboard.knowledge.deleteBtn}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
