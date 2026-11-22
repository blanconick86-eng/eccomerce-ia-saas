import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedStore } from "@/lib/supabase/store";
import { deleteProductQuerySchema } from "@/lib/validation/product";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  const searchParams = request.nextUrl.searchParams;
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const categoryFilter = (searchParams.get("category") ?? "").trim();

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, store_id, sku, name, description, price, currency, stock_status, category, created_at, updated_at"
    )
    .eq("store_id", store.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const allProducts = data ?? [];
  const categories = Array.from(
    new Set(
      allProducts
        .map((item) => item.category?.trim())
        .filter((cat): cat is string => Boolean(cat))
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredProducts = allProducts.filter((item) => {
    const matchesCategory =
      categoryFilter === "" || item.category?.trim() === categoryFilter;
    const matchesQuery =
      query === "" ||
      item.name.toLowerCase().includes(query) ||
      item.sku.toLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  });

  return NextResponse.json({
    products: filteredProducts,
    categories,
    totalCount: allProducts.length,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedStore();
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { supabase, store } = auth;
  let idParam = request.nextUrl.searchParams.get("id");

  if (!idParam) {
    try {
      const body = (await request.json()) as { id?: unknown };
      if (typeof body?.id === "string") {
        idParam = body.id;
      }
    } catch {
      // Ignore empty body when query param was omitted
    }
  }

  const parsed = deleteProductQuerySchema.safeParse({ id: idParam });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid product id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("id", parsed.data.id)
    .eq("store_id", store.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, id: data.id });
}
