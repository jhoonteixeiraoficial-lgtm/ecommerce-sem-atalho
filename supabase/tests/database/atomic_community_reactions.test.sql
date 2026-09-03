begin;

select plan(13);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000401', 'reaction-active@test.local'),
  ('00000000-0000-0000-0000-000000000402', 'reaction-suspended@test.local');

update public.account_status
set status = 'suspended', reason = 'test fixture'
where user_id = '00000000-0000-0000-0000-000000000402';

insert into public.subscriptions (user_id, plan, status, current_period_end)
values
  ('00000000-0000-0000-0000-000000000401', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000402', 'comunidade', 'active', statement_timestamp() + interval '1 day');

insert into public.community_posts (id, user_id, content)
values ('00000000-0000-0000-0000-000000001401', '00000000-0000-0000-0000-000000000401', 'reaction fixture');

select has_function(
  'public',
  'toggle_community_reaction',
  array['uuid', 'text'],
  'atomic reaction toggle RPC exists'
);

select ok(
  coalesce((
    select prosecdef
      and proowner = 'postgres'::regrole
      and proconfig = array['search_path=""']
    from pg_catalog.pg_proc
    where oid = to_regprocedure('public.toggle_community_reaction(uuid,text)')
  ), false),
  'reaction toggle is postgres-owned SECURITY DEFINER with an empty search path'
);

select ok(
  has_function_privilege('authenticated', 'public.toggle_community_reaction(uuid,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.toggle_community_reaction(uuid,text)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.toggle_community_reaction(uuid,text)', 'EXECUTE')
    and not exists (
      select 1
      from pg_catalog.pg_proc as functions
      cross join lateral pg_catalog.aclexplode(functions.proacl) as privileges
      where functions.oid = to_regprocedure('public.toggle_community_reaction(uuid,text)')
        and privileges.grantee = 0
        and privileges.privilege_type = 'EXECUTE'
    ),
  'only authenticated sessions can execute the reaction toggle'
);

set local role anon;
select throws_ok(
  $$ select public.toggle_community_reaction('00000000-0000-0000-0000-000000001401', 'like') $$,
  '42501',
  null,
  'anonymous callers cannot execute the reaction toggle'
);
reset role;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;

select is(
  public.toggle_community_reaction('00000000-0000-0000-0000-000000001401', 'love')->>'removed',
  'false',
  'first toggle atomically adds a reaction'
);
reset role;

select is(
  (
    select user_id
    from public.community_reactions
    where post_id = '00000000-0000-0000-0000-000000001401'
      and reaction_type = 'love'
  ),
  '00000000-0000-0000-0000-000000000401'::uuid,
  'the RPC derives reaction ownership from auth.uid()'
);

set local role authenticated;
select is(
  public.toggle_community_reaction('00000000-0000-0000-0000-000000001401', 'love')->>'removed',
  'true',
  'second toggle atomically removes the reaction'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.community_reactions
    where post_id = '00000000-0000-0000-0000-000000001401'
      and user_id = '00000000-0000-0000-0000-000000000401'
      and reaction_type = 'love'
  ),
  0,
  'remove toggle leaves no reaction row'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
set local role authenticated;
select throws_ok(
  $$ select public.toggle_community_reaction('00000000-0000-0000-0000-000000001401', 'like') $$,
  'P0001',
  'Community reaction rejected',
  'canonical member access is required inside the RPC'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;
select throws_ok(
  $$ select public.toggle_community_reaction('00000000-0000-0000-0000-000000001401', 'angry') $$,
  'P0001',
  'Community reaction rejected',
  'the RPC rejects reaction values outside the database boundary'
);
reset role;

set local role authenticated;
select throws_ok(
  $$ select public.toggle_community_reaction('00000000-0000-0000-0000-000000001401', null) $$,
  'P0001',
  'Community reaction rejected',
  'the RPC rejects null reaction values deliberately'
);
reset role;

select throws_ok(
  $$
    insert into public.community_posts (user_id, content, image_url)
    values (
      '00000000-0000-0000-0000-000000000401',
      'unsafe image fixture',
      'javascript:alert(1)'
    )
  $$,
  '23514',
  null,
  'the database rejects unsafe community post image URLs'
);

select throws_ok(
  $$
    insert into public.community_posts (user_id, content, image_url)
    values (
      '00000000-0000-0000-0000-000000000401',
      'oversized image fixture',
      'https://example.test/' || repeat('x', 2049)
    )
  $$,
  '23514',
  null,
  'the database bounds community post image URLs'
);

select * from finish();
rollback;
