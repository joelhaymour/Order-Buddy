alter table public.products
add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated users can upload product images" on storage.objects;
create policy "authenticated users can upload product images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'product-images');

drop policy if exists "authenticated users can view product images" on storage.objects;
create policy "authenticated users can view product images"
on storage.objects
for select
to authenticated
using (bucket_id = 'product-images');

drop policy if exists "authenticated users can update product images" on storage.objects;
create policy "authenticated users can update product images"
on storage.objects
for update
to authenticated
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');

drop policy if exists "authenticated users can delete product images" on storage.objects;
create policy "authenticated users can delete product images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'product-images');
