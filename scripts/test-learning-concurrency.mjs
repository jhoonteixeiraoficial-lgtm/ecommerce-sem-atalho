import { spawn, spawnSync } from 'node:child_process'

const container = 'supabase_db_ecommerce-sem-atalho-local'
const actorId = '00000000-0000-0000-0000-000000000971'
const deactivatorId = '00000000-0000-0000-0000-000000000972'
const spareAdminId = '00000000-0000-0000-0000-000000000973'
const memberId = '00000000-0000-0000-0000-000000000974'
const moduleRace = {
  course: '00000000-0000-0000-0000-000000000981',
  module: '00000000-0000-0000-0000-000000000982',
  lesson: '00000000-0000-0000-0000-000000000983',
}
const courseRace = {
  course: '00000000-0000-0000-0000-000000000984',
  module: '00000000-0000-0000-0000-000000000985',
  lesson: '00000000-0000-0000-0000-000000000986',
}
const deadlockRace = {
  course: '00000000-0000-0000-0000-000000000987',
  module: '00000000-0000-0000-0000-000000000988',
  lesson: '00000000-0000-0000-0000-000000000989',
}
const unauthorizedCourseId = '00000000-0000-0000-0000-000000000990'

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
    const child = spawn('docker', [
      'exec', '-e', `PGAPPNAME=${applicationName}`, container,
      'psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sql,
    ])
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

function settle(promise) {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason }),
  )
}

async function waitForActivity(applicationName, waitEventType, timeout = 5000) {
  const deadline = Date.now() + timeout
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

function serviceAction({ actor = actorId, entity, action, id, title = null }) {
  const value = title === null ? 'null' : `'${title}'`
  return `
    set statement_timeout = '12s';
    select set_config('request.jwt.claim.role', 'service_role', false);
    set role service_role;
    select public.admin_learning_action(
      '${actor}', '${entity}', '${action}', '${id}', null,
      null, ${value}, null, null, null, null, null, null, false
    );
  `
}

const setup = `
  delete from public.admin_audit_log
  where actor_user_id in ('${actorId}', '${deactivatorId}', '${spareAdminId}');
  delete from public.lesson_progress
  where lesson_id between '${moduleRace.lesson}' and '${deadlockRace.lesson}';
  delete from public.lessons
  where id between '${moduleRace.lesson}' and '${deadlockRace.lesson}';
  delete from public.modules
  where id between '${moduleRace.module}' and '${deadlockRace.module}';
  delete from public.courses
  where id between '${moduleRace.course}' and '${unauthorizedCourseId}';
  delete from auth.users
  where id between '${actorId}' and '${memberId}';

  insert into auth.users (id, email)
  values
    ('${actorId}', 'learning-race-actor@test.local'),
    ('${deactivatorId}', 'learning-race-deactivator@test.local'),
    ('${spareAdminId}', 'learning-race-spare@test.local'),
    ('${memberId}', 'learning-race-member@test.local');
  update public.user_roles
  set role = 'admin'
  where user_id in ('${actorId}', '${deactivatorId}', '${spareAdminId}');

  insert into public.courses (id, slug, title, is_published)
  values
    ('${moduleRace.course}', 'module-race-course', 'Module race course', true),
    ('${courseRace.course}', 'course-race-course', 'Course race course', true),
    ('${deadlockRace.course}', 'deadlock-race-course', 'Deadlock race course', true);
  insert into public.modules (id, course_id, slug, title, is_published)
  values
    ('${moduleRace.module}', '${moduleRace.course}', 'module-race-module', 'Module race module', true),
    ('${courseRace.module}', '${courseRace.course}', 'course-race-module', 'Course race module', true),
    ('${deadlockRace.module}', '${deadlockRace.course}', 'deadlock-race-module', 'Deadlock race module', true);
  insert into public.lessons (id, module_id, slug, title, is_published)
  values
    ('${moduleRace.lesson}', '${moduleRace.module}', 'module-race-lesson', 'Module race lesson', true),
    ('${courseRace.lesson}', '${courseRace.module}', 'course-race-lesson', 'Course race lesson', true),
    ('${deadlockRace.lesson}', '${deadlockRace.module}', 'deadlock-race-lesson', 'Deadlock race lesson', true);

  create function public.test_delay_learning_delete()
  returns trigger language plpgsql set search_path = '' as $$
  begin
    if old.id in ('${moduleRace.module}'::uuid, '${deadlockRace.module}'::uuid) then
      perform pg_catalog.pg_sleep(4);
    end if;
    return old;
  end;
  $$;
  create trigger test_delay_learning_delete
    before delete on public.modules
    for each row execute function public.test_delay_learning_delete();

  create function public.test_delay_admin_deactivation()
  returns trigger language plpgsql set search_path = '' as $$
  begin
    if new.user_id = '${actorId}'::uuid and new.status = 'banned'::public.account_state then
      perform pg_catalog.pg_sleep(4);
    end if;
    return new;
  end;
  $$;
  create trigger test_delay_admin_deactivation
    before update on public.account_status
    for each row execute function public.test_delay_admin_deactivation();
`

const cleanup = `
  drop trigger if exists test_delay_learning_delete on public.modules;
  drop function if exists public.test_delay_learning_delete();
  drop trigger if exists test_delay_admin_deactivation on public.account_status;
  drop function if exists public.test_delay_admin_deactivation();
  delete from public.admin_audit_log
  where actor_user_id in ('${actorId}', '${deactivatorId}', '${spareAdminId}');
  delete from public.lesson_progress
  where lesson_id between '${moduleRace.lesson}' and '${deadlockRace.lesson}';
  delete from public.lessons
  where id between '${moduleRace.lesson}' and '${deadlockRace.lesson}';
  delete from public.modules
  where id between '${moduleRace.module}' and '${deadlockRace.module}';
  delete from public.courses
  where id between '${moduleRace.course}' and '${unauthorizedCourseId}';
  delete from auth.users
  where id between '${actorId}' and '${memberId}';
`

async function testModuleProgressRace() {
  const deletion = settle(psql(
    serviceAction({ entity: 'module', action: 'delete', id: moduleRace.module }),
    'learning-module-delete',
  ))
  await waitForActivity('learning-module-delete', 'Timeout')

  const insertion = settle(psql(`
    set statement_timeout = '12s';
    insert into public.lesson_progress (user_id, lesson_id, position_seconds)
    values ('${memberId}', '${moduleRace.lesson}', 10);
  `, 'learning-module-progress-insert'))

  let lockError
  try {
    await waitForActivity('learning-module-progress-insert', 'Lock', 2000)
  } catch (error) {
    lockError = error
  }
  const [deleteResult, insertResult] = await Promise.all([deletion, insertion])

  if (lockError) throw lockError
  if (deleteResult.status !== 'fulfilled') throw deleteResult.reason
  if (insertResult.status !== 'rejected' || !String(insertResult.reason).includes('foreign key constraint')) {
    throw new Error('progress insertion was not rejected by descendant deletion FK protection')
  }
  const counts = psqlSync(`
    select
      (select count(*) from public.lesson_progress where lesson_id = '${moduleRace.lesson}'),
      (select count(*) from public.modules where id = '${moduleRace.module}');
  `)
  if (counts !== '0|0') throw new Error(`module race persisted unexpected rows: ${counts}`)
}

async function testCourseProgressRace() {
  const holder = psql(`
    begin;
    select id from public.courses where id = '${courseRace.course}' for update;
    select pg_sleep(3);
    commit;
  `, 'learning-course-lock-holder')
  await waitForActivity('learning-course-lock-holder', 'Timeout')

  const deletion = settle(psql(
    serviceAction({ entity: 'course', action: 'delete', id: courseRace.course }),
    'learning-course-delete',
  ))
  await waitForActivity('learning-course-delete', 'Lock')
  await psql(`
    insert into public.lesson_progress (user_id, lesson_id, position_seconds)
    values ('${memberId}', '${courseRace.lesson}', 20);
  `, 'learning-course-progress-insert')

  await holder
  const deleteResult = await deletion
  if (deleteResult.status !== 'rejected' || !String(deleteResult.reason).includes('Learning action conflict')) {
    throw new Error('course deletion did not retain its descendant conflict')
  }
  const counts = psqlSync(`
    select
      (select count(*) from public.lesson_progress where lesson_id = '${courseRace.lesson}'),
      (select count(*) from public.courses where id = '${courseRace.course}');
  `)
  if (counts !== '1|1') throw new Error(`course race lost progress or hierarchy: ${counts}`)
}

async function testActorDeactivationRace() {
  const deactivation = settle(psql(`
    set statement_timeout = '12s';
    select set_config('request.jwt.claim.role', 'service_role', false);
    set role service_role;
    select public.admin_user_action(
      '${deactivatorId}', '${actorId}', 'set_status', null, 'banned', 'Concurrency test'
    );
  `, 'learning-actor-deactivation'))
  await waitForActivity('learning-actor-deactivation', 'Timeout')

  const learningAction = settle(psql(`
    set statement_timeout = '12s';
    select set_config('request.jwt.claim.role', 'service_role', false);
    set role service_role;
    select public.admin_learning_action(
      '${actorId}', 'course', 'create', '${unauthorizedCourseId}', null,
      'unauthorized-race-course', 'Unauthorized race course', '', null, null, 0, false, null, true
    );
  `, 'learning-after-deactivation'))

  let lockError
  try {
    await waitForActivity('learning-after-deactivation', 'Lock', 2000)
  } catch (error) {
    lockError = error
  }
  const [deactivationResult, actionResult] = await Promise.all([deactivation, learningAction])

  if (lockError) throw lockError
  if (deactivationResult.status !== 'fulfilled') throw deactivationResult.reason
  if (actionResult.status !== 'rejected' || !String(actionResult.reason).includes('Learning action rejected')) {
    throw new Error('learning action was not rejected after serialized actor deactivation')
  }
  if (psqlSync(`select count(*) from public.courses where id = '${unauthorizedCourseId}';`) !== '0') {
    throw new Error('deactivated actor committed a learning mutation')
  }
}

async function testParentChildLockOrder() {
  const deletion = settle(psql(
    serviceAction({ actor: deactivatorId, entity: 'module', action: 'delete', id: deadlockRace.module }),
    'learning-parent-delete',
  ))
  await waitForActivity('learning-parent-delete', 'Timeout')

  const childUpdate = settle(psql(
    serviceAction({ actor: deactivatorId, entity: 'lesson', action: 'update', id: deadlockRace.lesson, title: 'Updated safely' }),
    'learning-child-update',
  ))
  await waitForActivity('learning-child-update', 'Lock')
  const [deleteResult, updateResult] = await Promise.all([deletion, childUpdate])
  const combinedErrors = [deleteResult, updateResult]
    .filter((result) => result.status === 'rejected')
    .map((result) => String(result.reason))
    .join('\n')

  if (combinedErrors.includes('deadlock detected')) throw new Error('parent/child actions deadlocked')
  if (deleteResult.status !== 'fulfilled') throw deleteResult.reason
  if (updateResult.status !== 'rejected' || !String(updateResult.reason).includes('Learning action rejected')) {
    throw new Error('child update did not serialize behind parent deletion')
  }
}

const tests = [
  ['progress insertion serializes behind module deletion', testModuleProgressRace],
  ['course deletion preserves concurrently inserted descendant progress', testCourseProgressRace],
  ['actor deactivation serializes before learning authorization', testActorDeactivationRace],
  ['parent deletion and child update complete without deadlock', testParentChildLockOrder],
]

const failures = []
try {
  psqlSync(setup)
  for (const [name, test] of tests) {
    try {
      await test()
      console.log(`${name}: PASS`)
    } catch (error) {
      failures.push(`${name}: ${error instanceof Error ? error.message : error}`)
      console.error(`${name}: FAIL`)
    }
  }
} finally {
  try {
    psqlSync(cleanup)
  } catch (error) {
    failures.push(`cleanup: ${error instanceof Error ? error.message : error}`)
  }
}

if (failures.length > 0) {
  throw new Error(`Learning concurrency failures:\n${failures.join('\n')}`)
}
