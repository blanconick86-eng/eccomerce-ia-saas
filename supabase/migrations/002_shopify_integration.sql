-- 002_shopify_integration.sql
-- Shopify OAuth integration credentials table, RLS policies, and external product sync columns.

create table if not exists public.shopify_integrations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_domain text not null,
  access_token text not null,
  scopes text not null default '',
  status text not null default 'connected',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shopify_integrations_store_id
  on public.shopify_integrations(store_id);

create index if not exists idx_shopify_integrations_shop_domain
  on public.shopify_integrations(shop_domain);

drop trigger if exists trg_shopify_integrations_updated_at on public.shopify_integrations;
create trigger trg_shopify_integrations_updated_at
  before update on public.shopify_integrations
  for each row execute function public.set_updated_at();

alter table public.shopify_integrations enable row level security;

drop policy if exists "shopify_integrations_select_store_owner" on public.shopify_integrations;
create policy "shopify_integrations_select_store_owner"
  on public.shopify_integrations for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "shopify_integrations_insert_store_owner" on public.shopify_integrations;
create policy "shopify_integrations_insert_store_owner"
  on public.shopify_integrations for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "shopify_integrations_update_store_owner" on public.shopify_integrations;
create policy "shopify_integrations_update_store_owner"
  on public.shopify_integrations for update
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
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

drop policy if exists "shopify_integrations_delete_store_owner" on public.shopify_integrations;
create policy "shopify_integrations_delete_store_owner"
  on public.shopify_integrations for delete
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      where s.id = store_id
        and s.owner_id = (select auth.uid())
    )
  );

-- Extend products table for external channel sync (Shopify, etc.)
alter table public.products
  add column if not exists source text not null default 'manual',
  add column if not exists external_id text,
  add column if not exists stock_quantity integer,
  add column if not exists image_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_store_source_external_id_key'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_store_source_external_id_key
      unique (store_id, source, external_id);
  end if;
end
$$;

create index if not exists idx_products_store_source
  on public.products(store_id, source);
