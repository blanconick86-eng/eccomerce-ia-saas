-- 001_initial_schema.sql
-- Initial schema, strict RLS policies, and auth onboarding trigger for StoreOne.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Utility trigger function for updated_at columns
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- stores
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  language text not null default 'es',
  created_at timestamptz not null default now()
);

-- products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency text not null default 'USD',
  stock_status text not null default 'in_stock',
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_store_id_sku_key unique (store_id, sku)
);

-- policies
create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  type text not null,
  content text not null default '',
  language text not null default 'es',
  updated_at timestamptz not null default now()
);

-- ai_settings
create table if not exists public.ai_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  response_mode text not null default 'approval',
  tone text not null default 'friendly',
  language text not null default 'auto',
  confidence_threshold numeric(3, 2) not null default 0.85
    check (confidence_threshold >= 0 and confidence_threshold <= 1),
  allowed_topics text[] not null default '{}'::text[],
  restricted_topics text[] not null default '{}'::text[]
);

-- imports
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  filename text not null,
  status text not null default 'pending',
  rows_imported integer not null default 0 check (rows_imported >= 0),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  status text not null default 'open',
  language text not null default 'es',
  created_at timestamptz not null default now()
);

-- messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,
  content text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- usage_events
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  event_type text not null,
  quantity integer not null default 1 check (quantity >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_stores_owner_id on public.stores(owner_id);
create index if not exists idx_products_store_id on public.products(store_id);
create index if not exists idx_policies_store_id on public.policies(store_id);
create index if not exists idx_imports_store_id on public.imports(store_id);
create index if not exists idx_conversations_store_id on public.conversations(store_id);
create index if not exists idx_messages_conversation_id on public.messages(conversation_id);
create index if not exists idx_usage_events_store_id on public.usage_events(store_id);

-- ---------------------------------------------------------------------------
-- 4. Updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists trg_policies_updated_at on public.policies;
create trigger trg_policies_updated_at
  before update on public.policies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Row Level Security (RLS)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.policies enable row level security;
alter table public.ai_settings enable row level security;
alter table public.imports enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.usage_events enable row level security;

-- profiles policies
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using (id = (select auth.uid()));

-- stores policies
drop policy if exists "stores_select_own" on public.stores;
create policy "stores_select_own"
  on public.stores for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "stores_insert_own" on public.stores;
create policy "stores_insert_own"
  on public.stores for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "stores_update_own" on public.stores;
create policy "stores_update_own"
  on public.stores for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "stores_delete_own" on public.stores;
create policy "stores_delete_own"
  on public.stores for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- products policies
drop policy if exists "products_select_store_owner" on public.products;
create policy "products_select_store_owner"
  on public.products for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "products_insert_store_owner" on public.products;
create policy "products_insert_store_owner"
  on public.products for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "products_update_store_owner" on public.products;
create policy "products_update_store_owner"
  on public.products for update
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "products_delete_store_owner" on public.products;
create policy "products_delete_store_owner"
  on public.products for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

-- policies table policies
drop policy if exists "policies_select_store_owner" on public.policies;
create policy "policies_select_store_owner"
  on public.policies for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "policies_insert_store_owner" on public.policies;
create policy "policies_insert_store_owner"
  on public.policies for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "policies_update_store_owner" on public.policies;
create policy "policies_update_store_owner"
  on public.policies for update
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "policies_delete_store_owner" on public.policies;
create policy "policies_delete_store_owner"
  on public.policies for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

-- ai_settings policies
drop policy if exists "ai_settings_select_store_owner" on public.ai_settings;
create policy "ai_settings_select_store_owner"
  on public.ai_settings for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "ai_settings_insert_store_owner" on public.ai_settings;
create policy "ai_settings_insert_store_owner"
  on public.ai_settings for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "ai_settings_update_store_owner" on public.ai_settings;
create policy "ai_settings_update_store_owner"
  on public.ai_settings for update
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "ai_settings_delete_store_owner" on public.ai_settings;
create policy "ai_settings_delete_store_owner"
  on public.ai_settings for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

-- imports policies
drop policy if exists "imports_select_store_owner" on public.imports;
create policy "imports_select_store_owner"
  on public.imports for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "imports_insert_store_owner" on public.imports;
create policy "imports_insert_store_owner"
  on public.imports for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "imports_update_store_owner" on public.imports;
create policy "imports_update_store_owner"
  on public.imports for update
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "imports_delete_store_owner" on public.imports;
create policy "imports_delete_store_owner"
  on public.imports for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

-- conversations policies
drop policy if exists "conversations_select_store_owner" on public.conversations;
create policy "conversations_select_store_owner"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "conversations_insert_store_owner" on public.conversations;
create policy "conversations_insert_store_owner"
  on public.conversations for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "conversations_update_store_owner" on public.conversations;
create policy "conversations_update_store_owner"
  on public.conversations for update
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "conversations_delete_store_owner" on public.conversations;
create policy "conversations_delete_store_owner"
  on public.conversations for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

-- messages policies (scoped via parent conversation -> store owner)
drop policy if exists "messages_select_store_owner" on public.messages;
create policy "messages_select_store_owner"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      join public.stores s on s.id = c.store_id
      where c.id = messages.conversation_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "messages_insert_store_owner" on public.messages;
create policy "messages_insert_store_owner"
  on public.messages for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.conversations c
      join public.stores s on s.id = c.store_id
      where c.id = messages.conversation_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "messages_update_store_owner" on public.messages;
create policy "messages_update_store_owner"
  on public.messages for update
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      join public.stores s on s.id = c.store_id
      where c.id = messages.conversation_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.conversations c
      join public.stores s on s.id = c.store_id
      where c.id = messages.conversation_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "messages_delete_store_owner" on public.messages;
create policy "messages_delete_store_owner"
  on public.messages for delete
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      join public.stores s on s.id = c.store_id
      where c.id = messages.conversation_id
        and s.owner_id = (select auth.uid())
    )
  );

-- usage_events policies
drop policy if exists "usage_events_select_store_owner" on public.usage_events;
create policy "usage_events_select_store_owner"
  on public.usage_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "usage_events_insert_store_owner" on public.usage_events;
create policy "usage_events_insert_store_owner"
  on public.usage_events for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "usage_events_update_store_owner" on public.usage_events;
create policy "usage_events_update_store_owner"
  on public.usage_events for update
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "usage_events_delete_store_owner" on public.usage_events;
create policy "usage_events_delete_store_owner"
  on public.usage_events for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Auth onboarding trigger (profile + initial store + default ai_settings)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_full_name text;
  v_store_name text;
  v_language text;
begin
  v_full_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_store_name := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_name', '')), ''),
    'My Store'
  );
  v_language := case
    when new.raw_user_meta_data ->> 'language' in ('es', 'en')
      then new.raw_user_meta_data ->> 'language'
    else 'es'
  end;

  insert into public.profiles (id, full_name)
  values (new.id, v_full_name);

  insert into public.stores (owner_id, name, language)
  values (new.id, v_store_name, v_language)
  returning id into v_store_id;

  insert into public.ai_settings (store_id)
  values (v_store_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
