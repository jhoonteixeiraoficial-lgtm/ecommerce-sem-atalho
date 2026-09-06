begin;

-- Drop the existing function (same signature required) to add p_thumbnail_url
-- and relax p_duration_seconds NOT NULL for lesson creation.
drop function public.admin_learning_action(
  uuid, text, text, uuid, uuid, text, text, text, text, integer, integer, boolean, timestamptz, boolean
);

create function public.admin_learning_action(
  p_actor_user_id uuid,
  p_entity text,
  p_action text,
  p_entity_id uuid,
  p_parent_id uuid,
  p_slug text,
  p_title text,
  p_description text,
  p_video_url text,
  p_duration_seconds integer,
  p_sort_order integer,
  p_is_published boolean,
  p_release_at timestamptz,
  p_release_at_set boolean,
  p_thumbnail_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  target_found boolean;
  current_parent_id uuid;
  current_course_id uuid;
  current_published boolean;
  desired_published boolean;
  parent_published boolean;
  course_published boolean;
  module_published boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(194964823, 1);

  if auth.role() is distinct from 'service_role'
    or p_release_at_set is null
    or p_entity is null
    or p_action is null
    or p_entity not in ('course', 'module', 'lesson')
    or p_action not in ('create', 'update', 'delete')
    or not exists (
      select 1
      from public.user_roles as roles
      join public.account_status as states using (user_id)
      where roles.user_id = p_actor_user_id
        and roles.role = 'admin'::public.app_role
        and states.status = 'active'::public.account_state
    )
  then
    raise exception using errcode = 'P0001', message = 'Learning action rejected';
  end if;

  if p_action = 'create' then
    if p_slug is null
      or p_title is null
      or p_description is null
      or p_sort_order is null
      or p_is_published is null
      or not p_release_at_set
      or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or pg_catalog.char_length(p_slug) not between 1 and 100
      or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 200
      or pg_catalog.char_length(pg_catalog.btrim(p_description)) > 5000
      or p_sort_order not between 0 and 1000000
      or (p_entity = 'course' and (p_parent_id is not null or p_video_url is not null or p_duration_seconds is not null))
      or (p_entity = 'module' and (p_parent_id is null or p_video_url is not null or p_duration_seconds is not null))
      or (p_entity = 'lesson' and (
        p_parent_id is null
        or p_video_url is null
        or pg_catalog.char_length(p_video_url) > 2048
        or (p_video_url <> '' and p_video_url !~ '^https://[^[:space:]]+$')
      ))
    then
      raise exception using errcode = 'P0001', message = 'Learning action rejected';
    end if;

    target_id := coalesce(p_entity_id, gen_random_uuid());

    if p_entity = 'course' then
      if exists (select 1 from public.courses where slug = p_slug) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;

      insert into public.courses (
        id, slug, title, description, sort_order, is_published, release_at
      ) values (
        target_id, p_slug, pg_catalog.btrim(p_title), pg_catalog.btrim(p_description),
        p_sort_order, p_is_published, p_release_at
      );
    elsif p_entity = 'module' then
      select courses.is_published
      into parent_published
      from public.courses
      where courses.id = p_parent_id
      for update;

      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;
      if p_is_published and not parent_published then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;
      if exists (select 1 from public.modules where slug = p_slug) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;

      insert into public.modules (
        id, course_id, slug, title, description, sort_order, is_published, release_at
      ) values (
        target_id, p_parent_id, p_slug, pg_catalog.btrim(p_title), pg_catalog.btrim(p_description),
        p_sort_order, p_is_published, p_release_at
      );
    else
      select modules.course_id
      into current_course_id
      from public.modules
      where modules.id = p_parent_id;

      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;

      select courses.is_published
      into course_published
      from public.courses
      where courses.id = current_course_id
      for update;

      select modules.is_published
      into module_published
      from public.modules
      where modules.id = p_parent_id
        and modules.course_id = current_course_id
      for update;

      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;
      parent_published := course_published and module_published;
      if p_is_published and not parent_published then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;
      if exists (
        select 1 from public.lessons where module_id = p_parent_id and slug = p_slug
      ) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;

      insert into public.lessons (
        id, module_id, slug, title, description, video_url, duration_seconds,
        sort_order, is_published, release_at, thumbnail_url
      ) values (
        target_id, p_parent_id, p_slug, pg_catalog.btrim(p_title), pg_catalog.btrim(p_description),
        p_video_url, coalesce(p_duration_seconds, 0), p_sort_order, p_is_published, p_release_at,
        p_thumbnail_url
      );
    end if;
  elsif p_action = 'update' then
    if p_entity_id is null
      or p_parent_id is not null
      or (p_slug is null and p_title is null and p_description is null and p_video_url is null
        and p_duration_seconds is null and p_sort_order is null and p_is_published is null
        and not p_release_at_set and p_thumbnail_url is null)
      or (p_slug is not null and (
        p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        or pg_catalog.char_length(p_slug) not between 1 and 100
      ))
      or (p_title is not null and pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 1 and 200)
      or (p_description is not null and pg_catalog.char_length(pg_catalog.btrim(p_description)) > 5000)
      or (p_sort_order is not null and p_sort_order not between 0 and 1000000)
      or (p_entity <> 'lesson' and (p_video_url is not null or p_duration_seconds is not null))
      or (p_video_url is not null and (
        pg_catalog.char_length(p_video_url) > 2048
        or (p_video_url <> '' and p_video_url !~ '^https://[^[:space:]]+$')
      ))
      or (p_duration_seconds is not null and p_duration_seconds not between 0 and 86400)
    then
      raise exception using errcode = 'P0001', message = 'Learning action rejected';
    end if;

    target_id := p_entity_id;

    if p_entity = 'course' then
      select true, courses.is_published
      into target_found, current_published
      from public.courses
      where courses.id = target_id
      for update;

      if not coalesce(target_found, false) then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;
      desired_published := coalesce(p_is_published, current_published);
      if not desired_published and exists (
        select 1 from public.modules where course_id = target_id and is_published
      ) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;
      if p_slug is not null and exists (
        select 1 from public.courses where slug = p_slug and id <> target_id
      ) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;

      update public.courses
      set slug = coalesce(p_slug, slug),
          title = coalesce(pg_catalog.btrim(p_title), title),
          description = coalesce(pg_catalog.btrim(p_description), description),
          sort_order = coalesce(p_sort_order, sort_order),
          is_published = desired_published,
          release_at = case when p_release_at_set then p_release_at else release_at end,
          updated_at = pg_catalog.statement_timestamp()
      where id = target_id;
    elsif p_entity = 'module' then
      select modules.course_id
      into current_parent_id
      from public.modules
      where modules.id = target_id;

      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;

      select courses.is_published
      into parent_published
      from public.courses
      where courses.id = current_parent_id
      for update;

      select true, modules.is_published
      into target_found, current_published
      from public.modules
      where modules.id = target_id
        and modules.course_id = current_parent_id
      for update;

      if not coalesce(target_found, false) then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;
      desired_published := coalesce(p_is_published, current_published);

      if desired_published and not coalesce(parent_published, false) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;
      if not desired_published and exists (
        select 1 from public.lessons where module_id = target_id and is_published
      ) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;
      if p_slug is not null and exists (
        select 1 from public.modules where slug = p_slug and id <> target_id
      ) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;

      update public.modules
      set slug = coalesce(p_slug, slug),
          title = coalesce(pg_catalog.btrim(p_title), title),
          description = coalesce(pg_catalog.btrim(p_description), description),
          sort_order = coalesce(p_sort_order, sort_order),
          is_published = desired_published,
          release_at = case when p_release_at_set then p_release_at else release_at end,
          updated_at = pg_catalog.statement_timestamp()
      where id = target_id;
    else
      select lessons.module_id
      into current_parent_id
      from public.lessons
      where lessons.id = target_id;

      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;

      select modules.course_id
      into current_course_id
      from public.modules
      where modules.id = current_parent_id;

      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;

      select courses.is_published
      into course_published
      from public.courses
      where courses.id = current_course_id
      for update;

      select modules.is_published
      into module_published
      from public.modules
      where modules.id = current_parent_id
        and modules.course_id = current_course_id
      for update;

      select true, lessons.is_published
      into target_found, current_published
      from public.lessons
      where lessons.id = target_id
        and lessons.module_id = current_parent_id
      for update;

      if not coalesce(target_found, false) then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;
      desired_published := coalesce(p_is_published, current_published);
      parent_published := course_published and module_published;

      if desired_published and not coalesce(parent_published, false) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;
      if p_slug is not null and exists (
        select 1 from public.lessons
        where module_id = current_parent_id and slug = p_slug and id <> target_id
      ) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;

      update public.lessons
      set slug = coalesce(p_slug, slug),
          title = coalesce(pg_catalog.btrim(p_title), title),
          description = coalesce(pg_catalog.btrim(p_description), description),
          video_url = coalesce(p_video_url, video_url),
          duration_seconds = coalesce(p_duration_seconds, duration_seconds),
          sort_order = coalesce(p_sort_order, sort_order),
          is_published = desired_published,
          release_at = case when p_release_at_set then p_release_at else release_at end,
          thumbnail_url = coalesce(p_thumbnail_url, thumbnail_url),
          updated_at = pg_catalog.statement_timestamp()
      where id = target_id;
    end if;
  else
    if p_entity_id is null
      or p_parent_id is not null
      or p_slug is not null
      or p_title is not null
      or p_description is not null
      or p_video_url is not null
      or p_duration_seconds is not null
      or p_sort_order is not null
      or p_is_published is not null
      or p_release_at is not null
      or p_release_at_set
      or p_thumbnail_url is not null
    then
      raise exception using errcode = 'P0001', message = 'Learning action rejected';
    end if;

    target_id := p_entity_id;

    if p_entity = 'course' then
      perform 1 from public.courses where id = target_id for update;
      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;

      perform 1
      from public.modules
      where course_id = target_id
      order by id
      for update;

      perform 1
      from public.lessons
      join public.modules on modules.id = lessons.module_id
      where modules.course_id = target_id
      order by lessons.id
      for update of lessons;

      if exists (select 1 from public.modules where course_id = target_id)
        or exists (
          select 1
          from public.lesson_progress
          join public.lessons on lessons.id = lesson_progress.lesson_id
          join public.modules on modules.id = lessons.module_id
          where modules.course_id = target_id
        )
      then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;
      delete from public.courses where id = target_id;
    elsif p_entity = 'module' then
      select modules.course_id
      into current_course_id
      from public.modules
      where modules.id = target_id;

      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;

      perform 1 from public.courses where id = current_course_id for update;
      perform 1
      from public.modules
      where id = target_id and course_id = current_course_id
      for update;
      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;

      perform 1
      from public.lessons
      where module_id = target_id
      order by id
      for update;

      if exists (
        select 1
        from public.lesson_progress
        join public.lessons on lessons.id = lesson_progress.lesson_id
        where lessons.module_id = target_id
      ) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;
      delete from public.modules where id = target_id;
    else
      select lessons.module_id
      into current_parent_id
      from public.lessons
      where lessons.id = target_id;

      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;

      select modules.course_id
      into current_course_id
      from public.modules
      where modules.id = current_parent_id;

      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;

      perform 1 from public.courses where id = current_course_id for update;
      perform 1
      from public.modules
      where id = current_parent_id and course_id = current_course_id
      for update;
      perform 1
      from public.lessons
      where id = target_id and module_id = current_parent_id
      for update;
      if not found then
        raise exception using errcode = 'P0001', message = 'Learning action rejected';
      end if;

      if exists (select 1 from public.lesson_progress where lesson_id = target_id) then
        raise exception using errcode = 'P0002', message = 'Learning action conflict';
      end if;
      delete from public.lessons where id = target_id;
    end if;
  end if;

  insert into public.admin_audit_log (actor_user_id, action, metadata)
  values (
    p_actor_user_id,
    'learning.' || p_entity || '.' || case p_action
      when 'create' then 'created'
      when 'update' then 'updated'
      else 'deleted'
    end,
    pg_catalog.jsonb_build_object('entity', p_entity, 'entity_id', target_id)
  );

  return target_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0002', message = 'Learning action conflict';
  when foreign_key_violation or check_violation or not_null_violation then
    raise exception using errcode = 'P0001', message = 'Learning action rejected';
end;
$$;

alter function public.admin_learning_action(
  uuid, text, text, uuid, uuid, text, text, text, text, integer, integer, boolean, timestamptz, boolean, text
) owner to postgres;

revoke all on function public.admin_learning_action(
  uuid, text, text, uuid, uuid, text, text, text, text, integer, integer, boolean, timestamptz, boolean, text
) from public, anon, authenticated, service_role;

grant execute on function public.admin_learning_action(
  uuid, text, text, uuid, uuid, text, text, text, text, integer, integer, boolean, timestamptz, boolean, text
) to service_role;

commit;
