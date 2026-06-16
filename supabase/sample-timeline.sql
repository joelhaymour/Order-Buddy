alter table public.products
add column if not exists sample_production_days integer not null default 0;

alter table public.products
add column if not exists sample_shipping_days integer not null default 0;
