create extension if not exists pgcrypto;

create table if not exists public.drop_days (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_date date not null,
  description text default '',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text not null default '',
  category text not null,
  supplier text not null default '',
  status text not null check (status in ('idea', 'sample', 'bulk', 'canceled')),
  drop_day_id uuid references public.drop_days(id) on delete set null,
  notes text not null default '',
  sample_ordered_at date,
  sample_approved_at date,
  bulk_start_date date,
  production_days integer not null default 0,
  shipping_days integer not null default 0,
  target_launch_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cost_entries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  title text not null,
  description text not null default '',
  amount numeric(12, 2) not null check (amount >= 0),
  entry_date date not null,
  cost_type text not null check (cost_type in ('sample', 'materials', 'packaging', 'freight', 'misc')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_products_status on public.products(status);
create index if not exists idx_products_drop_day_id on public.products(drop_day_id);
create index if not exists idx_cost_entries_product_id on public.cost_entries(product_id);
create index if not exists idx_drop_days_target_date on public.drop_days(target_date);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row
execute function public.handle_updated_at();

alter table public.drop_days enable row level security;
alter table public.products enable row level security;
alter table public.cost_entries enable row level security;

create policy "authenticated users can manage drop days"
on public.drop_days
for all
to authenticated
using (true)
with check (true);

create policy "authenticated users can manage products"
on public.products
for all
to authenticated
using (true)
with check (true);

create policy "authenticated users can manage cost entries"
on public.cost_entries
for all
to authenticated
using (true)
with check (true);
