# Assertive Competitive Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate conversion-oriented Mercado Livre titles and descriptions from auditable competitive patterns without corrupting product identity or introducing unsupported claims.

**Architecture:** Convert research into a typed benchmark and a fact-referenced copy brief. Let AI propose copy, then require deterministic identity and claim guards before accepting it; otherwise use a safe factual fallback.

**Tech Stack:** TypeScript 5, Vitest, Gemini/Claude/Groq provider adapters, Mercado Livre REST API, Next.js 16

**Spec:** `docs/superpowers/specs/2026-09-09-assertive-autonomous-listings-v2.md`

## Global Constraints

- Competitor values never become facts unless exact-product evidence independently qualifies them.
- Never label a reference as a best seller without an official highlight position.
- Titles and descriptions must use the frozen evidence snapshot from the evidence/categories plan.
- Copy must remain original and plain text.
- Unsupported measurements, warranties, certifications, compatibility, package contents, health/performance claims, and superlatives are rejected.
- User Products `family_name` receives the same identity guard as classic titles.
- Do not commit without explicit user authorization.

---

### Task 1: Auditable Benchmark Set

**Files:**
- Create: `src/lib/assertive/benchmark.ts`
- Modify: `src/lib/assertive/research.ts`
- Modify: `src/lib/assertive/dna.ts`
- Test: `src/lib/assertive/__tests__/benchmark.test.ts`
- Test: `src/lib/assertive/__tests__/research-market.test.ts`

**Interfaces:**
- Consumes: `CompetitorDossier[]` and official highlight/search/seller signals.
- Produces: `BenchmarkSet`, `BenchmarkReference.kind`, `evidence`, and `buildBenchmarkSet()`.

- [ ] **Step 1: Add benchmark-label regressions**

```ts
it('uses OFFICIAL_BEST_SELLER only with highlight evidence', () => {
  const set = buildBenchmarkSet([dossier({ highlight_position: 2 })])
  expect(set.primary?.kind).toBe('OFFICIAL_BEST_SELLER')
  expect(set.primary?.evidence).toContain('Mais vendidos da categoria: posição #2')
})

it('labels a heuristic winner as strongest reference', () => {
  const set = buildBenchmarkSet([dossier({ highlight_position: null, competitive_reference_strength: 90 })])
  expect(set.primary?.kind).toBe('STRONGEST_REFERENCE')
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/benchmark.test.ts src/lib/assertive/__tests__/research-market.test.ts`

Expected: FAIL because `BenchmarkSet` does not exist.

- [ ] **Step 3: Implement benchmark selection**

```ts
export type BenchmarkKind = 'OFFICIAL_BEST_SELLER' | 'STRONGEST_REFERENCE'

export interface BenchmarkReference {
  product_id: string
  item_id: string | null
  kind: BenchmarkKind
  exactness: MatchClass
  strength: number
  evidence: string[]
}

export interface BenchmarkSet {
  primary: BenchmarkReference | null
  references: BenchmarkReference[]
  official_best_seller_available: boolean
}

function toBenchmarkReference(dossier: CompetitorDossier): BenchmarkReference {
  return {
    product_id: dossier.product_id,
    item_id: dossier.item_id,
    kind: dossier.highlight_position === null ? 'STRONGEST_REFERENCE' : 'OFFICIAL_BEST_SELLER',
    exactness: dossier.match_class,
    strength: dossier.competitive_reference_strength,
    evidence: dossier.strength_evidence,
  }
}

export function buildBenchmarkSet(competitors: CompetitorDossier[]): BenchmarkSet {
  const references = competitors.map(toBenchmarkReference)
  return {
    primary: references[0] ?? null,
    references,
    official_best_seller_available: references.some(r => r.kind === 'OFFICIAL_BEST_SELLER'),
  }
}
```

Preserve exact-product matching and competitive ranking as separate dimensions. Store the benchmark in `ResearchResult` and feed only patterns, signal evidence, and attribute IDs into DNA.

- [ ] **Step 4: Run benchmark and DNA tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/benchmark.test.ts src/lib/assertive/__tests__/research-market.test.ts src/lib/assertive/__tests__/dna.test.ts`

Expected: PASS.

### Task 2: Task-Aware AI Model Registry

**Files:**
- Create: `src/lib/assertive/ai-models.ts`
- Modify: `src/lib/assertive/ai.ts:20-78`
- Modify: `src/lib/assertive/ai-router.ts`
- Modify: `src/lib/assertive/websearch.ts:26`
- Test: `src/lib/assertive/__tests__/ai-models.test.ts`
- Test: `src/lib/assertive/__tests__/ai-router.test.ts`

**Interfaces:**
- Consumes: provider environment keys and explicit model environment overrides.
- Produces: `modelsForTask()`, explicit vision capability, model provenance, and deterministic fallback order.

- [ ] **Step 1: Add model-registry tests**

```ts
it('selects a vision-capable model whenever images are present', () => {
  expect(modelsForTask('visual_fidelity', envWithGemini).every(m => m.capabilities.vision)).toBe(true)
})

it('never sends image work to Groq text fallback', () => {
  expect(modelsForTask('visual_fidelity', envWithAll).map(m => m.provider)).not.toContain('groq')
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/ai-models.test.ts src/lib/assertive/__tests__/ai-router.test.ts`

Expected: FAIL because the registry and new visual tasks do not exist.

- [ ] **Step 3: Define explicit model capabilities and environment overrides**

```ts
export interface AIModelSpec {
  provider: 'gemini' | 'claude' | 'groq' | 'openai'
  model: string
  capabilities: { json: boolean; vision: boolean; imageGeneration: boolean; grounding: boolean }
  tier: 'reasoning' | 'draft' | 'vision' | 'image'
}
```

Use `ANTHROPIC_MODEL`, `GEMINI_REASONING_MODEL`, `GEMINI_DRAFT_MODEL`, `GEMINI_VISION_MODEL`, `GEMINI_SEARCH_MODEL`, and `GEMINI_IMAGE_MODEL`. Defaults must be selected from a successful provider catalog response and covered by a deployment health check; do not retain nonexistent `gemini-3.5-*` defaults.

- [ ] **Step 4: Add model metadata to router results and observability**

Every generation call returns provider, model, tier, latency, and attempt count. JSON helpers retain this metadata alongside parsed content rather than discarding it.

- [ ] **Step 5: Run router tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/ai-models.test.ts src/lib/assertive/__tests__/ai-router.test.ts`

Expected: PASS.

### Task 3: Frozen Copy Brief And Protected Identity

**Files:**
- Create: `src/lib/assertive/copy-brief.ts`
- Create: `src/lib/assertive/copy-guard.ts`
- Modify: `src/lib/assertive/generator.ts`
- Test: `src/lib/assertive/__tests__/copy-brief.test.ts`
- Test: `src/lib/assertive/__tests__/copy-guard.test.ts`
- Test: `src/lib/assertive/__tests__/generator.test.ts`

**Interfaces:**
- Consumes: evidence-qualified `ProductTruth`, category context, trends, and BenchmarkSet.
- Produces: `CopyBrief`, `verifyProtectedIdentityText()`, and guarded title/family-name candidates.

- [ ] **Step 1: Add the Caneta/Canela regression**

```ts
it('rejects a one-letter mutation of the protected product noun', () => {
  const result = verifyProtectedIdentityText(
    'Testador Circuito Kitest KA250 Canela Polaridade',
    copyBriefFor('Caneta de Polaridade', 'Kitest', 'KA250')
  )
  expect(result).toMatchObject({ valid: false, reason_codes: ['IDENTITY_TOKEN_MUTATED'] })
})
```

- [ ] **Step 2: Add unsupported-token and category-limit tests**

```ts
it('rejects a title with an unsupported measurement', () => {
  expect(guardTitle(brief, 'Caneta Kitest KA250 48V', 60).accepted).toBe(false)
})

it('uses the official title limit', () => {
  expect(guardTitle(brief, longCandidate, 55).value.length).toBeLessThanOrEqual(55)
})
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/copy-brief.test.ts src/lib/assertive/__tests__/copy-guard.test.ts src/lib/assertive/__tests__/generator.test.ts`

Expected: FAIL because the copy brief and lexical mutation guard do not exist.

- [ ] **Step 4: Build a fact-only copy brief**

```ts
export interface CopyFact {
  id: string
  label: string
  value: string
  protected: boolean
}

export interface CopyBrief {
  product_name: string
  facts: CopyFact[]
  protected_phrases: string[]
  allowed_measurements: string[]
  keywords: string[]
  category: { id: string; name: string; title_limit: number }
  benchmark_patterns: { title_shapes: string[]; description_shapes: string[] }
}
```

Exclude every non-publishable truth field. Include competitor structures and category trends, never competitor fact values.

- [ ] **Step 5: Implement identity and measurement guards**

Normalize accents and punctuation while preserving token boundaries. Require exact protected brand/model tokens. For the protected product noun, reject a candidate token with edit distance one when it replaces the canonical token and no accepted synonym is in the brief. Reject numbers/units absent from `allowed_measurements`.

- [ ] **Step 6: Apply the guard to title, alternatives, and `family_name`**

If a candidate fails, construct the fallback from protected product type, brand, model, variant, and evidence-qualified differentiators. Record reason codes in `GeneratedListing.improvements` and stage metadata.

- [ ] **Step 7: Run focused tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/copy-brief.test.ts src/lib/assertive/__tests__/copy-guard.test.ts src/lib/assertive/__tests__/generator.test.ts`

Expected: PASS, including `Caneta de Polaridade Kitest KA250 12V 24V`.

### Task 4: Fact-Referenced Description Generation

**Files:**
- Modify: `src/lib/assertive/generator.ts`
- Modify: `src/lib/assertive/copy-guard.ts`
- Test: `src/lib/assertive/__tests__/copy-guard.test.ts`
- Test: `src/lib/assertive/__tests__/generator.test.ts`

**Interfaces:**
- Consumes: `CopyBrief` from Task 3.
- Produces: structured `RawCopy`, `verifyDescriptionClaims()`, and deterministic fallback description.

- [ ] **Step 1: Add high-risk claim tests**

```ts
it.each([
  'Garantia de 5 anos',
  'Homologado pela Anatel',
  'Compatível com todos os veículos',
  'Acompanha carregador e bateria',
  'Elimina 100% das bactérias',
])('rejects unsupported claim: %s', claim => {
  expect(verifyDescriptionClaims(claim, brief).valid).toBe(false)
})
```

- [ ] **Step 2: Add fact-reference tests**

The AI response schema must use sections whose claims contain `fact_refs`:

```ts
interface RawCopyClaim {
  text: string
  fact_refs: string[]
}

interface RawCopy {
  title: string
  family_name: string
  sections: Array<{ heading: string; claims: RawCopyClaim[] }>
}
```

Assert that an unknown reference or a measurable claim without a supporting fact rejects the generated description.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/copy-guard.test.ts src/lib/assertive/__tests__/generator.test.ts`

Expected: FAIL before structured claims are implemented.

- [ ] **Step 4: Generate and validate structured copy**

The prompt receives only `CopyBrief`. Render accepted claims as plain text. Reject unknown references, unsupported numeric units, and regulated keywords without exact facts.

- [ ] **Step 5: Implement deterministic category-neutral fallback**

```ts
function factualDescription(title: string, brief: CopyBrief): string {
  return [
    title,
    '',
    'Sobre o produto',
    brief.product_name,
    '',
    'Especificações confirmadas',
    ...brief.facts.map(fact => `- ${fact.label}: ${fact.value}`),
  ].join('\n').trim()
}
```

When AI output fails, use this fallback and continue the pipeline.

- [ ] **Step 6: Run copy tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/copy-guard.test.ts src/lib/assertive/__tests__/generator.test.ts`

Expected: PASS.

### Task 5: Autonomous Three-Mode UX

**Files:**
- Modify: `src/app/membros/assertive-ecommerce-ia/novo/page.tsx`
- Modify: `src/app/membros/assertive-ecommerce-ia/analise/[id]/page.tsx`
- Modify: `src/app/membros/assertive-ecommerce-ia/editor/[id]/page.tsx`
- Modify: `src/app/api/assertive/analyze/route.ts`
- Test: `src/app/api/assertive/analyze/route.test.ts`
- Test: `src/lib/assertive/__tests__/analysis-progress.test.ts`

**Interfaces:**
- Consumes: photo, description, or URL input; blocking-question API from the evidence/categories plan.
- Produces: automatic pipeline start, a concise progress view, and preview-first handoff.

- [ ] **Step 1: Add API compatibility tests for three primary modes**

Assert `photo`, `description`, and `url` remain accepted while GTIN/brand-model are accepted only as advanced hints. Invalid combinations return the current Portuguese errors.

- [ ] **Step 2: Run route tests and establish baseline**

Run: `npm.cmd test -- src/app/api/assertive/analyze/route.test.ts src/lib/assertive/__tests__/analysis-progress.test.ts`

Expected: existing tests pass and new automatic-run expectations fail.

- [ ] **Step 3: Reduce the creation screen to three primary choices**

Keep one photo dropzone, one description textarea, and one URL field. Place GTIN and brand/model under an `Informações avançadas` disclosure. Preserve mobile layout and current upload limits.

- [ ] **Step 4: Remove optional confirmation interruption**

After identification, continue automatically into research. Show identity correction only when identity confidence is below the accepted threshold or exact source evidence conflicts. Do not render `truth.uncertain` as pre-research questions.

- [ ] **Step 5: Keep only official blocking questions before publish**

The analysis/editor flow consumes up to three `blocking_questions`; all non-blocking gaps stay in the optional improvements section.

- [ ] **Step 6: Run UX-adjacent tests and build**

Run: `npm.cmd test -- src/app/api/assertive/analyze/route.test.ts src/lib/assertive/__tests__/analysis-progress.test.ts`

Expected: PASS.

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd run build`

Expected: successful production build.

### Task 6: Competitive Copy Verification Gate

**Files:**
- Modify: `src/lib/assertive/__tests__/golden-regression.test.ts`
- Modify: `src/lib/assertive/__tests__/generator.test.ts`
- Modify: `src/lib/assertive/observability.ts` if additional event metadata typing is required

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: a verified copy checkpoint.

- [ ] **Step 1: Add golden copy fixtures**

Include tools, electronics, fashion, beauty, grocery, auto-parts, and home products. For each, assert protected identity, title limit, no unsupported numeric claims, no copied competitor sentence, and deterministic fallback behavior.

- [ ] **Step 2: Run all Assertive tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__ src/app/api/assertive`

Expected: PASS.

- [ ] **Step 3: Verify static output**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd run build`

Expected: exit code 0.

- [ ] **Step 4: Inspect diff quality**

Run: `git diff --check`

Expected: no whitespace errors.
