export const PRODUCT_FIELDS = [
  "sku",
  "name",
  "description",
  "price",
  "currency",
  "category",
  "stock_status",
] as const;

export const REQUIRED_PRODUCT_FIELDS = ["sku", "name", "price"] as const;

export type ProductField = (typeof PRODUCT_FIELDS)[number];
export type ColumnMapping = Record<ProductField, string>;

const FIELD_ALIASES: Record<ProductField, string[]> = {
  sku: ["sku", "codigo", "code", "id_producto", "product_sku", "variant_sku", "ref"],
  name: ["name", "nombre", "title", "titulo", "producto", "product_name"],
  description: [
    "description",
    "descripcion",
    "desc",
    "body",
    "body_html",
    "detalle",
    "detalles",
  ],
  price: ["price", "precio", "valor", "variant_price", "unit_price", "monto"],
  currency: ["currency", "moneda", "divisa"],
  category: [
    "category",
    "categoria",
    "product_type",
    "tipo",
    "collection",
    "coleccion",
  ],
  stock_status: [
    "stock_status",
    "stock",
    "estado_stock",
    "availability",
    "disponibilidad",
    "estado",
    "inventory_status",
  ],
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

export function autoMapHeaders(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    sku: "",
    name: "",
    description: "",
    price: "",
    currency: "",
    category: "",
    stock_status: "",
  };

  const normalizedMap = new Map<string, string>();
  for (const header of headers) {
    const norm = normalizeHeader(header);
    if (norm && !normalizedMap.has(norm)) {
      normalizedMap.set(norm, header);
    }
  }

  const usedHeaders = new Set<string>();

  for (const field of PRODUCT_FIELDS) {
    for (const alias of FIELD_ALIASES[field]) {
      const matched = normalizedMap.get(alias);
      if (matched && !usedHeaders.has(matched)) {
        mapping[field] = matched;
        usedHeaders.add(matched);
        break;
      }
    }
  }

  return mapping;
}

export function mapCsvRows(
  rawRows: Record<string, string>[],
  mapping: ColumnMapping
): { rowNumber: number; raw: Record<string, string> }[] {
  return rawRows.map((row, index) => {
    const mapped: Record<string, string> = {};
    for (const field of PRODUCT_FIELDS) {
      const sourceHeader = mapping[field];
      mapped[field] =
        sourceHeader && row[sourceHeader] !== undefined
          ? String(row[sourceHeader])
          : "";
    }
    return {
      rowNumber: index + 2,
      raw: mapped,
    };
  });
}

export const SAMPLE_CSV_CONTENT = [
  "sku,name,description,price,currency,category,stock_status",
  'NRD-SW-001,"Sweater Merino Clasico","Lana merino 100% respirable",98.00,USD,Indumentaria,available',
  'NRD-BG-003,"Mochila Urbana Impermeable 16","Compartimento acolchado para laptop",129.50,USD,Accesorios,available',
  'NRD-HM-002,"Set de Tazas Ceramica (x2)","Ceramica artesanal esmaltada",38,EUR,Hogar,available',
  'NRD-SG-008,"Gafas Polarizadas Everyday","Proteccion UV400 marco liviano",112,USD,Optica,out_of_stock',
  'NRD-BT-005,"Botella Termica Acero 750ml","Mantiene frio 24h y calor 12h",34.99,USD,Accesorios,available',
].join("\n");
