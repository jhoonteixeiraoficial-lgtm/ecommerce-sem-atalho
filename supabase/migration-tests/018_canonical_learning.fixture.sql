insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000901', 'pre-018-member@test.local');

insert into public.modules (id, slug, title, description, sort_order, is_published, created_at)
values (
  '00000000-0000-0000-0000-000000000902',
  'pre-018-module',
  'Pre-018 module',
  'Legacy module',
  4,
  true,
  '2026-08-01 10:00:00+00'
);

insert into public.lessons (
  id, module_id, slug, title, description, video_url, duration_minutes, sort_order, is_published, created_at
)
values (
  '00000000-0000-0000-0000-000000000903',
  '00000000-0000-0000-0000-000000000902',
  'pre-018-lesson',
  'Pre-018 lesson',
  'Legacy lesson',
  'https://videos.example.test/pre-018',
  7,
  2,
  true,
  '2026-08-02 10:00:00+00'
);

insert into public.user_progress (id, user_id, lesson_id, completed, completed_at, created_at)
values (
  '00000000-0000-0000-0000-000000000904',
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000903',
  true,
  '2026-08-03 10:00:00+00',
  '2026-08-02 11:00:00+00'
);
