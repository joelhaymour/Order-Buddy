create extension if not exists pgcrypto;

create or replace function public.default_workspace_permissions()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'create_products', true,
    'edit_products', true,
    'move_stages', true,
    'manage_calendar', true,
    'manage_drop_days', true,
    'manage_events', true,
    'manage_images', true,
    'add_costs', true,
    'edit_costs', true,
    'delete_costs', true,
    'view_cost_amounts', true,
    'view_total_costs', true
  );
$$;

create table if not exists public.workspace_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Order Buddy',
  initial_admin_email text,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id)
);

alter table public.workspace_settings
add column if not exists initial_admin_email text;

insert into public.workspace_settings (id, store_name)
values (true, 'Order Buddy')
on conflict (id) do nothing;

create table if not exists public.workspace_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'removed')),
  permissions jsonb not null default public.default_workspace_permissions(),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists workspace_members_email_lower_idx
on public.workspace_members (lower(email));

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  permissions jsonb not null default public.default_workspace_permissions(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'failed')),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists workspace_pending_invite_email_idx
on public.workspace_invitations (lower(email))
where status = 'pending';

create or replace function public.is_active_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_workspace_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where user_id = auth.uid()
      and status = 'active'
      and role = 'admin'
  );
$$;

create or replace function public.has_workspace_permission(permission_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where user_id = auth.uid()
      and status = 'active'
      and (
        role = 'admin'
        or coalesce((permissions ->> permission_name)::boolean, false)
      )
  );
$$;

create or replace function public.handle_new_workspace_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matching_invite public.workspace_invitations%rowtype;
  configured_admin_email text;
  assigned_role text := 'member';
  assigned_status text := 'pending';
  assigned_permissions jsonb := public.default_workspace_permissions();
begin
  select initial_admin_email
  into configured_admin_email
  from public.workspace_settings
  where id = true;

  select *
  into matching_invite
  from public.workspace_invitations
  where lower(email) = lower(new.email)
    and status = 'pending'
    and expires_at > timezone('utc', now())
  order by created_at desc
  limit 1;

  if configured_admin_email is not null
     and lower(new.email) = lower(configured_admin_email) then
    assigned_role := 'admin';
    assigned_status := 'active';
  elsif matching_invite.id is not null then
    assigned_role := matching_invite.role;
    assigned_status := 'active';
    assigned_permissions := matching_invite.permissions;
  end if;

  insert into public.workspace_members (
    user_id,
    email,
    full_name,
    role,
    status,
    permissions,
    invited_by
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    assigned_role,
    assigned_status,
    assigned_permissions,
    matching_invite.invited_by
  )
  on conflict (user_id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      updated_at = timezone('utc', now());

  if matching_invite.id is not null then
    update public.workspace_invitations
    set status = 'accepted',
        accepted_at = timezone('utc', now())
    where id = matching_invite.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_workspace_member on auth.users;
create trigger on_auth_user_created_workspace_member
after insert or update of email on auth.users
for each row execute function public.handle_new_workspace_user();

insert into public.workspace_members (user_id, email, full_name, role, status, permissions)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'full_name', ''),
  case
    when lower(email) = lower(coalesce((
      select initial_admin_email
      from public.workspace_settings
      where id = true
    ), '')) then 'admin'
    else 'member'
  end,
  'active',
  public.default_workspace_permissions()
from auth.users
where email is not null
on conflict (user_id) do update
set email = excluded.email,
    role = case
      when lower(excluded.email) = lower(coalesce((
        select initial_admin_email
        from public.workspace_settings
        where id = true
      ), '')) then 'admin'
      else public.workspace_members.role
    end,
    status = case
      when lower(excluded.email) = lower(coalesce((
        select initial_admin_email
        from public.workspace_settings
        where id = true
      ), '')) then 'active'
      else public.workspace_members.status
    end,
    updated_at = timezone('utc', now());

create or replace function public.bootstrap_workspace(
  initial_admin_email text,
  initial_store_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(initial_admin_email));
  configured_admin_email text;
  existing_admin_email text;
begin
  if normalized_email = '' or position('@' in normalized_email) = 0 then
    raise exception 'A valid initial administrator email is required';
  end if;
  if length(trim(initial_store_name)) = 0 then
    raise exception 'Store name is required';
  end if;

  select workspace_settings.initial_admin_email
  into configured_admin_email
  from public.workspace_settings
  where id = true;

  if configured_admin_email is not null
     and lower(configured_admin_email) <> normalized_email then
    raise exception 'This workspace is already initialized for a different administrator';
  end if;

  select email
  into existing_admin_email
  from public.workspace_members
  where role = 'admin' and status = 'active'
  order by created_at
  limit 1;

  if existing_admin_email is not null
     and lower(existing_admin_email) <> normalized_email then
    raise exception 'This workspace already has a different active administrator';
  end if;

  update public.workspace_settings
  set store_name = trim(initial_store_name),
      initial_admin_email = normalized_email,
      updated_at = timezone('utc', now()),
      updated_by = null
  where id = true;

  insert into public.workspace_members (
    user_id,
    email,
    full_name,
    role,
    status,
    permissions
  )
  select
    id,
    email,
    coalesce(raw_user_meta_data ->> 'full_name', ''),
    'admin',
    'active',
    public.default_workspace_permissions()
  from auth.users
  where lower(email) = normalized_email
  on conflict (user_id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = 'admin',
      status = 'active',
      permissions = public.default_workspace_permissions(),
      updated_at = timezone('utc', now());
end;
$$;

create or replace function public.admin_update_workspace_name(next_store_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_admin() then
    raise exception 'Administrator access required';
  end if;
  if length(trim(next_store_name)) = 0 then
    raise exception 'Store name is required';
  end if;

  update public.workspace_settings
  set store_name = trim(next_store_name),
      updated_at = timezone('utc', now()),
      updated_by = auth.uid()
  where id = true;
end;
$$;

create or replace function public.admin_update_member(
  target_user_id uuid,
  next_role text,
  next_status text,
  next_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member public.workspace_members%rowtype;
  active_admin_count integer;
begin
  if not public.is_workspace_admin() then
    raise exception 'Administrator access required';
  end if;
  if next_role not in ('admin', 'member') then
    raise exception 'Invalid role';
  end if;
  if next_status not in ('pending', 'active', 'removed') then
    raise exception 'Invalid status';
  end if;

  select * into current_member
  from public.workspace_members
  where user_id = target_user_id;

  if current_member.user_id is null then
    raise exception 'Member not found';
  end if;

  if current_member.role = 'admin'
     and current_member.status = 'active'
     and (next_role <> 'admin' or next_status <> 'active') then
    select count(*) into active_admin_count
    from public.workspace_members
    where role = 'admin' and status = 'active';
    if active_admin_count <= 1 then
      raise exception 'The last active administrator cannot be removed or demoted';
    end if;
  end if;

  update public.workspace_members
  set role = next_role,
      status = next_status,
      permissions = coalesce(next_permissions, public.default_workspace_permissions()),
      updated_at = timezone('utc', now())
  where user_id = target_user_id;
end;
$$;

create or replace function public.reschedule_drop_day(target_drop_day_id uuid, next_target_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_workspace_permission('manage_calendar') then
    raise exception 'Calendar permission required';
  end if;
  update public.drop_days set target_date = next_target_date where id = target_drop_day_id;
end;
$$;

create or replace function public.reschedule_product(
  target_product_id uuid,
  next_sample_ordered_at date,
  next_bulk_start_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_workspace_permission('manage_calendar') then
    raise exception 'Calendar permission required';
  end if;
  update public.products
  set sample_ordered_at = next_sample_ordered_at,
      bulk_start_date = next_bulk_start_date
  where id = target_product_id;
end;
$$;

create or replace function public.update_product_stage(target_product_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_workspace_permission('move_stages') then
    raise exception 'Stage movement permission required';
  end if;
  if next_status not in ('idea', 'sample', 'bulk', 'launched', 'canceled') then
    raise exception 'Invalid product status';
  end if;
  update public.products set status = next_status where id = target_product_id;
end;
$$;

create or replace function public.update_drop_metadata(target_drop_day_id uuid, next_description text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_workspace_permission('manage_events') then
    raise exception 'Calendar event permission required';
  end if;
  update public.drop_days set description = next_description where id = target_drop_day_id;
end;
$$;

create or replace function public.set_product_image_path(target_product_id uuid, next_image_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_workspace_permission('manage_images') then
    raise exception 'Image permission required';
  end if;
  update public.products set image_path = next_image_path where id = target_product_id;
end;
$$;

create or replace function public.get_product_cost_totals()
returns table (product_id uuid, total numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_workspace_permission('view_total_costs') then
    return;
  end if;
  return query
  select cost_entries.product_id, coalesce(sum(cost_entries.amount), 0)::numeric
  from public.cost_entries
  group by cost_entries.product_id;
end;
$$;

revoke all on function public.admin_update_workspace_name(text) from public;
revoke all on function public.admin_update_member(uuid, text, text, jsonb) from public;
revoke all on function public.bootstrap_workspace(text, text) from public;
revoke all on function public.reschedule_drop_day(uuid, date) from public;
revoke all on function public.reschedule_product(uuid, date, date) from public;
revoke all on function public.update_product_stage(uuid, text) from public;
revoke all on function public.update_drop_metadata(uuid, text) from public;
revoke all on function public.set_product_image_path(uuid, text) from public;
revoke all on function public.get_product_cost_totals() from public;

grant execute on function public.admin_update_workspace_name(text) to authenticated;
grant execute on function public.admin_update_member(uuid, text, text, jsonb) to authenticated;
grant execute on function public.bootstrap_workspace(text, text) to service_role;
grant execute on function public.reschedule_drop_day(uuid, date) to authenticated;
grant execute on function public.reschedule_product(uuid, date, date) to authenticated;
grant execute on function public.update_product_stage(uuid, text) to authenticated;
grant execute on function public.update_drop_metadata(uuid, text) to authenticated;
grant execute on function public.set_product_image_path(uuid, text) to authenticated;
grant execute on function public.get_product_cost_totals() to authenticated;

alter table public.workspace_settings enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;

drop policy if exists "active members can view workspace settings" on public.workspace_settings;
create policy "active members can view workspace settings"
on public.workspace_settings for select to authenticated
using (public.is_active_workspace_member());

drop policy if exists "members can view self and admins can view all" on public.workspace_members;
create policy "members can view self and admins can view all"
on public.workspace_members for select to authenticated
using (user_id = auth.uid() or public.is_workspace_admin());

drop policy if exists "admins can view invitations" on public.workspace_invitations;
create policy "admins can view invitations"
on public.workspace_invitations for select to authenticated
using (public.is_workspace_admin());

drop policy if exists "admins can create invitations" on public.workspace_invitations;
create policy "admins can create invitations"
on public.workspace_invitations for insert to authenticated
with check (public.is_workspace_admin() and invited_by = auth.uid());

drop policy if exists "admins can update invitations" on public.workspace_invitations;
create policy "admins can update invitations"
on public.workspace_invitations for update to authenticated
using (public.is_workspace_admin())
with check (public.is_workspace_admin());

drop policy if exists "authenticated users can manage drop days" on public.drop_days;
drop policy if exists "active members can view drop days" on public.drop_days;
drop policy if exists "permitted members can create drop days" on public.drop_days;
drop policy if exists "permitted members can update drop days" on public.drop_days;
drop policy if exists "permitted members can delete drop days" on public.drop_days;
create policy "active members can view drop days"
on public.drop_days for select to authenticated
using (public.is_active_workspace_member());
create policy "permitted members can create drop days"
on public.drop_days for insert to authenticated
with check (public.has_workspace_permission('manage_drop_days'));
create policy "permitted members can update drop days"
on public.drop_days for update to authenticated
using (public.has_workspace_permission('manage_drop_days'))
with check (public.has_workspace_permission('manage_drop_days'));
create policy "permitted members can delete drop days"
on public.drop_days for delete to authenticated
using (public.has_workspace_permission('manage_drop_days'));

drop policy if exists "authenticated users can manage products" on public.products;
drop policy if exists "active members can view products" on public.products;
drop policy if exists "permitted members can create products" on public.products;
drop policy if exists "permitted members can update products" on public.products;
drop policy if exists "permitted members can delete products" on public.products;
create policy "active members can view products"
on public.products for select to authenticated
using (public.is_active_workspace_member());
create policy "permitted members can create products"
on public.products for insert to authenticated
with check (public.has_workspace_permission('create_products'));
create policy "permitted members can update products"
on public.products for update to authenticated
using (public.has_workspace_permission('edit_products'))
with check (public.has_workspace_permission('edit_products'));
create policy "permitted members can delete products"
on public.products for delete to authenticated
using (public.has_workspace_permission('edit_products'));

drop policy if exists "authenticated users can manage cost entries" on public.cost_entries;
drop policy if exists "permitted members can view cost entries" on public.cost_entries;
drop policy if exists "permitted members can add cost entries" on public.cost_entries;
drop policy if exists "permitted members can update cost entries" on public.cost_entries;
drop policy if exists "permitted members can delete cost entries" on public.cost_entries;
create policy "permitted members can view cost entries"
on public.cost_entries for select to authenticated
using (public.has_workspace_permission('view_cost_amounts'));
create policy "permitted members can add cost entries"
on public.cost_entries for insert to authenticated
with check (public.has_workspace_permission('add_costs'));
create policy "permitted members can update cost entries"
on public.cost_entries for update to authenticated
using (public.has_workspace_permission('edit_costs'))
with check (public.has_workspace_permission('edit_costs'));
create policy "permitted members can delete cost entries"
on public.cost_entries for delete to authenticated
using (public.has_workspace_permission('delete_costs'));

drop policy if exists "authenticated users can upload product images" on storage.objects;
drop policy if exists "authenticated users can view product images" on storage.objects;
drop policy if exists "authenticated users can update product images" on storage.objects;
drop policy if exists "authenticated users can delete product images" on storage.objects;
drop policy if exists "active members can view product images" on storage.objects;
create policy "active members can view product images"
on storage.objects for select to authenticated
using (
  bucket_id = 'product-images'
  and public.is_active_workspace_member()
);
create policy "permitted members can upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and public.has_workspace_permission('manage_images')
);
create policy "permitted members can update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and public.has_workspace_permission('manage_images')
)
with check (
  bucket_id = 'product-images'
  and public.has_workspace_permission('manage_images')
);
create policy "permitted members can delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and public.has_workspace_permission('manage_images')
);
