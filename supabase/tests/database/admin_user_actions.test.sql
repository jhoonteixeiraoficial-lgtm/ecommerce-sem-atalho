select plan(23);

delete from public.admin_audit_log
where actor_user_id between '00000000-0000-0000-0000-000000000201'
  and '00000000-0000-0000-0000-000000000206';

delete from auth.users
where id between '00000000-0000-0000-0000-000000000201'
  and '00000000-0000-0000-0000-000000000206';

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000201', 'action-actor@test.local'),
  ('00000000-0000-0000-0000-000000000202', 'action-target@test.local'),
  ('00000000-0000-0000-0000-000000000203', 'action-inactive@test.local'),
  ('00000000-0000-0000-0000-000000000204', 'action-spare@test.local'),
  ('00000000-0000-0000-0000-000000000205', 'race-a@test.local'),
  ('00000000-0000-0000-0000-000000000206', 'race-b@test.local');

update public.user_roles
set role = 'admin'
where user_id in (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000204'
);

update public.account_status
set status = 'banned', reason = 'Inactive actor fixture'
where user_id = '00000000-0000-0000-0000-000000000203';

select has_function(
  'public',
  'admin_user_action',
  array['uuid', 'uuid', 'text', 'app_role', 'account_state', 'text'],
  'admin action RPC has the narrow expected signature'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.admin_user_action(uuid,uuid,text,public.app_role,public.account_state,text)',
    'EXECUTE'
  ),
  'service role can execute the admin action RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.admin_user_action(uuid,uuid,text,public.app_role,public.account_state,text)',
    'EXECUTE'
  ) and not has_function_privilege(
    'authenticated',
    'public.admin_user_action(uuid,uuid,text,public.app_role,public.account_state,text)',
    'EXECUTE'
  ),
  'browser roles cannot execute the admin action RPC'
);

set role service_role;

select lives_ok(
  $$
    select public.admin_user_action(
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000202',
      'set_role',
      'admin',
      null,
      null
    )
  $$,
  'an active canonical admin can change a target role'
);

select is(
  (select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-000000000202'),
  'admin',
  'role action updates canonical role state'
);

select is(
  (
    select count(*)::integer
    from public.admin_audit_log
    where actor_user_id = '00000000-0000-0000-0000-000000000201'
      and target_user_id = '00000000-0000-0000-0000-000000000202'
      and action = 'user.role_changed'
  ),
  1,
  'role action appends exactly one audit record'
);

select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-000000000202'),
  'member',
  'role action does not modify the legacy profile role'
);

select throws_ok(
  $$
    select public.admin_user_action(
      '00000000-0000-0000-0000-000000000203',
      '00000000-0000-0000-0000-000000000202',
      'set_role',
      'member',
      null,
      null
    )
  $$,
  'P0001',
  'Admin user action rejected',
  'inactive canonical admin cannot act'
);

select throws_ok(
  $$
    select public.admin_user_action(
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000299',
      'set_role',
      'member',
      null,
      null
    )
  $$,
  'P0001',
  'Admin user action rejected',
  'missing target is rejected'
);

select throws_ok(
  $$
    select public.admin_user_action(
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000201',
      'set_role',
      'member',
      null,
      null
    )
  $$,
  'P0001',
  'Admin user action rejected',
  'admin cannot demote self'
);

select throws_ok(
  $$
    select public.admin_user_action(
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000201',
      'set_status',
      null,
      'banned',
      'Self ban attempt'
    )
  $$,
  'P0001',
  'Admin user action rejected',
  'admin cannot ban self'
);

select throws_ok(
  $$
    select public.admin_user_action(
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000202',
      'set_status',
      null,
      'suspended',
      'ab'
    )
  $$,
  'P0001',
  'Admin user action rejected',
  'suspension rejects a reason shorter than three characters'
);

select throws_ok(
  format(
    'select public.admin_user_action(%L, %L, %L, null, %L, %L)',
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000202',
    'set_status',
    'banned',
    repeat('x', 501)
  ),
  'P0001',
  'Admin user action rejected',
  'ban rejects a reason longer than 500 characters'
);

select lives_ok(
  $$
    select public.admin_user_action(
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000202',
      'set_status',
      null,
      'suspended',
      '  Terms violation  '
    )
  $$,
  'valid suspension succeeds'
);

select is(
  (select status::text || ':' || reason from public.account_status where user_id = '00000000-0000-0000-0000-000000000202'),
  'suspended:Terms violation',
  'suspension stores canonical status and trimmed reason'
);

update public.account_status
set suspended_until = statement_timestamp() + interval '1 day'
where user_id = '00000000-0000-0000-0000-000000000202';

select lives_ok(
  $$
    select public.admin_user_action(
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000202',
      'set_status',
      null,
      'active',
      null
    )
  $$,
  'activation does not require a reason'
);

select is(
  (
    select status::text || ':' || reason || ':' || coalesce(suspended_until::text, 'null')
    from public.account_status
    where user_id = '00000000-0000-0000-0000-000000000202'
  ),
  'active::null',
  'activation clears reason and suspension date'
);

reset role;

create function pg_temp.reject_action_audit()
returns trigger
language plpgsql
as $$
begin
  if new.target_user_id = '00000000-0000-0000-0000-000000000202' then
    raise exception 'forced audit failure';
  end if;
  return new;
end;
$$;

create trigger reject_action_audit
before insert on public.admin_audit_log
for each row execute function pg_temp.reject_action_audit();

set role service_role;

select throws_ok(
  $$
    select public.admin_user_action(
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000202',
      'set_role',
      'member',
      null,
      null
    )
  $$,
  'P0001',
  'forced audit failure',
  'audit failure aborts the action transaction'
);

select is(
  (select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-000000000202'),
  'admin',
  'canonical mutation rolls back when audit insertion fails'
);

reset role;

drop trigger reject_action_audit on public.admin_audit_log;

update public.user_roles
set role = case
  when user_id in (
    '00000000-0000-0000-0000-000000000205',
    '00000000-0000-0000-0000-000000000206'
  ) then 'admin'::public.app_role
  else 'member'::public.app_role
end
where user_id between '00000000-0000-0000-0000-000000000201'
  and '00000000-0000-0000-0000-000000000206';

begin;
set local role service_role;

select public.admin_user_action(
  '00000000-0000-0000-0000-000000000205',
  '00000000-0000-0000-0000-000000000206',
  'set_role',
  'member',
  null,
  null
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_locks
    where pid = pg_catalog.pg_backend_pid()
      and locktype = 'advisory'
      and mode = 'ExclusiveLock'
      and granted
  ),
  'admin action holds its serialization lock until transaction end'
);

commit;

set role service_role;

select throws_ok(
  $$
    select public.admin_user_action(
      '00000000-0000-0000-0000-000000000206',
      '00000000-0000-0000-0000-000000000205',
      'set_role',
      'member',
      null,
      null
    )
  $$,
  'P0001',
  'Admin user action rejected',
  'serialized cross-demotion revalidates and rejects the demoted actor'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.user_roles as roles
    join public.account_status as states using (user_id)
    where roles.user_id in (
      '00000000-0000-0000-0000-000000000205',
      '00000000-0000-0000-0000-000000000206'
    )
      and roles.role = 'admin'
      and states.status = 'active'
  ),
  1,
  'serialized cross-demotions preserve one active admin'
);

select is(
  (
    select count(*)::integer
    from public.admin_audit_log
    where actor_user_id in (
      '00000000-0000-0000-0000-000000000205',
      '00000000-0000-0000-0000-000000000206'
    )
  ),
  1,
  'only the committed serialized demotion writes an audit record'
);

delete from public.admin_audit_log
where actor_user_id between '00000000-0000-0000-0000-000000000201'
  and '00000000-0000-0000-0000-000000000206';

delete from auth.users
where id between '00000000-0000-0000-0000-000000000201'
  and '00000000-0000-0000-0000-000000000206';

select * from finish();
