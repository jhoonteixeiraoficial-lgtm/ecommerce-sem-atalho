insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000801', 'migration-boundary@test.local');

insert into public.lives (id, title, scheduled_at, rtmp_url, stream_key)
values
  (
    '00000000-0000-0000-0000-000000000811',
    'Both credential values',
    statement_timestamp(),
    'placeholder-ingest-url',
    'placeholder-stream-key'
  ),
  (
    '00000000-0000-0000-0000-000000000812',
    'Missing ingest URL',
    statement_timestamp(),
    null,
    'placeholder-only-key'
  ),
  (
    '00000000-0000-0000-0000-000000000813',
    'No credential values',
    statement_timestamp(),
    '',
    ''
  );

insert into public.community_posts (id, user_id, content, category)
values (
  '00000000-0000-0000-0000-000000000821',
  '00000000-0000-0000-0000-000000000801',
  chr(9) || chr(10),
  'legacy-category'
);

insert into public.community_comments (id, post_id, user_id, content)
values (
  '00000000-0000-0000-0000-000000000822',
  '00000000-0000-0000-0000-000000000821',
  '00000000-0000-0000-0000-000000000801',
  repeat('c', 2001)
);

insert into public.chat_channels (id, name, slug)
values ('00000000-0000-0000-0000-000000000823', 'Legacy channel', 'legacy-migration-channel');

insert into public.chat_messages (id, channel_id, user_id, content)
values (
  '00000000-0000-0000-0000-000000000824',
  '00000000-0000-0000-0000-000000000823',
  '00000000-0000-0000-0000-000000000801',
  repeat('m', 1001)
);
