alter function public.default_workspace_permissions() set search_path = public;
alter function public.handle_updated_at() set search_path = public;

drop function if exists public.update_product_stage(uuid, text, text);
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

revoke execute on function public.is_active_workspace_member() from public, anon;
revoke execute on function public.is_workspace_admin() from public, anon;
revoke execute on function public.has_workspace_permission(text) from public, anon;
revoke execute on function public.handle_new_workspace_user() from public, anon, authenticated;
revoke execute on function public.admin_update_workspace_name(text) from anon;
revoke execute on function public.admin_update_member(uuid, text, text, jsonb) from anon;
revoke execute on function public.reschedule_drop_day(uuid, date) from anon;
revoke execute on function public.reschedule_product(uuid, date, date) from anon;
revoke execute on function public.update_product_stage(uuid, text) from public, anon;
revoke execute on function public.update_drop_metadata(uuid, text) from anon;
revoke execute on function public.set_product_image_path(uuid, text) from anon;
revoke execute on function public.get_product_cost_totals() from anon;
grant execute on function public.update_product_stage(uuid, text) to authenticated;
grant execute on function public.is_active_workspace_member() to authenticated;
grant execute on function public.is_workspace_admin() to authenticated;
grant execute on function public.has_workspace_permission(text) to authenticated;

drop policy if exists "authenticated users can view product images" on storage.objects;

create index if not exists workspace_members_invited_by_idx
on public.workspace_members(invited_by);
create index if not exists workspace_invitations_invited_by_idx
on public.workspace_invitations(invited_by);
create index if not exists workspace_settings_updated_by_idx
on public.workspace_settings(updated_by);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_members'
  ) then
    alter publication supabase_realtime add table public.workspace_members;
  end if;
end;
$$;

drop policy if exists "members can view self and admins can view all"
on public.workspace_members;
create policy "members can view self and admins can view all"
on public.workspace_members for select to authenticated
using (user_id = (select auth.uid()) or public.is_workspace_admin());

drop policy if exists "admins can create invitations"
on public.workspace_invitations;
create policy "admins can create invitations"
on public.workspace_invitations for insert to authenticated
with check (public.is_workspace_admin() and invited_by = (select auth.uid()));
