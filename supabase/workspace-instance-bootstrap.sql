alter table public.workspace_settings
add column if not exists initial_admin_email text;

update public.workspace_settings
set initial_admin_email = (
  select email
  from public.workspace_members
  where role = 'admin' and status = 'active'
  order by created_at
  limit 1
)
where id = true
  and initial_admin_email is null;

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
  existing_admin_email text;
begin
  if normalized_email = '' or position('@' in normalized_email) = 0 then
    raise exception 'A valid initial administrator email is required';
  end if;
  if length(trim(initial_store_name)) = 0 then
    raise exception 'Store name is required';
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

revoke execute on function public.bootstrap_workspace(text, text)
from public, anon, authenticated;
grant execute on function public.bootstrap_workspace(text, text)
to service_role;

revoke execute on function public.handle_new_workspace_user()
from public, anon, authenticated;
