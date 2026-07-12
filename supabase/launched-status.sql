alter table public.products
drop constraint if exists products_status_check;

alter table public.products
add constraint products_status_check
check (status in ('idea', 'sample', 'bulk', 'launched', 'canceled'));
