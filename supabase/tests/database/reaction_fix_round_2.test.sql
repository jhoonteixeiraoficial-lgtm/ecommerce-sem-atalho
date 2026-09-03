begin;

select plan(19);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000461', 'reaction-service-active@test.local'),
  ('00000000-0000-0000-0000-000000000462', 'reaction-service-suspended@test.local');

update public.account_status
set status = 'suspended', reason = 'test fixture'
where user_id = '00000000-0000-0000-0000-000000000462';

insert into public.subscriptions (user_id, plan, status, current_period_end)
values
  ('00000000-0000-0000-0000-000000000461', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000462', 'comunidade', 'active', statement_timestamp() + interval '1 day');

insert into public.community_posts (id, user_id, content)
values ('00000000-0000-0000-0000-000000001461', '00000000-0000-0000-0000-000000000461', 'service reaction fixture');

select has_function(
  'public',
  'toggle_community_reaction',
  array['uuid', 'uuid', 'text', 'uuid'],
  'trusted reaction RPC accepts an explicit server-derived actor'
);

select hasnt_function(
  'public',
  'toggle_community_reaction',
  array['uuid', 'text', 'uuid'],
  'authenticated-callable reaction RPC signature is removed'
);

select ok(
  has_function_privilege('service_role', 'public.toggle_community_reaction(uuid,uuid,text,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.toggle_community_reaction(uuid,uuid,text,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.toggle_community_reaction(uuid,uuid,text,uuid)', 'EXECUTE'),
  'only the trusted service role can execute the reaction RPC'
);

select throws_ok(
  $$ select public.toggle_community_reaction(
    '00000000-0000-0000-0000-000000000461',
    '00000000-0000-0000-0000-000000001461',
    'clap',
    '00000000-0000-0000-0000-000000009469'
  ) $$,
  'P0001', 'Community reaction rejected',
  'the reaction RPC fails closed without a trusted service JWT role'
);

set local role anon;
select throws_ok(
  $$ select public.toggle_community_reaction(
    '00000000-0000-0000-0000-000000000461',
    '00000000-0000-0000-0000-000000001461',
    'like',
    '00000000-0000-0000-0000-000000009461'
  ) $$,
  '42501', null,
  'anonymous clients cannot execute the trusted reaction RPC'
);
reset role;

set local role authenticated;
select throws_ok(
  $$ select public.toggle_community_reaction(
    '00000000-0000-0000-0000-000000000461',
    '00000000-0000-0000-0000-000000001461',
    'like',
    '00000000-0000-0000-0000-000000009461'
  ) $$,
  '42501', null,
  'authenticated clients cannot execute the trusted reaction RPC'
);
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select is(
  public.toggle_community_reaction(
    '00000000-0000-0000-0000-000000000461',
    '00000000-0000-0000-0000-000000001461',
    'like',
    '00000000-0000-0000-0000-000000009461'
  )->>'removed',
  'false',
  'trusted service call toggles for the validated actor'
);

select throws_ok(
  $$ select public.toggle_community_reaction(
    '00000000-0000-0000-0000-000000000462',
    '00000000-0000-0000-0000-000000001461',
    'like',
    '00000000-0000-0000-0000-000000009462'
  ) $$,
  'P0001', 'Community reaction rejected',
  'trusted service call still enforces canonical actor access'
);
reset role;

select has_index(
  'public',
  'community_reaction_operations',
  'community_reaction_operations_created_at_idx',
  'operation retention cleanup is supported by an age index'
);

update public.community_reaction_operations
set created_at = statement_timestamp() - interval '16 minutes'
where operation_id = '00000000-0000-0000-0000-000000009461';

set local role service_role;
select is(
  public.toggle_community_reaction(
    '00000000-0000-0000-0000-000000000461',
    '00000000-0000-0000-0000-000000001461',
    'love',
    '00000000-0000-0000-0000-000000009463'
  )->>'removed',
  'false',
  'a trusted call safely processes a new operation while cleaning expired records'
);
reset role;

select is(
  (select count(*)::integer from public.community_reaction_operations where operation_id = '00000000-0000-0000-0000-000000009461'),
  0,
  'operation records older than the explicit 15 minute window are removed'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000461', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.community_posts (user_id, content, image_url)
     values ('00000000-0000-0000-0000-000000000461', 'valid strict URL', 'https://images.example.test/path/image.png?size=2#preview') $$,
  'the database accepts the strict HTTPS image URL subset'
);

select throws_ok(
  $$ insert into public.community_posts (user_id, content, image_url)
     values ('00000000-0000-0000-0000-000000000461', 'colon host', 'https://:') $$,
  '23514', null,
  'the database rejects a malformed colon host'
);

select throws_ok(
  $$ insert into public.community_posts (user_id, content, image_url)
     values ('00000000-0000-0000-0000-000000000461', 'percent host', 'https://%') $$,
  '23514', null,
  'the database rejects a malformed percent host'
);

select throws_ok(
  $$ insert into public.community_posts (user_id, content, image_url)
     values ('00000000-0000-0000-0000-000000000461', 'credential URL', 'https://user@example.test/image.png') $$,
  '23514', null,
  'the database rejects credentials outside the strict image URL subset'
);

select throws_ok(
  $$ insert into public.community_posts (user_id, content, image_url)
     values ('00000000-0000-0000-0000-000000000461', 'port URL', 'https://example.test:443/image.png') $$,
  '23514', null,
  'the database rejects ports outside the strict image URL subset'
);

select throws_ok(
  $$ insert into public.community_posts (user_id, content, image_url)
     values ('00000000-0000-0000-0000-000000000461', 'single label URL', 'https://localhost/image.png') $$,
  '23514', null,
  'the database rejects single-label hosts outside the strict image URL subset'
);

select throws_ok(
  $$ insert into public.community_posts (user_id, content, image_url)
     values ('00000000-0000-0000-0000-000000000461', 'uppercase URL', 'HTTPS://images.example.test/image.png') $$,
  '23514', null,
  'the database requires the canonical lowercase HTTPS scheme'
);

select throws_ok(
  $$ insert into public.community_posts (user_id, content, image_url)
     values ('00000000-0000-0000-0000-000000000461', 'newline URL', E'https://images.example.test/image.png\n') $$,
  '23514', null,
  'the database rejects all whitespace including a terminal newline'
);

reset role;

select * from finish();
rollback;
