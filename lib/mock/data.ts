import type {
  AnalyticsRange,
  MockActivity,
  MockAnalyticsSnapshot,
  MockConversation,
  MockImportJob,
  MockKnowledgeDoc,
  MockProduct,
} from "@/types/mock";

export const MOCK_OVERVIEW_STATS = {
  products: "248",
  queries: "1,420",
  approved: "1,218",
  pending: "34",
};

export const MOCK_RECENT_ACTIVITY: MockActivity[] = [
  {
    id: "act-1",
    customer: "Lucía Fernández",
    channel: "web",
    topic: {
      es: "Compatibilidad laptop 16\" y stock (NRD-BG-003)",
      en: "16\" laptop fit & stock check (NRD-BG-003)",
    },
    status: "pending",
    confidence: 96,
    timestamp: { es: "Hace 4 min", en: "4m ago" },
  },
  {
    id: "act-2",
    customer: "Mateo Álvarez",
    channel: "email",
    topic: {
      es: "Plazo de cambio de talle en sweater Merino",
      en: "Size exchange window for Merino crewneck",
    },
    status: "approved",
    confidence: 94,
    timestamp: { es: "Hace 18 min", en: "18m ago" },
  },
  {
    id: "act-3",
    customer: "Sofia Bennett",
    channel: "whatsapp",
    topic: {
      es: "Envío internacional y costos de aduana",
      en: "International shipping & customs fees",
    },
    status: "edited",
    confidence: 88,
    timestamp: { es: "Hace 42 min", en: "42m ago" },
  },
  {
    id: "act-4",
    customer: "Diego Morales",
    channel: "web",
    topic: {
      es: "Garantía de botella térmica de acero (NRD-BT-005)",
      en: "Insulated steel bottle warranty (NRD-BT-005)",
    },
    status: "approved",
    confidence: 97,
    timestamp: { es: "Hace 1 h", en: "1h ago" },
  },
  {
    id: "act-5",
    customer: "Hannah Kim",
    channel: "email",
    topic: {
      es: "Reposición de gafas polarizadas sin stock",
      en: "Restock ETA for out-of-stock sunglasses",
    },
    status: "pending",
    confidence: 74,
    timestamp: { es: "Hace 2 h", en: "2h ago" },
  },
  {
    id: "act-6",
    customer: "Camila Rojas",
    channel: "web",
    topic: {
      es: "Medios de pago y cuotas sin interés",
      en: "Accepted payment methods & installments",
    },
    status: "approved",
    confidence: 95,
    timestamp: { es: "Hace 3 h", en: "3h ago" },
  },
];

export const MOCK_PRODUCTS: MockProduct[] = [
  {
    id: "prod-1",
    sku: "NRD-SW-001",
    name: {
      es: "Sweater Merino Clásico",
      en: "Merino Wool Crewneck",
    },
    category: { es: "Indumentaria", en: "Apparel" },
    price: 98,
    stock: 42,
    status: "active",
    updatedAt: "2026-11-21",
  },
  {
    id: "prod-2",
    sku: "NRD-HM-002",
    name: {
      es: "Set de Tazas Cerámica Minimal (x2)",
      en: "Minimalist Ceramic Mug Set (x2)",
    },
    category: { es: "Hogar", en: "Home" },
    price: 38,
    stock: 65,
    status: "active",
    updatedAt: "2026-11-21",
  },
  {
    id: "prod-3",
    sku: "NRD-BG-003",
    name: {
      es: "Mochila Urbana Impermeable 16\"",
      en: "Weatherproof Commuter Backpack 16\"",
    },
    category: { es: "Accesorios", en: "Accessories" },
    price: 129,
    stock: 18,
    status: "active",
    updatedAt: "2026-11-20",
  },
  {
    id: "prod-4",
    sku: "NRD-HM-004",
    name: {
      es: "Funda Nórdica de Lino Lavado",
      en: "Washed Linen Duvet Cover",
    },
    category: { es: "Hogar", en: "Home" },
    price: 154,
    stock: 4,
    status: "low_stock",
    updatedAt: "2026-11-20",
  },
  {
    id: "prod-5",
    sku: "NRD-BT-005",
    name: {
      es: "Botella Térmica Acero 750ml",
      en: "Insulated Steel Bottle 750ml",
    },
    category: { es: "Accesorios", en: "Accessories" },
    price: 34,
    stock: 89,
    status: "active",
    updatedAt: "2026-11-19",
  },
  {
    id: "prod-6",
    sku: "NRD-WL-006",
    name: {
      es: "Billetera Slim Cuero Vegetal",
      en: "Vegetable-Tanned Card Wallet",
    },
    category: { es: "Accesorios", en: "Accessories" },
    price: 52,
    stock: 5,
    status: "low_stock",
    updatedAt: "2026-11-18",
  },
  {
    id: "prod-7",
    sku: "NRD-HD-007",
    name: {
      es: "Buzo Hoodie Algodón Orgánico",
      en: "Organic Cotton Hoodie",
    },
    category: { es: "Indumentaria", en: "Apparel" },
    price: 84,
    stock: 31,
    status: "active",
    updatedAt: "2026-11-18",
  },
  {
    id: "prod-8",
    sku: "NRD-SG-008",
    name: {
      es: "Gafas Polarizadas Everyday",
      en: "Polarized Everyday Sunglasses",
    },
    category: { es: "Óptica", en: "Eyewear" },
    price: 112,
    stock: 0,
    status: "out_of_stock",
    updatedAt: "2026-11-17",
  },
];

export const MOCK_CONVERSATIONS: MockConversation[] = [
  {
    id: "conv-1",
    customerName: "Lucía Fernández",
    customerEmail: "lucia.f@example.com",
    channel: "web",
    subject: {
      es: "Compatibilidad laptop 16\" y devoluciones",
      en: "16\" laptop fit & return policy",
    },
    status: "pending",
    confidence: 96,
    updatedAt: { es: "Hace 4 min", en: "4m ago" },
    messages: [
      {
        id: "m-1",
        role: "customer",
        text: {
          es: "Hola, ¿la Mochila Urbana Impermeable entra con una MacBook Pro de 16 pulgadas? ¿Tienen stock hoy y cuántos días tengo para devolverla si no me convence?",
          en: "Hi! Does the Weatherproof Commuter Backpack fit a 16-inch MacBook Pro? Is it in stock today, and how many days do I have for a return?",
        },
        time: "10:14",
      },
    ],
    suggestedReply: {
      es: "¡Hola Lucía! Sí, nuestra Mochila Urbana Impermeable (SKU: NRD-BG-003) cuenta con compartimento acolchado para laptops de hasta 16\". Hoy tenemos 18 unidades disponibles a $129 USD. Además, tenés 30 días desde la entrega para solicitar un cambio o devolución sin costo.",
      en: "Hi Lucía! Yes, our Weatherproof Commuter Backpack (SKU: NRD-BG-003) includes a padded compartment for laptops up to 16\". We currently have 18 units in stock at $129 USD, and you have 30 days from delivery for a free return or exchange.",
    },
    matchedSources: [
      {
        type: "product",
        label: {
          es: "NRD-BG-003 · Stock: 18 · $129",
          en: "NRD-BG-003 · Stock: 18 · $129",
        },
      },
      {
        type: "policy",
        label: {
          es: "Política de cambios y devoluciones (30 días)",
          en: "Returns & exchanges policy (30 days)",
        },
      },
    ],
  },
  {
    id: "conv-2",
    customerName: "Hannah Kim",
    customerEmail: "hannah.k@example.com",
    channel: "email",
    subject: {
      es: "Reposición de gafas polarizadas (NRD-SG-008)",
      en: "Restock inquiry for Polarized Sunglasses (NRD-SG-008)",
    },
    status: "pending",
    confidence: 74,
    updatedAt: { es: "Hace 2 h", en: "2h ago" },
    messages: [
      {
        id: "m-2",
        role: "customer",
        text: {
          es: "Vi que las Gafas Polarizadas Everyday figuran sin stock. ¿Saben exactamente qué día vuelven a ingresar?",
          en: "I noticed the Polarized Everyday Sunglasses show out of stock. Do you know the exact date they will be restocked?",
        },
        time: "08:35",
      },
    ],
    suggestedReply: {
      es: "Hola Hannah, confirmamos que las Gafas Polarizadas Everyday (SKU: NRD-SG-008) están actualmente sin stock. En nuestro catálogo aún no figura una fecha exacta de reposición confirmada; derivo tu consulta al equipo de inventario para darte una fecha estimada.",
      en: "Hi Hannah, our Polarized Everyday Sunglasses (SKU: NRD-SG-008) are currently out of stock. Our catalog doesn't list a confirmed restock date yet—I'm flagging this with our inventory team so we can send you an accurate ETA.",
    },
    matchedSources: [
      {
        type: "product",
        label: {
          es: "NRD-SG-008 · Stock: 0 (Sin stock)",
          en: "NRD-SG-008 · Stock: 0 (Out of stock)",
        },
      },
    ],
  },
  {
    id: "conv-3",
    customerName: "Mateo Álvarez",
    customerEmail: "mateo.alvarez@example.com",
    channel: "email",
    subject: {
      es: "Guía de talles Sweater Merino",
      en: "Merino Crewneck sizing guidance",
    },
    status: "approved",
    confidence: 94,
    updatedAt: { es: "Hace 18 min", en: "18m ago" },
    messages: [
      {
        id: "m-3",
        role: "customer",
        text: {
          es: "Mido 1,78 m y peso 75 kg. ¿Me conviene M o L en el Sweater Merino Clásico?",
          en: "I'm 1.78m and 75kg. Should I pick M or L for the Merino Wool Crewneck?",
        },
        time: "09:50",
      },
      {
        id: "m-4",
        role: "ai",
        text: {
          es: "Hola Mateo, según nuestra guía de talles para el Sweater Merino Clásico (SKU: NRD-SW-001), con 1,78 m y 75 kg el talle M ofrece un calce clásico; si preferís un ajuste más holgado para usar sobre camisa, elegí L. Recordá que los cambios de talle son gratuitos dentro de los 30 días.",
          en: "Hi Mateo, based on our sizing guide for the Merino Wool Crewneck (SKU: NRD-SW-001), size M offers a classic tailored fit at 1.78m / 75kg, while L gives extra room for layering. Size exchanges are free within 30 days.",
        },
        time: "09:51",
      },
    ],
    suggestedReply: {
      es: "Hola Mateo, según nuestra guía de talles para el Sweater Merino Clásico (SKU: NRD-SW-001), con 1,78 m y 75 kg el talle M ofrece un calce clásico; si preferís un ajuste más holgado para usar sobre camisa, elegí L. Recordá que los cambios de talle son gratuitos dentro de los 30 días.",
      en: "Hi Mateo, based on our sizing guide for the Merino Wool Crewneck (SKU: NRD-SW-001), size M offers a classic tailored fit at 1.78m / 75kg, while L gives extra room for layering. Size exchanges are free within 30 days.",
    },
    matchedSources: [
      {
        type: "product",
        label: {
          es: "NRD-SW-001 · Stock: 42 · $98",
          en: "NRD-SW-001 · Stock: 42 · $98",
        },
      },
      {
        type: "policy",
        label: {
          es: "Guía oficial de talles y medidas",
          en: "Official sizing & fit guide",
        },
      },
    ],
  },
  {
    id: "conv-4",
    customerName: "Sofia Bennett",
    customerEmail: "sofia.b@example.com",
    channel: "whatsapp",
    subject: {
      es: "Reclamo por taza llegada con fisura",
      en: "Damaged ceramic mug on delivery",
    },
    status: "escalated",
    confidence: 62,
    updatedAt: { es: "Hace 1 h", en: "1h ago" },
    messages: [
      {
        id: "m-5",
        role: "customer",
        text: {
          es: "Recibí hoy el Set de Tazas Cerámica Minimal pero una llegó rajada en la base. ¿Cómo gestiono el reemplazo?",
          en: "I received the Minimalist Ceramic Mug Set today, and one mug arrived cracked at the base. How do I get a replacement?",
        },
        time: "09:10",
      },
    ],
    suggestedReply: {
      es: "Lamentamos mucho que una de las tazas de tu Set (SKU: NRD-HM-002) haya llegado dañada. Este caso requiere gestión directa de reemplazo sin cargo: nuestro equipo de soporte ya tomó tu pedido para enviarte una unidad nueva de inmediato.",
      en: "We're very sorry one mug from your set (SKU: NRD-HM-002) arrived damaged. Because this is a transit-damage claim, I'm escalating your ticket directly to our support specialists so we can ship a free replacement right away.",
    },
    matchedSources: [
      {
        type: "product",
        label: {
          es: "NRD-HM-002 · Set de Tazas Cerámica",
          en: "NRD-HM-002 · Minimalist Ceramic Mug Set",
        },
      },
      {
        type: "policy",
        label: {
          es: "Regla de escalado: productos dañados",
          en: "Escalation guardrail: transit damage",
        },
      },
    ],
  },
  {
    id: "conv-5",
    customerName: "Camila Rojas",
    customerEmail: "camila.r@example.com",
    channel: "web",
    subject: {
      es: "Envío gratis y medios de pago",
      en: "Free shipping threshold & payments",
    },
    status: "approved",
    confidence: 95,
    updatedAt: { es: "Hace 3 h", en: "3h ago" },
    messages: [
      {
        id: "m-6",
        role: "customer",
        text: {
          es: "¿A partir de qué monto tienen envío gratis y aceptan tarjeta de débito?",
          en: "What order minimum qualifies for free shipping, and do you accept debit cards?",
        },
        time: "07:20",
      },
    ],
    suggestedReply: {
      es: "¡Hola Camila! El envío estándar es gratuito en compras desde $90 USD. Aceptamos tarjetas de crédito y débito Visa, Mastercard y Amex, además de pagos digitales en el checkout.",
      en: "Hi Camila! Standard shipping is free on orders over $90 USD. We accept Visa, Mastercard, and Amex credit and debit cards, plus digital wallets at checkout.",
    },
    matchedSources: [
      {
        type: "policy",
        label: {
          es: "Política de envíos estándar y exprés",
          en: "Standard & express shipping policy",
        },
      },
      {
        type: "policy",
        label: {
          es: "Medios de pago aceptados",
          en: "Accepted payment methods",
        },
      },
    ],
  },
];

export const MOCK_KNOWLEDGE_DOCS: MockKnowledgeDoc[] = [
  {
    id: "doc-1",
    title: {
      es: "Política de envíos estándar y exprés",
      en: "Standard & express shipping policy",
    },
    category: "shipping",
    excerpt: {
      es: "Envío gratis desde $90 USD. Despacho en 24 h hábiles; entrega estándar en 3–5 días hábiles y exprés en 24–48 h.",
      en: "Free shipping on orders over $90 USD. Dispatched within 1 business day; standard delivery takes 3–5 days, express 24–48h.",
    },
    chunks: 6,
    status: "published",
    updatedAt: "2026-11-20",
  },
  {
    id: "doc-2",
    title: {
      es: "Cambios y devoluciones en 30 días",
      en: "30-day returns & size exchanges",
    },
    category: "returns",
    excerpt: {
      es: "Devoluciones y cambios de talle gratuitos dentro de los 30 días posteriores a la entrega con etiqueta original.",
      en: "Free returns and size exchanges within 30 days of delivery as long as original tags remain attached.",
    },
    chunks: 8,
    status: "published",
    updatedAt: "2026-11-19",
  },
  {
    id: "doc-3",
    title: {
      es: "Medios de pago y facturación",
      en: "Payment methods & invoicing",
    },
    category: "payments",
    excerpt: {
      es: "Tarjetas Visa, Mastercard, Amex (crédito y débito) y billeteras digitales. Emisión automática de factura por email.",
      en: "Visa, Mastercard, Amex credit/debit cards and digital wallets accepted. Automated PDF invoice sent via email.",
    },
    chunks: 4,
    status: "published",
    updatedAt: "2026-11-17",
  },
  {
    id: "doc-4",
    title: {
      es: "Guía oficial de talles — Indumentaria",
      en: "Official apparel sizing guide",
    },
    category: "sizing",
    excerpt: {
      es: "Tabla de medidas de pecho, largo y hombros para S, M, L y XL en sweaters de lana Merino y hoodies orgánicos.",
      en: "Chest, length, and shoulder measurements for sizes S–XL across Merino knitwear and organic cotton hoodies.",
    },
    chunks: 5,
    status: "published",
    updatedAt: "2026-11-16",
  },
  {
    id: "doc-5",
    title: {
      es: "Garantía de accesorios y mochilas",
      en: "Accessories & backpack warranty",
    },
    category: "warranty",
    excerpt: {
      es: "Cobertura de 2 años ante defectos de costura, cierres impermeables y aislamiento térmico en botellas.",
      en: "2-year warranty covering stitching defects, waterproof zippers, and thermal insulation on steel bottles.",
    },
    chunks: 4,
    status: "published",
    updatedAt: "2026-11-14",
  },
  {
    id: "doc-6",
    title: {
      es: "Envíos internacionales y aranceles (borrador)",
      en: "International shipping & duties (draft)",
    },
    category: "shipping",
    excerpt: {
      es: "Borrador interno con cobertura para LATAM y Europa vía courier con cálculo de impuestos en destino.",
      en: "Internal draft covering LATAM and EU courier routes and destination duty estimation rules.",
    },
    chunks: 3,
    status: "draft",
    updatedAt: "2026-11-21",
  },
];

export const MOCK_IMPORT_JOBS: MockImportJob[] = [
  {
    id: "imp-1",
    fileName: "nordica-catalog-nov-2026.csv",
    rowsTotal: 248,
    rowsImported: 248,
    rowsWarnings: 0,
    status: "completed",
    createdAt: "2026-11-21 14:22",
  },
  {
    id: "imp-2",
    fileName: "winter-accessories-update.csv",
    rowsTotal: 64,
    rowsImported: 61,
    rowsWarnings: 3,
    status: "with_warnings",
    createdAt: "2026-11-15 09:45",
  },
  {
    id: "imp-3",
    fileName: "initial-store-export.csv",
    rowsTotal: 192,
    rowsImported: 192,
    rowsWarnings: 0,
    status: "completed",
    createdAt: "2026-11-02 17:10",
  },
];

export const MOCK_ANALYTICS_BY_RANGE: Record<
  AnalyticsRange,
  MockAnalyticsSnapshot
> = {
  "7d": {
    kpis: {
      resolutionRate: "88.4%",
      avgDraftTime: "1.4s",
      approvalRate: "86.2%",
      escalationRate: "6.8%",
    },
    weeklyVolume: [
      { day: { es: "Lun", en: "Mon" }, total: 48, approved: 42 },
      { day: { es: "Mar", en: "Tue" }, total: 56, approved: 49 },
      { day: { es: "Mié", en: "Wed" }, total: 64, approved: 55 },
      { day: { es: "Jue", en: "Thu" }, total: 52, approved: 46 },
      { day: { es: "Vie", en: "Fri" }, total: 71, approved: 61 },
      { day: { es: "Sáb", en: "Sat" }, total: 39, approved: 34 },
      { day: { es: "Dom", en: "Sun" }, total: 32, approved: 28 },
    ],
    topTopics: [
      { topic: { es: "Stock y variantes", en: "Stock & variants" }, share: 34, count: 123 },
      { topic: { es: "Envíos y plazos", en: "Shipping & ETA" }, share: 28, count: 101 },
      { topic: { es: "Cambios y talles", en: "Returns & sizing" }, share: 22, count: 80 },
      { topic: { es: "Pagos y facturas", en: "Payments & invoices" }, share: 16, count: 58 },
    ],
    topProducts: [
      {
        sku: "NRD-BG-003",
        name: { es: "Mochila Urbana Impermeable 16\"", en: "Weatherproof Commuter Backpack 16\"" },
        queries: 84,
        accuracy: 96,
      },
      {
        sku: "NRD-SW-001",
        name: { es: "Sweater Merino Clásico", en: "Merino Wool Crewneck" },
        queries: 67,
        accuracy: 94,
      },
      {
        sku: "NRD-HM-004",
        name: { es: "Funda Nórdica de Lino Lavado", en: "Washed Linen Duvet Cover" },
        queries: 49,
        accuracy: 92,
      },
    ],
  },
  "30d": {
    kpis: {
      resolutionRate: "87.1%",
      avgDraftTime: "1.5s",
      approvalRate: "85.8%",
      escalationRate: "7.4%",
    },
    weeklyVolume: [
      { day: { es: "Sem 1", en: "Wk 1" }, total: 310, approved: 265 },
      { day: { es: "Sem 2", en: "Wk 2" }, total: 345, approved: 298 },
      { day: { es: "Sem 3", en: "Wk 3" }, total: 392, approved: 336 },
      { day: { es: "Sem 4", en: "Wk 4" }, total: 373, approved: 319 },
    ],
    topTopics: [
      { topic: { es: "Stock y variantes", en: "Stock & variants" }, share: 36, count: 511 },
      { topic: { es: "Envíos y plazos", en: "Shipping & ETA" }, share: 27, count: 383 },
      { topic: { es: "Cambios y talles", en: "Returns & sizing" }, share: 23, count: 327 },
      { topic: { es: "Pagos y facturas", en: "Payments & invoices" }, share: 14, count: 199 },
    ],
    topProducts: [
      {
        sku: "NRD-BG-003",
        name: { es: "Mochila Urbana Impermeable 16\"", en: "Weatherproof Commuter Backpack 16\"" },
        queries: 312,
        accuracy: 96,
      },
      {
        sku: "NRD-SW-001",
        name: { es: "Sweater Merino Clásico", en: "Merino Wool Crewneck" },
        queries: 254,
        accuracy: 94,
      },
      {
        sku: "NRD-SG-008",
        name: { es: "Gafas Polarizadas Everyday", en: "Polarized Everyday Sunglasses" },
        queries: 189,
        accuracy: 89,
      },
    ],
  },
  "90d": {
    kpis: {
      resolutionRate: "85.9%",
      avgDraftTime: "1.6s",
      approvalRate: "84.4%",
      escalationRate: "8.1%",
    },
    weeklyVolume: [
      { day: { es: "Sep", en: "Sep" }, total: 1120, approved: 938 },
      { day: { es: "Oct", en: "Oct" }, total: 1290, approved: 1094 },
      { day: { es: "Nov", en: "Nov" }, total: 1420, approved: 1218 },
    ],
    topTopics: [
      { topic: { es: "Stock y variantes", en: "Stock & variants" }, share: 35, count: 1340 },
      { topic: { es: "Envíos y plazos", en: "Shipping & ETA" }, share: 29, count: 1110 },
      { topic: { es: "Cambios y talles", en: "Returns & sizing" }, share: 22, count: 843 },
      { topic: { es: "Pagos y facturas", en: "Payments & invoices" }, share: 14, count: 537 },
    ],
    topProducts: [
      {
        sku: "NRD-BG-003",
        name: { es: "Mochila Urbana Impermeable 16\"", en: "Weatherproof Commuter Backpack 16\"" },
        queries: 845,
        accuracy: 95,
      },
      {
        sku: "NRD-SW-001",
        name: { es: "Sweater Merino Clásico", en: "Merino Wool Crewneck" },
        queries: 690,
        accuracy: 93,
      },
      {
        sku: "NRD-BT-005",
        name: { es: "Botella Térmica Acero 750ml", en: "Insulated Steel Bottle 750ml" },
        queries: 520,
        accuracy: 97,
      },
    ],
  },
};
