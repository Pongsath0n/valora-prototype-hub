-- Valora Engine MVP Schema v2
-- Supabase-first, multi-tenant by store_id, SaaS-ready

create extension if not exists pgcrypto;

-- enums
create type public.store_role as enum ('owner', 'manager', 'staff');
create type public.order_status as enum (
  'draft', 'pending_payment', 'paid', 'accepted', 'preparing', 'ready_for_pickup', 'completed', 'cancelled'
);
create type public.payment_status as enum ('unpaid', 'pending', 'paid', 'rejected', 'refunded');
create type public.channel_fee_type as enum ('none', 'percent', 'fixed');
create type public.stock_movement_type as enum ('in', 'out', 'adjustment', 'restore');

-- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Bangkok',
  currency text not null default 'THB',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.store_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique(store_id, user_id)
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null,
  sku text,
  is_active boolean not null default true,
  base_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  unit text not null,
  cost_per_unit numeric(12,4) not null default 0,
  stock_on_hand numeric(12,3) not null default 0,
  low_stock_threshold numeric(12,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity_used numeric(12,4) not null,
  created_at timestamptz not null default now(),
  unique(product_id, ingredient_id)
);

create table if not exists public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  fee_type public.channel_fee_type not null default 'none',
  fee_value numeric(12,4) not null default 0,
  created_at timestamptz not null default now(),
  unique(store_id, name)
);

create table if not exists public.channel_prices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  channel_id uuid not null references public.sales_channels(id) on delete cascade,
  selling_price numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique(product_id, channel_id)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text,
  phone text,
  line_user_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel_id uuid references public.sales_channels(id) on delete set null,
  status public.order_status not null default 'draft',
  payment_status public.payment_status not null default 'unpaid',
  total_amount numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  channel_fee_total numeric(12,2) not null default 0,
  gross_profit numeric(12,2) not null default 0,
  note text,
  ordered_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  line_total numeric(12,2) not null,
  line_cost numeric(12,2) not null,
  line_profit numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  movement_type public.stock_movement_type not null,
  quantity numeric(12,4) not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(12,2) not null,
  method text,
  status public.payment_status not null default 'unpaid',
  paid_at timestamptz,
  transaction_ref text,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.sales_channels enable row level security;
alter table public.channel_prices enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.payments enable row level security;

create or replace function public.is_store_member(_store_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.store_members sm
    where sm.store_id = _store_id and sm.user_id = auth.uid()
  );
$$;

create policy "profiles self" on public.profiles
for all using (id = auth.uid()) with check (id = auth.uid());

create policy "stores by membership" on public.stores
for all using (public.is_store_member(id)) with check (public.is_store_member(id));

-- apply same scoped policy pattern for store-scoped tables
create policy "store_members by store" on public.store_members
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

create policy "product_categories by store" on public.product_categories
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "products by store" on public.products
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "ingredients by store" on public.ingredients
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "recipes by store" on public.recipes
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "sales_channels by store" on public.sales_channels
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "channel_prices by store" on public.channel_prices
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "customers by store" on public.customers
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "orders by store" on public.orders
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "order_items by store" on public.order_items
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "stock_movements by store" on public.stock_movements
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
create policy "payments by store" on public.payments
for all using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));
