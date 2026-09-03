insert into auth.users (id, email, raw_user_meta_data)
values (
  '00000000-0000-0000-0000-000000000717',
  'pre-017-profile@test.local',
  '{"full_name":"Before 017"}'::jsonb
);

update public.profiles
set full_name = 'Pre-017 Profile',
    avatar_url = 'https://images.example.test/pre-017.png',
    email = 'private-pre-017@test.local',
    phone = '+55 11 98888-1717',
    role = 'admin',
    is_banned = true,
    ban_reason = 'private pre-017 fixture'
where id = '00000000-0000-0000-0000-000000000717';
