begin;
select plan(8);

create or replace function pg_temp.assert_42501(statements text[])
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
      when insufficient_privilege then
        denied := true;
    end;

    if not denied then
      raise exception 'statement did not raise SQLSTATE 42501: %', statement;
    end if;
  end loop;
end;
$$;

create or replace function pg_temp.assert_paid_through_fails_closed(member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.subscriptions
  set current_period_end = statement_timestamp() - interval '1 second'
  where user_id = member_id;

  if public.has_member_access() then
    raise exception 'expired current_period_end granted member access';
  end if;

  update public.subscriptions
  set current_period_end = null
  where user_id = member_id;

  if public.has_member_access() then
    raise exception 'null current_period_end granted member access';
  end if;
end;
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000101', 'member@test.local'),
  ('00000000-0000-0000-0000-000000000102', 'admin@test.local'),
  ('00000000-0000-0000-0000-000000000103', 'banned@test.local');

update public.user_roles
set role = 'admin'
where user_id in (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103'
);

update public.account_status
set status = 'banned', reason = 'test fixture'
where user_id = '00000000-0000-0000-0000-000000000103';

insert into public.subscriptions (user_id, plan, status, current_period_end)
values
  (
    '00000000-0000-0000-0000-000000000101',
    'comunidade',
    'active',
    now() + interval '1 day'
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    'comunidade',
    'active',
    now() + interval '1 day'
  );

set local role anon;
select lives_ok(
  $test$
    select pg_temp.assert_42501(array[
      'select public.has_member_access()',
      'select public.is_admin()',
      'select public.has_active_subscription()'
    ])
  $test$,
  'anonymous callers cannot invoke any authorization helper'
);
reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
set local role authenticated;
select is(
  public.has_member_access(),
  true,
  'active member with unexpired paid-through date has member access'
);
reset role;

set local role authenticated;
select lives_ok(
  $$
    select pg_temp.assert_paid_through_fails_closed(
      '00000000-0000-0000-0000-000000000101'
    )
  $$,
  'expired and null paid-through dates both deny member access'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
set local role authenticated;
select is(
  public.has_member_access() or public.is_admin(),
  false,
  'banned canonical admin is denied despite an active paid subscription'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
set local role authenticated;
select is(
  public.is_admin(),
  true,
  'active canonical admin is recognized without a subscription'
);
reset role;

set local role service_role;
select lives_ok(
  $test$
    select pg_temp.assert_42501(array[
      'insert into public.user_roles (user_id, role) values (''00000000-0000-0000-0000-000000000101'', ''member'')',
      'update public.user_roles set role = role where user_id = ''00000000-0000-0000-0000-000000000101''',
      'delete from public.user_roles where user_id = ''00000000-0000-0000-0000-000000000101''',
      'insert into public.account_status (user_id, status) values (''00000000-0000-0000-0000-000000000101'', ''active'')',
      'update public.account_status set reason = reason where user_id = ''00000000-0000-0000-0000-000000000101''',
      'delete from public.account_status where user_id = ''00000000-0000-0000-0000-000000000101'''
    ])
  $test$,
  'service role cannot directly mutate canonical role and status records'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
set local role authenticated;
select lives_ok(
  $test$
    do $$
    begin
      if has_table_privilege(
        'authenticated',
        'public.user_roles',
        'SELECT,INSERT,UPDATE,DELETE'
      ) or has_any_column_privilege(
        'authenticated',
        'public.user_roles',
        'SELECT,INSERT,UPDATE,REFERENCES'
      ) or has_table_privilege(
        'authenticated',
        'public.account_status',
        'SELECT,INSERT,UPDATE,DELETE'
      ) or has_any_column_privilege(
        'authenticated',
        'public.account_status',
        'SELECT,INSERT,UPDATE,REFERENCES'
      ) then
        raise exception 'authenticated retains canonical table or column privileges';
      end if;

      perform pg_temp.assert_42501(array[
        'select * from public.user_roles',
        'insert into public.user_roles (user_id, role) values (''00000000-0000-0000-0000-000000000101'', ''member'')',
        'update public.user_roles set role = role where user_id = auth.uid()',
        'select * from public.account_status',
        'insert into public.account_status (user_id, status) values (''00000000-0000-0000-0000-000000000101'', ''active'')',
        'update public.account_status set status = status where user_id = auth.uid()'
      ]);
    end
    $$
  $test$,
  'authenticated role has no canonical table, column, or operation access'
);

select lives_ok(
  $test$
    select pg_temp.assert_42501(array[
      'update public.profiles set role = ''admin'' where id = auth.uid()',
      'update public.profiles set is_banned = true where id = auth.uid()',
      'update public.profiles set ban_reason = ''client controlled'' where id = auth.uid()',
      'update public.profiles set banned_at = statement_timestamp() where id = auth.uid()',
      'insert into public.subscriptions (user_id, plan, status) values (auth.uid(), ''comunidade'', ''active'')',
      'update public.subscriptions set status = ''active'' where user_id = auth.uid()',
      'update public.subscriptions set payment_provider = ''client'' where user_id = auth.uid()',
      'update public.subscriptions set external_id = ''client'' where user_id = auth.uid()',
      'update public.subscriptions set current_period_end = statement_timestamp() + interval ''1 year'' where user_id = auth.uid()',
      'delete from public.subscriptions where user_id = auth.uid()'
    ])
  $test$,
  'member cannot mutate legacy authority or subscription state'
);
reset role;

select * from finish();
rollback;
