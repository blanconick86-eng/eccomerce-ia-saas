export type Profile = {
  id: string;
  full_name: string | null;
  created_at: string;
};

export type Store = {
  id: string;
  owner_id: string;
  name: string;
  language: string;
  created_at: string;
};

export type Product = {
  id: string;
  store_id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  stock_status: string;
  category: string | null;
  created_at: string;
  updated_at: string;
};

export type Policy = {
  id: string;
  store_id: string;
  type: string;
  content: string;
  language: string;
  updated_at: string;
};

export type AiSettings = {
  store_id: string;
  response_mode: string;
  tone: string;
  language: string;
  confidence_threshold: number;
  allowed_topics: string[];
  restricted_topics: string[];
};

export type ImportJob = {
  id: string;
  store_id: string;
  filename: string;
  status: string;
  rows_imported: number;
  errors: unknown;
  created_at: string;
};

export type Channel = {
  id: string;
  store_id: string;
  name: string;
  type: string;
  credentials?: Record<string, unknown> | null;
  created_at: string;
};

export type ChannelSummary = Pick<Channel, "id" | "name" | "type">;

export type Conversation = {
  id: string;
  store_id: string;
  channel_id?: string | null;
  external_thread_id?: string | null;
  status: string;
  language: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  status: string;
  created_at: string;
};

export type UsageEvent = {
  id: string;
  store_id: string;
  event_type: string;
  quantity: number;
  created_at: string;
};
