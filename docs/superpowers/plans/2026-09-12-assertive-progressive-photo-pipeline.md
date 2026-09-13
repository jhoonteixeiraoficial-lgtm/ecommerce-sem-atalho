# Assertive Progressive Photo Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar seis fotos Gemini progressivas, retomáveis, fiéis e não duplicadas para análises por link, descrição ou foto própria, sempre com capa branca e sem publicar referências externas brutas.

**Architecture:** A análise cria o rascunho e jobs duráveis sem esperar a galeria inteira. Um worker acionado pelo editor primeiro adquire referências privadas do produto exato e depois gera um slot por requisição, com claim atômico, múltiplas referências, gates de qualidade e atualização isolada da posição. O editor exibe os seis estados e retoma jobs pendentes após reload.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Supabase/PostgreSQL, Vitest 4, Sharp, Gemini GenerateContent, Mercado Livre APIs.

**Spec:** `docs/superpowers/specs/2026-09-12-assertive-progressive-photo-pipeline-design.md`

## Global Constraints

- Trabalhar inline nesta sessão; o usuário proibiu subagentes.
- Alterar somente o domínio de fotos do Assertive.
- Criar exatamente seis slots automáticos por rascunho novo.
- Priorizar concorrente do produto exato; usar foto própria como referência adicional/fallback.
- Ampliar busca do Mercado Livre para fabricante, varejistas e outros marketplaces quando necessário.
- Nunca anexar `REFERENCE_ONLY`, URL externa bruta ou foto original de concorrente à galeria.
- Slot zero exige imagem quadrada com fundo branco puro.
- Bloquear saídas estruturalmente incorretas e duplicatas; exibir saídas inconclusivas para revisão.
- Toda saída Gemini exige confirmação humana antes da publicação.
- Processar no máximo dois jobs simultâneos por anúncio.
- Não modificar autenticação, conexão ML, copy, preço, categoria, logística ou publicação.
- Nenhum smoke test pode clicar ou chamar a rota de publicação.
- Preservar rascunhos e dados reais; excluir somente registros criados e marcados pelo próprio smoke.

---

## File Structure

- `supabase/migrations/20260912130000_assertive_progressive_image_jobs.sql`: tabela de jobs, constraints, claim e atualização atômica de slot.
- `supabase/tests/database/progressive_image_jobs.test.sql`: comportamento real do schema, concorrência e RPCs em PostgreSQL.
- `src/lib/assertive/image-job-contract.ts`: tipos compartilhados e schema de snapshot cliente/servidor.
- `src/lib/assertive/image-jobs.ts`: persistência, bootstrap, claim, transições e snapshot seguro.
- `src/lib/assertive/safe-remote-url.ts`: validação HTTPS/DNS reutilizável.
- `src/lib/assertive/web-image-discovery.ts`: fetch HTML limitado e extração de imagens de páginas externas.
- `src/lib/assertive/visual-references.ts`: candidatos, identidade visual, ranking, ingestão e diversidade.
- `src/lib/assertive/image-quality.ts`: hash perceptual, fundo branco e comparação local.
- `src/lib/assertive/gemini-image.ts`: geração com até três referências.
- `src/lib/assertive/image-fidelity.ts`: gate multirreferência e composição nova.
- `src/lib/assertive/progressive-images.ts`: execução de busca e de um slot.
- `src/lib/assertive/pipeline.ts`: criação do rascunho e bootstrap progressivo sem geração em lote.
- `src/app/api/assertive/listings/[id]/images/jobs/route.ts`: snapshot dos jobs.
- `src/app/api/assertive/listings/[id]/images/jobs/run/route.ts`: execução de exatamente um job.
- `src/app/api/assertive/listings/[id]/images/jobs/[position]/route.ts`: remoção persistente de um slot.
- `src/app/api/assertive/listings/[id]/images/jobs/[position]/retry/route.ts`: retry isolado.
- `src/app/api/assertive/listings/[id]/images/confirm/route.ts`: confirmação ligada ao job.
- `src/components/assertive/progressive-photo-gallery.tsx`: seis cards e ações por slot.
- `src/lib/assertive/progressive-photo-client.ts`: seleção pura de ações do pump cliente.
- `src/app/membros/assertive-ecommerce-ia/editor/[id]/page.tsx`: integração do componente e pump com duas requisições.

---

### Task 1: Persisted Image Job Schema

**Files:**
- Create: `supabase/migrations/20260912130000_assertive_progressive_image_jobs.sql`
- Create: `supabase/tests/database/progressive_image_jobs.test.sql`

**Interfaces:**
- Produces table `assertive_image_jobs`; análises novas recebem um `REFERENCE_SEARCH` e seis `GENERATE_SLOT`, enquanto rascunhos existentes recebem jobs somente nas posições ausentes.
- Produces statuses `QUEUED | RUNNING | RETRYABLE | REVIEW | SUCCEEDED | FAILED | DISMISSED`.
- Extends `assertive_image_assets.origin` with `WEB_REFERENCE`.

- [ ] **Step 1: Start the local Supabase stack and write a failing pgTAP behavior test**

```sql
begin;
select plan(5);

select has_table('public', 'assertive_image_jobs', 'durable image jobs exist');
select col_is_pk('public', 'assertive_image_jobs', 'id', 'jobs have stable identity');
select ok(
  coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.assertive_image_jobs')), false),
  'jobs enforce row level security'
);
select throws_ok(
  $$insert into public.assertive_image_jobs
    (user_id, analysis_id, listing_id, kind, position, role, status)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003', 'GENERATE_SLOT', 6, 'MAIN', 'QUEUED')$$,
  '23514', null, 'only slots zero through five are accepted'
);
select throws_ok(
  $$insert into public.assertive_image_jobs
    (user_id, analysis_id, listing_id, kind, position, role, status)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003', 'REFERENCE_SEARCH', 0, 'MAIN', 'QUEUED')$$,
  '23514', null, 'reference search cannot occupy a gallery slot'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test and verify the missing migration fails**

Run: `npx.cmd supabase test db supabase/tests/database/progressive_image_jobs.test.sql`

Expected: FAIL because the table does not exist. If Docker Desktop is stopped, start it and wait for `docker version` to report the server before rerunning; do not treat infrastructure absence as the expected RED.

- [ ] **Step 3: Add the job table and constraints**

```sql
ALTER TABLE public.assertive_image_assets
  DROP CONSTRAINT IF EXISTS assertive_image_assets_origin_check;

ALTER TABLE public.assertive_image_assets
  ADD CONSTRAINT assertive_image_assets_origin_check
  CHECK (origin IN ('USER_UPLOAD','ML_OWN_ITEM','ML_CATALOG','COMPETITOR','WEB_REFERENCE','AI_GENERATED'));

CREATE TABLE IF NOT EXISTS public.assertive_image_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES public.assertive_analyses(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.assertive_listings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('REFERENCE_SEARCH','GENERATE_SLOT')),
  position INT CHECK (position BETWEEN 0 AND 5),
  role TEXT CHECK (role IN ('MAIN','DETAIL','PACKAGING','LIFESTYLE','INFORMATIONAL')),
  shot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','RUNNING','RETRYABLE','REVIEW','SUCCEEDED','FAILED','DISMISSED')),
  reference_asset_ids UUID[] NOT NULL DEFAULT '{}',
  output_asset_id UUID REFERENCES public.assertive_image_assets(id) ON DELETE SET NULL,
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  next_attempt_at TIMESTAMPTZ,
  lock_token UUID,
  locked_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'REFERENCE_SEARCH' AND position IS NULL AND role IS NULL)
    OR (kind = 'GENERATE_SLOT' AND position IS NOT NULL AND role IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS assertive_image_jobs_reference_unique
  ON public.assertive_image_jobs(listing_id) WHERE kind = 'REFERENCE_SEARCH';
CREATE UNIQUE INDEX IF NOT EXISTS assertive_image_jobs_listing_slot_unique
  ON public.assertive_image_jobs(listing_id, position) WHERE kind = 'GENERATE_SLOT';
CREATE INDEX IF NOT EXISTS assertive_image_jobs_claim_idx
  ON public.assertive_image_jobs(listing_id, status, next_attempt_at, position);

ALTER TABLE public.assertive_image_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own assertive image jobs"
  ON public.assertive_image_jobs FOR SELECT USING (auth.uid() = user_id);
```

- [ ] **Step 4: Reset the local database and run the behavioral schema test**

Run: `npx.cmd supabase db reset`

Run: `npx.cmd supabase test db supabase/tests/database/progressive_image_jobs.test.sql`

Expected: PASS.

- [ ] **Step 5: Commit the schema foundation**

```powershell
git add -- "supabase/migrations/20260912130000_assertive_progressive_image_jobs.sql" "supabase/tests/database/progressive_image_jobs.test.sql"
git commit -m "feat(assertive): add progressive image job schema"
```

---

### Task 2: Atomic Claim and Slot Projection

**Files:**
- Modify: `supabase/migrations/20260912130000_assertive_progressive_image_jobs.sql`
- Modify: `supabase/tests/database/progressive_image_jobs.test.sql`

**Interfaces:**
- Produces RPC `assertive_claim_image_job(UUID, UUID, UUID)` returning one claimed row.
- Produces RPC `assertive_upsert_listing_image_slot(UUID, UUID, INT, UUID, TEXT)`.
- Produces RPCs `assertive_reset_image_slot` and `assertive_confirm_image_slot` para retry, remoção e confirmação atômicos.
- Todas as RPCs são executáveis apenas por `service_role`.

- [ ] **Step 1: Extend pgTAP with observable claim and slot behavior**

Antes das asserções, insira em transação um usuário `auth.users`, uma análise, um rascunho, o job de busca e seis jobs de slot com UUIDs fixos. Depois da asserção de prioridade, conclua a busca e reivindique duas posições com tokens diferentes antes de provar que a terceira chamada retorna vazia.

```sql
select is(
  (select kind from public.assertive_claim_image_job(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000111'
  )),
  'REFERENCE_SEARCH',
  'reference acquisition is always claimed first'
);

update public.assertive_image_jobs
set status = 'SUCCEEDED', lock_token = null, locked_at = null
where listing_id = '00000000-0000-0000-0000-000000000103' and kind = 'REFERENCE_SEARCH';

select is(
  (select position from public.assertive_claim_image_job(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000112'
  )),
  0,
  'generation starts at the cover after references succeed'
);

select is_empty(
  $$select * from public.assertive_claim_image_job(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000114'
  )$$,
  'a third live generation worker is not claimed'
);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx.cmd supabase test db supabase/tests/database/progressive_image_jobs.test.sql`

Expected: FAIL because the RPC definitions are absent.

- [ ] **Step 3: Implement atomic claim semantics**

The claim function must lock one eligible row with `FOR UPDATE SKIP LOCKED`, prioritize `REFERENCE_SEARCH`, require the reference job to be `SUCCEEDED` before claiming a generation slot, refuse a third live generation worker, recover stale `RUNNING` rows after three minutes, increment `attempt_count`, and set `lock_token` plus `locked_at` in the same statement.

```sql
CREATE OR REPLACE FUNCTION public.assertive_claim_image_job(
  p_listing_id UUID,
  p_user_id UUID,
  p_lock_token UUID
) RETURNS SETOF public.assertive_image_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT job.id
    FROM public.assertive_image_jobs job
    WHERE job.listing_id = p_listing_id
      AND job.user_id = p_user_id
      AND job.attempt_count < job.max_attempts
      AND (
        job.status = 'QUEUED'
        OR (job.status = 'RETRYABLE' AND COALESCE(job.next_attempt_at, now()) <= now())
        OR (job.status = 'RUNNING' AND job.locked_at < now() - interval '3 minutes')
      )
      AND (
        job.kind = 'REFERENCE_SEARCH'
        OR (
          EXISTS (
            SELECT 1 FROM public.assertive_image_jobs reference_job
            WHERE reference_job.listing_id = job.listing_id
              AND reference_job.kind = 'REFERENCE_SEARCH'
              AND reference_job.status = 'SUCCEEDED'
          )
          AND (
            SELECT count(*) FROM public.assertive_image_jobs active_job
            WHERE active_job.listing_id = job.listing_id
              AND active_job.kind = 'GENERATE_SLOT'
              AND active_job.status = 'RUNNING'
              AND active_job.locked_at >= now() - interval '3 minutes'
          ) < 2
        )
      )
    ORDER BY CASE WHEN job.kind = 'REFERENCE_SEARCH' THEN 0 ELSE 1 END, job.position NULLS FIRST
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.assertive_image_jobs job
  SET status = 'RUNNING',
      attempt_count = job.attempt_count + 1,
      lock_token = p_lock_token,
      locked_at = now(),
      error_code = NULL,
      error_message = NULL,
      updated_at = now()
  FROM candidate
  WHERE job.id = candidate.id
  RETURNING job.*;
END;
$$;
```

- [ ] **Step 4: Implement atomic slot projection, confirmation and reset**

The slot RPC must lock the listing row, reject published/publishing listings, reject `REFERENCE_ONLY` and `REJECT` assets, delete only the existing relation at the same position, insert the output, rebuild `photos` and `attributes.photo_metadata` ordered by position, append the generated asset to `image_review.required_asset_ids`, and invalidate preflight fields. `assertive_confirm_image_slot` moves only the matching `REVIEW` job to `SUCCEEDED`. `assertive_reset_image_slot` locks the same rows, removes the old output from the gallery and review arrays, then sets the slot to `QUEUED` for retry or `DISMISSED` for explicit removal.

- [ ] **Step 5: Run migration tests and SQL syntax checks**

Run: `npx.cmd supabase db reset`

Run: `npx.cmd supabase test db supabase/tests/database/progressive_image_jobs.test.sql`

Expected: PASS.

- [ ] **Step 6: Commit the RPC contract**

```powershell
git add -- "supabase/migrations/20260912130000_assertive_progressive_image_jobs.sql" "supabase/tests/database/progressive_image_jobs.test.sql"
git commit -m "feat(assertive): add atomic image job operations"
```

---

### Task 3: Shared Job Contract and Store

**Files:**
- Create: `src/lib/assertive/image-job-contract.ts`
- Create: `src/lib/assertive/image-jobs.ts`
- Create: `src/lib/assertive/__tests__/image-jobs.test.ts`

**Interfaces:**
- Produces `ImageJobStatus`, `ImageJob`, `ImageJobSlot`, and `ImageJobSnapshot`.
- Produces `ensureProgressiveImageJobs(input): Promise<void>`.
- Produces `claimNextImageJob(listingId, userId): Promise<ImageJob | null>`.
- Produces `getImageJobSnapshot(listingId, userId): Promise<ImageJobSnapshot>`.
- Produces `transitionImageJob(jobId, userId, lockToken, patch): Promise<void>`.
- Produces `retryImageJob(listingId, userId, position): Promise<void>`.

- [ ] **Step 1: Write failing tests for six-slot bootstrap and safe snapshots**

```ts
it('bootstraps one reference job and six ordered generation slots for a new empty listing', async () => {
  await ensureProgressiveImageJobs({
    listingId: 'listing-1', analysisId: 'analysis-1', userId: 'user-1', imagePlan,
  })
  expect(inserted).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'REFERENCE_SEARCH', position: null }),
    expect.objectContaining({ kind: 'GENERATE_SLOT', position: 0, role: 'MAIN' }),
    expect.objectContaining({ kind: 'GENERATE_SLOT', position: 5 }),
  ]))
  expect(inserted).toHaveLength(7)
})

it('preserves occupied legacy positions and creates only missing jobs', async () => {
  existingListingImages = [{ position: 0, asset_id: 'manual-1' }, { position: 2, asset_id: 'manual-2' }]
  await ensureProgressiveImageJobs({
    listingId: 'listing-1', analysisId: 'analysis-1', userId: 'user-1', imagePlan,
  })
  expect(inserted.filter(row => row.kind === 'GENERATE_SLOT').map(row => row.position)).toEqual([1, 3, 4, 5])
})

it('never exposes private reference URLs in a snapshot', async () => {
  const snapshot = await getImageJobSnapshot('listing-1', 'user-1')
  expect(JSON.stringify(snapshot)).not.toContain('private-reference')
  expect(snapshot.slots).toHaveLength(6)
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-jobs.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Define the shared contract**

```ts
export type ImageJobStatus = 'QUEUED' | 'RUNNING' | 'RETRYABLE' | 'REVIEW' | 'SUCCEEDED' | 'FAILED' | 'DISMISSED'

export interface ImageJobSlot {
  position: number
  role: 'MAIN' | 'DETAIL' | 'PACKAGING' | 'LIFESTYLE' | 'INFORMATIONAL'
  title: string
  description: string
  status: ImageJobStatus
  asset_id: string | null
  preview_url: string | null
  attempts: number
  error_code: string | null
  error_message: string | null
  auto_verdict: 'ACCEPT' | 'REVIEW' | null
}

export interface ImageJobSnapshot {
  listing_id: string
  target_count: 6
  ready_count: number
  reference_status: ImageJobStatus
  reference_count: number
  runnable: boolean
  slots: ImageJobSlot[]
}
```

- [ ] **Step 4: Implement store operations with ownership filters**

Use `createAdminClient()`, always filter `listing_id` and `user_id`, call the claim RPC with `randomUUID()`, truncate stored error messages to 1000 characters, and map only generated public URLs into the snapshot. Merge existing authorized `assertive_listing_images` into their persisted positions so a legacy manual image appears as an already-ready slot without creating a generation job over it.

- [ ] **Step 5: Run focused tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-jobs.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the job store**

```powershell
git add -- "src/lib/assertive/image-job-contract.ts" "src/lib/assertive/image-jobs.ts" "src/lib/assertive/__tests__/image-jobs.test.ts"
git commit -m "feat(assertive): add progressive image job store"
```

---

### Task 4: Safe External Image Discovery

**Files:**
- Create: `src/lib/assertive/safe-remote-url.ts`
- Modify: `src/lib/assertive/safe-image-fetch.ts`
- Create: `src/lib/assertive/web-image-discovery.ts`
- Create: `src/lib/assertive/__tests__/web-image-discovery.test.ts`

**Interfaces:**
- Produces `assertPublicHttpsUrl(url: URL): Promise<void>`.
- Produces `discoverWebImageCandidates(pageUrl: string): Promise<string[]>`.
- Consumes `searchWeb(query, maxSources)` from `websearch.ts` in later tasks.

- [ ] **Step 1: Write failing tests for metadata extraction and SSRF rejection**

```ts
it('extracts absolute og:image, twitter:image and JSON-LD images without duplicates', async () => {
  fetchMock.mockResolvedValue(htmlResponse(`
    <meta property="og:image" content="/photo-a.jpg">
    <meta name="twitter:image" content="https://cdn.example/photo-b.jpg">
    <script type="application/ld+json">{"image":["https://cdn.example/photo-b.jpg","https://cdn.example/photo-c.jpg"]}</script>
  `))
  await expect(discoverWebImageCandidates('https://shop.example/product')).resolves.toEqual([
    'https://shop.example/photo-a.jpg',
    'https://cdn.example/photo-b.jpg',
    'https://cdn.example/photo-c.jpg',
  ])
})

it('rejects redirects to loopback or private IPs', async () => {
  await expect(discoverWebImageCandidates('https://127.0.0.1/product')).rejects.toThrow('URL remota não permitida')
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm.cmd test -- src/lib/assertive/__tests__/web-image-discovery.test.ts`

Expected: FAIL because discovery does not exist.

- [ ] **Step 3: Extract reusable URL security**

Move the current DNS/IP rules from `safe-image-fetch.ts` into `safe-remote-url.ts`. Preserve all forbidden IPv4/IPv6 ranges and require HTTPS without credentials. Update image fetching to use the exported helper without behavior change.

- [ ] **Step 4: Implement bounded HTML discovery**

Fetch manually with at most three redirects, a 10-second timeout, `Accept: text/html`, maximum 1 MiB, and no script execution. Parse attributes from meta tags independent of attribute order, parse valid JSON-LD recursively for `image`, `image.url`, `contentUrl` and arrays, resolve relative URLs, keep HTTPS only, and return at most 12 unique URLs.

- [ ] **Step 5: Run discovery and existing image fetch tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/web-image-discovery.test.ts src/lib/assertive/__tests__/safe-image-fetch.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit secure discovery**

```powershell
git add -- "src/lib/assertive/safe-remote-url.ts" "src/lib/assertive/safe-image-fetch.ts" "src/lib/assertive/web-image-discovery.ts" "src/lib/assertive/__tests__/web-image-discovery.test.ts"
git commit -m "feat(assertive): discover external images safely"
```

---

### Task 5: Visual Reference Selection and Ingestion

**Files:**
- Create: `src/lib/assertive/visual-references.ts`
- Create: `src/lib/assertive/__tests__/visual-references.test.ts`
- Modify: `src/lib/assertive/research.ts`
- Modify: `src/lib/assertive/image-assets.ts`

**Interfaces:**
- Produces `evaluateVisualReference(truth, candidate): VisualReferenceEvaluation`.
- Produces `acquireVisualReferences(input): Promise<ImageAsset[]>`.
- Produces `searchMarketplaceVisualReferences(token, truth, limit): Promise<VisualReferenceCandidate[]>`.
- Extends `createReferenceAsset` with explicit origin and metadata.

- [ ] **Step 1: Reproduce the direct-link gate failure in a unit test**

```ts
it('accepts official source pictures without requiring copy-qualified facts', () => {
  const result = evaluateVisualReference(truth({
    confidence: 0.95,
    source_item_id: 'MLB54005757',
    source_catalog_product_id: 'MLB54005757',
  }), {
    source: 'ML_SOURCE',
    image_url: 'https://http2.mlstatic.com/furadeira.jpg',
    source_item_id: 'MLB54005757',
    source_catalog_product_id: 'MLB54005757',
    title: 'Parafusadeira Fulink FK-80PT',
    attributes: {},
  })
  expect(result).toMatchObject({ accepted: true, confidence: 1 })
})
```

- [ ] **Step 2: Add a test proving visual references do not become facts**

```ts
it('accepts a visually confirmed candidate while leaving factual matching unchanged', () => {
  expect(evaluateMatch(productTruth, candidate)).not.toMatchObject({ usable_as_fact_source: true })
  expect(evaluateVisualReference(productTruth, visualCandidate)).toMatchObject({ accepted: true })
})
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm.cmd test -- src/lib/assertive/__tests__/visual-references.test.ts`

Expected: FAIL because the visual evaluator does not exist.

- [ ] **Step 4: Implement candidate identity and conflict rules**

Use source item/catalog equality, GTIN, MPN+brand, brand+model, normalized model-in-title, and confirmed variant conflicts. Keep `evaluateMatch` unchanged for facts. Return reason codes and an identity confidence from 0 to 1.

- [ ] **Step 5: Implement marketplace expansion**

Reuse the query variants in `identitySearchQueries`, inspect more product candidates only for images, and return product pictures plus identity attributes without adding them to `ResearchResult` facts.

- [ ] **Step 6: Implement external fallback and ingestion**

Call `searchWeb` only when accepted ML candidates are insufficient. Discover images from returned pages, download with `fetchImageSafely`, reject invalid or tiny images, hash bytes, create private `SOURCE_REFERENCE` assets with `REFERENCE_ONLY`, and store explicit origin plus scores in metadata. Sort competitor references first, then source URL, catalog and web; cap accepted diverse assets at eight.

- [ ] **Step 7: Run reference, research and asset tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/visual-references.test.ts src/lib/assertive/__tests__/research-market.test.ts src/lib/assertive/__tests__/image-assets.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit visual acquisition**

```powershell
git add -- "src/lib/assertive/visual-references.ts" "src/lib/assertive/__tests__/visual-references.test.ts" "src/lib/assertive/research.ts" "src/lib/assertive/image-assets.ts"
git commit -m "feat(assertive): acquire exact visual references"
```

---

### Task 6: Local Cover and Duplicate Gates

**Files:**
- Create: `src/lib/assertive/image-quality.ts`
- Create: `src/lib/assertive/__tests__/image-quality.test.ts`

**Interfaces:**
- Produces `perceptualHash(buffer): Promise<string>`.
- Produces `perceptualDistance(left, right): number`.
- Produces `assessWhiteCover(buffer): Promise<WhiteCoverAssessment>`.
- Produces `findNearDuplicate(candidate, comparisons, threshold): Promise<string | null>`.

- [ ] **Step 1: Write failing tests using generated pixel fixtures**

```ts
it('accepts a square cover with white borders and rejects a colored background', async () => {
  const white = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#ffffff' } })
    .composite([{ input: await productRectangle('#202020'), left: 156, top: 106 }]).jpeg().toBuffer()
  const colored = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#d9b38c' } }).jpeg().toBuffer()
  expect((await assessWhiteCover(white)).passed).toBe(true)
  expect((await assessWhiteCover(colored)).passed).toBe(false)
})

it('detects resized copies and keeps distinct compositions', async () => {
  const firstHash = await perceptualHash(first)
  expect(perceptualDistance(firstHash, await perceptualHash(resizedFirst))).toBeLessThanOrEqual(4)
  expect(perceptualDistance(firstHash, await perceptualHash(differentComposition))).toBeGreaterThan(6)
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-quality.test.ts`

Expected: FAIL because quality helpers do not exist.

- [ ] **Step 3: Implement deterministic gates**

Use Sharp to normalize orientation. Compute a 64-bit difference hash from a 9x8 grayscale image. Sample the outer 8% of pixels for near-white RGB values `>= 245`; require square output and at least 90% white border pixels. Use Hamming distance `<= 4` against references and `<= 6` against accepted gallery outputs as near-duplicate thresholds.

- [ ] **Step 4: Run quality tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-quality.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit quality gates**

```powershell
git add -- "src/lib/assertive/image-quality.ts" "src/lib/assertive/__tests__/image-quality.test.ts"
git commit -m "feat(assertive): validate cover and image diversity"
```

---

### Task 7: Multi-Reference Gemini and Fidelity

**Files:**
- Modify: `src/lib/assertive/gemini-image.ts`
- Modify: `src/lib/assertive/image-fidelity.ts`
- Modify: `src/lib/assertive/__tests__/gemini-image.test.ts`
- Modify: `src/lib/assertive/__tests__/image-fidelity.test.ts`

**Interfaces:**
- Changes `GenerateProductImageInput` to accept `references?: Array<{ buffer: Buffer; mime_type: string }>`.
- Produces `verifyReferenceGuidedImage(input): Promise<ImageFidelityResult & { composition_is_new: boolean }>`.
- Preserves `editProductImage` for owned-photo cleanup.

- [ ] **Step 1: Write a failing request-body test for three references**

```ts
it('sends up to three exact references and requests a new composition', async () => {
  await generateProductImage({
    productName: 'Parafusadeira Fulink FK-80PT',
    facts: [{ label: 'Modelo', value: 'FK-80PT' }],
    references: [referenceA, referenceB, referenceC, referenceD],
    shot: { order: 1, title: 'Foto principal', description: 'Fundo branco', required: true },
    apiKey: 'test-key',
    models: ['image-model'],
  })
  const body = JSON.parse(fetchMock.mock.calls[0][1].body)
  expect(body.contents[0].parts.filter((part: { inlineData?: unknown }) => part.inlineData)).toHaveLength(3)
  expect(body.contents[0].parts[0].text).toContain('composição nova')
})
```

- [ ] **Step 2: Write fidelity tests for structural reject and inconclusive review**

```ts
it('rejects a different variant even when the scene is attractive', async () => {
  mockVision({ same_product: true, variant_preserved: false, composition_is_new: true, score: 92 })
  await expect(verifyReferenceGuidedImage(input)).resolves.toMatchObject({ status: 'REJECT' })
})

it('returns REVIEW when structure passes but the gate response is unavailable', async () => {
  mockVisionFailure(new Error('503'))
  await expect(verifyReferenceGuidedImage(input)).resolves.toMatchObject({ status: 'REVIEW' })
})
```

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/gemini-image.test.ts src/lib/assertive/__tests__/image-fidelity.test.ts`

Expected: FAIL on the new interfaces.

- [ ] **Step 4: Implement multi-reference request generation**

Limit references to three, append each as `inlineData`, hash all reference hashes into provenance, and instruct Gemini to preserve product identity while changing composition. Keep cover and secondary prompts distinct and return one 1:1 2K image.

- [ ] **Step 5: Implement the multireference gate**

Send references followed by the candidate to the vision workload. Require preservation booleans for product, geometry, variant, color, branding, quantity and components. Require `composition_is_new`. Return `REJECT` for structural conflicts, `REVIEW` for unavailable/malformed assessment without known conflicts, and `ACCEPT` only for a clean verdict.

- [ ] **Step 6: Run Gemini and fidelity tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/gemini-image.test.ts src/lib/assertive/__tests__/image-fidelity.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit multireference generation**

```powershell
git add -- "src/lib/assertive/gemini-image.ts" "src/lib/assertive/image-fidelity.ts" "src/lib/assertive/__tests__/gemini-image.test.ts" "src/lib/assertive/__tests__/image-fidelity.test.ts"
git commit -m "feat(assertive): generate from multiple visual references"
```

---

### Task 8: Progressive Job Orchestrator

**Files:**
- Create: `src/lib/assertive/progressive-images.ts`
- Create: `src/lib/assertive/__tests__/progressive-images.test.ts`
- Modify: `src/lib/assertive/image-pipeline.ts`

**Interfaces:**
- Produces `runNextProgressiveImageJob(input): Promise<{ snapshot: ImageJobSnapshot; processed_kind: ImageJobKind | null; processed_position: number | null }>`.
- Produces `runReferenceSearchJob(job, context): Promise<void>`.
- Produces `runGenerationSlotJob(job, context): Promise<void>`.
- Consumes job store, visual references, Gemini, quality gates and slot RPC.

- [ ] **Step 1: Write failing tests for reference-first ordering and one-slot execution**

```ts
it('completes reference acquisition before changing a generation slot', async () => {
  const state = createInMemoryImageJobState({ next: referenceJob, acquiredReferences: [referenceAsset] })
  const result = await runNextProgressiveImageJob(contextWith(state.dependencies))
  expect(result.processed_kind).toBe('REFERENCE_SEARCH')
  expect(state.jobs.reference.status).toBe('SUCCEEDED')
  expect(state.listingImages).toEqual([])
})

it('generates and projects only the claimed slot', async () => {
  const state = createInMemoryImageJobState({ next: slotJob({ position: 3, role: 'LIFESTYLE' }) })
  const result = await runNextProgressiveImageJob(contextWith(state.dependencies))
  expect(result.processed_position).toBe(3)
  expect(state.listingImages).toEqual([{ position: 3, asset_id: 'generated-3' }])
  expect(state.jobs.slots.filter(job => job.status === 'REVIEW').map(job => job.position)).toEqual([3])
})
```

- [ ] **Step 2: Add tests for cover rejection, duplicate retry and provider backoff**

```ts
it('does not attach a cover that fails the white-background gate', async () => {
  const state = createInMemoryImageJobState({
    next: slotJob({ position: 0, role: 'MAIN' }),
    coverAssessment: { passed: false, white_ratio: 0.2, square: true },
  })
  const result = await runNextProgressiveImageJob(contextWith(state.dependencies))
  expect(result.snapshot.slots[0]).toMatchObject({ status: 'RETRYABLE', error_code: 'IMAGE_BACKGROUND_REJECTED' })
  expect(state.listingImages).toEqual([])
})
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm.cmd test -- src/lib/assertive/__tests__/progressive-images.test.ts`

Expected: FAIL because the orchestrator does not exist.

- [ ] **Step 4: Implement reference job execution**

Load listing and analysis under the same user, reject published/publishing listings, acquire references, write accepted asset IDs to all slot jobs, mark the search `SUCCEEDED`, or mark it `RETRYABLE/FAILED` with stable error codes. Record stage events with counts and origins.

- [ ] **Step 5: Implement one-slot execution**

Load at most three diverse reference assets, call Gemini once for the job, normalize output, run multireference fidelity, white-cover and duplicate checks, persist only non-structurally-rejected output, project the slot atomically, and transition it to `REVIEW`. Map `429`, `503` and timeout to delayed `RETRYABLE` without losing the lock ownership check.

- [ ] **Step 6: Preserve legacy helpers while routing new work through focused functions**

Keep `buildListingGallery` and existing upload normalization behavior. Extract only reusable image creation pieces from `buildGeneratedListingGallery`; do not rewrite unrelated image flows.

- [ ] **Step 7: Run orchestrator and legacy pipeline tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/progressive-images.test.ts src/lib/assertive/__tests__/image-pipeline.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the orchestrator**

```powershell
git add -- "src/lib/assertive/progressive-images.ts" "src/lib/assertive/__tests__/progressive-images.test.ts" "src/lib/assertive/image-pipeline.ts"
git commit -m "feat(assertive): orchestrate resumable image generation"
```

---

### Task 9: Analysis Pipeline Bootstrap

**Files:**
- Modify: `src/lib/assertive/pipeline.ts`
- Modify: `src/lib/assertive/__tests__/category-reresolution.integration.test.ts`
- Create: `src/lib/assertive/__tests__/pipeline-progressive-images.test.ts`

**Interfaces:**
- New behavior behind `ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED === 'true'`.
- New analyses persist listing plus six jobs without invoking Gemini inside `runGeneration`.
- Existing behavior remains available when the flag is false for rollback.

- [ ] **Step 1: Write the failing furadeira regression test**

```ts
it('creates progressive jobs for a URL snapshot with references even when copy facts are incomplete', async () => {
  analysis.input_type = 'url'
  analysis.product_truth = {
    ...truth,
    confidence: 0.95,
    source_item_id: 'MLB54005757',
    source_catalog_product_id: 'MLB54005757',
    source_pictures: Array.from({ length: 11 }, (_, index) => `https://http2.mlstatic.com/${index}.jpg`),
  }
  process.env.ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED = 'true'
  const result = await runGeneration(analysis, config)
  expect(result.listingId).toBeTruthy()
  expect(persistedListings).toEqual([expect.objectContaining({ id: result.listingId, photos: [] })])
  expect(persistedImageJobs.filter(job => job.listing_id === result.listingId)).toHaveLength(7)
  expect(persistedImageOperations).toEqual([])
})
```

- [ ] **Step 2: Add rollback and preservation tests**

Prove that flag false follows the existing synchronous path and that previous user photos remain present when bootstrapping missing slots.

- [ ] **Step 3: Run tests and verify they fail**

Run: `npm.cmd test -- src/lib/assertive/__tests__/pipeline-progressive-images.test.ts src/lib/assertive/__tests__/category-reresolution.integration.test.ts`

Expected: FAIL on missing bootstrap behavior.

- [ ] **Step 4: Implement an exact six-step plan helper**

Export a pure helper that normalizes `generated.image_plan` into six safe positions using the approved MAIN, DETAIL, DETAIL, LIFESTYLE, LIFESTYLE and INFORMATIONAL/PACKAGING fallback roles.

- [ ] **Step 5: Persist or update the listing before image work in progressive mode**

In progressive mode, do not call `collectAndClassifyPhotos` or `buildAnalysisListingGallery`. A new analysis starts with `photos = []`, keeps uploaded asset IDs only as private references, sets `image_review.outcome = 'progressive_pending'`, and performs no Gemini operation. When a draft already exists, update that same listing ID in place instead of delete-and-insert, preserve its authorized `assertive_listing_images` and photos, and create jobs only for positions absent from `0..5`. After the listing write, call `ensureProgressiveImageJobs`. Keep `photos.length === 0` as a publication blocker while the editor receives explicit slots from the dedicated API.

- [ ] **Step 6: Run pipeline tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/pipeline-progressive-images.test.ts src/lib/assertive/__tests__/category-reresolution.integration.test.ts src/lib/assertive/__tests__/publication-readiness.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit pipeline bootstrap**

```powershell
git add -- "src/lib/assertive/pipeline.ts" "src/lib/assertive/__tests__/pipeline-progressive-images.test.ts" "src/lib/assertive/__tests__/category-reresolution.integration.test.ts"
git commit -m "feat(assertive): bootstrap progressive galleries"
```

---

### Task 10: Image Job HTTP API and Review State

**Files:**
- Create: `src/app/api/assertive/listings/[id]/images/jobs/route.ts`
- Create: `src/app/api/assertive/listings/[id]/images/jobs/route.test.ts`
- Create: `src/app/api/assertive/listings/[id]/images/jobs/run/route.ts`
- Create: `src/app/api/assertive/listings/[id]/images/jobs/run/route.test.ts`
- Create: `src/app/api/assertive/listings/[id]/images/jobs/[position]/route.ts`
- Create: `src/app/api/assertive/listings/[id]/images/jobs/[position]/route.test.ts`
- Create: `src/app/api/assertive/listings/[id]/images/jobs/[position]/retry/route.ts`
- Create: `src/app/api/assertive/listings/[id]/images/jobs/[position]/retry/route.test.ts`
- Modify: `src/app/api/assertive/listings/[id]/images/confirm/route.ts`
- Modify: `src/app/api/assertive/listings/[id]/images/confirm/route.test.ts`
- Modify: `src/app/api/assertive/listings/[id]/publish/route.ts`
- Modify: `src/app/api/assertive/listings/[id]/publish/route.test.ts`

**Interfaces:**
- `GET images/jobs` returns `ImageJobSnapshot`.
- `POST images/jobs/run` bootstraps if needed and executes one job.
- `POST images/jobs/[position]/retry` accepts positions 0 through 5 only.
- `DELETE images/jobs/[position]` dismisses only that slot and keeps the asset as history.
- Confirm transitions the matching job from `REVIEW` to `SUCCEEDED`.
- Publish blocks while any non-dismissed generation job is not `SUCCEEDED`.

- [ ] **Step 1: Write failing route tests**

```ts
it('returns six safe slots without private references', async () => {
  const response = await GET(request, context)
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.slots).toHaveLength(6)
  expect(JSON.stringify(body)).not.toContain('private-reference')
})

it('runs at most one claimed job per POST', async () => {
  const response = await runRoutePOST(request, context)
  expect(response.status).toBe(200)
  expect((await response.json()).processed_jobs).toBe(1)
})
```

- [ ] **Step 2: Add auth, published listing, invalid position and provider error tests**

Assert `401/403`, `404`, `409`, `400`, retryable `200` snapshots, and sanitized errors. No route returns provider payload or reference URL.

- [ ] **Step 3: Run route tests and verify they fail**

Run: `npm.cmd test -- "src/app/api/assertive/listings/[id]/images/jobs/route.test.ts" "src/app/api/assertive/listings/[id]/images/jobs/run/route.test.ts" "src/app/api/assertive/listings/[id]/images/jobs/[position]/route.test.ts" "src/app/api/assertive/listings/[id]/images/jobs/[position]/retry/route.test.ts"`

Expected: FAIL because routes do not exist.

- [ ] **Step 4: Implement GET snapshot and POST run routes**

Use `requireCommunityUser`, `runtime = 'nodejs'`, `maxDuration = 180` on `run`, ownership inside service functions, and stable JSON. `POST /run` calls `ensureProgressiveImageJobs` for eligible legacy drafts before `runNextProgressiveImageJob` and reports `processed_jobs: 0 | 1`.

- [ ] **Step 5: Implement per-slot retry and dismiss**

Validate the dynamic position with Zod, reject published/publishing listings, increment a generation nonce, detach only the replaced slot through `assertive_reset_image_slot`, reset it to `QUEUED`, and return the new snapshot. `DELETE` invokes the same RPC with `DISMISSED`; neither operation deletes historical assets or storage objects. If reference acquisition has no usable assets and is terminal, retry also reopens the reference job.

- [ ] **Step 6: Extend confirm and publish gates**

Confirm only an output asset attached to a `REVIEW` job for that listing/user, then transition to `SUCCEEDED` and recompute status. Publish queries image jobs and returns `409 IMAGE_JOBS_PENDING` unless all six slots are `SUCCEEDED` or explicitly `DISMISSED`, while preserving existing image review checks.

- [ ] **Step 7: Run all changed route tests**

Run: `npm.cmd test -- "src/app/api/assertive/listings/[id]/images/jobs/route.test.ts" "src/app/api/assertive/listings/[id]/images/jobs/run/route.test.ts" "src/app/api/assertive/listings/[id]/images/jobs/[position]/route.test.ts" "src/app/api/assertive/listings/[id]/images/jobs/[position]/retry/route.test.ts" "src/app/api/assertive/listings/[id]/images/confirm/route.test.ts" "src/app/api/assertive/listings/[id]/publish/route.test.ts"`

Expected: PASS.

- [ ] **Step 8: Commit APIs**

```powershell
git add -- "src/app/api/assertive/listings/[id]/images/jobs" "src/app/api/assertive/listings/[id]/images/confirm/route.ts" "src/app/api/assertive/listings/[id]/images/confirm/route.test.ts" "src/app/api/assertive/listings/[id]/publish/route.ts" "src/app/api/assertive/listings/[id]/publish/route.test.ts"
git commit -m "feat(assertive): expose progressive image jobs"
```

---

### Task 11: Progressive Gallery Client and UI

**Files:**
- Create: `src/lib/assertive/progressive-photo-client.ts`
- Create: `src/lib/assertive/__tests__/progressive-photo-client.test.ts`
- Create: `src/components/assertive/progressive-photo-gallery.tsx`
- Modify: `src/app/membros/assertive-ecommerce-ia/editor/[id]/page.tsx`

**Interfaces:**
- Produces `nextImageJobRequestCount(snapshot, inFlight): number` capped at two.
- `ProgressivePhotoGallery` consumes snapshot plus confirm/retry/remove/open callbacks.
- Editor starts, pauses and resumes the pump without changing other listing sections.

- [ ] **Step 1: Write failing scheduler tests**

```ts
it('never schedules more than two concurrent workers', () => {
  expect(nextImageJobRequestCount(runnableSnapshot, 0)).toBe(2)
  expect(nextImageJobRequestCount(runnableSnapshot, 1)).toBe(1)
  expect(nextImageJobRequestCount(runnableSnapshot, 2)).toBe(0)
})

it('stops when no job is runnable', () => {
  expect(nextImageJobRequestCount({ ...runnableSnapshot, runnable: false }, 0)).toBe(0)
})
```

- [ ] **Step 2: Run the scheduler test and verify it fails**

Run: `npm.cmd test -- src/lib/assertive/__tests__/progressive-photo-client.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the pure scheduler and gallery component**

Render six fixed-position cards with accessible labels and these states: `Buscando referência`, `Na fila`, `Gerando com Gemini`, `Revisar`, `Pronta`, `Tentar novamente`. Render previews only from snapshot output URLs. Show `N de 6 prontas`, per-slot error and retry, and a white-background badge on position zero.

- [ ] **Step 4: Integrate a two-worker pump in the editor**

On mount, GET the snapshot. While `runnable`, POST `/images/jobs/run` enough times to fill at most two in-flight requests. After each response, use `startTransition` to update the snapshot and continue. Abort on unmount, back off after network errors, and restart after visibility/reload. Do not use `useMemo` or `useCallback` unless existing compiler guidance requires it.

- [ ] **Step 5: Connect existing actions**

Confirm one `REVIEW` asset, retry or dismiss one position through dedicated APIs, retain lightbox/download, and keep manual upload. Render the progressive gallery inside the simplified blocker view too, so unrelated attribute questions never hide photo progress. When progressive mode is absent, render the existing gallery unchanged for rollback compatibility.

- [ ] **Step 6: Run scheduler, route and editor-related tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/progressive-photo-client.test.ts "src/app/api/assertive/listings/[id]/images/jobs/route.test.ts" "src/app/api/assertive/listings/[id]/images/jobs/run/route.test.ts" "src/app/api/assertive/listings/[id]/images/confirm/route.test.ts"`

Expected: PASS.

- [ ] **Step 7: Run focused lint and typecheck**

Run: `npx.cmd eslint "src/components/assertive/progressive-photo-gallery.tsx" "src/app/membros/assertive-ecommerce-ia/editor/[id]/page.tsx" "src/lib/assertive/progressive-photo-client.ts"`

Run: `npm.cmd run typecheck`

Expected: both exit 0.

- [ ] **Step 8: Commit the progressive UI**

```powershell
git add -- "src/lib/assertive/progressive-photo-client.ts" "src/lib/assertive/__tests__/progressive-photo-client.test.ts" "src/components/assertive/progressive-photo-gallery.tsx" "src/app/membros/assertive-ecommerce-ia/editor/[id]/page.tsx"
git commit -m "feat(assertive): show progressive photo gallery"
```

---

### Task 12: Full Verification, Migration and Real Browser

**Files:**
- Modify only files required by failures discovered in this task.
- Create temporary smoke scripts under `scripts/.tmp-*`; delete them before final status.

**Interfaces:**
- Produces a tested commit, applied migration and ready deployment.
- Does not produce or publish a Mercado Livre item.

- [ ] **Step 1: Run all focused photo tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-jobs.test.ts src/lib/assertive/__tests__/web-image-discovery.test.ts src/lib/assertive/__tests__/visual-references.test.ts src/lib/assertive/__tests__/image-quality.test.ts src/lib/assertive/__tests__/gemini-image.test.ts src/lib/assertive/__tests__/image-fidelity.test.ts src/lib/assertive/__tests__/progressive-images.test.ts src/lib/assertive/__tests__/pipeline-progressive-images.test.ts src/lib/assertive/__tests__/progressive-photo-client.test.ts`

Run: `npx.cmd supabase test db supabase/tests/database/progressive_image_jobs.test.sql`

Expected: PASS.

- [ ] **Step 2: Run repository verification sequentially**

Run: `npm.cmd test -- --run`

Run: `npm.cmd run build`

Run only after build completes: `npm.cmd run typecheck`

Run focused ESLint on every changed TypeScript/TSX source file.

Expected: zero test failures, successful build/typecheck, no focused lint errors.

- [ ] **Step 3: Review diff and commit implementation fixes**

Run: `git status --short`, `git diff --check`, `git diff --stat`, and `git log --oneline -10`.

Stage only progressive-photo files and commit with a concise message matching repository style.

- [ ] **Step 4: Apply and verify the migration**

Run: `npx.cmd supabase db push --dry-run` from a linked worktree first. Apply `20260912130000`, then run `npx.cmd supabase migration list` and confirm local/remote match.

- [ ] **Step 5: Deploy a preview with the progressive flag enabled**

Deploy the exact tested commit to Vercel preview. Set `ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED=true` only for preview first, inspect until `Ready`, and verify the health URL returns `200`.

- [ ] **Step 6: Exercise real link input in Google Chrome**

Use the direct product URL from analysis `00545f44-5c9e-4442-99c0-85fd59aa18ed`. Assert six visible slots, reference count greater than zero, progressive status changes, at least one generated preview, no raw ML reference URL in listing photos, and no page/5xx errors.

- [ ] **Step 7: Exercise real description and photo inputs**

Use `Processador AMD Ryzen 5 5500 100-100000457BOX` for description. For photo, use a user-owned or previously generated licensed fixture associated with the smoke user. Assert expanded reference search, progressive recovery after reload, maximum two concurrent job calls, cover white badge and unique gallery URLs.

- [ ] **Step 8: Inspect generated images visually**

Open all six previews in the Chrome lightbox. Confirm the first has white background, secondary photos are distinct, product identity/variant is stable, scenes do not imply unconfirmed accessories, and no source photo is reproduced exactly.

- [ ] **Step 9: Verify publication remains untouched**

Inspect network logs and database rows to confirm no request reached `/publish` and no new `ml_item_id` was created.

- [ ] **Step 10: Promote the tested deployment and repeat smoke**

Promote the same commit to production, enable the flag, inspect deployment `Ready`, confirm canonical URL `200`, and repeat the link journey without publishing.

- [ ] **Step 11: Clean only owned smoke data and temporary files**

Delete analyses/listings/assets/jobs whose IDs were recorded by the smoke script, remove their storage objects, preserve every pre-existing record, delete temporary scripts/screenshots, and confirm both feature and main worktree statuses.

- [ ] **Step 12: Report evidence**

Report commit, migration ID, deployment URL/ID, exact test totals, browser/version, three journeys, generated photo counts, errors, preserved data and any residual provider limitation.
