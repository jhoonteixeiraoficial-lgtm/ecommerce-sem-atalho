begin;

select plan(7);

select hasnt_column('public', 'lives', 'stream_key', 'migration drops the source stream key column');
select hasnt_column('public', 'lives', 'rtmp_url', 'migration drops the source ingest URL column');

select is(
  (
    select rtmp_url || ':' || stream_key
    from public.live_credentials
    where live_id = '00000000-0000-0000-0000-000000000811'
  ),
  'placeholder-ingest-url:placeholder-stream-key',
  'migration copies both pre-existing credential values'
);

select is(
  (
    select rtmp_url || ':' || stream_key
    from public.live_credentials
    where live_id = '00000000-0000-0000-0000-000000000812'
  ),
  ':placeholder-only-key',
  'migration copies a credential row when one counterpart is missing'
);

select is(
  (
    select count(*)::integer
    from public.live_credentials
    where live_id = '00000000-0000-0000-0000-000000000813'
  ),
  0,
  'migration does not create a credential row for two empty values'
);

select is(
  (
    select
      (select count(*) from public.community_posts where id = '00000000-0000-0000-0000-000000000821') +
      (select count(*) from public.community_comments where id = '00000000-0000-0000-0000-000000000822') +
      (select count(*) from public.chat_messages where id = '00000000-0000-0000-0000-000000000824')
  )::integer,
  3,
  'migration applies without removing invalid legacy community rows'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint
    where conname in (
      'community_posts_content_check',
      'community_posts_category_check',
      'community_comments_content_check',
      'chat_messages_content_check'
    )
      and not convalidated
  ),
  4,
  'migration leaves all new community constraints unvalidated'
);

select * from finish();
rollback;
