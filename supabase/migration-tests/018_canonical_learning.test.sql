begin;

select plan(5);

select is(
  (select id from public.modules where slug = 'pre-018-module'),
  '00000000-0000-0000-0000-000000000902'::uuid,
  'migration 018 preserves the legacy module ID'
);
select is(
  (select id from public.lessons where slug = 'pre-018-lesson'),
  '00000000-0000-0000-0000-000000000903'::uuid,
  'migration 018 preserves the legacy lesson ID'
);
select is(
  (
    select count(*)::integer
    from public.courses as courses
    join public.modules as modules on modules.course_id = courses.id
    where modules.id = '00000000-0000-0000-0000-000000000902'
  ),
  1,
  'migration 018 creates one default course for an orphan legacy module'
);
select is(
  (select duration_seconds from public.lessons where id = '00000000-0000-0000-0000-000000000903'),
  420,
  'migration 018 converts legacy lesson minutes to seconds'
);
select is(
  (
    select id::text || ':' || user_id::text || ':' || lesson_id::text || ':' || completed::text || ':' || completed_at::text
    from public.lesson_progress
    where id = '00000000-0000-0000-0000-000000000904'
  ),
  '00000000-0000-0000-0000-000000000904:00000000-0000-0000-0000-000000000901:00000000-0000-0000-0000-000000000903:true:2026-08-03 10:00:00+00',
  'migration 018 preserves and copies the legacy completion'
);

select * from finish();
rollback;
