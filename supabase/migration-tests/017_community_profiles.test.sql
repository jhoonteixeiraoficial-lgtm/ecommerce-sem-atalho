begin;

select plan(2);

select is(
  (
    select full_name || ':' || avatar_url
    from public.community_profiles
    where id = '00000000-0000-0000-0000-000000000717'
  ),
  'Pre-017 Profile:https://images.example.test/pre-017.png',
  'migration 017 reconciles a profile row that existed before trigger installation'
);

select columns_are(
  'public',
  'community_profiles',
  array['id', 'full_name', 'avatar_url', 'created_at', 'updated_at'],
  'the replayed pre-017 profile exposes no private columns'
);

select * from finish();
rollback;
