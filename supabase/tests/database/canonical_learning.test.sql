begin;

select plan(18);

create or replace function pg_temp.assert_learning_mutations_denied(statements text[])
returns void
language plpgsql
as $$
declare
  statement text;
  denied boolean;
begin
  foreach statement in array statements loop
    denied := false;
    begin
      execute statement;
    exception
      when insufficient_privilege then denied := true;
    end;

    if not denied then
      raise exception 'statement did not raise SQLSTATE 42501: %', statement;
    end if;
  end loop;
end;
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000801', 'learning-member@test.local'),
  ('00000000-0000-0000-0000-000000000802', 'learning-other@test.local'),
  ('00000000-0000-0000-0000-000000000803', 'learning-inactive@test.local');

update public.account_status
set status = 'suspended', suspended_until = statement_timestamp() + interval '1 day'
where user_id = '00000000-0000-0000-0000-000000000803';

insert into public.subscriptions (user_id, plan, status, current_period_end)
values
  ('00000000-0000-0000-0000-000000000801', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000802', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000803', 'comunidade', 'active', statement_timestamp() + interval '1 day');

insert into public.courses (id, slug, title, sort_order, is_published, release_at)
values
  ('00000000-0000-0000-0000-000000000811', 'released-course', 'Released course', 0, true, statement_timestamp() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000812', 'draft-course', 'Draft course', 1, false, statement_timestamp() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000813', 'future-course', 'Future course', 2, true, statement_timestamp() + interval '1 day');

insert into public.modules (id, course_id, slug, title, sort_order, is_published, release_at)
values
  ('00000000-0000-0000-0000-000000000821', '00000000-0000-0000-0000-000000000811', 'released-module', 'Released module', 0, true, null),
  ('00000000-0000-0000-0000-000000000822', '00000000-0000-0000-0000-000000000811', 'draft-module', 'Draft module', 1, false, null),
  ('00000000-0000-0000-0000-000000000823', '00000000-0000-0000-0000-000000000811', 'future-module', 'Future module', 2, true, statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000824', '00000000-0000-0000-0000-000000000812', 'draft-parent-module', 'Draft parent module', 3, true, null),
  ('00000000-0000-0000-0000-000000000825', '00000000-0000-0000-0000-000000000813', 'future-parent-module', 'Future parent module', 4, true, null);

insert into public.lessons (id, module_id, slug, title, duration_seconds, sort_order, is_published, release_at)
values
  ('00000000-0000-0000-0000-000000000831', '00000000-0000-0000-0000-000000000821', 'released-lesson', 'Released lesson', 120, 0, true, null),
  ('00000000-0000-0000-0000-000000000832', '00000000-0000-0000-0000-000000000821', 'draft-lesson', 'Draft lesson', 120, 1, false, null),
  ('00000000-0000-0000-0000-000000000833', '00000000-0000-0000-0000-000000000821', 'future-lesson', 'Future lesson', 120, 2, true, statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000834', '00000000-0000-0000-0000-000000000822', 'draft-module-lesson', 'Draft module lesson', 120, 3, true, null),
  ('00000000-0000-0000-0000-000000000835', '00000000-0000-0000-0000-000000000825', 'future-course-lesson', 'Future course lesson', 120, 4, true, null);

insert into public.lesson_progress (
  id, user_id, lesson_id, position_seconds, started_at, last_viewed_at, completed, completed_at
)
values
  (
    '00000000-0000-0000-0000-000000000841',
    '00000000-0000-0000-0000-000000000801',
    '00000000-0000-0000-0000-000000000831',
    30,
    statement_timestamp() - interval '1 hour',
    statement_timestamp(),
    false,
    null
  ),
  (
    '00000000-0000-0000-0000-000000000842',
    '00000000-0000-0000-0000-000000000801',
    '00000000-0000-0000-0000-000000000832',
    30,
    statement_timestamp() - interval '1 hour',
    statement_timestamp(),
    false,
    null
  ),
  (
    '00000000-0000-0000-0000-000000000843',
    '00000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000831',
    30,
    statement_timestamp() - interval '1 hour',
    statement_timestamp(),
    false,
    null
  );

select has_table('public', 'courses', 'canonical courses exist');
select columns_are(
  'public',
  'courses',
  array['id', 'slug', 'title', 'description', 'sort_order', 'is_published', 'release_at', 'created_at', 'updated_at'],
  'courses expose the canonical columns'
);
select columns_are(
  'public',
  'modules',
  array['id', 'slug', 'title', 'description', 'sort_order', 'is_published', 'created_at', 'course_id', 'release_at', 'updated_at'],
  'modules retain legacy columns and gain canonical ownership and timestamps'
);
select columns_are(
  'public',
  'lessons',
  array['id', 'module_id', 'slug', 'title', 'description', 'video_url', 'duration_minutes', 'sort_order', 'is_published', 'created_at', 'duration_seconds', 'release_at', 'updated_at'],
  'lessons retain transitional metadata and gain canonical duration and timestamps'
);
select columns_are(
  'public',
  'lesson_progress',
  array['id', 'user_id', 'lesson_id', 'position_seconds', 'started_at', 'last_viewed_at', 'completed', 'completed_at', 'created_at', 'updated_at'],
  'lesson progress exposes the canonical playback state'
);
select col_is_pk('public', 'lesson_progress', 'id', 'lesson progress has a stable primary key');
select col_is_fk('public', 'modules', 'course_id', 'modules belong to a course');
select col_is_fk('public', 'lesson_progress', 'lesson_id', 'lesson progress belongs to a lesson');
select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint
    where conname in (
      'courses_sort_order_check',
      'modules_sort_order_check',
      'lessons_sort_order_check',
      'lessons_duration_seconds_check',
      'lesson_progress_position_seconds_check',
      'lesson_progress_completion_check',
      'lesson_progress_user_id_lesson_id_key'
    )
      and convalidated
  ),
  7,
  'canonical ordering, duration, position, completion, and uniqueness constraints are enforced'
);
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'modules' and column_name = 'course_id')
        or (table_name = 'lessons' and column_name = 'duration_seconds')
        or (table_name = 'lesson_progress' and column_name in (
          'user_id', 'lesson_id', 'position_seconds', 'started_at', 'last_viewed_at',
          'completed', 'created_at', 'updated_at'
        ))
      )
      and is_nullable = 'NO'
  ),
  10,
  'canonical relationships and progress state require non-null values'
);

select ok(
  has_table_privilege('authenticated', 'public.courses', 'SELECT')
    and has_table_privilege('authenticated', 'public.modules', 'SELECT')
    and has_table_privilege('authenticated', 'public.lessons', 'SELECT')
    and has_table_privilege('authenticated', 'public.lesson_progress', 'SELECT')
    and has_table_privilege('authenticated', 'public.user_progress', 'SELECT')
    and not has_table_privilege('authenticated', 'public.courses', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.modules', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.lessons', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.lesson_progress', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.user_progress', 'INSERT,UPDATE,DELETE'),
  'browser roles have read-only learning privileges'
);

set local role anon;
select throws_ok(
  $$ select * from public.courses $$,
  '42501',
  null,
  'anonymous users cannot read learning metadata'
);
reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
set local role authenticated;
select is((select count(*)::integer from public.courses), 1, 'members see only published released courses');
select is((select count(*)::integer from public.modules), 1, 'module visibility checks its publication, release, and course ancestor');
select is((select count(*)::integer from public.lessons), 1, 'lesson visibility checks its publication, release, and all ancestors');
select is((select count(*)::integer from public.lesson_progress), 1, 'members see only their progress for currently accessible lessons');
select lives_ok(
  $test$
    select pg_temp.assert_learning_mutations_denied(array[
      'insert into public.courses (slug, title) values (''browser-course'', ''Browser course'')',
      'update public.modules set title = title where id = ''00000000-0000-0000-0000-000000000821''',
      'delete from public.lessons where id = ''00000000-0000-0000-0000-000000000831''',
      'insert into public.lesson_progress (user_id, lesson_id) values (auth.uid(), ''00000000-0000-0000-0000-000000000831'')',
      'update public.user_progress set completed = true where user_id = auth.uid()'
    ])
  $test$,
  'browser members cannot mutate metadata or progress'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000803', true);
set local role authenticated;
select is(
  (select count(*) from public.courses)
    + (select count(*) from public.modules)
    + (select count(*) from public.lessons)
    + (select count(*) from public.lesson_progress),
  0::bigint,
  'inactive accounts cannot read metadata or progress'
);
reset role;

select * from finish();
rollback;
