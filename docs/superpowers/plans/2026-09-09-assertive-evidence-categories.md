# Assertive Evidence And Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve factual evidence end to end and make official Mercado Livre category requirements the only source of publication blockers.

**Architecture:** Add one publishability contract shared by generation, enrichment, validation, and publishing. Expand the category context from live Mercado Livre metadata and turn unresolved official errors into a maximum of three seller questions per round.

**Tech Stack:** TypeScript 5, Next.js 16 Route Handlers, Zod, Vitest, Supabase, Mercado Livre REST API

**Spec:** `docs/superpowers/specs/2026-09-09-assertive-autonomous-listings-v2.md`

## Global Constraints

- Never invent product values.
- Only `CONFIRMED`, evidence-qualified `AUTO_FILLED`, and `USER_OVERRIDE` values may reach a publishable payload.
- `NEEDS_CONFIRMATION`, `CONFLICT`, `UNKNOWN`, and `NOT_APPLICABLE` never satisfy an official required field.
- Only official category requirements and Mercado Livre validation errors block publication.
- Ask at most three blocking questions per round; recommended and optional fields remain advisory.
- Preserve validated payload hashing, publication locking, reconciliation, and immutable `published_payload` behavior.
- Do not commit without explicit user authorization.

---

### Task 1: Central Attribute Evidence Contract

**Files:**
- Create: `src/lib/assertive/attribute-evidence.ts`
- Modify: `src/lib/assertive/generator.ts:11-18`
- Modify: `src/lib/assertive/enrichment.ts:24-28`
- Test: `src/lib/assertive/__tests__/attribute-evidence.test.ts`

**Interfaces:**
- Consumes: `DataStatus`, `TruthField`, and persisted legacy `ListingAttribute` rows.
- Produces: `ListingAttribute.status`, `ListingAttribute.evidence`, `ListingAttribute.source_url`, `isPublishableStatus()`, `resolveAttributeStatus()`, and `publishableAttributes()`.

- [ ] **Step 1: Write failing status-contract tests**

```ts
it.each(['NEEDS_CONFIRMATION', 'CONFLICT', 'UNKNOWN', 'NOT_APPLICABLE'] as const)(
  'does not publish %s', status => {
    expect(publishableAttributes([{ ...base, status }])).toEqual([])
  }
)

it.each(['CONFIRMED', 'AUTO_FILLED', 'USER_OVERRIDE'] as const)(
  'publishes evidence-qualified %s', status => {
    expect(publishableAttributes([{ ...base, status, evidence: 'literal source' }])).toHaveLength(1)
  }
)
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/attribute-evidence.test.ts`

Expected: FAIL because `attribute-evidence.ts` does not exist.

- [ ] **Step 3: Add the shared contract**

```ts
export const PUBLISHABLE_STATUSES = new Set<DataStatus>([
  'CONFIRMED',
  'AUTO_FILLED',
  'USER_OVERRIDE',
])

export function isPublishableStatus(status: DataStatus | undefined): boolean {
  return Boolean(status && PUBLISHABLE_STATUSES.has(status))
}

export function resolveAttributeStatus(attribute: ListingAttribute): DataStatus {
  if (attribute.status) return attribute.status
  if (attribute.source === 'user') return 'USER_OVERRIDE'
  if (attribute.source === 'catalog' && attribute.evidence) return 'AUTO_FILLED'
  return 'NEEDS_CONFIRMATION'
}

export function publishableAttributes(attributes: ListingAttribute[]): ListingAttribute[] {
  return attributes.filter(attribute =>
    Boolean(attribute.value_name?.trim()) && isPublishableStatus(resolveAttributeStatus(attribute))
  )
}
```

- [ ] **Step 4: Extend `ListingAttribute` without duplicating the type in enrichment**

```ts
export interface ListingAttribute {
  id: string
  name: string
  value_name: string
  value_id?: string
  tier: string
  source: 'truth' | 'ai' | 'catalog' | 'user'
  /** Optional only while reading persisted listings created before Evidence V2. */
  status?: DataStatus
  evidence?: string
  source_url?: string
}

export interface EnrichedAttribute extends Omit<ListingAttribute, 'status'> {
  status: DataStatus
}
```

- [ ] **Step 5: Run focused tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/attribute-evidence.test.ts src/lib/assertive/__tests__/enrichment.test.ts`

Expected: PASS.

### Task 2: Preserve Evidence Through Generation And Enrichment

**Files:**
- Modify: `src/lib/assertive/truth.ts:216-252`
- Modify: `src/lib/assertive/generator.ts:276-398`
- Modify: `src/lib/assertive/enrichment.ts:261-313,538-623`
- Test: `src/lib/assertive/__tests__/product-truth.test.ts`
- Test: `src/lib/assertive/__tests__/generator.test.ts`
- Test: `src/lib/assertive/__tests__/enrichment.test.ts`

**Interfaces:**
- Consumes: shared evidence contract from Task 1.
- Produces: status-preserving listing attributes and evidence-safe GTIN handling.

- [ ] **Step 1: Add regressions for high-confidence AI facts and GTIN ownership**

```ts
it('keeps a high-confidence visual inference non-publishable', () => {
  const truth = buildTruthForTest({ color: { value: 'Preto', confidence: 'high' } }, 'photo')
  expect(truth.fields.color.status).toBe('NEEDS_CONFIRMATION')
})

it('does not confirm a checksum-valid GTIN without exact-product evidence', async () => {
  const result = await enrichAttributes(inputWithInferredGtin('7898559182505'))
  expect(result.attributes.find(a => a.id === 'GTIN')?.status).not.toBe('CONFIRMED')
})
```

- [ ] **Step 2: Run the regressions and confirm they fail**

Run: `npm.cmd test -- src/lib/assertive/__tests__/product-truth.test.ts src/lib/assertive/__tests__/generator.test.ts src/lib/assertive/__tests__/enrichment.test.ts`

Expected: FAIL because `high` currently becomes `AUTO_FILLED`, generator drops status, and GTIN checksum promotes identity.

- [ ] **Step 3: Make AI confidence non-authoritative**

Implement this status mapping in `buildTruth`:

```ts
const status: DataStatus = confidence === 'confirmed'
  ? 'CONFIRMED'
  : 'NEEDS_CONFIRMATION'
```

Keep low-confidence values in `uncertain`; retain high-confidence values with `NEEDS_CONFIRMATION` so they can be suggested but cannot publish themselves.

- [ ] **Step 4: Preserve truth provenance in `reconcileAttributes`**

Change `truthByAttr` to retain the full field and pass status/evidence into `push`:

```ts
const truthByAttr: Record<string, TruthField> = {}

push(attrId, field.value, 'truth', {
  status: field.status ?? (field.confidence === 'confirmed' ? 'CONFIRMED' : 'NEEDS_CONFIRMATION'),
  evidence: field.evidence,
  source_url: field.source_url,
})
```

Generated AI attributes receive `NEEDS_CONFIRMATION`; exact catalog and deterministic attributes retain `AUTO_FILLED`; seller values retain `USER_OVERRIDE`.

- [ ] **Step 5: Stop enrichment from reconstructing status from `source`**

Use `resolveAttributeStatus(existing)` for current values and preserve `field.status` for ProductTruth. In `resolveGTIN`, preserve the truth field's original status instead of returning `CONFIRMED` merely because `isValidGtin()` succeeds.

- [ ] **Step 6: Run the focused suite**

Run: `npm.cmd test -- src/lib/assertive/__tests__/product-truth.test.ts src/lib/assertive/__tests__/generator.test.ts src/lib/assertive/__tests__/enrichment.test.ts`

Expected: PASS.

### Task 3: Official Category Context And Eligibility

**Files:**
- Modify: `src/lib/assertive/taxonomy.ts`
- Modify: `src/lib/assertive/pipeline.ts:110-140`
- Test: `src/lib/assertive/__tests__/category-context.test.ts`
- Test: `src/lib/assertive/__tests__/category-matrix.test.ts`

**Interfaces:**
- Consumes: Mercado Livre category, attribute, sale-term, and seller-capability endpoints.
- Produces: `CategoryContext` with `eligibility`, `itemAttributes`, `variationAttributes`, `saleTerms`, and limits.

- [ ] **Step 1: Add category-context regressions**

```ts
it('rejects a category disabled for listing', async () => {
  mockCategory({ settings: { listing_allowed: false, status: 'disabled' } })
  await expect(resolveCategoryContext('token', 'MLB1')).rejects.toThrow('não aceita novas publicações')
})

it('separates child variation attributes without dropping them', async () => {
  const context = await resolveCategoryContext('token', 'MLB2')
  expect(context.variationAttributes.map(a => a.id)).toContain('SIZE')
  expect(context.itemAttributes.map(a => a.id)).not.toContain('SIZE')
})
```

- [ ] **Step 2: Run category tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/category-context.test.ts src/lib/assertive/__tests__/category-matrix.test.ts`

Expected: FAIL because category eligibility, sale terms, and variation attributes are not represented.

- [ ] **Step 3: Expand official types and fetchers**

Add `max_pictures_per_item`, `max_pictures_per_item_var`, `minimum_price`, `maximum_price`, `shipping_modes`, and `vertical` to `CategoryInfo.settings`. Add:

```ts
export async function getCategorySaleTerms(token: string, categoryId: string): Promise<MLAttribute[]> {
  return mlGet<MLAttribute[]>(`/categories/${categoryId}/sale_terms`, token, { ttl: WEEK, persist: true })
}
```

- [ ] **Step 4: Build the normalized context**

```ts
export interface CategoryContext {
  category: CategoryInfo | null
  attributes: ClassifiedAttribute[]
  itemAttributes: ClassifiedAttribute[]
  variationAttributes: ClassifiedAttribute[]
  saleTerms: ClassifiedAttribute[]
  capabilities: SellerCapabilities | null
  limits: { title: number; pictures: number; variationPictures: number }
}
```

Reject only when `listing_allowed === false` or category status is explicitly non-enabled. Preserve variation attributes rather than filtering them from the context.

- [ ] **Step 5: Cover representative domains with fixtures**

Keep the matrix deterministic and include electronics, tools, fashion, home, auto-parts, beauty, grocery, and sports. Assert explicit `required`/`catalog_required` tags block, `recommended`/`optional` do not block, and `CHILD_PK` fields remain available to variation handling.

- [ ] **Step 6: Run category tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/category-context.test.ts src/lib/assertive/__tests__/category-matrix.test.ts`

Expected: PASS.

### Task 4: Variation And Specialized Requirement Projection

**Files:**
- Modify: `src/lib/assertive/generator.ts`
- Modify: `src/lib/assertive/publisher.ts`
- Modify: `src/lib/assertive/publication-readiness.ts`
- Create: `src/lib/assertive/specialized-requirements.ts`
- Test: `src/lib/assertive/__tests__/publisher-variations.test.ts`
- Test: `src/lib/assertive/__tests__/specialized-requirements.test.ts`

**Interfaces:**
- Consumes: item attributes, variation attributes, sale terms, seller capabilities, and ML validation issues from `CategoryContext`.
- Produces: `ListingVariation[]`, variation-aware `MLItemPayload`, and actionable specialized blockers.

- [ ] **Step 1: Add a single-SKU fashion variation regression**

```ts
it('projects CHILD_PK values into one variation without losing evidence status', () => {
  const payload = buildItemPayload(inputWithSizeAndColor, classicCapabilities)
  expect(payload.variations).toEqual([expect.objectContaining({
    attribute_combinations: expect.arrayContaining([
      expect.objectContaining({ id: 'SIZE', value_name: 'M' }),
    ]),
  })])
  expect(payload.attributes.map(attribute => attribute.id)).not.toContain('SIZE')
})
```

- [ ] **Step 2: Add specialized-blocker regressions**

```ts
it('returns an actionable size-chart blocker without fabricating an id', () => {
  expect(normalizeSpecializedIssues([sizeChartIssue])).toEqual([
    expect.objectContaining({ kind: 'SIZE_CHART', is_blocker: true }),
  ])
})

it('keeps optional vehicle compatibility advisory', () => {
  expect(normalizeSpecializedIssues([optionalCompatibilityWarning])[0].is_blocker).toBe(false)
})
```

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/publisher-variations.test.ts src/lib/assertive/__tests__/specialized-requirements.test.ts`

Expected: FAIL because the payload has no variation representation and specialized issues are untyped.

- [ ] **Step 4: Add variation types and evidence filtering**

```ts
export interface ListingVariation {
  attribute_combinations: Array<{ id: string; value_id?: string; value_name: string }>
  attributes: Array<{ id: string; value_id?: string; value_name: string }>
  price: number
  available_quantity: number
}
```

For a single-SKU listing, collect publishable `isVariationOnly` fields into one variation and leave item-level fields in `payload.attributes`. When a category/account accepts the value at item level instead, preserve the validator-confirmed payload shape. Never synthesize extra colors, sizes, stock, or pictures.

- [ ] **Step 5: Normalize specialized official errors**

Map validation codes for size charts, vehicle compatibility, regulated identifiers, catalog obligations, and sale terms to typed requirements. Preserve the raw code/message, mark blocking only when severity is `error`, and route seller-resolvable IDs into the minimal question selector. Non-answerable account or authorization issues remain actionable blockers.

- [ ] **Step 6: Run variation and publisher tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/publisher-variations.test.ts src/lib/assertive/__tests__/specialized-requirements.test.ts src/lib/assertive/__tests__/publisher-validation.test.ts`

Expected: PASS.

### Task 5: Minimal Blocking Questions

**Files:**
- Create: `src/lib/assertive/blocking-questions.ts`
- Modify: `src/lib/assertive/publication-requirements.ts`
- Modify: `src/lib/assertive/enrichment.ts:478-525`
- Modify: `src/app/api/assertive/listings/[id]/answers/route.ts`
- Modify: `src/app/membros/assertive-ecommerce-ia/editor/[id]/page.tsx`
- Test: `src/lib/assertive/__tests__/blocking-questions.test.ts`
- Test: `src/app/api/assertive/listings/[id]/answers/route.test.ts`

**Interfaces:**
- Consumes: `PublicationRequirements`, schema, current attributes, and ML issues.
- Produces: `buildBlockingQuestions(...): PendingQuestion[]` capped at three and automatic revalidation after answers.

- [ ] **Step 1: Add question-selection tests**

```ts
it('asks only unresolved official blockers and caps a round at three', () => {
  const questions = buildBlockingQuestions(requirementsWithFiveBlockers, schema, attributes)
  expect(questions).toHaveLength(3)
  expect(questions.every(q => q.blocking)).toBe(true)
})

it('never asks a recommended attribute before preview', () => {
  expect(buildBlockingQuestions(recommendedOnly, schema, [])).toEqual([])
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/blocking-questions.test.ts src/app/api/assertive/listings/[id]/answers/route.test.ts`

Expected: FAIL because the selector and route test do not exist and existing queues include recommended fields.

- [ ] **Step 3: Implement deterministic ranking and deduplication**

Normalize aliases to one fact, group issue codes by attribute, rank official errors before schema requirements, prefer closed-list questions, and return `ranked.slice(0, 3)`.

- [ ] **Step 4: Persist seller answers with explicit status**

```ts
const entry: ListingAttribute = {
  id: attrId,
  name: spec.name,
  value_name,
  value_id,
  tier: spec.tier,
  source: 'user',
  status: 'USER_OVERRIDE',
  evidence: 'Informado pelo vendedor',
}
```

Clear validation/hash, recompute, invoke the same validation service used by the validate route, and return the next blocker round.

- [ ] **Step 5: Show recommended gaps as optional editor improvements only**

The editor's blocking card consumes `blocking_questions`; its collapsed improvements section consumes `recommended_missing`. Neither hardcodes category attribute IDs.

- [ ] **Step 6: Run focused tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/blocking-questions.test.ts src/app/api/assertive/listings/[id]/answers/route.test.ts src/lib/assertive/__tests__/publication-requirements.test.ts`

Expected: PASS.

### Task 6: Enforce Evidence In Validation And Publication

**Files:**
- Create: `src/lib/assertive/listing-validation.ts`
- Modify: `src/app/api/assertive/listings/[id]/validate/route.ts`
- Modify: `src/lib/assertive/publisher.ts:232-325`
- Modify: `src/app/api/assertive/listings/[id]/publish/route.ts:135-218`
- Test: `src/app/api/assertive/listings/[id]/validate/route.test.ts`
- Test: `src/app/api/assertive/listings/[id]/publish/route.test.ts`
- Test: `src/lib/assertive/__tests__/publisher-validation.test.ts`

**Interfaces:**
- Consumes: publishable attributes and official category context.
- Produces: `validateAndPersistListing()` and publication from an unchanged validated payload.

- [ ] **Step 1: Add the required inferred-attribute regression**

```ts
it('keeps a required NEEDS_CONFIRMATION value blocked after ML 204', async () => {
  seedListingAttribute({ id: 'VOLTAGE', value_name: '220 V', status: 'NEEDS_CONFIRMATION' })
  mockMLValidation(204)
  const response = await POST(request, routeContext)
  expect(await response.json()).toMatchObject({ valid: false })
  expect(savedListing.status).toBe('needs_input')
})
```

- [ ] **Step 2: Add publisher filtering and immutable-snapshot regressions**

```ts
it('excludes non-publishable attributes from the ML payload', () => {
  const payload = buildItemPayload(inputWithStatuses(), classicCapabilities)
  expect(payload.attributes.map(a => a.id)).not.toContain('INFERRED_REQUIRED')
})

it('publishes the exact stored validated payload', async () => {
  seedReadyListing({ validated_payload: canonicalPayload, validated_payload_hash: payloadHash(canonicalPayload) })
  await POST(request, context)
  expect(publishListing).toHaveBeenCalledWith(expect.any(String), canonicalPayload, expect.any(String))
})
```

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm.cmd test -- src/app/api/assertive/listings/[id]/validate/route.test.ts src/app/api/assertive/listings/[id]/publish/route.test.ts src/lib/assertive/__tests__/publisher-validation.test.ts`

Expected: FAIL because validation currently rewrites all non-user statuses to `CONFIRMED` and publication rebuilds/revalidates a different payload.

- [ ] **Step 4: Extract one validation service**

`validateAndPersistListing(listing, userId)` must build from `publishableAttributes`, compute effective requirements with original statuses, save the accepted payload/hash only when both local and ML checks pass, and preserve warning-only HTTP 400 semantics.

- [ ] **Step 5: Make publication consume the validated snapshot**

Before acquiring the lock, require:

```ts
listing.status === 'ready_to_publish'
listing.validation?.valid === true
listing.validated_payload != null
payloadHash(listing.validated_payload) === listing.validated_payload_hash
listing.attributes?.publication_requirements?.all_clear === true
```

Use `listing.validated_payload` as the `publishListing` payload. Do not overwrite the validated snapshot during lock acquisition. Restrict the compare-and-set lock to `status = ready_to_publish`, `ml_item_id IS NULL`, and the current validated hash.

- [ ] **Step 6: Preserve checkpoint reconciliation assertions**

Retain tests for warning-only validation acceptance, canonical JSONB hash order, confirmed/pending GET reconciliation, immutable `published_payload`, and no duplicate retry after a successful POST.

- [ ] **Step 7: Run the publication suite**

Run: `npm.cmd test -- src/app/api/assertive/listings/[id]/validate/route.test.ts src/app/api/assertive/listings/[id]/publish/route.test.ts src/lib/assertive/__tests__/publication-readiness.test.ts src/lib/assertive/__tests__/publisher-validation.test.ts`

Expected: PASS.

### Task 7: Evidence And Category Verification Gate

**Files:**
- Modify: `src/lib/assertive/__tests__/golden-regression.test.ts`
- Modify: `src/lib/assertive/__tests__/category-matrix.test.ts`
- Modify: `docs/superpowers/specs/2026-09-09-assertive-autonomous-listings-v2.md` only if behavior differs from the approved contract

**Interfaces:**
- Consumes: all tasks in this plan.
- Produces: a verified evidence/category checkpoint suitable for image and copy integration.

- [ ] **Step 1: Add one golden path per representative category class**

Each fixture must assert category resolution, required attributes, non-blocking recommendations, question count, payload attributes, and readiness state. Include a classic account and a User Products account.

- [ ] **Step 2: Run all Assertive tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__ src/app/api/assertive`

Expected: PASS.

- [ ] **Step 3: Run static and production verification**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd run build`

Expected: exit code 0 and successful Next.js production build.

- [ ] **Step 4: Inspect the final diff and worktree**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intended evidence/category files plus approved plan/spec files are changed.
