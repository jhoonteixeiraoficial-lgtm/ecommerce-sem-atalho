begin;

select plan(26);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000901', 'learning-admin@test.local'),
  ('00000000-0000-0000-0000-000000000902', 'learning-inactive-admin@test.local'),
  ('00000000-0000-0000-0000-000000000903', 'learning-progress@test.local');

update public.user_roles
set role = 'admin'
where user_id in (
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000902'
);

update public.account_status
set status = 'banned', reason = 'Inactive admin fixture'
where user_id = '00000000-0000-0000-0000-000000000902';

select has_function(
  'public',
  'admin_learning_action',
  array['uuid', 'text', 'text', 'uuid', 'uuid', 'text', 'text', 'text', 'text', 'integer', 'integer', 'boolean', 'timestamp with time zone', 'boolean'],
  'learning action RPC has one fixed explicit signature'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.admin_learning_action(uuid,text,text,uuid,uuid,text,text,text,text,integer,integer,boolean,timestamp with time zone,boolean)',
    'EXECUTE'
  ),
  'service role can execute the learning action RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_learning_action(uuid,text,text,uuid,uuid,text,text,text,text,integer,integer,boolean,timestamp with time zone,boolean)',
    'EXECUTE'
  ) and not has_function_privilege(
    'authenticated',
    'public.admin_learning_action(uuid,text,text,uuid,uuid,text,text,text,text,integer,integer,boolean,timestamp with time zone,boolean)',
    'EXECUTE'
  ),
  'browser roles cannot execute the learning action RPC'
);

select is(
  (
    select proconfig
    from pg_catalog.pg_proc
    where oid = 'public.admin_learning_action(uuid,text,text,uuid,uuid,text,text,text,text,integer,integer,boolean,timestamp with time zone,boolean)'::regprocedure
  ),
  array['search_path=""'],
  'learning action RPC has a fixed empty search path'
);

select ok(
  has_table_privilege('service_role', 'public.courses', 'SELECT')
    and has_table_privilege('service_role', 'public.modules', 'SELECT')
    and has_table_privilege('service_role', 'public.lessons', 'SELECT')
    and not has_table_privilege('service_role', 'public.courses', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('service_role', 'public.modules', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('service_role', 'public.lessons', 'INSERT,UPDATE,DELETE'),
  'service role has read-only direct metadata access'
);

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000902', 'course', 'create', null, null,
      'blocked-course', 'Blocked course', '', null, null, 0, false, null, true
    )
  $$,
  'P0001',
  'Learning action rejected',
  'inactive canonical admins cannot mutate learning metadata'
);

select lives_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'course', 'create',
      '00000000-0000-0000-0000-000000000911', null,
      'admin-course', 'Admin course', 'Course description', null, null, 0, false, null, true
    )
  $$,
  'active canonical admins can create a course'
);

select is(
  (select title from public.courses where id = '00000000-0000-0000-0000-000000000911'),
  'Admin course',
  'course create stores exact metadata'
);

select is(
  (
    select count(*)::integer
    from public.admin_audit_log
    where actor_user_id = '00000000-0000-0000-0000-000000000901'
      and action = 'learning.course.created'
      and metadata ->> 'entity_id' = '00000000-0000-0000-0000-000000000911'
  ),
  1,
  'course create appends exactly one audit row'
);

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'course', null,
      '00000000-0000-0000-0000-000000000911', null,
      null, null, null, null, null, null, null, null, false
    )
  $$,
  'P0001',
  'Learning action rejected',
  'null actions cannot fall through to a mutation branch'
);

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'course', 'create', null, null,
      'admin-course', 'Duplicate course', '', null, null, 1, false, null, true
    )
  $$,
  'P0002',
  'Learning action conflict',
  'duplicate course slugs are controlled conflicts'
);

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'module', 'create', null,
      '00000000-0000-0000-0000-000000000999', 'missing-parent', 'Missing parent', '',
      null, null, 0, false, null, true
    )
  $$,
  'P0001',
  'Learning action rejected',
  'module creation requires an existing course parent'
);

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'module', 'create',
      '00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000911',
      'published-child', 'Published child', '', null, null, 0, true, null, true
    )
  $$,
  'P0002',
  'Learning action conflict',
  'published modules require a published course'
);

select lives_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'course', 'update',
      '00000000-0000-0000-0000-000000000911', null,
      null, null, null, null, null, null, true, null, false
    )
  $$,
  'course publication can be updated'
);

select lives_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'module', 'create',
      '00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000911',
      'admin-module', 'Admin module', '', null, null, 0, true, null, true
    )
  $$,
  'a published module can be created under a published course'
);

select lives_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'lesson', 'create',
      '00000000-0000-0000-0000-000000000913', '00000000-0000-0000-0000-000000000912',
      'admin-lesson', 'Admin lesson', '', 'https://video.example.test/watch/1', 300, 0, true, null, true
    )
  $$,
  'a lesson can be created with transitional HTTPS metadata'
);

select is(
  (
    select video_url || ':' || duration_seconds::text
    from public.lessons
    where id = '00000000-0000-0000-0000-000000000913'
  ),
  'https://video.example.test/watch/1:300',
  'lesson create stores exact video and duration metadata'
);

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'module', 'update',
      '00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000911',
      null, 'Moved module', null, null, null, null, null, null, false
    )
  $$,
  'P0001',
  'Learning action rejected',
  'updates reject immutable parent IDs'
);

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'course', 'update',
      '00000000-0000-0000-0000-000000000911', null,
      null, null, null, null, null, null, false, null, false
    )
  $$,
  'P0002',
  'Learning action conflict',
  'a course with published modules cannot be unpublished'
);

reset role;

insert into public.lesson_progress (user_id, lesson_id, position_seconds)
values (
  '00000000-0000-0000-0000-000000000903',
  '00000000-0000-0000-0000-000000000913',
  10
);

set local role service_role;

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'lesson', 'delete',
      '00000000-0000-0000-0000-000000000913', null,
      null, null, null, null, null, null, null, null, false
    )
  $$,
  'P0002',
  'Learning action conflict',
  'lessons with progress cannot be deleted'
);

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'module', 'delete',
      '00000000-0000-0000-0000-000000000912', null,
      null, null, null, null, null, null, null, null, false
    )
  $$,
  'P0002',
  'Learning action conflict',
  'modules containing progress cannot be deleted'
);

reset role;

create function pg_temp.reject_learning_audit()
returns trigger
language plpgsql
as $$
begin
  if new.action = 'learning.course.updated' then
    raise exception 'forced learning audit failure';
  end if;
  return new;
end;
$$;

create trigger reject_learning_audit
before insert on public.admin_audit_log
for each row execute function pg_temp.reject_learning_audit();

set local role service_role;

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'course', 'update',
      '00000000-0000-0000-0000-000000000911', null,
      null, 'Rolled back title', null, null, null, null, null, null, false
    )
  $$,
  'P0001',
  'forced learning audit failure',
  'audit insertion failure aborts the metadata transaction'
);

select is(
  (select title from public.courses where id = '00000000-0000-0000-0000-000000000911'),
  'Admin course',
  'metadata update rolls back when audit insertion fails'
);

reset role;
drop trigger reject_learning_audit on public.admin_audit_log;

delete from public.lesson_progress where lesson_id = '00000000-0000-0000-0000-000000000913';

set local role service_role;

select lives_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'lesson', 'delete',
      '00000000-0000-0000-0000-000000000913', null,
      null, null, null, null, null, null, null, null, false
    )
  $$,
  'lesson deletion succeeds after progress is absent'
);

select is(
  (
    select count(*)::integer
    from public.admin_audit_log
    where actor_user_id = '00000000-0000-0000-0000-000000000901'
      and action = 'learning.lesson.deleted'
      and metadata ->> 'entity_id' = '00000000-0000-0000-0000-000000000913'
  ),
  1,
  'successful deletion appends exactly one audit row'
);

select throws_ok(
  $$
    select public.admin_learning_action(
      '00000000-0000-0000-0000-000000000901', 'material', 'delete',
      '00000000-0000-0000-0000-000000000913', null,
      null, null, null, null, null, null, null, null, false
    )
  $$,
  'P0001',
  'Learning action rejected',
  'unsupported entity and action combinations are rejected'
);

select * from finish();
rollback;
