import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedStore } from "@/lib/supabase/store";
import {
  importRequestSchema,
  validateProductRows,
} from "@/lib/validation/product";

const BATCH_SIZE = 500;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function GET() {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  const { data, error } = await supabase
    .from("imports")
    .select("id, store_id, filename, status, rows_imported, errors, created_at")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ imports: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsedRequest = importRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: "Invalid import payload",
        details: parsedRequest.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const { filename, rows } = parsedRequest.data;
  const indexedRows = rows.map((raw, index) => ({
    rowNumber: index + 2,
    raw,
  }));

  const { validRows, errors } = validateProductRows(indexedRows);

  if (validRows.length === 0) {
    await supabase.from("imports").insert({
      store_id: store.id,
      filename,
      status: "failed",
      rows_imported: 0,
      errors,
    });

    return NextResponse.json(
      {
        error: "No valid product rows to import",
        errors,
      },
      { status: 400 }
    );
  }

  const skus = validRows.map((item) => item.data.sku);
  const existingSkus = new Set<string>();

  for (const skuChunk of chunkArray(skus, BATCH_SIZE)) {
    const { data: existingRows, error: existingError } = await supabase
      .from("products")
      .select("sku")
      .eq("store_id", store.id)
      .in("sku", skuChunk);

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    for (const row of existingRows ?? []) {
      existingSkus.add(row.sku);
    }
  }

  const upsertPayload = validRows.map(({ data }) => ({
    store_id: store.id,
    sku: data.sku,
    name: data.name,
    description: data.description ?? null,
    price: data.price,
    currency: data.currency,
    stock_status: data.stock_status,
    category: data.category ?? null,
  }));

  for (const batch of chunkArray(upsertPayload, BATCH_SIZE)) {
    const { error: upsertError } = await supabase
      .from("products")
      .upsert(batch, { onConflict: "store_id,sku" });

    if (upsertError) {
      await supabase.from("imports").insert({
        store_id: store.id,
        filename,
        status: "failed",
        rows_imported: 0,
        errors: [
          ...errors,
          { row: 0, reasons: [`Database upsert failed: ${upsertError.message}`] },
        ],
      });

      return NextResponse.json(
        { error: upsertError.message },
        { status: 500 }
      );
    }
  }

  const updatedCount = validRows.filter((item) =>
    existingSkus.has(item.data.sku)
  ).length;
  const createdCount = validRows.length - updatedCount;
  const importStatus =
    errors.length > 0 ? "completed_with_errors" : "completed";

  const { data: importRecord, error: importInsertError } = await supabase
    .from("imports")
    .insert({
      store_id: store.id,
      filename,
      status: importStatus,
      rows_imported: validRows.length,
      errors,
    })
    .select("id, store_id, filename, status, rows_imported, errors, created_at")
    .single();

  if (importInsertError) {
    return NextResponse.json(
      { error: importInsertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    import: importRecord,
    summary: {
      received: rows.length,
      imported: validRows.length,
      created: createdCount,
      updated: updatedCount,
      failed: errors.length,
    },
    errors,
  });
}
