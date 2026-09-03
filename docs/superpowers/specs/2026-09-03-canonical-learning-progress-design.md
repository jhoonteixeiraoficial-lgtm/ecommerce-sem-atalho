# Canonical Learning And Progress Design

Date: 2026-09-03
Status: Approved for autonomous execution under the ecosystem reconstruction roadmap

## Objective

Replace the drifting course prototype with one canonical learning model that powers member catalog, module pages, lesson navigation, dashboard progress, continue-watching, and server-side course administration.

## Scope

This phase includes courses, modules, lessons, publication scheduling, lesson progress, member learning APIs, administrative metadata APIs, and migration of the existing learning UI. Private signed media delivery is the next phase; this phase preserves existing `video_url` values as transitional metadata without claiming that private media is solved.

## Data Model

- `courses`: slug, title, description, publication state, release timestamp, sort order, and timestamps.
- Existing `modules` rows retain their IDs and gain `course_id`, release timestamp, and updated timestamp. Existing `sort_order` is canonical.
- Existing `lessons` rows retain their IDs and gain release timestamp, duration in seconds, and updated timestamp. Existing `sort_order` is canonical.
- `lesson_progress`: one row per user and lesson with position seconds, started timestamp, last viewed timestamp, completion state, and completion timestamp.
- Existing `user_progress` completion rows are backfilled into `lesson_progress`; the legacy table becomes read-only and is no longer used by application code.

A single default course is created only when legacy modules exist without a course. The migration is idempotent, preserves IDs, and refuses invalid relationships rather than deleting data.

## Authorization

- Member reads require canonical `has_member_access()`, publication, and release timestamps for the course, module, and lesson.
- Browser roles cannot mutate course metadata or progress tables directly.
- Member learning routes use `requireUser()` and server-only database access.
- Admin learning routes use `requireAdmin()`, strict Zod schemas, explicit columns, and audit records.
- A progress update validates that the lesson is currently accessible and derives the user ID from the authorized session.

## API Boundaries

- `GET /api/learning/catalog`: published course/module/lesson tree plus per-lesson progress for the caller.
- `GET /api/learning/modules/[moduleSlug]`: one accessible module, ordered lessons, and progress.
- `GET /api/learning/lessons/[moduleSlug]/[lessonSlug]`: one accessible lesson, parent module, adjacent accessible lessons, and progress.
- `PATCH /api/learning/progress`: saves playback position and completion idempotently.
- `/api/admin/learning/*`: lists the complete tree and performs explicit course/module/lesson mutations.

Responses use stable camelCase DTOs and never expose draft content to members or database errors to clients.

## Progress Semantics

- First playback creates `started_at` and `last_viewed_at`.
- Position updates are clamped to zero and the known lesson duration.
- Completion is idempotent and reversible.
- Completing sets `completed_at`; reopening completion clears it.
- Dashboard totals include only currently accessible lessons.
- Continue-watching selects the most recently viewed incomplete lesson, falling back to the first accessible incomplete lesson.

## Migration And Rollout

1. Add and test schema without changing UI reads.
2. Add member APIs and progress mutation.
3. Add guarded admin APIs.
4. Move member screens and dashboard to the APIs.
5. Move the admin lesson screen to guarded APIs.
6. Verify database, application, lint, typecheck, and build gates.

The production migration requires the existing controlled-cutover process and a backup. Checkout remains disabled.

## Testing

- pgTAP covers anonymous, active member, expired, suspended, banned, admin, and service boundaries.
- Migration replay proves legacy module, lesson, and completion IDs survive backfill.
- Handler tests cover authorization, strict validation, publication/release filtering, adjacency, and generic failures.
- Pure progress tests cover position clamping, completion transitions, percentages, and continue-watching selection.
- Final gates are Vitest, pgTAP/replay, SQL lint, TypeScript, ESLint, production build, and Gitleaks.

## Non-Goals

- Video upload processing or signed media URLs.
- Materials, community moderation, lives, billing, certificates, quizzes, comments per lesson, or analytics.
- Destructive removal of legacy learning tables during this phase.
