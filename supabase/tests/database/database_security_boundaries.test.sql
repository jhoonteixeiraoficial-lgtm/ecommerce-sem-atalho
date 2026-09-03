begin;

select plan(22);

create or replace function pg_temp.assert_community_blocked(
  post_id uuid,
  comment_id uuid,
  reaction_id uuid,
  message_id uuid
)
returns void
language plpgsql
as $$
declare
  affected integer;
begin
  if (select count(*) from public.community_posts where id = post_id) <> 0
    or (select count(*) from public.community_comments where id = comment_id) <> 0
    or (select count(*) from public.community_reactions where id = reaction_id) <> 0
    or (select count(*) from public.chat_messages where id = message_id) <> 0
  then
    raise exception 'inactive account could read community content';
  end if;

  update public.community_posts set content = content where id = post_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account updated a post'; end if;

  delete from public.community_posts;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account deleted a post'; end if;

  update public.community_comments set content = content where id = comment_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account updated a comment'; end if;

  delete from public.community_comments;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account deleted a comment'; end if;

  delete from public.community_reactions;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account deleted a reaction'; end if;

  update public.chat_messages set content = content where id = message_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account updated a message'; end if;

  delete from public.chat_messages;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account deleted a message'; end if;
end;
$$;

create or replace function pg_temp.assert_personal_resources_blocked(
  read_id uuid,
  notification_id uuid,
  new_channel_id uuid
)
returns void
language plpgsql
as $$
declare
  affected integer;
  denied boolean;
begin
  if (select count(*) from public.chat_message_reads where id = read_id) <> 0
    or (select count(*) from public.notifications where id = notification_id) <> 0
  then
    raise exception 'inactive account could read personal resources';
  end if;

  update public.chat_message_reads set last_read_at = last_read_at where id = read_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account updated a message read'; end if;

  update public.notifications set is_read = true where id = notification_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account updated a notification'; end if;

  delete from public.notifications where id = notification_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account deleted a notification'; end if;

  denied := false;
  begin
    insert into public.chat_message_reads (user_id, channel_id)
    values (auth.uid(), new_channel_id);
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then raise exception 'inactive account inserted a message read'; end if;

  denied := false;
  begin
    insert into public.notifications (user_id, type, title)
    values (auth.uid(), 'system', 'fixture');
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then raise exception 'inactive account inserted a notification'; end if;
end;
$$;

create or replace function pg_temp.assert_invalid_content_rejected(statements text[])
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
    exception when check_violation then
      denied := true;
    end;
    if not denied then raise exception 'invalid write succeeded: %', statement; end if;
  end loop;
end;
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000301', 'boundary-active@test.local'),
  ('00000000-0000-0000-0000-000000000302', 'boundary-suspended@test.local'),
  ('00000000-0000-0000-0000-000000000303', 'boundary-banned@test.local'),
  ('00000000-0000-0000-0000-000000000304', 'boundary-expired@test.local'),
  ('00000000-0000-0000-0000-000000000305', 'boundary-admin@test.local');

update public.user_roles
set role = 'admin'
where user_id = '00000000-0000-0000-0000-000000000305';

update public.account_status
set status = 'suspended', reason = 'test fixture'
where user_id = '00000000-0000-0000-0000-000000000302';

update public.account_status
set status = 'banned', reason = 'test fixture'
where user_id = '00000000-0000-0000-0000-000000000303';

insert into public.subscriptions (user_id, plan, status, current_period_end)
values
  ('00000000-0000-0000-0000-000000000301', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000302', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000303', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000304', 'comunidade', 'active', statement_timestamp() - interval '1 day');

insert into public.chat_channels (id, name, slug)
values
  ('00000000-0000-0000-0000-000000000701', 'Boundary fixtures', 'boundary-fixtures'),
  ('00000000-0000-0000-0000-000000000702', 'Boundary new reads', 'boundary-new-reads');

insert into public.community_posts (id, user_id, content)
values
  ('00000000-0000-0000-0000-000000001301', '00000000-0000-0000-0000-000000000301', 'active fixture'),
  ('00000000-0000-0000-0000-000000001302', '00000000-0000-0000-0000-000000000302', 'suspended fixture'),
  ('00000000-0000-0000-0000-000000001303', '00000000-0000-0000-0000-000000000303', 'banned fixture'),
  ('00000000-0000-0000-0000-000000001304', '00000000-0000-0000-0000-000000000304', 'expired fixture'),
  ('00000000-0000-0000-0000-000000001305', '00000000-0000-0000-0000-000000000305', 'admin fixture');

insert into public.community_comments (id, post_id, user_id, content)
values
  ('00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000001301', '00000000-0000-0000-0000-000000000301', 'active fixture'),
  ('00000000-0000-0000-0000-000000002302', '00000000-0000-0000-0000-000000001302', '00000000-0000-0000-0000-000000000302', 'suspended fixture'),
  ('00000000-0000-0000-0000-000000002303', '00000000-0000-0000-0000-000000001303', '00000000-0000-0000-0000-000000000303', 'banned fixture'),
  ('00000000-0000-0000-0000-000000002304', '00000000-0000-0000-0000-000000001304', '00000000-0000-0000-0000-000000000304', 'expired fixture');

insert into public.community_reactions (id, post_id, user_id, reaction_type)
values
  ('00000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000001301', '00000000-0000-0000-0000-000000000301', 'like'),
  ('00000000-0000-0000-0000-000000003302', '00000000-0000-0000-0000-000000001302', '00000000-0000-0000-0000-000000000302', 'like'),
  ('00000000-0000-0000-0000-000000003303', '00000000-0000-0000-0000-000000001303', '00000000-0000-0000-0000-000000000303', 'like'),
  ('00000000-0000-0000-0000-000000003304', '00000000-0000-0000-0000-000000001304', '00000000-0000-0000-0000-000000000304', 'like');

insert into public.chat_messages (id, channel_id, user_id, content)
values
  ('00000000-0000-0000-0000-000000004301', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000301', 'active fixture'),
  ('00000000-0000-0000-0000-000000004302', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000302', 'suspended fixture'),
  ('00000000-0000-0000-0000-000000004303', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000303', 'banned fixture'),
  ('00000000-0000-0000-0000-000000004304', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000304', 'expired fixture');

insert into public.chat_message_reads (id, user_id, channel_id)
values
  ('00000000-0000-0000-0000-000000005301', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000005302', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000005303', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000005304', '00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000701');

insert into public.notifications (id, user_id, type, title)
values
  ('00000000-0000-0000-0000-000000006301', '00000000-0000-0000-0000-000000000301', 'system', 'active fixture'),
  ('00000000-0000-0000-0000-000000006302', '00000000-0000-0000-0000-000000000302', 'system', 'suspended fixture'),
  ('00000000-0000-0000-0000-000000006303', '00000000-0000-0000-0000-000000000303', 'system', 'banned fixture'),
  ('00000000-0000-0000-0000-000000006304', '00000000-0000-0000-0000-000000000304', 'system', 'expired fixture');

select has_table('public', 'live_credentials', 'live credentials are stored in a separate relation');
select hasnt_column('public', 'lives', 'stream_key', 'member-readable lives have no stream key column');
select hasnt_column('public', 'lives', 'rtmp_url', 'member-readable lives have no ingest URL column');
select col_is_pk('public', 'live_credentials', 'live_id', 'live credentials are keyed by live ID');
select fk_ok('public', 'live_credentials', 'live_id', 'public', 'lives', 'id', 'live credentials follow the live lifecycle');

select ok(
  coalesce((
    select bool_and(privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
      and count(*) = 4
    from information_schema.role_table_grants
    where grantee = 'service_role' and table_schema = 'public' and table_name = 'live_credentials'
  ), false),
  'service role has only CRUD privileges on live credentials'
);

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where grantee in ('PUBLIC', 'anon', 'authenticated')
      and table_schema = 'public' and table_name = 'live_credentials'
  ) and not exists (
    select 1 from information_schema.column_privileges
    where grantee in ('PUBLIC', 'anon', 'authenticated')
      and table_schema = 'public' and table_name = 'live_credentials'
  ),
  'browser roles have no table or column privileges on live credentials'
);

select ok(
  coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.live_credentials')), false),
  'live credentials have RLS enabled as defense in depth'
);

select ok(
  coalesce((
    select prosecdef
      and proowner = 'postgres'::regrole
      and proconfig = array['search_path=""']
    from pg_catalog.pg_proc
    where oid = to_regprocedure('public.create_notification(uuid,text,text,text,text)')
  ), false),
  'create_notification is postgres-owned SECURITY DEFINER with an empty search path'
);

select ok(
  has_function_privilege('service_role', 'public.create_notification(uuid,text,text,text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.create_notification(uuid,text,text,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.create_notification(uuid,text,text,text,text)', 'EXECUTE')
    and not exists (
      select 1
      from pg_catalog.pg_proc as functions
      cross join lateral pg_catalog.aclexplode(functions.proacl) as privileges
      where functions.oid = to_regprocedure('public.create_notification(uuid,text,text,text,text)')
        and privileges.grantee = 0
        and privileges.privilege_type = 'EXECUTE'
    ),
  'only the trusted service role can directly execute create_notification'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
set local role authenticated;
select lives_ok(
  $$
    insert into public.community_comments (post_id, user_id, content)
    values (
      '00000000-0000-0000-0000-000000001305',
      '00000000-0000-0000-0000-000000000301',
      'trigger flow fixture'
    )
  $$,
  'trusted notification trigger flow still works for an entitled member'
);
reset role;

select is(
  (select count(*)::integer from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000305' and type = 'comment'),
  1,
  'comment trigger creates exactly one notification'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', true);
set local role authenticated;
select lives_ok(
  $$ select pg_temp.assert_community_blocked(
    '00000000-0000-0000-0000-000000001302',
    '00000000-0000-0000-0000-000000002302',
    '00000000-0000-0000-0000-000000003302',
    '00000000-0000-0000-0000-000000004302'
  ) $$,
  'suspended member cannot read, update, or delete community resources'
);
select lives_ok(
  $$ select pg_temp.assert_personal_resources_blocked(
    '00000000-0000-0000-0000-000000005302',
    '00000000-0000-0000-0000-000000006302',
    '00000000-0000-0000-0000-000000000702'
  ) $$,
  'suspended member cannot operate on message reads or notifications'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000303', true);
set local role authenticated;
select lives_ok(
  $$ select pg_temp.assert_community_blocked(
    '00000000-0000-0000-0000-000000001303',
    '00000000-0000-0000-0000-000000002303',
    '00000000-0000-0000-0000-000000003303',
    '00000000-0000-0000-0000-000000004303'
  ) $$,
  'banned member cannot read, update, or delete community resources'
);
select lives_ok(
  $$ select pg_temp.assert_personal_resources_blocked(
    '00000000-0000-0000-0000-000000005303',
    '00000000-0000-0000-0000-000000006303',
    '00000000-0000-0000-0000-000000000702'
  ) $$,
  'banned member cannot operate on message reads or notifications'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000304', true);
set local role authenticated;
select lives_ok(
  $$ select pg_temp.assert_community_blocked(
    '00000000-0000-0000-0000-000000001304',
    '00000000-0000-0000-0000-000000002304',
    '00000000-0000-0000-0000-000000003304',
    '00000000-0000-0000-0000-000000004304'
  ) $$,
  'expired member cannot read, update, or delete community resources'
);
select lives_ok(
  $$ select pg_temp.assert_personal_resources_blocked(
    '00000000-0000-0000-0000-000000005304',
    '00000000-0000-0000-0000-000000006304',
    '00000000-0000-0000-0000-000000000702'
  ) $$,
  'expired member cannot operate on message reads or notifications'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000305', true);
set local role authenticated;
select lives_ok(
  $$
    delete from public.community_reactions where id = '00000000-0000-0000-0000-000000003302';
    delete from public.community_comments where id = '00000000-0000-0000-0000-000000002302';
    delete from public.chat_messages where id = '00000000-0000-0000-0000-000000004302';
    delete from public.community_posts where id = '00000000-0000-0000-0000-000000001302';
  $$,
  'active admin retains community moderation capability'
);
reset role;

select lives_ok(
  $test$
    select pg_temp.assert_invalid_content_rejected(array[
      'insert into public.community_posts (user_id, content) values (''00000000-0000-0000-0000-000000000301'', ''   '')',
      'insert into public.community_posts (user_id, content) values (''00000000-0000-0000-0000-000000000301'', repeat(''p'', 5001))',
      'insert into public.community_posts (user_id, content, category) values (''00000000-0000-0000-0000-000000000301'', ''valid'', ''invalid'')',
      'insert into public.community_posts (user_id, content, category) values (''00000000-0000-0000-0000-000000000301'', ''valid'', null)',
      'insert into public.community_comments (post_id, user_id, content) values (''00000000-0000-0000-0000-000000001301'', ''00000000-0000-0000-0000-000000000301'', ''   '')',
      'insert into public.community_comments (post_id, user_id, content) values (''00000000-0000-0000-0000-000000001301'', ''00000000-0000-0000-0000-000000000301'', repeat(''c'', 2001))',
      'insert into public.chat_messages (channel_id, user_id, content) values (''00000000-0000-0000-0000-000000000701'', ''00000000-0000-0000-0000-000000000301'', ''   '')',
      'insert into public.chat_messages (channel_id, user_id, content) values (''00000000-0000-0000-0000-000000000701'', ''00000000-0000-0000-0000-000000000301'', repeat(''m'', 1001))'
    ])
  $test$,
  'database constraints reject blank, oversized, and invalid-category community writes'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint
    where conrelid in (
      'public.community_posts'::regclass,
      'public.community_comments'::regclass,
      'public.chat_messages'::regclass
    )
      and conname like '%_content_check'
      and not convalidated
  ),
  3,
  'content constraints remain NOT VALID for unknown legacy rows'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint
    where conrelid = 'public.community_posts'::regclass
      and conname = 'community_posts_category_check'
      and not convalidated
  ),
  1,
  'category constraint remains NOT VALID for unknown legacy rows'
);

select * from finish();
rollback;
