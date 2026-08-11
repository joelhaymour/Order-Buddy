alter table public.cost_entries
drop constraint if exists cost_entries_cost_type_check;

update public.cost_entries
set cost_type = case cost_type
  when 'freight' then 'shipping'
  when 'materials' then 'bulk'
  when 'packaging' then 'bulk'
  else cost_type
end;

alter table public.cost_entries
add constraint cost_entries_cost_type_check
check (cost_type in ('sample', 'shipping', 'duties', 'bulk', 'misc'));
