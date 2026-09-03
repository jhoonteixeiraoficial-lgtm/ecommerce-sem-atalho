# Canonical Learning And Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one canonical, authorized course and lesson-progress domain that powers both member learning screens and server-side administration.

**Architecture:** Preserve existing learning row IDs while extending the schema through forward migrations. All application writes move behind strict server APIs; member responses filter publication and release state, while admin responses use canonical guards and explicit DTOs. Legacy `user_progress` is backfilled and then retired from application access without destructive deletion.

**Tech Stack:** Next.js 16.3.3 App Router, React 19, TypeScript strict mode, Supabase PostgreSQL/RLS, Zod 3, Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-03-canonical-learning-progress-design.md`

## Global Constraints

- Preserve existing course content IDs and Auth accounts.
- Do not expose drafts or future releases to members.
- Do not trust browser-supplied user IDs, roles, completion timestamps, or totals.
- All privileged writes use canonical server guards and explicit fields.
- Keep private-media delivery explicitly deferred; do not make buckets public.
- Checkout and paid traffic remain disabled.
- Use TDD and commit after every reviewed task.

---

### Task 1: Canonical Learning Schema And Migration Replay

**Files:**
- Create: `supabase/migrations/018_canonical_learning.sql`
- Create: `supabase/tests/database/canonical_learning.test.sql`
- Create: `supabase/migration-tests/018_canonical_learning.fixture.sql`
- Create: `supabase/migration-tests/018_canonical_learning.test.sql`
- Modify: `scripts/test-database.mjs`

**Interfaces:**
- Produces: `courses`, extended `modules`/`lessons`, and `lesson_progress`.
- Produces: member-safe SELECT policies and server-only mutation privileges.
- Consumed by: member/admin learning APIs in Tasks 2-3.

- [ ] **Step 1: Write RED pgTAP authorization and schema assertions**

Assert exact columns and constraints, anonymous denial, active-member released-content reads, future/draft denial, inactive-account denial, browser mutation denial, own-progress read, and cross-user progress denial.

- [ ] **Step 2: Write RED migration replay fixtures**

Seed one legacy module, lesson, and completion row through migration 017. Assert after migration 018 that IDs are unchanged, one default course owns the module, lesson duration is converted to seconds, and completion appears in `lesson_progress`.

- [ ] **Step 3: Run database tests and verify RED**

Run: `npm.cmd run test:db`

Expected: new assertions fail because migration 018 and canonical relations do not exist.

- [ ] **Step 4: Implement migration 018**

Create `courses`; extend `modules` with `course_id`, `release_at`, `updated_at`; extend `lessons` with `duration_seconds`, `release_at`, `updated_at`; create `lesson_progress` with `unique(user_id, lesson_id)`. Backfill a default course only for orphan legacy modules and copy `user_progress` completions. Add checks for nonnegative order/duration/position and completion timestamp consistency.

Replace learning RLS so member visibility requires `has_member_access()`, published ancestors, and `coalesce(release_at, '-infinity') <= now()`. Revoke browser metadata/progress DML; grant only required SELECT. Service-only APIs perform writes.

- [ ] **Step 5: Extend the migration replay runner**

Teach `scripts/test-database.mjs` to reset through migration 017, load the 018 fixture, apply migration 018, run its assertions, and restore the complete local database in `finally`.

- [ ] **Step 6: Verify GREEN**

Run: `npm.cmd run test:db`

Run: `npx.cmd supabase db lint --local`

Expected: all pgTAP and migration replay assertions pass; SQL lint reports no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/018_canonical_learning.sql supabase/tests/database/canonical_learning.test.sql supabase/migration-tests/018_canonical_learning.fixture.sql supabase/migration-tests/018_canonical_learning.test.sql scripts/test-database.mjs
git commit -m "feat: add canonical learning schema"
```

### Task 2: Authorized Member Learning APIs

**Files:**
- Create: `src/lib/learning/types.ts`
- Create: `src/lib/learning/progress.ts`
- Create: `src/lib/learning/progress.test.ts`
- Create: `src/app/api/learning/catalog/route.ts`
- Create: `src/app/api/learning/modules/[moduleSlug]/route.ts`
- Create: `src/app/api/learning/lessons/[moduleSlug]/[lessonSlug]/route.ts`
- Create: `src/app/api/learning/progress/route.ts`
- Create: focused route tests beside the routes

**Interfaces:**
- Produces: stable `CourseCatalogDto`, `ModuleDetailDto`, `LessonDetailDto`, and `LessonProgressDto` camelCase types.
- Produces: `clampPosition(positionSeconds, durationSeconds)` and completion transition logic.
- Consumed by: member screens in Task 4.

- [ ] **Step 1: Write RED pure progress tests**

Cover negative and over-duration positions, unknown duration, first-start timestamp, idempotent completion, reopening completion, percentage with zero lessons, and most-recent incomplete selection.

- [ ] **Step 2: Write RED handler tests**

For every route cover 401, 403, 503, released-content success, draft/future 404, malformed slugs/JSON/UUIDs, unknown fields, database failure, and explicit response fields. Progress tests must prove the request cannot choose another user or completion timestamp.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm.cmd test -- src/lib/learning src/app/api/learning`

Expected: imports/routes fail because the learning API does not exist.

- [ ] **Step 4: Implement DTOs and progress rules**

Use explicit types with ISO timestamps and numeric seconds. Keep progress transitions pure and deterministic by accepting `now` as an argument.

- [ ] **Step 5: Implement read routes**

Call `requireUser()` before creating the service client. Query explicit columns only. Enforce published/released course ancestry in the server query even though RLS is also present. Return 404 for inaccessible records and generic 500 for storage failures.

- [ ] **Step 6: Implement progress PATCH**

Use a strict schema `{ lessonId: uuid, positionSeconds: nonnegative integer, completed?: boolean }`. Validate accessible lesson duration, derive user ID from the guard, calculate canonical state, and upsert `lesson_progress` by `(user_id, lesson_id)`.

- [ ] **Step 7: Verify GREEN and commit**

Run: `npm.cmd test -- src/lib/learning src/app/api/learning`

Run: `npm.cmd run typecheck`

Run: `npm.cmd run build`

```bash
git add src/lib/learning src/app/api/learning
git commit -m "feat: add member learning APIs"
```

### Task 3: Guarded Course Administration APIs

**Files:**
- Create: `src/lib/learning/admin-schema.ts`
- Create: `src/lib/learning/admin-schema.test.ts`
- Create: `src/app/api/admin/learning/route.ts`
- Create: `src/app/api/admin/learning/[entity]/[id]/route.ts`
- Create: focused handler tests
- Create: `supabase/migrations/019_audited_learning_actions.sql`
- Create: `supabase/tests/database/audited_learning_actions.test.sql`

**Interfaces:**
- Produces: admin tree GET and strict create/update/delete actions for course, module, and lesson metadata.
- Produces: transactional `admin_learning_action` RPC with audit insertion.
- Consumed by: admin UI in Task 5.

- [ ] **Step 1: Write RED strict-schema tests**

Cover allowed create/update/delete payloads, slug/title/description/duration/release bounds, HTTPS transitional video URLs, unknown-field rejection, immutable parent IDs, and invalid entity/action combinations.

- [ ] **Step 2: Write RED handler and pgTAP tests**

Cover canonical admin authorization, inactive-admin denial, service-only execute, atomic audit insertion, duplicate slug conflicts, parent existence, published-child consistency, and deletion refusal when progress exists.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm.cmd test -- src/lib/learning/admin-schema.test.ts src/app/api/admin/learning`

Run: `npm.cmd run test:db`

- [ ] **Step 4: Implement migration 019 RPC**

Use a fixed empty search path, explicit actor/entity/action parameters, canonical active-admin validation, row locking for reorder/update operations, exact metadata fields, and one audit row in the same transaction. Restrict execute to `service_role`.

- [ ] **Step 5: Implement guarded routes**

Authorize before creating the admin client. GET returns all states with explicit fields. Mutations parse strict schemas and invoke one RPC. Map controlled conflicts to generic 400/409 and infrastructure failures to generic 500.

- [ ] **Step 6: Verify GREEN and commit**

Run focused tests, `npm.cmd run test:db`, `npm.cmd run typecheck`, and `npm.cmd run build`.

```bash
git add src/lib/learning/admin-schema.ts src/lib/learning/admin-schema.test.ts src/app/api/admin/learning supabase/migrations/019_audited_learning_actions.sql supabase/tests/database/audited_learning_actions.test.sql
git commit -m "feat: add audited learning administration"
```

### Task 4: Migrate Member Learning Screens

**Files:**
- Modify: `src/app/membros/aulas/page.tsx`
- Modify: `src/app/membros/aulas/[moduleId]/page.tsx`
- Modify: `src/app/membros/aulas/[moduleId]/[lessonId]/page.tsx`
- Modify: `src/app/membros/dashboard/page.tsx`
- Create: `src/lib/learning/client.ts`
- Create: `src/lib/learning/client.test.ts`

**Interfaces:**
- Consumes: Task 2 DTOs and routes.
- Produces: catalog, module, lesson, progress, and continue-watching UI backed only by canonical APIs.

- [ ] **Step 1: Write RED client adapter tests**

Cover successful typed responses, 401 redirect signal, 403 access-required signal, 404 empty state, generic server error, and progress-save failure preserving local state.

- [ ] **Step 2: Implement one learning API client**

Centralize JSON/error handling without caching credentials or user IDs. Expose catalog/module/lesson fetches and progress update.

- [ ] **Step 3: Replace direct Supabase reads/writes**

Use canonical DTO fields (`sortOrder`, `durationSeconds`, no `order_index` or progress `module_id`). Preserve loading, empty, and error states. Progress UI updates only after confirmed server success.

- [ ] **Step 4: Implement dashboard canonical aggregates**

Derive totals and percentages from the catalog response. Use server-selected continue-watching data; do not use `completed_at` as last-viewed time and do not read nonexistent `profiles.plan_name`.

- [ ] **Step 5: Verify and commit**

Run focused tests, full Vitest, typecheck, focused ESLint, and build.

```bash
git add src/lib/learning/client.ts src/lib/learning/client.test.ts src/app/membros/aulas src/app/membros/dashboard/page.tsx
git commit -m "feat: connect member learning experience"
```

### Task 5: Migrate Admin Learning Screen

**Files:**
- Modify: `src/app/admin/lessons/page.tsx`
- Modify: `src/components/admin/VideoUpload.tsx`
- Create: `src/lib/learning/admin-client.ts`
- Create: `src/lib/learning/admin-client.test.ts`

**Interfaces:**
- Consumes: Task 3 admin DTOs/routes.
- Produces: browser UI with no direct privileged Supabase metadata writes or legacy role checks.

- [ ] **Step 1: Write RED admin-client tests**

Cover tree loading, strict create/update/delete requests, controlled conflicts, auth failures, and generic infrastructure failures.

- [ ] **Step 2: Implement admin API client**

Use fetch with explicit methods and bodies. Never accept user IDs, roles, audit actors, or arbitrary database column maps.

- [ ] **Step 3: Replace browser authority paths**

Remove `profiles.role` checks and all direct module/lesson writes. Rely on the server admin layout plus independently guarded APIs. Preserve current forms and feedback; surface API errors clearly.

- [ ] **Step 4: Keep media boundary explicit**

The upload component may return existing transitional metadata, but course metadata persistence must flow through the admin API. Do not make private buckets public or add permanent public delivery.

- [ ] **Step 5: Verify and commit**

Run focused tests, full Vitest, typecheck, focused ESLint, build, and database tests.

```bash
git add src/app/admin/lessons/page.tsx src/components/admin/VideoUpload.tsx src/lib/learning/admin-client.ts src/lib/learning/admin-client.test.ts
git commit -m "feat: connect learning administration"
```

### Task 6: Final Learning Verification

**Files:**
- Create: `docs/security/learning-domain-verification-report.md`

**Interfaces:**
- Produces: evidence gate for the private-media workstream.

- [ ] **Step 1: Run complete gates**

Run `npm.cmd test`, `npm.cmd run test:db`, `npx.cmd supabase db lint --local`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, and Gitleaks against a Git archive snapshot.

- [ ] **Step 2: Verify acceptance matrix**

Record PASS/FAIL for anonymous/inactive access, publication scheduling, admin-only writes, migration ID preservation, progress position/completion, continue-watching, adjacent navigation, and generic failure handling.

- [ ] **Step 3: Document residual scope**

State explicitly that signed media delivery, materials, moderation, live-provider integration, billing, legal verification, and browser-device QA remain later gates.

- [ ] **Step 4: Commit evidence**

```bash
git add docs/security/learning-domain-verification-report.md
git commit -m "docs: verify canonical learning domain"
```

## Plan Self-Review

- Spec coverage: schema, migration, member APIs, admin APIs, member UI, admin UI, progress semantics, authorization, and final evidence each map to one task.
- Scope: private media is excluded and follows this plan.
- Type consistency: all application consumers use camelCase DTOs; database snake_case remains inside route/data adapters.
- Destructive changes: none; legacy tables remain until a later cleanup migration.
