import Papa, { type ParseConfig, type ParseError } from "papaparse";

export type CsvParseSuccess = {
  ok: true;
  headers: string[];
  rows: Record<string, string>[];
  warnings: ParseError[];
  delimiter: string;
};

export type CsvParseFailure = {
  ok: false;
  reason: string;
  headers: string[];
  rowCount: number;
  delimiter: string;
  errors: ParseError[];
};

export type CsvParseOutcome = CsvParseSuccess | CsvParseFailure;

function cleanCsvText(rawText: string): {
  cleanedText: string;
  explicitDelimiter?: string;
} {
  let text = rawText.replace(/^\uFEFF/, "");
  text = text.replace(/^(?:[ \t]*\r?\n)+/, "").trim();

  // Handle Excel's optional `sep=;` / `sep=,` directive on line 1
  const sepMatch = text.match(/^sep=([,;\t|])\r?\n/i);
  let explicitDelimiter: string | undefined;
  if (sepMatch) {
    explicitDelimiter = sepMatch[1];
    text = text.slice(sepMatch[0].length).replace(/^(?:[ \t]*\r?\n)+/, "").trim();
  }

  return { cleanedText: text, explicitDelimiter };
}

function runPapaParse(
  csvText: string,
  delimiter?: string
): Papa.ParseResult<Record<string, string>> {
  const config: ParseConfig<Record<string, string>> = {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
    transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
    ...(delimiter ? { delimiter } : {}),
  };

  return Papa.parse<Record<string, string>>(csvText, config);
}

function extractHeadersAndRows(
  results: Papa.ParseResult<Record<string, string>>
) {
  const headers = (results.meta.fields ?? [])
    .map((h) => h.replace(/^\uFEFF/, "").trim())
    .filter((h) => h !== "");

  const rows = (results.data ?? []).filter(
    (row) =>
      row &&
      typeof row === "object" &&
      Object.values(row).some((val) => String(val ?? "").trim() !== "")
  );

  return { headers, rows };
}

export function parseCsvText(rawText: string): CsvParseOutcome {
  const { cleanedText, explicitDelimiter } = cleanCsvText(rawText);

  if (!cleanedText) {
    return {
      ok: false,
      reason: "CSV file is empty after removing BOM and blank lines",
      headers: [],
      rowCount: 0,
      delimiter: "",
      errors: [],
    };
  }

  let results = runPapaParse(cleanedText, explicitDelimiter);
  let { headers, rows } = extractHeadersAndRows(results);

  // Retry with explicit fallback delimiter if auto-detect produced a single combined header
  if (!explicitDelimiter && headers.length === 1) {
    const fallbackDelimiters = [";", ",", "\t", "|"];
    for (const candidate of fallbackDelimiters) {
      if (headers[0].includes(candidate)) {
        const retried = runPapaParse(cleanedText, candidate);
        const extracted = extractHeadersAndRows(retried);
        if (extracted.headers.length > 1) {
          results = retried;
          headers = extracted.headers;
          rows = extracted.rows;
          break;
        }
      }
    }
  }

  if (headers.length === 0 || rows.length === 0) {
    const reason =
      headers.length === 0
        ? "No CSV headers detected in the first non-empty line"
        : "CSV headers were found, but no non-empty data rows were detected";

    return {
      ok: false,
      reason,
      headers,
      rowCount: rows.length,
      delimiter: results.meta.delimiter ?? "",
      errors: results.errors ?? [],
    };
  }

  // Minor warnings like TooFewFields / UndetectableDelimiter do not block valid headers + rows
  return {
    ok: true,
    headers,
    rows,
    warnings: results.errors ?? [],
    delimiter: results.meta.delimiter ?? ",",
  };
}
