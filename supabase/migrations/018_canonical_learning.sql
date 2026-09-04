begin;

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default false,
  release_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_sort_order_check check (sort_order >= 0)
);

alter table public.modules
  add column if not exists course_id uuid,
  add column if not exists release_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.modules
set updated_at = created_at
where updated_at is null;

alter table public.modules
  alter column updated_at set default now(),
  alter column updated_at set not null;

insert into public.courses (slug, title, description, sort_order, is_published)
select
  'legacy-course',
  'Legacy Course',
  'Course created for learning content that predates canonical courses.',
  0,
  true
where exists (
  select 1 from public.modules where course_id is null
)
on conflict (slug) do nothing;

update public.modules
set course_id = (
  select id from public.courses where slug = 'legacy-course'
)
where course_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.modules'::regclass
      and conname = 'modules_course_id_fkey'
  ) then
    alter table public.modules
      add constraint modules_course_id_fkey
      foreign key (course_id) references public.courses(id) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.modules'::regclass
      and conname = 'modules_sort_order_check'
  ) then
    alter table public.modules
      add constraint modules_sort_order_check check (sort_order >= 0);
  end if;
end
$$;

alter table public.modules alter column course_id set not null;

alter table public.lessons
  add column if not exists duration_seconds integer,
  add column if not exists release_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.lessons
set duration_seconds = duration_minutes * 60
where duration_seconds is null;

update public.lessons
set updated_at = created_at
where updated_at is null;

alter table public.lessons
  alter column duration_seconds set default 0,
  alter column duration_seconds set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.lessons'::regclass
      and conname = 'lessons_sort_order_check'
  ) then
    alter table public.lessons
      add constraint lessons_sort_order_check check (sort_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.lessons'::regclass
      and conname = 'lessons_duration_seconds_check'
  ) then
    alter table public.lessons
      add constraint lessons_duration_seconds_check check (duration_seconds >= 0);
  end if;
end
$$;

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  position_seconds integer not null default 0,
  started_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_progress_position_seconds_check check (position_seconds >= 0),
  constraint lesson_progress_completion_check check (
    (completed and completed_at is not null)
    or (not completed and completed_at is null)
  ),
  constraint lesson_progress_user_id_lesson_id_key unique (user_id, lesson_id)
);

insert into public.lesson_progress (
  id,
  user_id,
  lesson_id,
  position_seconds,
  started_at,
  last_viewed_at,
  completed,
  completed_at,
  created_at,
  updated_at
)
select
  progress.id,
  progress.user_id,
  progress.lesson_id,
  0,
  progress.created_at,
  coalesce(progress.completed_at, progress.created_at),
  progress.completed,
  progress.completed_at,
  progress.created_at,
  coalesce(progress.completed_at, progress.created_at)
from public.user_progress as progress
where progress.completed
on conflict (user_id, lesson_id) do nothing;

create index if not exists modules_course_id_idx on public.modules(course_id);
create index if not exists lesson_progress_user_id_idx on public.lesson_progress(user_id);
create index if not exists lesson_progress_lesson_id_idx on public.lesson_progress(lesson_id);
create index if not exists lesson_progress_last_viewed_at_idx on public.lesson_progress(last_viewed_at desc);

alter table public.courses enable row level security;
alter table public.lesson_progress enable row level security;

drop policy if exists "modules_select_active_members" on public.modules;
drop policy if exists "modules_admin_all" on public.modules;
drop policy if exists "lessons_select_active_members" on public.lessons;
drop policy if exists "lessons_admin_all" on public.lessons;
drop policy if exists "progress_select_own" on public.user_progress;
drop policy if exists "progress_insert_own" on public.user_progress;
drop policy if exists "progress_update_own" on public.user_progress;

drop policy if exists "courses_select_members" on public.courses;
create policy "courses_select_members"
  on public.courses for select
  to authenticated
  using (
    public.has_member_access()
    and is_published
    and coalesce(release_at, '-infinity'::timestamptz) <= now()
  );

create policy "modules_select_active_members"
  on public.modules for select
  to authenticated
  using (
    public.has_member_access()
    and is_published
    and coalesce(release_at, '-infinity'::timestamptz) <= now()
    and exists (
      select 1
      from public.courses
      where courses.id = modules.course_id
        and courses.is_published
        and coalesce(courses.release_at, '-infinity'::timestamptz) <= now()
    )
  );

create policy "lessons_select_active_members"
  on public.lessons for select
  to authenticated
  using (
    public.has_member_access()
    and is_published
    and coalesce(release_at, '-infinity'::timestamptz) <= now()
    and exists (
      select 1
      from public.modules
      join public.courses on courses.id = modules.course_id
      where modules.id = lessons.module_id
        and modules.is_published
        and coalesce(modules.release_at, '-infinity'::timestamptz) <= now()
        and courses.is_published
        and coalesce(courses.release_at, '-infinity'::timestamptz) <= now()
    )
  );

drop policy if exists "lesson_progress_select_own" on public.lesson_progress;
create policy "lesson_progress_select_own"
  on public.lesson_progress for select
  to authenticated
  using (
    auth.uid() = user_id
    and public.has_member_access()
    and exists (
      select 1
      from public.lessons
      join public.modules on modules.id = lessons.module_id
      join public.courses on courses.id = modules.course_id
      where lessons.id = lesson_progress.lesson_id
        and lessons.is_published
        and coalesce(lessons.release_at, '-infinity'::timestamptz) <= now()
        and modules.is_published
        and coalesce(modules.release_at, '-infinity'::timestamptz) <= now()
        and courses.is_published
        and coalesce(courses.release_at, '-infinity'::timestamptz) <= now()
    )
  );

create policy "progress_select_own"
  on public.user_progress for select
  to authenticated
  using (
    auth.uid() = user_id
    and public.has_member_access()
    and exists (
      select 1
      from public.lessons
      join public.modules on modules.id = lessons.module_id
      join public.courses on courses.id = modules.course_id
      where lessons.id = user_progress.lesson_id
        and lessons.is_published
        and coalesce(lessons.release_at, '-infinity'::timestamptz) <= now()
        and modules.is_published
        and coalesce(modules.release_at, '-infinity'::timestamptz) <= now()
        and courses.is_published
        and coalesce(courses.release_at, '-infinity'::timestamptz) <= now()
    )
  );

revoke all on table public.courses from public, anon, authenticated, service_role;
revoke all on table public.modules from public, anon, authenticated, service_role;
revoke all on table public.lessons from public, anon, authenticated, service_role;
revoke all on table public.lesson_progress from public, anon, authenticated, service_role;
revoke all on table public.user_progress from public, anon, authenticated, service_role;

grant select on table public.courses, public.modules, public.lessons, public.lesson_progress, public.user_progress
  to authenticated, service_role;
grant insert, update, delete on table public.courses, public.modules, public.lessons, public.lesson_progress
  to service_role;

commit;
