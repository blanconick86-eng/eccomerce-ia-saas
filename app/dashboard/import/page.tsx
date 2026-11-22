"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import {
  PRODUCT_FIELDS,
  REQUIRED_PRODUCT_FIELDS,
  SAMPLE_CSV_CONTENT,
  autoMapHeaders,
  mapCsvRows,
  type ColumnMapping,
  type ProductField,
} from "@/lib/csv/mapper";
import { parseCsvText } from "@/lib/csv/parser";
import {
  validateProductRows,
  type RowValidationError,
} from "@/lib/validation/product";
import type { ImportJob } from "@/types/database";

type ImportStep = 1 | 2 | 3 | 4 | 5;

type ImportResult = {
  summary: {
    received: number;
    imported: number;
    created: number;
    updated: number;
    failed: number;
  };
  errors: RowValidationError[];
};

const EMPTY_MAPPING: ColumnMapping = {
  sku: "",
  name: "",
  description: "",
  price: "",
  currency: "",
  category: "",
  stock_status: "",
};

export default function ImportPage() {
  const { t } = useLanguage();
  const [step, setStep] = useState<ImportStep>(1);
  const [filename, setFilename] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [autoMappedFields, setAutoMappedFields] = useState<Set<ProductField>>(
    new Set()
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [history, setHistory] = useState<ImportJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/imports")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((payload: { imports?: ImportJob[] }) => {
        if (!cancelled) {
          setHistory(payload.imports ?? []);
        }
      })
      .catch(() => {
        // Keep empty history silently if offline or unauthorized
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const mappedRows = useMemo(
    () => mapCsvRows(rawRows, mapping),
    [rawRows, mapping]
  );

  const previewRows = useMemo(() => mappedRows.slice(0, 10), [mappedRows]);

  const validation = useMemo(
    () => validateProductRows(mappedRows),
    [mappedRows]
  );

  const missingRequiredFields = REQUIRED_PRODUCT_FIELDS.filter(
    (field) => !mapping[field]
  );

  const processFile = async (file: File) => {
    setParseError(null);
    setImportResult(null);
    setSubmitError(null);

    try {
      const buffer = await file.arrayBuffer();
      const rawText = new TextDecoder("utf-8").decode(buffer);
      const parsed = parseCsvText(rawText);

      if (!parsed.ok) {
        console.error("[CSV Import] Failed to parse CSV file:", {
          filename: file.name,
          size: file.size,
          reason: parsed.reason,
          delimiter: parsed.delimiter,
          headers: parsed.headers,
          rowCount: parsed.rowCount,
          errors: parsed.errors,
        });
        setParseError(t.dashboard.import.step1.parseError);
        return;
      }

      if (parsed.warnings.length > 0) {
        console.warn("[CSV Import] Non-blocking CSV parse warnings:", {
          filename: file.name,
          delimiter: parsed.delimiter,
          warnings: parsed.warnings,
        });
      }

      const detected = autoMapHeaders(parsed.headers);
      const autoMatched = new Set<ProductField>(
        PRODUCT_FIELDS.filter((field) => Boolean(detected[field]))
      );

      setFilename(file.name);
      setCsvHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(detected);
      setAutoMappedFields(autoMatched);
      setStep(2);
    } catch (error) {
      console.error("[CSV Import] Unexpected error reading CSV file:", {
        filename: file.name,
        error,
      });
      setParseError(t.dashboard.import.step1.parseError);
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV_CONTENT], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "storemind-sample-products.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setStep(1);
    setFilename("");
    setCsvHeaders([]);
    setRawRows([]);
    setMapping(EMPTY_MAPPING);
    setAutoMappedFields(new Set());
    setParseError(null);
    setSubmitError(null);
    setImportResult(null);
  };

  const handleImportSubmit = async () => {
    if (validation.validRows.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          rows: validation.validRows.map((item) => item.data),
        }),
      });

      const payload = (await response.json()) as ImportResult & {
        import?: ImportJob;
        error?: string;
      };

      if (!response.ok) {
        setSubmitError(payload.error || t.dashboard.import.step5.submitError);
        return;
      }

      setImportResult({
        summary: payload.summary,
        errors: payload.errors ?? [],
      });

      if (payload.import) {
        setHistory((prev) => [payload.import!, ...prev].slice(0, 20));
      }
    } catch {
      setSubmitError(t.dashboard.import.step5.submitError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {t.dashboard.import.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t.dashboard.import.subtitle}
          </p>
        </div>

        {step > 1 && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.dashboard.import.reset}</span>
          </button>
        )}
      </div>

      {/* 5-Step Progress Bar */}
      <nav aria-label="Import steps" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {t.dashboard.import.steps.map((label, index) => {
            const stepNumber = (index + 1) as ImportStep;
            const isCurrent = step === stepNumber;
            const isCompleted = step > stepNumber;

            return (
              <li
                key={label}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                  isCurrent
                    ? "bg-indigo-600 text-white"
                    : isCompleted
                      ? "bg-indigo-50 text-indigo-700"
                      : "bg-slate-50 text-slate-500"
                }`}
              >
                {isCompleted && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{label}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-7">
            <label
              htmlFor="csv-upload-input"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                isDragging
                  ? "border-indigo-500 bg-indigo-50/60"
                  : "border-slate-300 bg-slate-50/70 hover:border-indigo-400 hover:bg-indigo-50/30"
              }`}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <UploadCloud className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-4 text-sm font-semibold text-slate-900">
                {t.dashboard.import.step1.dropTitle}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t.dashboard.import.step1.dropSubtitle}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs">
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                <span>{t.dashboard.import.step1.selectFile}</span>
              </span>
              <input
                id="csv-upload-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileInput}
                className="sr-only"
              />
            </label>

            {parseError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                <span>{parseError}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {t.dashboard.import.schemaTitle}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {t.dashboard.import.schemaDescription}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {PRODUCT_FIELDS.map((col) => (
                  <span
                    key={col}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-xs font-medium ${
                      REQUIRED_PRODUCT_FIELDS.includes(
                        col as (typeof REQUIRED_PRODUCT_FIELDS)[number]
                      )
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {col}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadSample}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Download className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <span>{t.dashboard.import.step1.downloadSample}</span>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 2 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {t.dashboard.import.step2.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {t.dashboard.import.step2.subtitle}
              </p>
            </div>
            <div className="rounded-xl bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-700">
              {t.dashboard.import.step2.fileLabel}: {filename} ({rawRows.length}{" "}
              {t.dashboard.import.step2.rowsDetected})
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    {t.dashboard.import.step2.targetField}
                  </th>
                  <th className="px-4 py-3">
                    {t.dashboard.import.step2.csvColumn}
                  </th>
                  <th className="px-4 py-3">
                    {t.dashboard.import.step2.sampleValue}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {PRODUCT_FIELDS.map((field) => {
                  const isRequired = REQUIRED_PRODUCT_FIELDS.includes(
                    field as (typeof REQUIRED_PRODUCT_FIELDS)[number]
                  );
                  const selectedHeader = mapping[field];
                  const sampleVal = selectedHeader
                    ? rawRows[0]?.[selectedHeader] ?? ""
                    : "";

                  return (
                    <tr key={field}>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-900">
                            {t.dashboard.import.step2.fieldLabels[field]}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              isRequired
                                ? "bg-indigo-50 text-indigo-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {isRequired
                              ? t.dashboard.import.step2.requiredBadge
                              : t.dashboard.import.step2.optionalBadge}
                          </span>
                          {autoMappedFields.has(field) && selectedHeader && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              {t.dashboard.import.step2.autoMappedBadge}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <select
                          aria-label={field}
                          value={selectedHeader}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMapping((prev) => ({ ...prev, [field]: val }));
                          }}
                          className="w-full max-w-xs rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <option value="">
                            {t.dashboard.import.step2.unmappedOption}
                          </option>
                          {csvHeaders.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                        {sampleVal ? (
                          <span className="inline-block max-w-xs truncate rounded-md bg-slate-100 px-2 py-1">
                            {sampleVal}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {missingRequiredFields.length > 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>{t.dashboard.import.step2.missingRequired}</span>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t.dashboard.import.back}</span>
            </button>
            <button
              type="button"
              disabled={missingRequiredFields.length > 0}
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{t.dashboard.import.next}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* Step 3: Preview (first 10 rows) */}
      {step === 3 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {t.dashboard.import.step3.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {t.dashboard.import.step3.subtitle}
              </p>
            </div>
            <span className="font-mono text-xs text-slate-500">
              {t.dashboard.import.step3.showingFirst} {previewRows.length}{" "}
              {t.dashboard.import.step3.ofTotal} {mappedRows.length}{" "}
              {t.dashboard.import.step3.rowsWord}
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">{t.dashboard.import.step3.rowCol}</th>
                  {PRODUCT_FIELDS.map((field) => (
                    <th key={field} className="px-3 py-3 font-mono">
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map((item) => (
                  <tr key={item.rowNumber} className="hover:bg-slate-50/70">
                    <td className="px-3 py-3 font-mono text-slate-400">
                      #{item.rowNumber}
                    </td>
                    {PRODUCT_FIELDS.map((field) => (
                      <td
                        key={field}
                        className="max-w-[180px] truncate px-3 py-3 text-slate-700"
                      >
                        {item.raw[field] || (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t.dashboard.import.back}</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700"
            >
              <span>{t.dashboard.import.next}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* Step 4: Zod + Duplicate Validation */}
      {step === 4 && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t.dashboard.import.step4.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t.dashboard.import.step4.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-medium text-slate-600">
                {t.dashboard.import.step4.totalRows}
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {mappedRows.length}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-xs font-medium text-emerald-700">
                {t.dashboard.import.step4.validRows}
              </p>
              <p className="mt-1 text-2xl font-semibold text-emerald-900">
                {validation.validRows.length}
              </p>
            </div>
            <div
              className={`rounded-xl border p-4 ${
                validation.errors.length > 0
                  ? "border-rose-200 bg-rose-50/60"
                  : "border-slate-200 bg-slate-50/70"
              }`}
            >
              <p
                className={`text-xs font-medium ${
                  validation.errors.length > 0
                    ? "text-rose-700"
                    : "text-slate-600"
                }`}
              >
                {t.dashboard.import.step4.errorRows}
              </p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  validation.errors.length > 0
                    ? "text-rose-900"
                    : "text-slate-900"
                }`}
              >
                {validation.errors.length}
              </p>
            </div>
          </div>

          {validation.errors.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.dashboard.import.step4.allValidBanner}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                {t.dashboard.import.step4.errorsListTitle}
              </p>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50/30 divide-y divide-rose-100">
                {validation.errors.map((err, idx) => (
                  <div
                    key={`${err.row}-${idx}`}
                    className="flex flex-col gap-1 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-2 font-mono font-semibold text-rose-900">
                      <span>
                        {t.dashboard.import.step4.rowLabel} #{err.row}
                      </span>
                      {err.sku && (
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px]">
                          {err.sku}
                        </span>
                      )}
                    </div>
                    <p className="text-rose-800">{err.reasons.join(" · ")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validation.validRows.length === 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>{t.dashboard.import.step4.noValidRows}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>{t.dashboard.import.back}</span>
            </button>
            <button
              type="button"
              disabled={validation.validRows.length === 0}
              onClick={() => setStep(5)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{t.dashboard.import.next}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* Step 5: Import */}
      {step === 5 && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t.dashboard.import.step5.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {t.dashboard.import.step5.subtitle}
            </p>
          </div>

          {!importResult ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-800">
                <p className="font-semibold">
                  {validation.validRows.length}{" "}
                  {t.dashboard.import.step5.readyCount}
                </p>
                {validation.errors.length > 0 && (
                  <p className="mt-1 text-xs text-slate-600">
                    {validation.errors.length}{" "}
                    {t.dashboard.import.step5.skippedCount}
                  </p>
                )}
              </div>

              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setStep(4)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>{t.dashboard.import.back}</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || validation.validRows.length === 0}
                  onClick={handleImportSubmit}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting && (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  <span>
                    {isSubmitting
                      ? t.dashboard.import.step5.importing
                      : t.dashboard.import.step5.importButton}
                  </span>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{t.dashboard.import.step5.successTitle}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">
                    {t.dashboard.import.step5.importedLabel}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">
                    {importResult.summary.imported}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">
                    {t.dashboard.import.step5.createdLabel}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-700">
                    {importResult.summary.created}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">
                    {t.dashboard.import.step5.updatedLabel}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-indigo-700">
                    {importResult.summary.updated}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500">
                    {t.dashboard.import.step5.failedLabel}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-700">
                    {validation.errors.length + importResult.summary.failed}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span>{t.dashboard.import.reset}</span>
                </button>
                <Link
                  href="/dashboard/products"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700"
                >
                  <span>{t.dashboard.import.step5.viewProducts}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Real Import History from Supabase */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {t.dashboard.import.historyTitle}
          </h2>
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-8 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          </div>
        ) : history.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500">
            {t.dashboard.import.historyEmpty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">
                    {t.dashboard.import.columns.file}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.import.columns.imported}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.import.columns.errors}
                  </th>
                  <th className="px-6 py-3">
                    {t.dashboard.import.columns.status}
                  </th>
                  <th className="px-6 py-3 text-right">
                    {t.dashboard.import.columns.date}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((job) => {
                  const errCount = Array.isArray(job.errors)
                    ? job.errors.length
                    : 0;
                  const statusLabel =
                    job.status === "completed"
                      ? t.dashboard.import.statusCompleted
                      : job.status === "failed"
                        ? t.dashboard.import.statusFailed
                        : t.dashboard.import.statusWarnings;

                  const badgeStyle =
                    job.status === "completed"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : job.status === "failed"
                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                        : "bg-amber-50 text-amber-700 ring-amber-200";

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-xs font-medium text-slate-900">
                        {job.filename}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-slate-700">
                        {job.rows_imported}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-slate-600">
                        {errCount}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeStyle}`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right font-mono text-xs text-slate-500">
                        {job.created_at.slice(0, 16).replace("T", " ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
