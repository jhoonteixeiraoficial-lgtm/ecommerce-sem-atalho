# Staging Migration Evidence Report

**Date:** 2026-09-02
**Operator:** Automated (opencode)
**Local Supabase:** Docker Desktop + WSL2

## Migration Applied

- `010_security_foundation.sql` — applied via `supabase start` (auto-migrates on start)
- All prior migrations (001-009) applied successfully
- SQL lint: `No schema errors found`

## pgTAP Results

```
supabase/tests/database/security_foundation.test.sql .. ok
All tests successful.
Files=1, Tests=8, 1 wallclock secs ( 0.04 usr  0.03 sys +  0.01 cusr  0.01 csys =  0.09 CPU)
Result: PASS
```

**8/8 assertions passed:**
1. Anonymous blocked from all authorization helpers
2. Member with active subscription has access
3. Member with expired subscription denied
4. Member with NULL paid-through denied
5. Banned member denied
6. Suspended member denied
7. Active admin has access
8. Service-role can write to canonical tables

## Application Test Results

```
Test Files  5 passed (5)
     Tests  48 passed (48)
```

- `access.test.ts`: 4/4 GREEN
- `guards.test.ts`: 11/11 GREEN
- `middleware.test.ts`: 15/15 GREEN
- `profile/route.test.ts`: 8/8 GREEN
- `admin/[userId]/route.test.ts`: 10/10 GREEN

## Typecheck

```
tsc --noEmit — zero errors
```

## Build

```
next build — 39 routes, 0 errors
```

## Account-Role Assertions (local seed test)

Not applicable for local rehearsal (no production Auth user exists locally). The owner seed script includes a guard:
```sql
if not exists (select 1 from auth.users where id = 'd8c3528e-...') then
  raise exception 'Owner Auth user is missing; refusing to seed admin role';
end if;
```

## Failed Escalation Attempts (schema-level)

The Zod schemas reject:
- `role: 'admin'` in profile update (strict schema)
- `is_banned` injection in profile update (strict schema)
- Extra fields in admin action schema (strict discriminated union)
- Self-modification in admin PATCH (userId === authUser.id check)
- Last-admin demotion (countActiveAdmins guard)

## Rollback Rehearsal

Not performed in this local run. The rollback script (`supabase/rollbacks/010_security_foundation.down.sql`) is designed for staging-only use and does not restore insecure legacy policies.

## Conclusion

**All verification gates pass locally.** The security foundation is ready for staging deployment pending:
1. Supabase CLI authentication (`supabase login`)
2. Staging project creation and linking
3. `supabase db push --project-ref <staging-ref>`
4. Production owner seed after confirming Auth user exists

## H3D Round 2 - Feed Realtime Lifecycle

**Date:** 2026-09-03

- Added a lifecycle regression proving cancelled fallback recovery cannot restart polling.
- Guarded Feed realtime status/change callbacks and recovery refreshes with the active sync generation.
- Focused Vitest: 11/11 passed.
- Full Vitest: 231/231 passed across 15 files.
- Typecheck: passed with zero errors.
- Focused ESLint: zero errors; three existing `no-img-element` warnings in `Feed.tsx`.
- Production build: passed; 40 routes generated.
