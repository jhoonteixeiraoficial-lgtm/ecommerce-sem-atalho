begin;

select no_plan();

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000101', 'progressive-images@test.local'),
  ('00000000-0000-0000-0000-000000000201', 'other-progressive-images@test.local');

insert into public.assertive_analyses (
  id, user_id, product_name, input_type, status
) values (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101',
  'Produto de teste',
  'description',
  'pending'
);

insert into public.assertive_analyses (
  id, user_id, product_name, input_type, status
) values (
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000201',
  'Outro produto de teste',
  'description',
  'pending'
);

insert into public.assertive_listings (
  id, analysis_id, user_id, title, description, status
) values (
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101',
  'Produto de teste',
  'Descrição de teste',
  'draft'
);

insert into public.assertive_listings (
  id, analysis_id, user_id, title, description, status
) values (
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000201',
  'Outro produto de teste',
  'Outra descrição de teste',
  'draft'
);

select has_table(
  'public',
  'assertive_image_jobs',
  'durable image jobs exist'
);

select col_is_pk(
  'public',
  'assertive_image_jobs',
  'id',
  'jobs have stable identity'
);

select has_column(
  'public',
  'assertive_image_jobs',
  'listing_id',
  'jobs belong to a listing'
);

select has_column(
  'public',
  'assertive_image_jobs',
  'lock_token',
  'jobs persist worker ownership'
);

select ok(
  coalesce((
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = to_regclass('public.assertive_image_jobs')
  ), false)
  and has_table_privilege('authenticated', 'public.assertive_image_jobs', 'SELECT')
  and not has_table_privilege('authenticated', 'public.assertive_image_jobs', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.assertive_image_jobs', 'SELECT,INSERT,UPDATE,DELETE'),
  'users can only read their own jobs through RLS'
);

select has_index(
  'public',
  'assertive_image_jobs',
  'assertive_image_jobs_reference_unique',
  'one reference search exists per listing'
);

select has_index(
  'public',
  'assertive_image_jobs',
  'assertive_image_jobs_listing_slot_unique',
  'one generation job exists per listing position'
);

select lives_ok(
  $$insert into public.assertive_image_assets (
      id, user_id, analysis_id, kind, origin, rights_status, storage_bucket,
      storage_key, sha256, mime_type, width, height, byte_size
    ) values (
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000102',
      'SOURCE_REFERENCE', 'WEB_REFERENCE', 'REFERENCE_ONLY', 'assertive-originals',
      '00000000-0000-0000-0000-000000000101/web-reference.jpg', repeat('a', 64),
      'image/jpeg', 1200, 1200, 4096
    )$$,
  'web references are represented explicitly'
);

insert into public.assertive_image_assets (
  id, user_id, analysis_id, kind, origin, rights_status, storage_bucket,
  storage_key, public_url, sha256, mime_type, width, height, byte_size,
  parent_asset_id, provider, model, fidelity_status
) values
  (
    '00000000-0000-0000-0000-000000000321',
    '00000000-0000-0000-0000-000000000101',
    null, 'ORIGINAL_EVIDENCE', 'USER_UPLOAD', 'USER_OWNED', 'assertive-originals',
    '00000000-0000-0000-0000-000000000101/upload-original.jpg', null, repeat('b', 64),
    'image/jpeg', 1200, 1200, 4096, null, null, null, null
  ),
  (
    '00000000-0000-0000-0000-000000000322',
    '00000000-0000-0000-0000-000000000101',
    null, 'PUBLICATION_RENDITION', 'USER_UPLOAD', 'USER_OWNED', 'assertive',
    '00000000-0000-0000-0000-000000000101/upload-normalized.jpg',
    'https://example.test/upload-normalized.jpg', repeat('c', 64),
    'image/jpeg', 1200, 1200, 4096,
    '00000000-0000-0000-0000-000000000321', 'local', 'sharp-v1', 'ACCEPT'
  );

update public.assertive_analyses
set input_data = '{"photo_asset_ids":["00000000-0000-0000-0000-000000000322"]}'::jsonb
where id = '00000000-0000-0000-0000-000000000102';

select lives_ok(
  $$insert into public.assertive_image_jobs (
      id, user_id, analysis_id, listing_id, kind, position, role, status
    ) values
      ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000101',
       '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000103',
       'REFERENCE_SEARCH', null, null, 'QUEUED'),
      ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000101',
       '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000103',
       'GENERATE_SLOT', 0, 'MAIN', 'QUEUED')$$,
  'valid reference and cover jobs can be queued'
);

select lives_ok(
  $$insert into public.assertive_image_jobs (
      id, user_id, analysis_id, listing_id, kind, position, role, status
    ) values
      ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000101',
       '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000103',
       'GENERATE_SLOT', 1, 'DETAIL', 'QUEUED'),
      ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000101',
       '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000103',
       'GENERATE_SLOT', 2, 'DETAIL', 'QUEUED'),
      ('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000101',
       '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000103',
       'GENERATE_SLOT', 3, 'LIFESTYLE', 'QUEUED'),
      ('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000101',
       '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000103',
       'GENERATE_SLOT', 4, 'LIFESTYLE', 'QUEUED'),
      ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000101',
       '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000103',
       'GENERATE_SLOT', 5, 'INFORMATIONAL', 'QUEUED')$$,
  'all six generation slots can coexist'
);

select lives_ok(
  $$insert into public.assertive_image_jobs (
      id, user_id, analysis_id, listing_id, kind, position, role, status
    ) values (
      '00000000-0000-0000-0000-000000000205',
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000202',
      '00000000-0000-0000-0000-000000000203',
      'GENERATE_SLOT', 0, 'MAIN', 'QUEUED'
    )$$,
  'another owner can have independent work'
);

create temporary table visible_job_count (value integer);
grant select, insert on table visible_job_count to authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
set local role authenticated;
select lives_ok(
  $$insert into visible_job_count (value)
    select count(*)::integer from public.assertive_image_jobs$$,
  'authenticated users can query jobs'
);
reset role;
select is(
  (select value from visible_job_count),
  7,
  'authenticated users only read their own jobs'
);

select throws_ok(
  $$insert into public.assertive_image_jobs (
      user_id, analysis_id, listing_id, kind, position, role, status
    ) values (
      '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103', 'GENERATE_SLOT', 6, 'MAIN', 'QUEUED'
    )$$,
  '23514',
  null,
  'only slots zero through five are accepted'
);

select throws_ok(
  $$insert into public.assertive_image_jobs (
      user_id, analysis_id, listing_id, kind, position, role, status
    ) values (
      '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103', 'REFERENCE_SEARCH', 1, 'DETAIL', 'QUEUED'
    )$$,
  '23514',
  null,
  'reference search cannot occupy a gallery slot'
);

select throws_ok(
  $$insert into public.assertive_image_jobs (
      user_id, analysis_id, listing_id, kind, position, role, status
    ) values (
      '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103', 'GENERATE_SLOT', 0, 'MAIN', 'QUEUED'
    )$$,
  '23505',
  null,
  'a listing cannot queue the same position twice'
);

select throws_ok(
  $$insert into public.assertive_image_jobs (
      user_id, analysis_id, listing_id, kind, position, role, status
    ) values (
      '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103', 'REFERENCE_SEARCH', null, null, 'QUEUED'
    )$$,
  '23505',
  null,
  'a listing cannot queue reference acquisition twice'
);

select throws_ok(
  $$insert into public.assertive_image_jobs (
      user_id, analysis_id, listing_id, kind, position, role, status
    ) values (
      '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103', 'GENERATE_SLOT', 2, 'DETAIL', 'UNKNOWN'
    )$$,
  '23514',
  null,
  'unknown job statuses are rejected'
);

select throws_ok(
  $$insert into public.assertive_image_jobs (
      user_id, analysis_id, listing_id, kind, position, role, status
    ) values (
      '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103', 'GENERATE_SLOT', 2, 'HERO', 'QUEUED'
    )$$,
  '23514',
  null,
  'unknown gallery roles are rejected'
);

select throws_ok(
  $$insert into public.assertive_image_jobs (
      user_id, analysis_id, listing_id, kind, position, role, status, max_attempts
    ) values (
      '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103', 'GENERATE_SLOT', 2, 'DETAIL', 'QUEUED', 0
    )$$,
  '23514',
  null,
  'generation jobs require at least one attempt'
);

select throws_ok(
  $$insert into public.assertive_image_jobs (
      user_id, analysis_id, listing_id, kind, position, role, status
    ) values (
      '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103', 'GENERATE_SLOT', 2, 'DETAIL', 'RUNNING'
    )$$,
  '23514',
  null,
  'running jobs require a persisted lock owner and timestamp'
);

select throws_ok(
  $$update public.assertive_image_jobs
    set user_id = '00000000-0000-0000-0000-000000000101'
    where id = '00000000-0000-0000-0000-000000000205'$$,
  'P0001',
  'Assertive image job ownership rejected',
  'job ownership must match its analysis and listing'
);

select has_function(
  'public',
  'assertive_claim_image_job',
  array['uuid', 'uuid', 'uuid'],
  'the server can atomically claim one image job'
);

select ok(
  coalesce((
    select prosecdef
      and proowner = 'postgres'::regrole
      and proconfig = array['search_path=""']
    from pg_catalog.pg_proc
    where oid = to_regprocedure('public.assertive_claim_image_job(uuid,uuid,uuid)')
  ), false),
  'claim is postgres-owned SECURITY DEFINER with an empty search path'
);

select ok(
  coalesce(has_function_privilege(
    'service_role',
    to_regprocedure('public.assertive_claim_image_job(uuid,uuid,uuid)'),
    'EXECUTE'
  ), false)
    and not coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.assertive_claim_image_job(uuid,uuid,uuid)'),
      'EXECUTE'
    ), false)
    and not coalesce(has_function_privilege(
      'anon',
      to_regprocedure('public.assertive_claim_image_job(uuid,uuid,uuid)'),
      'EXECUTE'
    ), false),
  'only the trusted server can claim image jobs'
);

create temporary table claimed_jobs (
  id uuid,
  kind text,
  position integer,
  status text,
  attempt_count integer,
  lock_token uuid
);

select lives_ok(
  $$insert into claimed_jobs
    select id, kind, position, status, attempt_count, lock_token
    from public.assertive_claim_image_job(
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000111'
    )$$,
  'the reference job can be claimed'
);

select is(
  (select kind from claimed_jobs where lock_token = '00000000-0000-0000-0000-000000000111'),
  'REFERENCE_SEARCH',
  'reference acquisition is claimed before generation'
);

select is(
  (select status || ':' || attempt_count::text from claimed_jobs
    where lock_token = '00000000-0000-0000-0000-000000000111'),
  'RUNNING:1',
  'claim persists the running state and first attempt'
);

select has_function(
  'public',
  'assertive_complete_reference_job',
  array['uuid', 'uuid', 'uuid', 'uuid[]'],
  'the server can complete and propagate exact references atomically'
);

select ok(
  coalesce(has_function_privilege(
    'service_role',
    to_regprocedure('public.assertive_complete_reference_job(uuid,uuid,uuid,uuid[])'),
    'EXECUTE'
  ), false)
    and not coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.assertive_complete_reference_job(uuid,uuid,uuid,uuid[])'),
      'EXECUTE'
    ), false),
  'only the trusted server can complete reference acquisition'
);

select throws_ok(
  $$select public.assertive_complete_reference_job(
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000111',
    array['00000000-0000-0000-0000-000000000321']::uuid[]
  )$$,
  'P0001',
  'Assertive reference completion rejected',
  'a same-owner upload not listed in the analysis input remains unavailable'
);

select lives_ok(
  $$select public.assertive_complete_reference_job(
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000111',
    array[
      '00000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000000322'
    ]::uuid[]
  )$$,
  'the claimed reference search accepts a pre-analysis user upload linked by input data'
);

select ok(
  (select status = 'SUCCEEDED'
      and lock_token is null
      and reference_asset_ids = array[
        '00000000-0000-0000-0000-000000000301',
        '00000000-0000-0000-0000-000000000322'
      ]::uuid[]
   from public.assertive_image_jobs
   where id = '00000000-0000-0000-0000-000000000104')
  and 6 = (
    select count(*)
    from public.assertive_image_jobs
    where listing_id = '00000000-0000-0000-0000-000000000103'
      and kind = 'GENERATE_SLOT'
      and reference_asset_ids = array[
        '00000000-0000-0000-0000-000000000301',
        '00000000-0000-0000-0000-000000000322'
      ]::uuid[]
  ),
  'completion updates the reference job and every generation slot together'
);

update public.assertive_image_jobs
set status = 'SUCCEEDED', lock_token = null, locked_at = null
where id = '00000000-0000-0000-0000-000000000104';

select lives_ok(
  $$insert into claimed_jobs
    select id, kind, position, status, attempt_count, lock_token
    from public.assertive_claim_image_job(
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000112'
    )$$,
  'the first generation worker can be claimed'
);

select lives_ok(
  $$insert into claimed_jobs
    select id, kind, position, status, attempt_count, lock_token
    from public.assertive_claim_image_job(
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000113'
    )$$,
  'the second generation worker can be claimed'
);

select is(
  (select array_agg(position order by position) from claimed_jobs where kind = 'GENERATE_SLOT'),
  array[0, 1],
  'generation claims preserve slot order'
);

select lives_ok(
  $$insert into claimed_jobs
    select id, kind, position, status, attempt_count, lock_token
    from public.assertive_claim_image_job(
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000114'
    )$$,
  'a third claim is handled without an error'
);

select is(
  (select count(*)::integer from claimed_jobs
    where lock_token = '00000000-0000-0000-0000-000000000114'),
  0,
  'a third live generation worker is not claimed'
);

update public.assertive_image_jobs
set status = 'RUNNING',
    lock_token = '00000000-0000-0000-0000-000000000112',
    locked_at = statement_timestamp() - interval '4 minutes',
    attempt_count = 1
where listing_id = '00000000-0000-0000-0000-000000000103'
  and kind = 'GENERATE_SLOT'
  and position = 0;

select lives_ok(
  $$insert into claimed_jobs
    select id, kind, position, status, attempt_count, lock_token
    from public.assertive_claim_image_job(
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000115'
    )$$,
  'a stale generation lock can be reclaimed'
);

select is(
  (select position::text || ':' || attempt_count::text from claimed_jobs
    where lock_token = '00000000-0000-0000-0000-000000000115'),
  '0:2',
  'stale recovery keeps the slot and increments its durable attempt'
);

create temporary table wrong_owner_claims (id uuid);
select lives_ok(
  $$insert into wrong_owner_claims (id)
    select id from public.assertive_claim_image_job(
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000116'
    )$$,
  'an ownership mismatch is handled without leaking a job'
);
select is(
  (select count(*)::integer from wrong_owner_claims),
  0,
  'a caller cannot claim another owner listing'
);

select has_function(
  'public',
  'assertive_upsert_listing_image_slot',
  array['uuid', 'uuid', 'integer', 'uuid', 'uuid'],
  'the server can project one generated slot atomically'
);

select has_function(
  'public',
  'assertive_confirm_image_slot',
  array['uuid', 'uuid', 'integer', 'uuid'],
  'the server can confirm one generated slot atomically'
);

select has_function(
  'public',
  'assertive_reset_image_slot',
  array['uuid', 'uuid', 'integer', 'text'],
  'the server can reset or dismiss one slot atomically'
);

select ok(
  coalesce(has_function_privilege(
    'service_role',
    to_regprocedure('public.assertive_upsert_listing_image_slot(uuid,uuid,integer,uuid,uuid)'),
    'EXECUTE'
  ), false)
    and not coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.assertive_upsert_listing_image_slot(uuid,uuid,integer,uuid,uuid)'),
      'EXECUTE'
    ), false)
    and coalesce(has_function_privilege(
      'service_role',
      to_regprocedure('public.assertive_confirm_image_slot(uuid,uuid,integer,uuid)'),
      'EXECUTE'
    ), false)
    and not coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.assertive_confirm_image_slot(uuid,uuid,integer,uuid)'),
      'EXECUTE'
    ), false)
    and coalesce(has_function_privilege(
      'service_role',
      to_regprocedure('public.assertive_reset_image_slot(uuid,uuid,integer,text)'),
      'EXECUTE'
    ), false)
    and not coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.assertive_reset_image_slot(uuid,uuid,integer,text)'),
      'EXECUTE'
    ), false),
  'slot mutations are restricted to the trusted server'
);

insert into public.assertive_image_assets (
  id, user_id, analysis_id, kind, origin, rights_status, storage_bucket,
  storage_key, public_url, sha256, mime_type, width, height, byte_size,
  parent_asset_id, provider, model, fidelity_status, metadata
) values
  (
    '00000000-0000-0000-0000-000000000302',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000102',
    'GENERATED_SCENE', 'AI_GENERATED', 'LICENSED', 'assertive',
    '00000000-0000-0000-0000-000000000101/generated-cover.jpg',
    'https://cdn.test/generated-cover.jpg', repeat('b', 64), 'image/jpeg', 2048, 2048, 8192,
    '00000000-0000-0000-0000-000000000301', 'gemini', 'test-image-model', 'ACCEPT',
    '{"truth_brief_hash":"truth","prompt_hash":"cover","review_required":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000303',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000102',
    'GENERATED_SCENE', 'AI_GENERATED', 'LICENSED', 'assertive',
    '00000000-0000-0000-0000-000000000101/generated-detail.jpg',
    'https://cdn.test/generated-detail.jpg', repeat('c', 64), 'image/jpeg', 2048, 2048, 8192,
    '00000000-0000-0000-0000-000000000301', 'gemini', 'test-image-model', 'ACCEPT',
    '{"truth_brief_hash":"truth","prompt_hash":"detail","review_required":true}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000304',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000102',
    'GENERATED_SCENE', 'AI_GENERATED', 'LICENSED', 'assertive',
    '00000000-0000-0000-0000-000000000101/generated-detail-two.jpg',
    'https://cdn.test/generated-detail-two.jpg', repeat('d', 64), 'image/jpeg', 2048, 2048, 8192,
    '00000000-0000-0000-0000-000000000301', 'gemini', 'test-image-model', 'ACCEPT',
    '{"truth_brief_hash":"truth","prompt_hash":"detail-two","review_required":true}'::jsonb
  );

select lives_ok(
  $$select public.assertive_upsert_listing_image_slot(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    0,
    '00000000-0000-0000-0000-000000000302',
    '00000000-0000-0000-0000-000000000115'
  )$$,
  'the claimed cover can be projected'
);

select is(
  (select status || ':' || output_asset_id::text
   from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000103' and position = 0),
  'REVIEW:00000000-0000-0000-0000-000000000302',
  'a projected output waits for human review'
);

select is(
  (select count(*)::integer
   from public.assertive_listing_images
   where listing_id = '00000000-0000-0000-0000-000000000103'
     and position = 0
     and asset_id = '00000000-0000-0000-0000-000000000302'),
  1,
  'the cover is linked at its stable position'
);

select is(
  (select photos from public.assertive_listings
   where id = '00000000-0000-0000-0000-000000000103'),
  '["https://cdn.test/generated-cover.jpg"]'::jsonb,
  'listing photos are rebuilt from projected slots'
);

select is(
  (select attributes #> '{image_review,required_asset_ids}'
   from public.assertive_listings
   where id = '00000000-0000-0000-0000-000000000103'),
  '["00000000-0000-0000-0000-000000000302"]'::jsonb,
  'generated output is added to mandatory human review'
);

select lives_ok(
  $$select public.assertive_upsert_listing_image_slot(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    1,
    '00000000-0000-0000-0000-000000000303',
    '00000000-0000-0000-0000-000000000113'
  )$$,
  'a concurrent detail can be projected without replacing the cover'
);

select lives_ok(
  $$insert into claimed_jobs
    select id, kind, position, status, attempt_count, lock_token
    from public.assertive_claim_image_job(
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000116'
    )$$,
  'the next slot becomes claimable after one worker finishes'
);

select is(
  (select position from claimed_jobs
   where lock_token = '00000000-0000-0000-0000-000000000116'),
  2,
  'the next missing detail keeps its original position'
);

select throws_ok(
  $$select public.assertive_upsert_listing_image_slot(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    2,
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000116'
  )$$,
  'P0001',
  'Assertive image slot rejected',
  'a private source reference can never enter the gallery'
);

select lives_ok(
  $$select public.assertive_upsert_listing_image_slot(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    2,
    '00000000-0000-0000-0000-000000000304',
    '00000000-0000-0000-0000-000000000116'
  )$$,
  'a second detail can be projected after a rejected reference attempt'
);

select is(
  (select string_agg(position::text || ':' || asset_id::text, ',' order by position)
   from public.assertive_listing_images
   where listing_id = '00000000-0000-0000-0000-000000000103'),
  '0:00000000-0000-0000-0000-000000000302,1:00000000-0000-0000-0000-000000000303,2:00000000-0000-0000-0000-000000000304',
  'concurrent slot projection preserves every accepted image'
);

select lives_ok(
  $$select public.assertive_confirm_image_slot(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    0,
    '00000000-0000-0000-0000-000000000302'
  )$$,
  'the owner can confirm the matching generated cover'
);

select is(
  (select status from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000103' and position = 0),
  'SUCCEEDED',
  'human confirmation completes the slot'
);

select is(
  (select attributes #> '{image_review,confirmed_asset_ids}'
   from public.assertive_listings
   where id = '00000000-0000-0000-0000-000000000103'),
  '["00000000-0000-0000-0000-000000000302"]'::jsonb,
  'human confirmation is persisted on the listing'
);

select throws_ok(
  $$select public.assertive_confirm_image_slot(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    1,
    '00000000-0000-0000-0000-000000000302'
  )$$,
  'P0001',
  'Assertive image confirmation rejected',
  'confirmation cannot target another slot output'
);

create temporary table previous_nonce (value uuid);
insert into previous_nonce
select generation_nonce
from public.assertive_image_jobs
where listing_id = '00000000-0000-0000-0000-000000000103' and position = 1;

select lives_ok(
  $$select public.assertive_reset_image_slot(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    1,
    'QUEUED'
  )$$,
  'one generated detail can be retried'
);

select ok(
  (select status = 'QUEUED'
      and output_asset_id is null
      and attempt_count = 0
      and generation_nonce <> (select value from previous_nonce)
   from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000103' and position = 1),
  'retry clears output state and rotates idempotency'
);

select is(
  (select string_agg(position::text, ',' order by position)
   from public.assertive_listing_images
   where listing_id = '00000000-0000-0000-0000-000000000103'),
  '0,2',
  'retry removes only the selected gallery position'
);

select is(
  (select attributes #> '{image_review,required_asset_ids}'
   from public.assertive_listings
   where id = '00000000-0000-0000-0000-000000000103'),
  '["00000000-0000-0000-0000-000000000302","00000000-0000-0000-0000-000000000304"]'::jsonb,
  'retry removes only the replaced asset from review'
);

select lives_ok(
  $$select public.assertive_reset_image_slot(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    2,
    'DISMISSED'
  )$$,
  'one generated detail can be dismissed'
);

select is(
  (select status from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000103' and position = 2),
  'DISMISSED',
  'dismissal prevents automatic reappearance'
);

select is(
  (select photos from public.assertive_listings
   where id = '00000000-0000-0000-0000-000000000103'),
  '["https://cdn.test/generated-cover.jpg"]'::jsonb,
  'dismissal preserves every other gallery slot'
);

update public.assertive_listings
set status = 'published'
where id = '00000000-0000-0000-0000-000000000103';

select throws_ok(
  $$select public.assertive_reset_image_slot(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    0,
    'QUEUED'
  )$$,
  'P0001',
  'Assertive image slot reset rejected',
  'published galleries are immutable'
);

insert into public.assertive_listings (
  id, analysis_id, user_id, title, description, status
) values (
  '00000000-0000-0000-0000-000000000123',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101',
  'Novo rascunho progressivo',
  'Descrição do novo rascunho progressivo',
  'draft'
);

select has_function(
  'public',
  'assertive_bootstrap_image_jobs',
  array['uuid', 'uuid', 'jsonb'],
  'the server can create missing image jobs idempotently'
);

select ok(
  coalesce(has_function_privilege(
    'service_role',
    to_regprocedure('public.assertive_bootstrap_image_jobs(uuid,uuid,jsonb)'),
    'EXECUTE'
  ), false)
    and not coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.assertive_bootstrap_image_jobs(uuid,uuid,jsonb)'),
      'EXECUTE'
    ), false),
  'only the trusted server can bootstrap image jobs'
);

select lives_ok(
  $$select public.assertive_bootstrap_image_jobs(
    '00000000-0000-0000-0000-000000000123',
    '00000000-0000-0000-0000-000000000101',
    '[
      {"position":0,"role":"MAIN","shot":{"title":"Foto principal","description":"Fundo branco","required":true}},
      {"position":1,"role":"DETAIL","shot":{"title":"Detalhe 1","description":"Primeiro detalhe","required":true}},
      {"position":2,"role":"DETAIL","shot":{"title":"Detalhe 2","description":"Segundo detalhe","required":true}},
      {"position":3,"role":"LIFESTYLE","shot":{"title":"Uso 1","description":"Primeiro contexto","required":false}},
      {"position":4,"role":"LIFESTYLE","shot":{"title":"Uso 2","description":"Segundo contexto","required":false}},
      {"position":5,"role":"INFORMATIONAL","shot":{"title":"Informação","description":"Vista técnica segura","required":false}}
    ]'::jsonb
  )$$,
  'a new draft can bootstrap its progressive work'
);

select is(
  (select count(*)::integer
   from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000123'),
  7,
  'an empty draft receives one reference job and six slots'
);

select lives_ok(
  $$select public.assertive_bootstrap_image_jobs(
    '00000000-0000-0000-0000-000000000123',
    '00000000-0000-0000-0000-000000000101',
    '[
      {"position":0,"role":"MAIN","shot":{"title":"Foto principal"}},
      {"position":1,"role":"DETAIL","shot":{"title":"Detalhe 1"}},
      {"position":2,"role":"DETAIL","shot":{"title":"Detalhe 2"}},
      {"position":3,"role":"LIFESTYLE","shot":{"title":"Uso 1"}},
      {"position":4,"role":"LIFESTYLE","shot":{"title":"Uso 2"}},
      {"position":5,"role":"INFORMATIONAL","shot":{"title":"Informação"}}
    ]'::jsonb
  )$$,
  'bootstrap can be safely replayed'
);

select is(
  (select count(*)::integer
   from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000123'),
  7,
  'bootstrap replay does not duplicate work'
);

update public.assertive_image_jobs
set status = 'FAILED', attempt_count = max_attempts, reference_asset_ids = '{}'
where listing_id = '00000000-0000-0000-0000-000000000123'
  and (kind = 'REFERENCE_SEARCH' or position = 5);

select lives_ok(
  $$select public.assertive_reset_image_slot(
    '00000000-0000-0000-0000-000000000123',
    '00000000-0000-0000-0000-000000000101',
    5,
    'QUEUED'
  )$$,
  'a slot can request fresh references after terminal acquisition failure'
);

select ok(
  (select status = 'QUEUED'
      and attempt_count = 0
      and reference_asset_ids = '{}'
   from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000123'
     and kind = 'REFERENCE_SEARCH'),
  'retry reopens terminal reference acquisition when no reference is usable'
);

select has_function(
  'public',
  'assertive_attach_manual_image_slot',
  array['uuid', 'uuid', 'integer', 'uuid'],
  'the server can atomically assign a user-owned rendition to one slot'
);

select ok(
  coalesce(has_function_privilege(
    'service_role',
    to_regprocedure('public.assertive_attach_manual_image_slot(uuid,uuid,integer,uuid)'),
    'EXECUTE'
  ), false)
    and not coalesce(has_function_privilege(
      'authenticated',
      to_regprocedure('public.assertive_attach_manual_image_slot(uuid,uuid,integer,uuid)'),
      'EXECUTE'
    ), false),
  'only the trusted server can assign manual image slots'
);

insert into public.assertive_image_assets (
  id, user_id, analysis_id, kind, origin, rights_status, storage_bucket,
  storage_key, public_url, sha256, mime_type, width, height, byte_size,
  parent_asset_id, provider, model, fidelity_status, metadata
) values
  (
    '00000000-0000-0000-0000-000000000305',
    '00000000-0000-0000-0000-000000000101', null,
    'ORIGINAL_EVIDENCE', 'USER_UPLOAD', 'USER_OWNED', 'assertive-originals',
    '00000000-0000-0000-0000-000000000101/manual-original.jpg', null,
    repeat('d', 64), 'image/jpeg', 1200, 1200, 4096,
    null, null, null, null, '{}'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000306',
    '00000000-0000-0000-0000-000000000101', null,
    'PUBLICATION_RENDITION', 'USER_UPLOAD', 'USER_OWNED', 'assertive',
    '00000000-0000-0000-0000-000000000101/manual-rendition.jpg',
    'https://cdn.test/manual-rendition.jpg', repeat('e', 64), 'image/jpeg', 1200, 1200, 4096,
    '00000000-0000-0000-0000-000000000305', 'local', 'sharp-v1', 'ACCEPT', '{}'::jsonb
  );

update public.assertive_listings
set attributes = '{"image_review":{"outcome":"progressive_pending"}}'::jsonb
where id = '00000000-0000-0000-0000-000000000123';

select throws_ok(
  $$select public.assertive_attach_manual_image_slot(
    '00000000-0000-0000-0000-000000000123',
    '00000000-0000-0000-0000-000000000102',
    5,
    '00000000-0000-0000-0000-000000000306'
  )$$,
  'P0001',
  'Assertive manual image slot rejected',
  'manual assignment cannot cross listing ownership'
);

select throws_ok(
  $$select public.assertive_attach_manual_image_slot(
    '00000000-0000-0000-0000-000000000123',
    '00000000-0000-0000-0000-000000000101',
    5,
    '00000000-0000-0000-0000-000000000305'
  )$$,
  'P0001',
  'Assertive manual image slot rejected',
  'manual assignment rejects a private original asset'
);

select throws_ok(
  $$select public.assertive_attach_manual_image_slot(
    '00000000-0000-0000-0000-000000000123',
    '00000000-0000-0000-0000-000000000101',
    0,
    '00000000-0000-0000-0000-000000000306'
  )$$,
  'P0001',
  'Assertive manual image slot rejected',
  'a manual cover requires a recorded white-background approval'
);

insert into public.assertive_listings (
  id, analysis_id, user_id, title, description, status, attributes
) values (
  '00000000-0000-0000-0000-000000000124',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101',
  'Rascunho com galeria preservada',
  'Descrição do rascunho com galeria preservada',
  'needs_input',
  '{"image_review":{"outcome":"progressive_pending","required_asset_ids":["00000000-0000-0000-0000-000000000304"],"confirmed_asset_ids":[]}}'::jsonb
);

insert into public.assertive_listing_images (listing_id, asset_id, position, role)
values
  ('00000000-0000-0000-0000-000000000124', '00000000-0000-0000-0000-000000000306', 0, 'MAIN'),
  ('00000000-0000-0000-0000-000000000124', '00000000-0000-0000-0000-000000000304', 1, 'DETAIL');

select lives_ok(
  $$select public.assertive_bootstrap_image_jobs(
    '00000000-0000-0000-0000-000000000124',
    '00000000-0000-0000-0000-000000000101',
    '[
      {"position":0,"role":"MAIN","shot":{"title":"Foto principal"}},
      {"position":1,"role":"DETAIL","shot":{"title":"Detalhe 1"}},
      {"position":2,"role":"DETAIL","shot":{"title":"Detalhe 2"}},
      {"position":3,"role":"LIFESTYLE","shot":{"title":"Uso 1"}},
      {"position":4,"role":"LIFESTYLE","shot":{"title":"Uso 2"}},
      {"position":5,"role":"INFORMATIONAL","shot":{"title":"Informação"}}
    ]'::jsonb
  )$$,
  'an existing governed gallery can bootstrap without replacing its photos'
);

select is(
  (select count(*)::integer
   from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000124'),
  7,
  'an existing gallery still receives the complete seven-job contract'
);

select ok(
  (select status = 'SUCCEEDED'
      and output_asset_id = '00000000-0000-0000-0000-000000000306'
   from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000124'
     and position = 0)
  and
  (select status = 'REVIEW'
      and output_asset_id = '00000000-0000-0000-0000-000000000304'
   from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000124'
     and position = 1),
  'bootstrap preserves manual confirmation and pending AI review semantics'
);

select lives_ok(
  $$select public.assertive_attach_manual_image_slot(
    '00000000-0000-0000-0000-000000000123',
    '00000000-0000-0000-0000-000000000101',
    5,
    '00000000-0000-0000-0000-000000000306'
  )$$,
  'a safe user-owned rendition can fill a progressive slot'
);

select ok(
  (select status = 'SUCCEEDED'
      and output_asset_id = '00000000-0000-0000-0000-000000000306'
   from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000123'
     and position = 5)
  and exists (
    select 1
    from public.assertive_listing_images
    where listing_id = '00000000-0000-0000-0000-000000000123'
      and position = 5
      and asset_id = '00000000-0000-0000-0000-000000000306'
  ),
  'manual assignment completes and projects only the selected slot'
);

select is(
  (select attributes #>> '{image_review,outcome}'
   from public.assertive_listings
   where id = '00000000-0000-0000-0000-000000000123'),
  'progressive_pending',
  'slot refresh preserves the progressive editor marker'
);

update public.assertive_image_jobs
set status = 'RUNNING',
    attempt_count = max_attempts,
    lock_token = '00000000-0000-0000-0000-000000000777',
    locked_at = now() - interval '4 minutes'
where listing_id = '00000000-0000-0000-0000-000000000123'
  and position = 4;

select lives_ok(
  $$select * from public.assertive_claim_image_job(
    '00000000-0000-0000-0000-000000000123',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000778'
  )$$,
  'claim recovery handles a final attempt whose worker disappeared'
);

select ok(
  (select status = 'FAILED'
      and lock_token is null
      and locked_at is null
      and error_code = 'IMAGE_WORKER_TIMEOUT'
   from public.assertive_image_jobs
   where listing_id = '00000000-0000-0000-0000-000000000123'
     and position = 4),
  'an expired final attempt becomes terminal instead of remaining locked forever'
);

update public.assertive_listings
set status = 'published'
where id = '00000000-0000-0000-0000-000000000123';

select throws_ok(
  $$select public.assertive_bootstrap_image_jobs(
    '00000000-0000-0000-0000-000000000123',
    '00000000-0000-0000-0000-000000000101',
    '[]'::jsonb
  )$$,
  'P0001',
  'Assertive image job bootstrap rejected',
  'published listings cannot bootstrap new work'
);

select * from finish();
rollback;
