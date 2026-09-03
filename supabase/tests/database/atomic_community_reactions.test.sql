begin;

select plan(22);

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

select has_table(
  'public',
  'community_reaction_operations',
  'processed reaction operations are persisted'
);

select col_is_pk(
  'public',
  'community_reaction_operations',
  array['user_id', 'operation_id'],
  'operation identity is unique per authorized user'
);

select ok(
  coalesce((
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = to_regclass('public.community_reaction_operations')
  ), false)
  and not has_table_privilege('anon', 'public.community_reaction_operations', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.community_reaction_operations', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.community_reaction_operations', 'SELECT,INSERT,UPDATE,DELETE'),
  'operation records are private and protected by RLS'
);

select has_function(
  'public',
  'toggle_community_reaction',
  array['uuid', 'text', 'uuid'],
  'idempotent reaction toggle RPC exists'
);

select hasnt_function(
  'public',
  'toggle_community_reaction',
  array['uuid', 'text'],
  'non-idempotent reaction toggle signature is removed'
);

select ok(
  coalesce((
    select prosecdef
      and proowner = 'postgres'::regrole
      and proconfig = array['search_path=""']
    from pg_catalog.pg_proc
    where oid = to_regprocedure('public.toggle_community_reaction(uuid,text,uuid)')
  ), false),
  'reaction toggle is postgres-owned SECURITY DEFINER with an empty search path'
);

select ok(
  has_function_privilege('authenticated', 'public.toggle_community_reaction(uuid,text,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.toggle_community_reaction(uuid,text,uuid)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.toggle_community_reaction(uuid,text,uuid)', 'EXECUTE')
    and not exists (
      select 1
      from pg_catalog.pg_proc as functions
      cross join lateral pg_catalog.aclexplode(functions.proacl) as privileges
      where functions.oid = to_regprocedure('public.toggle_community_reaction(uuid,text,uuid)')
        and privileges.grantee = 0
        and privileges.privilege_type = 'EXECUTE'
    ),
  'only authenticated sessions can execute the reaction toggle'
);

set local role anon;
select throws_ok(
  $$
    select public.toggle_community_reaction(
      '00000000-0000-0000-0000-000000001401',
      'like',
      '00000000-0000-0000-0000-000000009401'
    )
  $$,
  '42501',
  null,
  'anonymous callers cannot execute the reaction toggle'
);
reset role;

create temporary table first_reaction_result (result jsonb not null);
grant select, insert on table first_reaction_result to authenticated;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;
insert into first_reaction_result (result)
select public.toggle_community_reaction(
  '00000000-0000-0000-0000-000000001401',
  'love',
  '00000000-0000-0000-0000-000000009401'
);
reset role;

select is(
  (select result->>'removed' from first_reaction_result),
  'false',
  'first operation atomically adds a reaction'
);

set local role authenticated;
select is(
  public.toggle_community_reaction(
    '00000000-0000-0000-0000-000000001401',
    'love',
    '00000000-0000-0000-0000-000000009401'
  ),
  (select result from first_reaction_result),
  'replaying one operation returns its exact original result'
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
  1,
  'replaying one operation does not toggle the reaction twice'
);

select is(
  (
    select count(*)::integer
    from public.community_reaction_operations
    where user_id = '00000000-0000-0000-0000-000000000401'
      and operation_id = '00000000-0000-0000-0000-000000009401'
  ),
  1,
  'one processed record is persisted for a replayed operation'
);

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
  public.toggle_community_reaction(
    '00000000-0000-0000-0000-000000001401',
    'love',
    '00000000-0000-0000-0000-000000009402'
  )->>'removed',
  'true',
  'a different operation ID remains a distinct toggle'
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
  'the distinct remove operation leaves no reaction row'
);

set local role authenticated;
select throws_ok(
  $$
    select public.toggle_community_reaction(
      '00000000-0000-0000-0000-000000001401',
      'like',
      '00000000-0000-0000-0000-000000009401'
    )
  $$,
  'P0001',
  'Community reaction rejected',
  'an operation ID cannot be replayed with different arguments'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
set local role authenticated;
select throws_ok(
  $$
    select public.toggle_community_reaction(
      '00000000-0000-0000-0000-000000001401',
      'like',
      '00000000-0000-0000-0000-000000009403'
    )
  $$,
  'P0001',
  'Community reaction rejected',
  'canonical member access is required inside the RPC'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
set local role authenticated;
select throws_ok(
  $$
    select public.toggle_community_reaction(
      '00000000-0000-0000-0000-000000001401',
      'angry',
      '00000000-0000-0000-0000-000000009404'
    )
  $$,
  'P0001',
  'Community reaction rejected',
  'the RPC rejects reaction values outside the database boundary'
);

select throws_ok(
  $$
    select public.toggle_community_reaction(
      '00000000-0000-0000-0000-000000001401',
      'like',
      null
    )
  $$,
  'P0001',
  'Community reaction rejected',
  'the RPC rejects null operation IDs deliberately'
);
reset role;

select throws_ok(
  $$
    insert into public.community_posts (user_id, content, image_url)
    values (
      '00000000-0000-0000-0000-000000000401',
      'http image fixture',
      'http://example.test/image.png'
    )
  $$,
  '23514',
  null,
  'the database accepts only HTTPS community post image URLs'
);

select throws_ok(
  $$
    insert into public.community_posts (user_id, content, image_url)
    values (
      '00000000-0000-0000-0000-000000000401',
      'whitespace image fixture',
      'https://example.test/image path.png'
    )
  $$,
  '23514',
  null,
  'the database rejects whitespace in community post image URLs'
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
