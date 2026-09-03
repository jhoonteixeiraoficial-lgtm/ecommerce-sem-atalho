import { spawn, spawnSync } from 'node:child_process'

const container = 'supabase_db_ecommerce-sem-atalho-local'
const userId = '00000000-0000-0000-0000-000000000451'
const postId = '00000000-0000-0000-0000-000000001451'
const operationId = '00000000-0000-0000-0000-000000009451'

function psqlSync(sql) {
  const result = spawnSync(
    'docker',
    ['exec', container, 'psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql],
    { encoding: 'utf8' },
  )

  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  return result.stdout.trim()
}

function psql(sql, applicationName) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-e',
        `PGAPPNAME=${applicationName}`,
        container,
        'psql',
        '-XAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        sql,
      ],
    )
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr || stdout))
      else resolve(stdout.trim())
    })
  })
}

async function waitForActivity(applicationName, waitEventType) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const count = psqlSync(`
      select count(*)
      from pg_catalog.pg_stat_activity
      where application_name = '${applicationName}'
        and wait_event_type = '${waitEventType}';
    `)
    if (count === '1') return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`${applicationName} did not enter ${waitEventType} wait state`)
}

const setup = `
  insert into auth.users (id, email)
  values ('${userId}', 'reaction-concurrency@test.local');
  insert into public.subscriptions (user_id, plan, status, current_period_end)
  values ('${userId}', 'comunidade', 'active', statement_timestamp() + interval '1 day');
  insert into public.community_posts (id, user_id, content)
  values ('${postId}', '${userId}', 'concurrency fixture');
  create function public.test_delay_reaction_operation()
  returns trigger language plpgsql set search_path = '' as $$
  begin
    if new.operation_id = '${operationId}'::uuid then
      perform pg_catalog.pg_sleep(3);
    end if;
    return new;
  end;
  $$;
  create trigger test_delay_reaction_operation
    after insert on public.community_reaction_operations
    for each row execute function public.test_delay_reaction_operation();
`

const cleanup = `
  do $$
  begin
    if pg_catalog.to_regclass('public.community_reaction_operations') is not null then
      execute 'drop trigger if exists test_delay_reaction_operation on public.community_reaction_operations';
    end if;
  end;
  $$;
  drop function if exists public.test_delay_reaction_operation();
  delete from auth.users where id = '${userId}';
`

const toggle = `
  select set_config('request.jwt.claim.role', 'service_role', false);
  set role service_role;
  select public.toggle_community_reaction('${userId}', '${postId}', 'fire', '${operationId}')::text;
`

try {
  psqlSync(setup)
  const firstCall = psql(toggle, 'reaction-concurrency-first')
  await waitForActivity('reaction-concurrency-first', 'Timeout')
  const duplicateCall = psql(toggle, 'reaction-concurrency-duplicate')
  await waitForActivity('reaction-concurrency-duplicate', 'Lock')
  const outputs = await Promise.all([firstCall, duplicateCall])
  const results = outputs.map((output) => output.split(/\r?\n/).find((line) => line.startsWith('{')))

  if (!results[0] || results[0] !== results[1]) {
    throw new Error(`concurrent duplicate calls returned different results: ${JSON.stringify(results)}`)
  }

  const counts = psqlSync(`
    select
      (select count(*) from public.community_reactions where user_id = '${userId}' and post_id = '${postId}' and reaction_type = 'fire'),
      (select count(*) from public.community_reaction_operations where user_id = '${userId}' and operation_id = '${operationId}');
  `)
  if (counts !== '1|1') throw new Error(`concurrent duplicate calls persisted unexpected counts: ${counts}`)

  console.log('Concurrent duplicate reaction operations returned one result and persisted one toggle: PASS')
} finally {
  try {
    psqlSync(cleanup)
  } catch (error) {
    console.error(`Concurrency cleanup failed: ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  }
}
