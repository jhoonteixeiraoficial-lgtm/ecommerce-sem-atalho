import { spawnSync } from 'node:child_process'

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function runSupabase(args) {
  const result = spawnSync(npx, ['supabase', ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`supabase ${args.join(' ')} exited with status ${result.status}`)
  }
}

function runNode(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${script} exited with status ${result.status}`)
}

let failed = false

try {
  runSupabase(['test', 'db'])
  runNode('scripts/test-reaction-concurrency.mjs')
  runSupabase([
    'db',
    'reset',
    '--version',
    '012',
    '--sql-paths',
    './migration-tests/013_database_security_boundaries.fixture.sql',
  ])
  runSupabase(['migration', 'up', '--local'])
  runSupabase([
    'test',
    'db',
    'supabase/migration-tests/013_database_security_boundaries.test.sql',
  ])
  runSupabase([
    'db',
    'reset',
    '--version',
    '016',
    '--sql-paths',
    './migration-tests/017_community_profiles.fixture.sql',
  ])
  runSupabase(['migration', 'up', '--local'])
  runSupabase([
    'test',
    'db',
    'supabase/migration-tests/017_community_profiles.test.sql',
  ])
} catch (error) {
  failed = true
  console.error(error instanceof Error ? error.message : error)
} finally {
  try {
    runSupabase(['db', 'reset'])
  } catch (error) {
    failed = true
    console.error(error instanceof Error ? error.message : error)
  }
}

if (failed) process.exitCode = 1
