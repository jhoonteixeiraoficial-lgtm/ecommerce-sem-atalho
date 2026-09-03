begin;

create table public.community_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.community_profiles enable row level security;
revoke all on table public.community_profiles from public, anon, authenticated, service_role;
grant select on table public.community_profiles to authenticated, service_role;

create policy "community_profiles_select_members"
  on public.community_profiles for select
  to authenticated
  using (public.has_member_access());

create function public.sync_community_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.community_profiles (id, full_name, avatar_url, created_at, updated_at)
  values (
    new.id,
    coalesce(new.full_name, ''),
    coalesce(new.avatar_url, ''),
    new.created_at,
    new.updated_at
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at;

  return new;
end;
$$;

alter function public.sync_community_profile() owner to postgres;
revoke all on function public.sync_community_profile() from public, anon, authenticated, service_role;

-- Block profile writers while synchronization is installed and existing rows
-- are reconciled. Writers resume after commit with the trigger already active.
lock table public.profiles in share row exclusive mode;

create trigger on_profile_community_fields_changed
  after insert or update of full_name, avatar_url, updated_at on public.profiles
  for each row
  execute function public.sync_community_profile();

insert into public.community_profiles (id, full_name, avatar_url, created_at, updated_at)
select id, coalesce(full_name, ''), coalesce(avatar_url, ''), created_at, updated_at
from public.profiles
on conflict (id) do update
set full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = excluded.updated_at;

drop policy if exists "profiles_select_members" on public.profiles;
drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

commit;
