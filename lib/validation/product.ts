import { z } from "zod";

const requiredTrimmedString = (requiredMessage: string) =>
  z.preprocess(
    (value) => (value === null || value === undefined ? "" : String(value)),
    z.string().trim().min(1, requiredMessage)
  );

const optionalTrimmedString = () =>
  z.preprocess((value) => {
    if (value === null || value === undefined) return undefined;
    const trimmed = String(value).trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().optional());

export const productRowSchema = z.object({
  sku: requiredTrimmedString("SKU is required"),
  name: requiredTrimmedString("Name is required"),
  description: optionalTrimmedString(),
  price: z.preprocess(
    (value) => {
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : NaN;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") return undefined;
        return Number(trimmed);
      }
      return value === null || value === undefined ? undefined : NaN;
    },
    z
      .number("Price must be a valid number")
      .min(0, "Price must be greater than or equal to 0")
  ),
  currency: z.preprocess(
    (value) => {
      if (value === null || value === undefined) return undefined;
      const trimmed = String(value).trim();
      return trimmed === "" ? undefined : trimmed.toUpperCase();
    },
    z
      .string()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code (e.g. USD)")
      .default("USD")
  ),
  category: optionalTrimmedString(),
  stock_status: z.preprocess(
    (value) => {
      if (value === null || value === undefined) return undefined;
      const trimmed = String(value).trim().toLowerCase();
      return trimmed === "" ? undefined : trimmed;
    },
    z
      .enum(
        ["available", "out_of_stock"],
        "stock_status must be 'available' or 'out_of_stock'"
      )
      .default("available")
  ),
});

export type ValidatedProductRow = z.infer<typeof productRowSchema>;

export type RowValidationError = {
  row: number;
  sku?: string;
  reasons: string[];
};

export type ValidatedBatchItem = {
  rowNumber: number;
  data: ValidatedProductRow;
};

export function validateProductRows(
  rows: { rowNumber: number; raw: Record<string, unknown> }[]
): {
  validRows: ValidatedBatchItem[];
  errors: RowValidationError[];
} {
  const validRows: ValidatedBatchItem[] = [];
  const errors: RowValidationError[] = [];
  const seenSkus = new Map<string, number>();

  for (const item of rows) {
    const rawSku =
      typeof item.raw.sku === "string"
        ? item.raw.sku.trim()
        : item.raw.sku !== undefined && item.raw.sku !== null
          ? String(item.raw.sku).trim()
          : undefined;

    const parsed = productRowSchema.safeParse(item.raw);

    if (!parsed.success) {
      const reasons = parsed.error.issues.map((issue) => {
        const field = issue.path.join(".");
        return field ? `${field}: ${issue.message}` : issue.message;
      });
      errors.push({
        row: item.rowNumber,
        sku: rawSku || undefined,
        reasons,
      });
      continue;
    }

    const existingRow = seenSkus.get(parsed.data.sku);
    if (existingRow !== undefined) {
      errors.push({
        row: item.rowNumber,
        sku: parsed.data.sku,
        reasons: [
          `sku: Duplicate SKU "${parsed.data.sku}" (first seen on row ${existingRow})`,
        ],
      });
      continue;
    }

    seenSkus.set(parsed.data.sku, item.rowNumber);
    validRows.push({
      rowNumber: item.rowNumber,
      data: parsed.data,
    });
  }

  return { validRows, errors };
}

export const importRequestSchema = z.object({
  filename: z.string().trim().min(1, "Filename is required").max(255),
  rows: z
    .array(z.record(z.string(), z.unknown()))
    .min(1, "At least one row is required")
    .max(5000, "Maximum 5000 rows per import"),
});

export const deleteProductQuerySchema = z.object({
  id: z.string().uuid("Invalid product id"),
});
