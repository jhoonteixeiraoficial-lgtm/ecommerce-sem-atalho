# Security And Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the known privilege-escalation and credential risks, introduce canonical role/account-status boundaries, and make authorization fail closed while preserving the two existing Supabase Auth accounts.

**Architecture:** Supabase Auth remains the identity provider. Authorization moves from user-editable `profiles` columns into server-controlled `user_roles` and `account_status` tables, while all privileged mutations pass through server-only guards and append an audit record. Existing application tables remain readable during this first cutover, but unsafe writes are removed and subsequent domain plans migrate course, community, media, live, and billing data onto the canonical model.

**Tech Stack:** Next.js 16.3.3 App Router, React 19, TypeScript 5 strict mode, Supabase Auth/PostgreSQL/RLS, Zod 3, Vitest, pgTAP through Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-09-02-esa-ecosystem-reconstruction-design.md`

## Global Constraints

- Keep Next.js, Supabase, and Vercel.
- Preserve the two existing Supabase Auth accounts.
- Keep `https://ecommerce-sem-atalho.vercel.app` until the Hostinger domain is purchased.
- Checkout and paid advertising remain disabled until all release gates pass.
- The owner administrator is identified by immutable Auth user ID `d8c3528e-471e-4835-85a6-c9effb38fdf2`, not by email-only logic.
- Members cannot update role, ban state, subscription state, provider IDs, or entitlements through Supabase REST calls.
- Privileged operations execute only in server routes with a server-only service key.
- Middleware and API authorization fail closed when configuration or authorization lookup fails.
- RLS tests cover anonymous, member, expired, banned, admin, and service identities.
- Never commit credentials, passwords, access tokens, provider secrets, or generated `.env` files.
- Do not rewrite Git history, rotate credentials, modify production data, or deploy without the explicit execution-time safety checkpoint in Task 2 and Task 9.

---

## File Structure

### Test And Tooling

- Modify `package.json`: add Vitest, Supabase CLI, test scripts, and secret-scan scripts.
- Create `vitest.config.ts`: Node test environment and `@/` alias.
- Create `supabase/config.toml`: local Supabase project configuration.
- Create `supabase/tests/database/security_foundation.test.sql`: pgTAP authorization tests.
- Create `src/lib/auth/access.test.ts`: pure access-decision tests.
- Create `src/lib/auth/guards.test.ts`: server guard behavior tests with injected dependencies.

### Authorization Runtime

- Create `src/lib/supabase/admin.ts`: server-only service-role client factory.
- Create `src/lib/auth/types.ts`: role, status, and access result types.
- Create `src/lib/auth/access.ts`: pure access decision function.
- Create `src/lib/auth/guards.ts`: `requireUser()` and `requireAdmin()`.
- Create `src/lib/auth/audit.ts`: append-only audit helper.
- Modify `src/lib/supabase/middleware.ts`: fail-closed page authorization using canonical tables.
- Modify `src/middleware.ts`: include protected API namespaces in authorization matching.

### Database

- Create `supabase/migrations/010_security_foundation.sql`: canonical role/status/audit tables, hardened functions, grants, and legacy write lockdown.
- Create `supabase/production/010_seed_owner_admin.sql`: one-time production owner-role seed using the immutable Auth ID.
- Create `supabase/migrations/010_security_foundation.down.sql`: reviewed rollback for staging rehearsal only.

### Safe APIs

- Create `src/app/api/account/profile/route.ts`: safe profile update endpoint.
- Create `src/app/api/admin/users/[userId]/route.ts`: role/status update endpoint.
- Modify `src/app/api/admin/users/route.ts`: canonical read model and server-only admin client.
- Modify `src/app/membros/perfil/page.tsx`: use account API instead of direct profile writes.
- Modify `src/app/admin/users/page.tsx`: use admin APIs instead of browser-side privileged writes.
- Modify `src/app/admin/layout.tsx`: server-enforced admin layout with no unauthorized flash.

### Incident And Operations

- Delete `scripts/setup-admin.js`.
- Delete `scripts/fix-rls.js`.
- Delete `scripts/create-functions.js`.
- Modify `.gitignore`: allow a credential-free `.env.example`.
- Create `.env.example`: variable names only.
- Create `.gitleaks.toml`: repository secret scanning configuration.
- Create `docs/security/credential-rotation-runbook.md`: exact rotation and verification sequence.
- Create `docs/security/production-cutover-checklist.md`: backup, migration, verification, and rollback gates.

---

### Task 1: Establish The Test Harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/auth/access.test.ts`
- Create: `supabase/config.toml`
- Create: `supabase/tests/database/security_foundation.test.sql`

**Interfaces:**
- Produces: `npm run test`, `npm run test:watch`, and `npm run test:db` commands used by every later task.
- Produces: the wished-for access API `resolveAccess(input: AccessInput): AccessResult`, implemented in Task 4.

- [ ] **Step 1: Add test dependencies and scripts**

Add `vitest` and `supabase` to `devDependencies`. Add these scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:db": "supabase test db",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 2: Create the Vitest configuration**

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', restoreMocks: true },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

- [ ] **Step 3: Write the failing access-decision tests**

```ts
import { describe, expect, it } from 'vitest'
import { resolveAccess } from './access'

describe('resolveAccess', () => {
  it('allows an active administrator into admin and member areas', () => {
    expect(resolveAccess({ role: 'admin', status: 'active', accessUntil: null })).toEqual({
      canUseMemberArea: true,
      canUseAdminArea: true,
      reason: null,
    })
  })

  it('blocks a banned administrator from every protected area', () => {
    expect(resolveAccess({ role: 'admin', status: 'banned', accessUntil: null })).toEqual({
      canUseMemberArea: false,
      canUseAdminArea: false,
      reason: 'banned',
    })
  })

  it('allows a member only while paid access is current', () => {
    expect(resolveAccess({
      role: 'member',
      status: 'active',
      accessUntil: '2099-01-01T00:00:00.000Z',
      now: '2026-09-02T00:00:00.000Z',
    }).canUseMemberArea).toBe(true)
  })

  it('blocks an expired member', () => {
    expect(resolveAccess({
      role: 'member',
      status: 'active',
      accessUntil: '2026-09-01T00:00:00.000Z',
      now: '2026-09-02T00:00:00.000Z',
    }).reason).toBe('expired')
  })
})
```

- [ ] **Step 4: Run the unit test and verify RED**

Run: `npm run test -- src/lib/auth/access.test.ts`

Expected: FAIL because `src/lib/auth/access.ts` does not exist.

- [ ] **Step 5: Initialize local Supabase configuration**

Run: `npx supabase init`

Keep the generated `supabase/config.toml`; set project ID to `ecommerce-sem-atalho-local`. Do not link it to production in this task.

- [ ] **Step 6: Create the initial pgTAP test shell**

```sql
begin;
select plan(1);
select ok(true, 'local database test harness runs');
select * from finish();
rollback;
```

- [ ] **Step 7: Start local Supabase and verify the database harness**

Run: `npx supabase start`

Run: `npm run test:db`

Expected: one pgTAP assertion passes.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/auth/access.test.ts supabase/config.toml supabase/tests/database/security_foundation.test.sql
git commit -m "test: establish security test harness"
```

### Task 2: Contain The Credential Incident

**Files:**
- Delete: `scripts/setup-admin.js`
- Delete: `scripts/fix-rls.js`
- Delete: `scripts/create-functions.js`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `.gitleaks.toml`
- Create: `docs/security/credential-rotation-runbook.md`

**Interfaces:**
- Produces: a repository with no plaintext Supabase secret or administrator password in the current tree.
- Produces: environment contract consumed by `src/lib/supabase/admin.ts` in Task 4.

- [ ] **Step 1: Record the execution-time safety checkpoint**

Before changing external credentials, obtain explicit approval for these irreversible/external actions:

```text
Rotate Supabase secret key, reset the owner password, revoke owner sessions,
inspect provider logs, and later purge credentials from Git history.
```

Do not proceed with provider-side rotation until that approval is recorded.

- [ ] **Step 2: Delete credential-bearing scripts**

Delete the three files listed above. Do not replace them with scripts that contain default credentials.

- [ ] **Step 3: Permit a safe environment template**

Append to `.gitignore`:

```gitignore
!.env.example
```

Create `.env.example`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
```

- [ ] **Step 4: Configure secret scanning**

Create `.gitleaks.toml`:

```toml
title = "ESA secret scanning"

[extend]
useDefault = true

[allowlist]
paths = ['''\.env\.example$''']
```

- [ ] **Step 5: Write the rotation runbook**

The document must include this exact order:

1. Create a fresh Supabase secret key.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel production and preview environments.
3. redeploy and verify authenticated server routes.
4. Revoke the exposed key.
5. Reset the owner password through Supabase Auth.
6. Revoke all owner sessions.
7. Review Auth, database, Storage, and deployment logs from the first exposed commit.
8. Run Gitleaks across the full Git history.
9. Plan a separately approved history rewrite if a shared remote contains the secret.

- [ ] **Step 6: Scan the current tree**

Run: `npx gitleaks dir . --config .gitleaks.toml --redact`

Expected: no credential finding in the current tree.

- [ ] **Step 7: Rotate external credentials after approval**

Follow the runbook. Never print secret values in terminal output, reports, or commits.

- [ ] **Step 8: Commit current-tree remediation**

```bash
git add .gitignore .env.example .gitleaks.toml docs/security/credential-rotation-runbook.md scripts/setup-admin.js scripts/fix-rls.js scripts/create-functions.js
git commit -m "security: remove exposed credentials from source"
```

### Task 3: Create Canonical Authorization Tables And RLS Tests

**Files:**
- Create: `supabase/migrations/010_security_foundation.sql`
- Create: `supabase/migrations/010_security_foundation.down.sql`
- Replace: `supabase/tests/database/security_foundation.test.sql`

**Interfaces:**
- Produces: `public.user_roles(user_id uuid, role app_role)`.
- Produces: `public.account_status(user_id uuid, status account_state, reason text, suspended_until timestamptz)`.
- Produces: `public.admin_audit_log(id uuid, actor_user_id uuid, action text, target_user_id uuid, metadata jsonb, created_at timestamptz)`.
- Produces: `public.is_admin()` and `public.has_member_access()` boolean functions.
- Consumed by: `requireAdmin()` and middleware in Tasks 4-5.

- [ ] **Step 1: Replace the pgTAP shell with failing authorization assertions**

Use fixed test UUIDs and JWT claims:

```sql
begin;
select plan(8);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000101', 'member@test.local'),
  ('00000000-0000-0000-0000-000000000102', 'admin@test.local'),
  ('00000000-0000-0000-0000-000000000103', 'banned@test.local');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
set local role authenticated;

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = auth.uid() $$,
  '42501',
  null,
  'member cannot promote their legacy profile'
);

select throws_ok(
  $$ insert into public.subscriptions (user_id, plan, status)
     values (auth.uid(), 'comunidade', 'active') $$,
  '42501',
  null,
  'member cannot create an active subscription'
);

reset role;
select * from finish();
rollback;
```

Add six more assertions covering role-table reads/writes, status-table reads/writes, banned access, and admin helper behavior.

- [ ] **Step 2: Run database tests and verify RED**

Run: `npm run test:db`

Expected: failures because canonical tables/functions do not exist and legacy writes remain possible.

- [ ] **Step 3: Write the security migration**

The migration must:

```sql
create type public.app_role as enum ('member', 'admin');
create type public.account_state as enum ('active', 'suspended', 'banned');

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status public.account_state not null default 'active',
  reason text not null default '',
  suspended_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'suspended' or suspended_until is null)
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id),
  action text not null check (char_length(action) between 3 and 100),
  target_user_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
alter table public.account_status enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.user_roles from anon, authenticated;
revoke all on public.account_status from anon, authenticated;
revoke all on public.admin_audit_log from anon, authenticated;
revoke insert, update, delete on public.subscriptions from anon, authenticated;

drop policy if exists "subscriptions_service_update" on public.subscriptions;
drop policy if exists "subscriptions_service_insert" on public.subscriptions;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
```

Create hardened `SECURITY DEFINER` SQL functions with `SET search_path = ''`, fully qualified object names, `REVOKE ALL FROM PUBLIC`, and only the minimum `GRANT EXECUTE` required. `has_member_access()` returns false for banned/suspended users and true for admins or members whose active subscription has not passed `current_period_end`.

- [ ] **Step 4: Backfill canonical rows without trusting legacy role values**

Insert every existing Auth user as `member` and `active`. Do not copy `profiles.role`, `profiles.is_banned`, or client-created subscriptions into trusted authorization state.

```sql
insert into public.user_roles (user_id, role)
select id, 'member'::public.app_role from auth.users
on conflict (user_id) do nothing;

insert into public.account_status (user_id, status)
select id, 'active'::public.account_state from auth.users
on conflict (user_id) do nothing;
```

- [ ] **Step 5: Add an Auth trigger for future users**

Create a hardened trigger function that inserts default role/status rows after `auth.users` insertion. It must not accept role/status from user metadata.

- [ ] **Step 6: Write the staging-only rollback migration**

The rollback drops the new trigger, functions, tables, and enum types in dependency order. It does not restore insecure legacy write policies.

- [ ] **Step 7: Reset local database and verify GREEN**

Run: `npx supabase db reset`

Run: `npm run test:db`

Expected: all eight pgTAP assertions pass.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/010_security_foundation.sql supabase/migrations/010_security_foundation.down.sql supabase/tests/database/security_foundation.test.sql
git commit -m "security: add canonical authorization model"
```

### Task 4: Implement Server-Only Authorization Guards

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/auth/types.ts`
- Create: `src/lib/auth/access.ts`
- Create: `src/lib/auth/guards.ts`
- Create: `src/lib/auth/guards.test.ts`

**Interfaces:**
- Produces: `resolveAccess(input: AccessInput): AccessResult`.
- Produces: `requireUser(): Promise<AuthorizedUser>`.
- Produces: `requireAdmin(): Promise<AuthorizedUser>`.
- Produces: `createAdminClient(): SupabaseClient` for server-only imports.

- [ ] **Step 1: Add the access types**

```ts
export type AppRole = 'member' | 'admin'
export type AccountState = 'active' | 'suspended' | 'banned'

export interface AccessInput {
  role: AppRole
  status: AccountState
  accessUntil: string | null
  now?: string
}

export interface AccessResult {
  canUseMemberArea: boolean
  canUseAdminArea: boolean
  reason: 'banned' | 'suspended' | 'expired' | null
}

export interface AuthorizedUser {
  id: string
  email: string | null
  role: AppRole
  status: AccountState
  accessUntil: string | null
}
```

- [ ] **Step 2: Implement the minimal pure access function**

Implement only the behavior already asserted in Task 1. Admin access requires `role === 'admin'` and active account state. Member access requires active state and either admin role or a future `accessUntil`.

- [ ] **Step 3: Run access tests and verify GREEN**

Run: `npm run test -- src/lib/auth/access.test.ts`

Expected: four tests pass.

- [ ] **Step 4: Write failing guard tests with injected dependencies**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createGuards } from './guards'

describe('requireAdmin', () => {
  it('rejects a member even when the browser requests an admin route', async () => {
    const guards = createGuards({
      getAuthUser: vi.fn().mockResolvedValue({ id: 'member', email: 'm@test.local' }),
      getAuthorization: vi.fn().mockResolvedValue({ role: 'member', status: 'active', accessUntil: '2099-01-01T00:00:00Z' }),
    })
    await expect(guards.requireAdmin()).rejects.toMatchObject({ status: 403 })
  })

  it('fails closed when authorization storage is unavailable', async () => {
    const guards = createGuards({
      getAuthUser: vi.fn().mockResolvedValue({ id: 'admin', email: 'a@test.local' }),
      getAuthorization: vi.fn().mockRejectedValue(new Error('database unavailable')),
    })
    await expect(guards.requireAdmin()).rejects.toMatchObject({ status: 503 })
  })
})
```

- [ ] **Step 5: Run guard tests and verify RED**

Run: `npm run test -- src/lib/auth/guards.test.ts`

Expected: FAIL because `createGuards` does not exist.

- [ ] **Step 6: Implement the server-only admin client**

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase server configuration is unavailable')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
```

- [ ] **Step 7: Implement injectable and production guards**

`createGuards(dependencies)` returns `requireUser` and `requireAdmin`. Export production wrappers that use the cookie-aware server client to authenticate and the admin client to read `user_roles`, `account_status`, and the current paid-through subscription. Throw typed `AuthError` instances with statuses 401, 403, or 503.

- [ ] **Step 8: Run guard tests, typecheck, and build**

Run: `npm run test -- src/lib/auth/access.test.ts src/lib/auth/guards.test.ts`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all commands pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/supabase/admin.ts src/lib/auth
git commit -m "security: centralize server authorization guards"
```

### Task 5: Make Route Protection Fail Closed

**Files:**
- Modify: `src/lib/supabase/middleware.ts`
- Modify: `src/middleware.ts`
- Modify: `src/app/admin/layout.tsx`
- Create: `src/lib/supabase/middleware.test.ts`

**Interfaces:**
- Consumes: canonical `user_roles` and `account_status` from Task 3.
- Produces: deterministic redirects for unauthenticated, banned, expired, and unauthorized users.

- [ ] **Step 1: Write failing middleware decision tests**

Extract a pure `decideRouteAccess()` function and test these cases:

```ts
expect(decideRouteAccess({ pathname: '/admin', authenticated: false })).toEqual({ redirect: '/login' })
expect(decideRouteAccess({ pathname: '/admin', authenticated: true, role: 'member', status: 'active' })).toEqual({ redirect: '/membros/dashboard' })
expect(decideRouteAccess({ pathname: '/membros/dashboard', authenticated: true, role: 'member', status: 'banned' })).toEqual({ redirect: '/banido' })
expect(decideRouteAccess({ pathname: '/membros/dashboard', authenticated: true, role: 'member', status: 'active', hasMemberAccess: false })).toEqual({ redirect: '/membros/assinatura-necessaria' })
```

- [ ] **Step 2: Run the middleware test and verify RED**

Run: `npm run test -- src/lib/supabase/middleware.test.ts`

Expected: FAIL because `decideRouteAccess` does not exist.

- [ ] **Step 3: Implement pure route decisions and fail-closed runtime behavior**

Remove the broad catch-and-continue behavior. For protected paths, missing server configuration or authorization lookup failure must redirect to `/erro-de-acesso` or return a 503 response; it must never return the original protected response.

- [ ] **Step 4: Protect admin routes before rendering**

Convert `src/app/admin/layout.tsx` to a server component. Call `requireAdmin()` before returning children. Redirect 401 to `/login` and 403 to `/membros/dashboard`. Do not render children during authorization.

- [ ] **Step 5: Cover protected API namespaces**

Update middleware matching so `/api/admin/:path*` is not globally excluded. Community APIs continue to authenticate inside route handlers. Do not rely on middleware as the only API security layer.

- [ ] **Step 6: Run tests and build**

Run: `npm run test -- src/lib/supabase/middleware.test.ts`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all pass and no unauthorized admin-content flash remains.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/middleware.ts src/lib/supabase/middleware.test.ts src/middleware.ts src/app/admin/layout.tsx
git commit -m "security: fail closed on protected routes"
```

### Task 6: Restrict Member Profile Mutations

**Files:**
- Create: `src/app/api/account/profile/route.ts`
- Create: `src/app/api/account/profile/route.test.ts`
- Modify: `src/app/membros/perfil/page.tsx`

**Interfaces:**
- Consumes: `requireUser()` from Task 4.
- Produces: `PATCH /api/account/profile` accepting only `{ fullName, phone, avatarUrl? }`.

- [ ] **Step 1: Write failing schema and handler tests**

Assert that valid profile data succeeds and these fields are rejected as unknown:

```ts
const escalation = { fullName: 'Member', phone: '', role: 'admin', is_banned: false }
expect(profileUpdateSchema.safeParse(escalation).success).toBe(false)
```

Also assert that an unauthenticated request returns 401 and database failure returns a generic 500 with no Supabase details.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- src/app/api/account/profile/route.test.ts`

Expected: FAIL because the endpoint and schema do not exist.

- [ ] **Step 3: Implement the endpoint**

Use a strict Zod object:

```ts
export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30),
  avatarUrl: z.string().url().max(2048).optional(),
}).strict()
```

After `requireUser()`, update only `full_name`, `phone`, and optional `avatar_url` for the authenticated ID. Never spread request data into a database update.

- [ ] **Step 4: Replace direct browser writes**

Modify the profile page to call `PATCH /api/account/profile`. Preserve existing loading and user feedback. Password changes continue through Supabase Auth and are not mixed into profile-row updates.

- [ ] **Step 5: Run tests and build**

Run: `npm run test -- src/app/api/account/profile/route.test.ts`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/account/profile src/app/membros/perfil/page.tsx
git commit -m "security: restrict member profile updates"
```

### Task 7: Move User Administration Behind Audited APIs

**Files:**
- Create: `src/lib/auth/audit.ts`
- Modify: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/[userId]/route.ts`
- Create: `src/app/api/admin/users/[userId]/route.test.ts`
- Modify: `src/app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin()` and `createAdminClient()` from Task 4.
- Produces: `PATCH /api/admin/users/:userId` for role/status changes.
- Produces: audit actions `user.role_changed`, `user.suspended`, `user.banned`, and `user.reactivated`.

- [ ] **Step 1: Write failing admin mutation tests**

Cover:

- member caller receives 403;
- admin can ban a member with a 3-500 character reason;
- request cannot mutate email, subscription, or arbitrary columns;
- admin cannot ban or demote themselves;
- final remaining administrator cannot be demoted;
- successful mutation appends one audit record.

Use the strict body union:

```ts
const adminUserActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set_role'), role: z.enum(['member', 'admin']) }).strict(),
  z.object({ action: z.literal('set_status'), status: z.enum(['active', 'suspended', 'banned']), reason: z.string().trim().min(3).max(500) }).strict(),
])
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test -- src/app/api/admin/users/[userId]/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement audit helper and mutation route**

Perform authorization, target validation, last-admin checks, canonical-table update, and audit insert. If audit insertion fails, return failure and roll back through a database RPC transaction rather than leaving an unaudited mutation.

- [ ] **Step 4: Replace the admin list query**

`GET /api/admin/users` uses `requireAdmin()` and the admin client. Fetch Auth users plus canonical role/status records server-side; return only fields needed by the UI. Do not rely on nonexistent PostgREST relationships to `auth.users`.

- [ ] **Step 5: Replace browser-side privileged mutations**

The admin page calls the APIs. Remove direct updates to other users and remove browser calls to `supabase.auth.admin.*`.

- [ ] **Step 6: Run tests and build**

Run: `npm run test -- src/app/api/admin/users/[userId]/route.test.ts`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/audit.ts src/app/api/admin/users src/app/admin/users/page.tsx
git commit -m "security: add audited user administration"
```

### Task 8: Seed The Owner And Rehearse Migration In Staging

**Files:**
- Create: `supabase/production/010_seed_owner_admin.sql`
- Create: `docs/security/production-cutover-checklist.md`

**Interfaces:**
- Consumes: canonical tables from Task 3.
- Produces: exactly one owner admin assignment for Auth ID `d8c3528e-471e-4835-85a6-c9effb38fdf2`.

- [ ] **Step 1: Write the owner seed script**

```sql
begin;

do $$
begin
  if not exists (
    select 1 from auth.users
    where id = 'd8c3528e-471e-4835-85a6-c9effb38fdf2'
  ) then
    raise exception 'Owner Auth user is missing; refusing to seed admin role';
  end if;
end $$;

insert into public.user_roles (user_id, role)
values ('d8c3528e-471e-4835-85a6-c9effb38fdf2', 'admin')
on conflict (user_id) do update set role = excluded.role, updated_at = now();

insert into public.account_status (user_id, status, reason)
values ('d8c3528e-471e-4835-85a6-c9effb38fdf2', 'active', '')
on conflict (user_id) do update set status = 'active', reason = '', updated_at = now();

commit;
```

- [ ] **Step 2: Write the cutover checklist**

Include:

1. Confirm rotated secrets are active and old secrets revoked.
2. Create and verify database backup.
3. Export both Auth user IDs and profile fields.
4. Apply migrations to staging.
5. Run pgTAP and application tests.
6. Run the owner seed only after confirming the immutable ID.
7. Verify owner admin access and second-account member-only access.
8. Verify direct member role, status, and subscription writes fail.
9. Exercise rollback in staging.
10. Record counts, timestamps, operator, and evidence.

- [ ] **Step 3: Link a separate staging Supabase project**

Run: `npx supabase link --project-ref <staging-project-ref>` only after the staging project is created and explicitly selected. Do not link the production project during rehearsal.

- [ ] **Step 4: Apply migrations and seed staging**

Run: `npx supabase db push`

Run the staging-equivalent admin seed using a staging Auth user ID. Do not run the production owner script against staging unless the same Auth ID was deliberately imported.

- [ ] **Step 5: Run staging security verification**

Run: `npm run test:db`

Run: `npm run test`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all pass.

- [ ] **Step 6: Produce a migration evidence report**

Record test output, account-role assertions, failed escalation attempts, backup identifier, and rollback result in `docs/security/staging-migration-report.md`. The report contains no secrets.

- [ ] **Step 7: Commit**

```bash
git add supabase/production/010_seed_owner_admin.sql docs/security/production-cutover-checklist.md docs/security/staging-migration-report.md
git commit -m "docs: add secure authorization cutover procedure"
```

### Task 9: Production Security Cutover

**Files:**
- Modify only if verification exposes a defect in files created by Tasks 1-8.

**Interfaces:**
- Consumes: all prior tasks and the approved cutover checklist.
- Produces: production authorization backed by canonical tables with preserved Auth accounts.

- [ ] **Step 1: Stop for explicit production approval**

Present the staging migration report, backup plan, exact migrations, owner seed, expected downtime, and rollback steps. Production migration is an external and potentially destructive action; do not infer approval from earlier general permission.

- [ ] **Step 2: Capture fresh production backup evidence**

Record the provider backup identifier and independently export the two Auth user IDs and non-secret profile fields.

- [ ] **Step 3: Apply the migration in the approved window**

Link to the confirmed production project, run `npx supabase db push`, then execute `supabase/production/010_seed_owner_admin.sql` through the approved SQL channel.

- [ ] **Step 4: Verify database authorization before deployment**

Test with temporary authenticated accounts:

- member cannot update role/status/subscription;
- banned member cannot use protected data;
- owner admin passes `is_admin()`;
- second preserved account remains member-only;
- anon receives no private role/status/audit data.

- [ ] **Step 5: Deploy the application**

Run: `npm run test`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `npm run build`

Run: `vercel --prod --yes`

- [ ] **Step 6: Run production smoke tests**

Verify login, owner admin route, member route, profile update, ban redirect, unauthenticated redirects, and API 401/403 behavior. Remove every temporary test account and test record.

- [ ] **Step 7: Decide go or rollback**

Go only if all authorization checks pass and logs contain no unexpected errors. Otherwise execute the reviewed rollback, restore the previous deployment, and preserve evidence for diagnosis.

- [ ] **Step 8: Commit any verification-only correction**

If no correction was required, do not create an empty commit. If a reviewed correction was required:

```bash
git add <only-the-reviewed-fix-files>
git commit -m "fix: address security cutover verification"
```

### Task 10: Final Foundation Verification

**Files:**
- Modify: `docs/security/staging-migration-report.md` or create `docs/security/production-security-report.md`

**Interfaces:**
- Produces: evidence required before the admin, course, community, live, billing, and public-site plans may start.

- [ ] **Step 1: Run the complete local verification suite**

Run:

```bash
npm run test
npm run test:db
npm run typecheck
npm run lint
npm run build
npx gitleaks dir . --config .gitleaks.toml --redact
```

Expected: zero failed tests, zero type errors, zero lint errors, successful build, and zero current-tree secret findings.

- [ ] **Step 2: Verify the security acceptance matrix**

The report must show PASS for:

- anonymous cannot access protected rows or routes;
- member cannot alter role, status, or subscription;
- expired member cannot access member content;
- suspended/banned user cannot access page, API, Realtime, or Storage resources covered by this foundation;
- admin can access admin routes only while active;
- service key exists only in server runtime;
- privileged mutation produces an audit record;
- authorization storage failure denies access.

- [ ] **Step 3: Document residual scope explicitly**

Record that course/media RLS, community moderation, live secrets, Mercado Pago, and distributed rate limiting are completed in their dependent plans, not silently treated as solved by this foundation.

- [ ] **Step 4: Commit the evidence**

```bash
git add docs/security/production-security-report.md
git commit -m "docs: record security foundation verification"
```

---

## Plan Self-Review

### Spec Coverage

- Credential lockdown: Tasks 2 and 9.
- Canonical role/account-status boundaries: Task 3.
- Server-only privileged operations: Tasks 4, 6, and 7.
- Fail-closed route authorization: Task 5.
- Preserve two Auth accounts and seed owner by immutable ID: Tasks 3, 8, and 9.
- Audit logging: Task 7.
- RLS role matrix and release evidence: Tasks 3 and 10.
- Backup, rollback, and controlled cutover: Tasks 8 and 9.

### Intentionally Deferred To Dependent Plans

- Canonical course/progress schema.
- Private signed media delivery.
- Full community moderation and notification lifecycle.
- YouTube Live credential separation.
- Mercado Pago checkout and subscription lifecycle.
- Landing page, legal content, consent-managed analytics, and ads readiness.

These are independent subsystems and require separate implementation plans after this security gate passes.
