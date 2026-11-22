export type Locale = "es" | "en";

export type LocalizedText = {
  es: string;
  en: string;
};

export type MockProduct = {
  id: string;
  sku: string;
  name: LocalizedText;
  category: LocalizedText;
  price: number;
  stock: number;
  status: "active" | "low_stock" | "out_of_stock";
  updatedAt: string;
};

export type MockActivity = {
  id: string;
  customer: string;
  channel: "web" | "email" | "whatsapp";
  topic: LocalizedText;
  status: "approved" | "pending" | "edited";
  confidence: number;
  timestamp: LocalizedText;
};

export type MockMessage = {
  id: string;
  role: "customer" | "ai" | "agent";
  text: LocalizedText;
  time: string;
};

export type MockConversation = {
  id: string;
  customerName: string;
  customerEmail: string;
  channel: "web" | "email" | "whatsapp";
  subject: LocalizedText;
  status: "pending" | "approved" | "escalated";
  confidence: number;
  updatedAt: LocalizedText;
  messages: MockMessage[];
  suggestedReply: LocalizedText;
  matchedSources: {
    label: LocalizedText;
    type: "product" | "policy";
  }[];
};

export type MockKnowledgeDoc = {
  id: string;
  title: LocalizedText;
  category: "shipping" | "returns" | "payments" | "sizing" | "warranty";
  excerpt: LocalizedText;
  chunks: number;
  status: "published" | "draft";
  updatedAt: string;
};

export type MockImportJob = {
  id: string;
  fileName: string;
  rowsTotal: number;
  rowsImported: number;
  rowsWarnings: number;
  status: "completed" | "with_warnings";
  createdAt: string;
};

export type MockWeeklyMetric = {
  day: LocalizedText;
  total: number;
  approved: number;
};

export type MockTopicMetric = {
  topic: LocalizedText;
  share: number;
  count: number;
};

export type AnalyticsRange = "7d" | "30d" | "90d";

export type MockAnalyticsSnapshot = {
  kpis: {
    resolutionRate: string;
    avgDraftTime: string;
    approvalRate: string;
    escalationRate: string;
  };
  weeklyVolume: MockWeeklyMetric[];
  topTopics: MockTopicMetric[];
  topProducts: {
    sku: string;
    name: LocalizedText;
    queries: number;
    accuracy: number;
  }[];
};
