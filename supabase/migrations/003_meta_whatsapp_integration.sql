-- 003_meta_whatsapp_integration.sql
-- Optional/recommended schema enhancements for Meta (WhatsApp Cloud API, Instagram, Messenger)
-- deduplication by external message ID (wamid / mid) and faster channel conversation lookups.

alter table public.messages
  add column if not exists external_message_id text;

create unique index if not exists idx_messages_external_message_id
  on public.messages(external_message_id)
  where external_message_id is not null;

create index if not exists idx_conversations_store_channel
  on public.conversations(store_id, channel_id);
