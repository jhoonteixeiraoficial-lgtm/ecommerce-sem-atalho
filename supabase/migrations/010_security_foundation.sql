-- Canonical authorization state. Legacy profile and subscription values are
-- deliberately not copied into these trusted tables.
do $$
begin
  create type public.app_role as enum ('member', 'admin');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.account_state as enum ('active', 'suspended', 'banned');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status public.account_state not null default 'active',
  reason text not null default '',
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_status_suspension_end_check
    check (status = 'suspended' or suspended_until is null)
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  action text not null check (char_length(action) between 3 and 100),
  target_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
alter table public.account_status enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on table public.user_roles from public, anon, authenticated;
revoke all on table public.account_status from public, anon, authenticated;
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select, insert, update on table public.user_roles to service_role;
grant select, insert, update on table public.account_status to service_role;
grant select, insert on table public.admin_audit_log to service_role;

-- Browser clients may edit presentation fields, but never legacy authority.
revoke insert, update on table public.profiles from anon, authenticated;
grant update (full_name, email, phone, avatar_url, updated_at)
  on table public.profiles to authenticated;
revoke insert, update, delete on table public.subscriptions from anon, authenticated;

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_safe_own" on public.profiles;
create policy "profiles_update_safe_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "subscriptions_service_update" on public.subscriptions;
drop policy if exists "subscriptions_service_insert" on public.subscriptions;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as roles
    join public.account_status as states on states.user_id = roles.user_id
    where roles.user_id = auth.uid()
      and roles.role = 'admin'::public.app_role
      and states.status = 'active'::public.account_state
  );
$$;

create or replace function public.has_member_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as roles
    join public.account_status as states on states.user_id = roles.user_id
    where roles.user_id = auth.uid()
      and states.status = 'active'::public.account_state
      and (
        roles.role = 'admin'::public.app_role
        or exists (
          select 1
          from public.subscriptions as subscriptions
          where subscriptions.user_id = roles.user_id
            and subscriptions.status = 'active'::public.subscription_status
            -- A missing paid-through date cannot prove current entitlement.
            and subscriptions.current_period_end is not null
            and subscriptions.current_period_end >= statement_timestamp()
        )
      )
  );
$$;

-- Existing policies and callers use this name. Keep it fail-closed by routing
-- it through the canonical member-access decision.
create or replace function public.has_active_subscription()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_member_access();
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.has_member_access() from public, anon, authenticated;
revoke all on function public.has_active_subscription() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_member_access() to authenticated;
grant execute on function public.has_active_subscription() to authenticated;

insert into public.user_roles (user_id, role)
select id, 'member'::public.app_role
from auth.users
on conflict (user_id) do nothing;

insert into public.account_status (user_id, status)
select id, 'active'::public.account_state
from auth.users
on conflict (user_id) do nothing;

create or replace function public.handle_new_user_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'member'::public.app_role)
  on conflict (user_id) do nothing;

  insert into public.account_status (user_id, status)
  values (new.id, 'active'::public.account_state)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user_authorization() from public, anon, authenticated;

drop trigger if exists on_auth_user_authorization_created on auth.users;
create trigger on_auth_user_authorization_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user_authorization();

-- Replace every surviving policy that treats legacy profile roles or an
-- undated active subscription as authority.
drop policy if exists "subscriptions_admin_select_all" on public.subscriptions;
create policy "subscriptions_admin_select_all"
  on public.subscriptions for select
  to authenticated
  using (public.is_admin());

drop policy if exists "modules_select_active_members" on public.modules;
create policy "modules_select_active_members"
  on public.modules for select
  to authenticated
  using (is_published = true and public.has_member_access());
drop policy if exists "modules_admin_all" on public.modules;
create policy "modules_admin_all"
  on public.modules for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "lessons_select_active_members" on public.lessons;
create policy "lessons_select_active_members"
  on public.lessons for select
  to authenticated
  using (is_published = true and public.has_member_access());
drop policy if exists "lessons_admin_all" on public.lessons;
create policy "lessons_admin_all"
  on public.lessons for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "materials_select_active_members" on public.materials;
create policy "materials_select_active_members"
  on public.materials for select
  to authenticated
  using (is_premium = false or public.has_member_access());
drop policy if exists "materials_admin_all" on public.materials;
create policy "materials_admin_all"
  on public.materials for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "lives_select_active_members" on public.lives;
create policy "lives_select_active_members"
  on public.lives for select
  to authenticated
  using (public.has_member_access());
drop policy if exists "lives_admin_all" on public.lives;
create policy "lives_admin_all"
  on public.lives for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "videos_select_active" on storage.objects;
create policy "videos_select_active"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'course-videos' and public.has_member_access());
drop policy if exists "videos_insert_admin" on storage.objects;
create policy "videos_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'course-videos' and public.is_admin());
drop policy if exists "videos_delete_admin" on storage.objects;
create policy "videos_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'course-videos' and public.is_admin());

drop policy if exists "materials_select_active" on storage.objects;
create policy "materials_select_active"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'course-materials' and public.has_member_access());
drop policy if exists "materials_insert_admin" on storage.objects;
create policy "materials_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'course-materials' and public.is_admin());
drop policy if exists "materials_delete_admin" on storage.objects;
create policy "materials_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'course-materials' and public.is_admin());
