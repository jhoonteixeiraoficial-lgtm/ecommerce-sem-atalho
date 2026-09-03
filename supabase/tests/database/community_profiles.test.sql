begin;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-0000-0000-000000000701',
    'profile-member@test.local',
    '{"full_name":"Profile Member"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000702',
    'profile-other@test.local',
    '{"full_name":"Other Member"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000703',
    'profile-admin@test.local',
    '{"full_name":"Profile Admin"}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000704',
    'profile-banned-admin@test.local',
    '{"full_name":"Banned Admin"}'::jsonb
  );

update public.profiles
set phone = '+55 11 99999-9999', role = 'admin', is_banned = true, ban_reason = 'legacy private'
where id = '00000000-0000-0000-0000-000000000702';

update public.user_roles
set role = 'admin'
where user_id in (
  '00000000-0000-0000-0000-000000000703',
  '00000000-0000-0000-0000-000000000704'
);

update public.account_status
set status = 'banned', reason = 'test fixture'
where user_id = '00000000-0000-0000-0000-000000000704';

insert into public.subscriptions (user_id, plan, status, current_period_end)
values
  ('00000000-0000-0000-0000-000000000701', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000702', 'comunidade', 'active', statement_timestamp() + interval '1 day');

select has_table('public', 'community_profiles', 'canonical community profiles exist');

select columns_are(
  'public',
  'community_profiles',
  array['id', 'full_name', 'avatar_url', 'created_at', 'updated_at'],
  'community profiles contain only public identity fields and timestamps'
);

select is(
  (
    select full_name || ':' || avatar_url
    from public.community_profiles
    where id = '00000000-0000-0000-0000-000000000702'
  ),
  'Other Member:',
  'existing profiles are backfilled without private fields'
);

update public.profiles
set full_name = 'Other Updated', avatar_url = 'https://images.example.test/other.png'
where id = '00000000-0000-0000-0000-000000000702';

select is(
  (
    select full_name || ':' || avatar_url
    from public.community_profiles
    where id = '00000000-0000-0000-0000-000000000702'
  ),
  'Other Updated:https://images.example.test/other.png',
  'profile presentation updates synchronize to community profiles'
);

select ok(
  coalesce((
    select prosecdef
      and proowner = 'postgres'::regrole
      and proconfig = array['search_path=""']
    from pg_catalog.pg_proc
    where oid = to_regprocedure('public.sync_community_profile()')
  ), false),
  'community profile synchronization is a hardened postgres-owned trigger function'
);

select ok(
  has_table_privilege('authenticated', 'public.community_profiles', 'SELECT')
    and not has_table_privilege('authenticated', 'public.community_profiles', 'INSERT')
    and not has_table_privilege('authenticated', 'public.community_profiles', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.community_profiles', 'DELETE'),
  'authenticated browsers have read-only table privileges on community profiles'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.community_profiles where id = '00000000-0000-0000-0000-000000000702'),
  1,
  'active members can read another member public community profile'
);

select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-0000-0000-000000000702'),
  0,
  'active members cannot read another member private profile'
);

select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-0000-0000-000000000701'),
  1,
  'profile owners retain private access to their own row'
);

select throws_ok(
  $$ update public.community_profiles set full_name = 'Injected' where id = auth.uid() $$,
  '42501',
  null,
  'browser roles cannot directly update community profiles'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-0000-0000-000000000702'),
  1,
  'active canonical admins retain private profile access'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000704', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-0000-0000-000000000702')
    + (select count(*)::integer from public.community_profiles where id = '00000000-0000-0000-0000-000000000702'),
  0,
  'banned canonical admins cannot read another private or community profile'
);
reset role;

select * from finish();
rollback;
