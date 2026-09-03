-- Owner admin seed. Run ONLY against production after verifying the Auth user
-- exists. This script is intentionally outside supabase/migrations/ because it
-- contains a production-specific immutable UUID and must not be auto-applied.
begin;

do $$
begin
  if not exists (
    select 1 from auth.users
    where id = 'd8c3528e-471e-4835-85a6-c9effb38fdf2'
  ) then
    raise exception 'Owner Auth user is missing; refusing to seed admin role';
  end if;
end $$;

insert into public.user_roles (user_id, role)
values ('d8c3528e-471e-4835-85a6-c9effb38fdf2', 'admin')
on conflict (user_id) do update set role = excluded.role, updated_at = now();

insert into public.account_status (user_id, status, reason)
values ('d8c3528e-471e-4835-85a6-c9effb38fdf2', 'active', '')
on conflict (user_id) do update set status = 'active', reason = '', updated_at = now();

commit;
