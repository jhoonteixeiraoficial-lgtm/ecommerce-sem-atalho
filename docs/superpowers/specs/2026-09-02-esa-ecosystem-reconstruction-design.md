# ESA Ecosystem Reconstruction Design

Date: 2026-09-02
Status: Awaiting written-spec approval

## 1. Objective

Reconstruct E-commerce Sem Atalho as a trustworthy monthly education ecosystem for people starting in e-commerce and sellers improving an existing operation. The system must provide a public acquisition site, a functional member experience, a separate administrative control plane, live sessions through OBS and YouTube, a moderated community, and recurring billing through Mercado Pago.

The Acertive E-commerce AI application is a later product. Its standalone R$29.90 plan and the combo plan may be displayed as coming soon, but they cannot be purchased until the application is production-ready.

## 2. Binding Decisions

- Keep Next.js, Supabase, and Vercel.
- Preserve the two existing Supabase Auth accounts.
- Rebuild application tables, grants, and RLS policies around a canonical schema.
- Keep `https://ecommerce-sem-atalho.vercel.app` until the Hostinger domain is purchased.
- Use YouTube unlisted streams as the first live provider, with OBS ingest and automatic replay.
- Launch paid checkout initially only for the R$97/month Community membership, including courses and lives.
- Display Acertive R$29.90/month and Combo R$119/month as coming soon without accepting payment.
- Cancellation stops future renewal and preserves access until the paid-through date.
- Keep checkout and paid advertising disabled until security, entitlement, cancellation, and QA gates pass.
- Never publish fabricated testimonials, revenue results, student counts, urgency, or scarcity.

## 3. Delivery Strategy

Work proceeds as separately verifiable subprojects:

1. Credential and authorization lockdown.
2. Canonical database and migration baseline.
3. Server-side administrative control plane.
4. Member course and progress domain.
5. Community, notifications, and moderation.
6. Private media delivery.
7. YouTube Live and calendar integration.
8. Mercado Pago recurring billing.
9. Public site, SEO, legal, and ad readiness.
10. Cross-device, security, and production QA.

Production remains available during reconstruction. Destructive migration requires a verified backup and a rehearsed restore procedure.

## 4. Security Architecture

### 4.1 Immediate Credential Response

- Rotate the exposed Supabase secret-class key.
- Reset the administrator password and revoke active administrator sessions.
- Remove credentials from scripts and repository history after rotation.
- Enable secret scanning in CI.
- Review Supabase and Vercel logs for unauthorized role, subscription, Auth, Storage, or content changes.

### 4.2 Authorization Model

Private account data, public community identity, authorization, and billing state are separate concerns:

- `profiles_private`: name, email mirror, phone, account preferences; selectable only by the owner and trusted server processes.
- `community_profiles`: display name and avatar only; readable by entitled members.
- `user_roles`: member/admin roles; writable only by server-side admin operations.
- `account_status`: active, suspended, or banned with reason and timestamps; writable only by server-side admin operations.
- `admin_audit_log`: append-only record of privileged actions.

Members cannot update role, ban state, subscription state, provider IDs, or entitlements through Supabase REST calls.

### 4.3 Server Enforcement

- Central `requireUser()` and `requireAdmin()` guards protect route handlers.
- Privileged operations execute only in server routes with a server-only service key.
- Middleware fails closed for protected routes if configuration or authorization lookup fails.
- RLS remains a second independent enforcement layer.
- Bans and expiration apply consistently to pages, APIs, Realtime, and Storage.
- Admin operations reject self-deletion, final-admin deletion, and unsafe role changes.

### 4.4 Defensive Controls

- Strict Zod schemas reject unknown or malformed fields.
- Distributed rate limiting uses a shared provider, not process-local memory.
- Admin actions and billing state transitions are auditable.
- CSP is deployed in report-only mode before enforcement, then removes unsafe production directives.
- Security tests cover anonymous, member, expired, banned, admin, and service identities.

## 5. Canonical Data Model

### 5.1 Learning

- `courses`: course metadata and publication state.
- `modules`: course relationship, slug, title, description, `sort_order`, publication state, and release date.
- `lessons`: module relationship, slug unique within module, title, description, media asset, duration in seconds, `sort_order`, publication state, and release date.
- `lesson_progress`: user, lesson, last position in seconds, started timestamp, last viewed timestamp, completion timestamp, and completion boolean.
- `materials`: title, description, category, media asset, publication state, and release date.
- `media_assets`: bucket, object path, MIME type, size, owner, processing state, and timestamps.

Dashboard progress, module progress, continue-watching, and course completion derive from these records only.

### 5.2 Community

- `community_posts`
- `community_comments`
- `community_reactions`
- `chat_channels`
- `chat_messages`
- `chat_message_reads`
- `community_reports`
- `moderation_actions`
- `notifications`

Posts, comments, and messages use `community_profiles` for safe identity display. Reports and moderation history are never publicly readable.

### 5.3 Lives

- `live_events`: title, description, scheduled time, duration, status, YouTube video ID, playback URL, replay URL, and publication state.
- `live_credentials`: provider ingest identifiers and secrets; admin/server only.

Streaming credentials never share a member-readable row.

### 5.4 Billing

- `plans`: internal plan catalog and launch availability.
- `plan_entitlements`: course, community, lives, or Acertive capabilities.
- `checkout_orders`: immutable purchase intent and accepted offer snapshot.
- `subscriptions`: internal lifecycle and paid-through/access-until timestamps.
- `payment_attempts`: provider payment states.
- `webhook_events`: unique, idempotent provider event inbox.
- `refund_requests`: request, eligibility, decision, provider result, and timestamps.
- `legal_acceptances`: policy versions, offer version, user, and timestamp.

Provider status and internal entitlement status remain separate.

## 6. Administrative Control Plane

The admin experience uses a distinct layout and navigation from the member area. Access is restricted to the verified owner admin account and future explicitly granted admins.

### 6.1 Dashboard

- Active, past-due, canceled, and banned member counts.
- Published and scheduled lessons, materials, and lives.
- Community moderation queue.
- Failed billing/webhook alerts.
- Recent privileged actions.

### 6.2 Course Management

- Create, edit, reorder, schedule, publish, and archive modules and lessons.
- Resumable private video upload with server-side type and size validation.
- Video processing state and preview.
- Replace or delete assets without orphaning Storage objects.
- Schedule future lesson publication.

### 6.3 Materials

- Upload, categorize, schedule, publish, replace, and archive files.
- Signed member downloads after entitlement checks.
- Download counters updated by the authorized download endpoint.

### 6.4 Members

- Search and filter by access, plan, billing status, role, and account status.
- Add or invite a member.
- Suspend, ban, unban, or revoke access with a required reason.
- View billing and moderation history.
- Never expose raw payment credentials or allow irreversible deletion without confirmation and audit logging.

### 6.5 Community Moderation

- View and remove posts, comments, and messages.
- Review reports.
- Warn, temporarily suspend, or ban members.
- Record actor, target, reason, source content, and timestamp.

### 6.6 Live Management

- Schedule and publish live events.
- Store the YouTube video ID and member playback URL.
- Display OBS setup instructions using provider-issued credentials.
- Mark live status based on provider state where available.
- Publish the automatic replay after the session.

## 7. Member Experience

> **2026-09-05 update:** the concrete mobile-first navigation and information architecture for this section (feed-as-home, hamburger + bottom navigation, lessons flow, individual lesson screen, unlisted-YouTube embedded video source) is recorded in `docs/superpowers/specs/2026-09-05-member-area-mobile-ux-direction.md`. That document is the authoritative UX direction for this section going forward; the data-model and authorization boundaries below remain unchanged and binding.

### 7.1 Dashboard

- Personalized greeting and current membership state.
- Real overall and per-module progress.
- Continue watching based on `last_viewed_at` and playback position.
- Upcoming live and newly released content from shared records.
- Clear empty states for new accounts.

### 7.2 Course

- Modules and lessons reflect publication and release schedules.
- Video playback uses short-lived signed access.
- Position is saved periodically and on navigation.
- Completion is idempotent and reversible.
- Previous/next lesson navigation respects module membership and publication state.

### 7.3 Community

- Feed, comments, reactions, channel chat, unread state, and notifications use real data.
- Realtime handles inserts, edits, and removals without duplicate rendering.
- Pagination and optimistic UI degrade safely when Realtime is unavailable.
- New accounts show zero content counts unless real community content exists.

### 7.4 Lives And Calendar

- Members see live, upcoming, and replay sections.
- YouTube playback is embedded without exposing OBS credentials.
- Calendar and dashboard derive from `live_events` and scheduled content.
- ICS generation is timezone-aware for Brazil.

### 7.5 Profile And Account

- Update allowed profile fields and avatar.
- Change email and password through verified flows.
- View membership, renewal date, payment history, and invoices when available.
- Cancel renewal while retaining access until `access_until`.
- Request refund, data export, correction, and account deletion.

## 8. Mercado Pago Recurring Billing

The first purchasable product is Community at R$97/month.

### 8.1 Checkout Flow

1. User selects the Community plan.
2. Server creates an immutable internal order.
3. Server creates the Mercado Pago recurring subscription/preapproval using trusted catalog values.
4. `external_reference` contains only the opaque internal order ID.
5. Browser redirects to the provider URL.
6. Return pages show pending, success, or failure but do not grant access.
7. A verified webhook retrieves the authoritative provider resource.
8. Idempotent processing updates payment, subscription, and entitlement state.

### 8.2 Lifecycle

- `pending`
- `active`
- `past_due`
- `cancel_at_period_end`
- `canceled`
- `expired`

Cancellation stops renewal and preserves access until the paid-through timestamp. Failed payment follows an owner-approved grace period before revocation. Scheduled reconciliation repairs missed or out-of-order notifications.

### 8.3 Webhook Requirements

- Fail closed when required secrets or signature fields are absent.
- Implement Mercado Pago's documented structured signature.
- Enforce timestamp tolerance and replay protection.
- Persist each event before processing with a unique provider event ID.
- Retrieve and validate provider data, amount, currency, plan, payer mapping, and account ownership.

## 9. Public Site And Conversion Design

### 9.1 Visual Direction

Use E-commerce Puro only as a reference for rhythm and confidence:

- Primarily warm white and light neutral backgrounds.
- Strategic dark editorial sections.
- Gold retained as a controlled ESA accent.
- Large type, numbered sections, generous spacing, and clear service cards.
- Authentic founder, platform, live, lesson, and community imagery.
- Mobile keeps a human trust cue above the fold.

### 9.2 Information Architecture

1. Hero with concrete membership proposition.
2. Separate paths for beginners and active sellers.
3. Founder origin and operating experience since 2009.
4. What members receive: course, lives, community, and materials.
5. Real platform previews and curriculum.
6. How the monthly membership works.
7. Transparent suitability and prerequisites.
8. Community plan pricing and recurring terms.
9. Acertive and Combo marked coming soon.
10. FAQ, legal identity, support, and policies.

### 9.3 Copy Rules

- Sell education, process, access, and support, not guaranteed income.
- Remove unsupported revenue claims, student counts, stock-avatar testimonials, and false scarcity.
- Use only documented cases with written permission and context.
- Until cases exist, use product proof: curriculum, screenshots, schedule, worksheets, and founder experience.
- Include an educational-results disclaimer and a Mercado Livre independence disclaimer.

### 9.4 Ads And SEO

- Preserve plan and campaign context through checkout.
- Add route metadata, canonical URLs, sitemap, robots rules, structured data, and a real OG image.
- Noindex auth, admin, member, checkout state, and unfinished product pages.
- Add consent-managed Meta/Google tracking only after the factual privacy inventory is complete.
- Browser and server conversion events use deduplication and never place PII in URLs.

## 10. Legal And Company Identity

Public lookup reports CNPJ `54.069.389/0001-50` as active under `54.069.389 JONATHA TEIXEIRA MARTINS`. This must be checked against an official Receita Federal/REDESIM record before publication.

The returned activity codes focus on commerce and logistics. An accountant or Brazilian counsel must confirm whether the registered activities and invoicing cover digital education and recurring membership before checkout is enabled.

Terms, privacy, cancellation, and refund pages must reflect the implemented lifecycle and include verified supplier identity, contact channels, recurring billing, access termination, processors, international transfers, retention, LGPD rights, and request procedures. This document does not replace legal advice.

## 11. Error Handling And Operations

- User-facing errors are clear, actionable, and do not expose database details.
- Server logs include correlation IDs without secrets or unnecessary personal data.
- Failed webhooks and media operations are retryable and observable.
- Realtime failure falls back to explicit refresh/polling without losing user content.
- Admin actions provide success/failure feedback and retain audit evidence.
- Database and Storage backup/restore procedures have measured RPO and RTO.

## 12. Testing And Release Gates

### 12.1 Automated

- Unit tests for validation and entitlement logic.
- API integration tests for every role and account state.
- pgTAP RLS tests against a real Supabase database.
- Mercado Pago sandbox signature, idempotency, renewal, failure, cancellation, and refund tests.
- Browser tests for registration, checkout, member access, progress, community, downloads, live playback, cancellation, and admin workflows.
- Secret scanning, dependency scanning, TypeScript, lint, and production build in CI.

### 12.2 Device And Accessibility

- Test widths: 375, 390, 768, 1024, 1440, and 1920 pixels.
- Chrome, Safari, Firefox, Android Chrome, and iOS Safari.
- Keyboard navigation, focus visibility, reduced motion, color contrast, and screen-reader labels.
- Core Web Vitals and ad-destination availability.

### 12.3 Release Gates

Checkout and paid traffic remain disabled until:

- Exposed credentials are rotated and the security review is clean.
- RLS tests pass for all roles and account states.
- Admin mutations are server-enforced and audited.
- Private media cannot be retrieved without entitlement.
- Cancellation and refund request paths work.
- Mercado Pago sandbox lifecycle tests pass.
- Legal content matches implemented behavior and verified company details.
- Unsupported proof and claims are removed.
- Mobile and desktop end-to-end tests pass.

## 13. Migration Strategy

1. Inventory and back up Auth, database, and Storage.
2. Export the two account IDs and required profile fields.
3. Create the canonical schema in a staging Supabase project.
4. Apply grants, RLS, functions, and generated TypeScript types.
5. Seed the owner admin role by immutable user ID, not email-only logic.
6. Run RLS and API integration tests.
7. Migrate retained accounts and verified data.
8. Rehearse rollback.
9. Schedule a controlled production cutover.
10. Reconcile counts and permissions after cutover.

## 14. Explicit Non-Goals

- Building the Acertive AI application.
- Charging for Acertive or Combo before the app is ready.
- Annual billing, coupons, affiliates, multi-currency, or multiple payment providers.
- Fabricated results, testimonials, user identities, scarcity, or student counts.
- Custom RTMP infrastructure in the initial live implementation.
- Legal conclusions without qualified professional review.

## 15. Remaining Owner Inputs

These inputs are required before their corresponding implementation gates:

- Official company record, supplier address presentation, and invoice guidance.
- Verified support email and commercial/contact channels.
- Mercado Pago production account capabilities and credentials.
- Failed-payment grace-period length.
- Refund approval workflow and responsible person.
- Verified founder biography facts and permitted images.
- Real testimonials/cases with evidence and written usage permission, if available.
- Actual live cadence, support response expectations, and content release schedule.
