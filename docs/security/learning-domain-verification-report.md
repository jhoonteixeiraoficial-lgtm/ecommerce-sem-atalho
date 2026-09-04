# Canonical Learning Domain Verification Report

Date: 2026-09-05
Plan: `docs/superpowers/plans/2026-09-03-canonical-learning-progress.md`
Spec: `docs/superpowers/specs/2026-09-03-canonical-learning-progress-design.md`
Branch: `feature/canonical-learning`
Range: `f4dd086..1972e3b`

## Gate Results

| Gate | Command | Result |
|---|---|---|
| Vitest (full) | `npm.cmd test` | PASS — 25 files, 381 tests |
| pgTAP + migration replay | `npm.cmd run test:db` | PASS — 164 pgTAP assertions; replay 013 (7/7), 017 (2/2), 018 (5/5); learning concurrency 4/4 |
| SQL lint | `npx.cmd supabase db lint --local` | PASS — no schema errors |
| TypeScript | `npm.cmd run typecheck` | PASS — no errors |
| ESLint | `npm.cmd run lint` | PASS — 0 errors, 42 pre-existing warnings (unrelated files, present before this workstream) |
| Production build | `npm.cmd run build` | PASS — 43/43 pages generated, all learning routes present |
| Gitleaks | `docker run zricethezav/gitleaks:latest detect` against a `git archive HEAD` snapshot (tracked files only, no build artifacts) | PASS — no leaks found |

One `test:db` run was interrupted mid-execution by an external tool timeout, leaving the local database in a partially migrated state and producing spurious pgTAP failures (missing columns, "Bad plan"). Re-running to completion with sufficient time reproduced the clean PASS above; this was a transient tooling interruption, not a code or migration defect.

## Acceptance Matrix

| Requirement | Result | Evidence |
|---|---|---|
| Anonymous access denied | PASS | `supabase/tests/database/canonical_learning.test.sql` anonymous-denial assertions; `requireUser()` enforced before any learning service client (`src/app/api/learning/*/route.ts`) |
| Inactive/expired/suspended/banned member denied | PASS | Canonical `has_member_access()` pgTAP assertions; route tests assert 401/403/503 (e.g. `src/app/api/learning/catalog/route.test.ts`) |
| Publication/release scheduling enforced (draft/future hidden) | PASS | Server queries filter `is_published` and NULL-or-past `release_at` for course/module/lesson ancestry; pgTAP and route tests cover draft/future 404 |
| Admin-only writes, audited | PASS | `admin_learning_action` RPC is `service_role`-only, `SECURITY DEFINER`, empty search path, atomic audit row (`019_audited_learning_actions.sql`); browser cannot supply actor/role/audit metadata (`src/lib/learning/admin-schema.ts`) |
| Migration ID preservation | PASS | `supabase/migration-tests/018_canonical_learning.test.sql` — legacy module/lesson/completion IDs unchanged after migration 018 |
| Progress position clamp + completion semantics | PASS | `src/lib/learning/progress.ts` clamps to `[0, duration]`; completion is idempotent and preserves `completed_at` unless transitioning incomplete→complete (`src/lib/learning/progress.test.ts`) |
| Continue-watching / dashboard aggregates | PASS | Derived server-side from catalog/progress data only, no `completed_at`-as-last-viewed and no `profiles.plan_name` (`src/app/membros/dashboard/page.tsx`, `src/lib/learning/client.ts`) |
| Adjacent lesson navigation | PASS | `src/app/api/learning/lessons/[moduleSlug]/[lessonSlug]/route.ts` computes prev/next only among accessible lessons; covered in route tests |
| Generic failure handling (no raw DB errors leaked) | PASS | All routes map storage failures to generic 500 and absence to 404; admin routes map conflicts to generic 400/409 |
| Concurrency safety (admin actions, progress-safe deletion) | PASS | `scripts/test-learning-concurrency.mjs` — 4/4 scenarios: no progress loss on concurrent deletion, no unauthorized commit after actor deactivation, no deadlock under conflicting parent/child mutations |

## Residual Scope (explicitly deferred, not part of this phase)

- Signed/private media delivery — `video_url` remains transitional HTTPS metadata; no signed URLs, no bucket exposure change.
- Materials management.
- Community moderation.
- Live-provider integration.
- Billing and checkout (remain disabled).
- Legal/compliance verification.
- Cross-browser/device manual QA.
- Production migration cutover for 018/019 (requires the existing controlled backup/cutover process; not executed against production in this workstream).

## Commits In Scope

- `87bf85e` feat: add canonical learning schema
- `df72a97` / `b0516cf` / `619b645` feat+test+fix: member learning APIs, tests, and hardening
- `a80c7a4` / `a29d07e` feat+fix: audited learning administration and concurrency serialization
- `97b6f33` feat: connect member learning experience
- `1972e3b` feat: connect learning administration
