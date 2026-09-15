# Assertive AI Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce publication-ready AI-improved photos from seller-owned originals while guaranteeing real multimodal analysis, immutable lineage, secure ingestion, and automatic fallback on fidelity failure.

**Architecture:** Introduce an asset registry with private originals and public publication renditions. Normalize every image deterministically, edit eligible images with Gemini, compare original and output through a real multimodal fidelity gate, and attach only accepted or safe fallback renditions to listings.

**Tech Stack:** TypeScript 5, Next.js 16 Route Handlers, Supabase Storage/Postgres, Sharp, Gemini GenerateContent REST API, Vitest

**Spec:** `docs/superpowers/specs/2026-09-09-assertive-autonomous-listings-v2.md`

## Global Constraints

- Never use competitor photos in a publishable gallery.
- Never alter product color, shape, texture, branding, labels, ports, controls, count, damage, variant, or included accessories.
- Never generate unseen product angles.
- Every derived image links to an immutable seller-owned or seller-authorized original.
- Every vision request sends actual image data, never URL strings as a substitute for pixels.
- Failed, rejected, timed-out, or unavailable AI editing falls back to a normalized original and does not block publication.
- Existing legacy URL listings remain readable while new listings use asset IDs and content hashes.
- Do not commit without explicit user authorization.

---

### Task 1: Image Asset Schema And Sharp Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `supabase/migrations/20260909180000_assertive_image_assets.sql`
- Create: `src/lib/assertive/image-assets.ts`
- Test: `src/lib/assertive/__tests__/image-assets.test.ts`
- Test: `src/lib/assertive/__tests__/input-types-migration.test.ts`

**Interfaces:**
- Consumes: authenticated user ID, original upload bytes, analysis/listing IDs.
- Produces: `ImageAsset`, `ImageOperation`, `ListingImage`, and repository functions for immutable asset lineage.

- [ ] **Step 1: Install the image decoder/normalizer**

Run: `npm.cmd install sharp`

Expected: `sharp` appears under dependencies and the lockfile is updated without unrelated package upgrades.

- [ ] **Step 2: Add a migration contract test**

```ts
it('creates immutable image assets, operations, and listing positions', () => {
  const sql = readMigration('20260909180000_assertive_image_assets.sql')
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS assertive_image_assets')
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS assertive_image_operations')
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS assertive_listing_images')
  expect(sql).toContain('UNIQUE (listing_id, position)')
})
```

- [ ] **Step 3: Run the migration test and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/input-types-migration.test.ts`

Expected: FAIL because the image migration does not exist.

- [ ] **Step 4: Create the additive migration**

The migration creates:

```sql
CREATE TABLE IF NOT EXISTS assertive_image_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  analysis_id UUID REFERENCES assertive_analyses(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ORIGINAL_EVIDENCE','SOURCE_REFERENCE','DERIVED','GENERATED_SCENE','PUBLICATION_RENDITION')),
  origin TEXT NOT NULL CHECK (origin IN ('USER_UPLOAD','ML_OWN_ITEM','ML_CATALOG','COMPETITOR')),
  rights_status TEXT NOT NULL CHECK (rights_status IN ('USER_OWNED','SELLER_OWNED_CONFIRMED','LICENSED','REFERENCE_ONLY','UNKNOWN')),
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  public_url TEXT,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INT NOT NULL CHECK (width > 0),
  height INT NOT NULL CHECK (height > 0),
  byte_size INT NOT NULL CHECK (byte_size > 0),
  parent_asset_id UUID REFERENCES assertive_image_assets(id),
  provider TEXT,
  model TEXT,
  fidelity_status TEXT CHECK (fidelity_status IN ('ACCEPT','REVIEW','REJECT')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_key)
);

CREATE TABLE IF NOT EXISTS assertive_image_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  analysis_id UUID REFERENCES assertive_analyses(id) ON DELETE SET NULL,
  input_asset_id UUID REFERENCES assertive_image_assets(id) NOT NULL,
  output_asset_id UUID REFERENCES assertive_image_assets(id),
  operation TEXT NOT NULL CHECK (operation IN ('NORMALIZE','AI_ENHANCE','AI_SCENE','FIDELITY_CHECK')),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','REJECTED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  provider TEXT,
  model TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,6),
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_listing_images (
  listing_id UUID REFERENCES assertive_listings(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES assertive_image_assets(id) NOT NULL,
  position INT NOT NULL CHECK (position >= 0),
  role TEXT NOT NULL,
  shot_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, asset_id),
  UNIQUE (listing_id, position)
);
```

Create a private `assertive-originals` bucket. Keep the existing public `assertive` bucket for publication renditions. Enable RLS and owner-read policies while write operations remain server-controlled.

- [ ] **Step 5: Add typed repository functions**

```ts
export interface ImageAsset {
  id: string
  user_id: string
  analysis_id: string | null
  kind: 'ORIGINAL_EVIDENCE' | 'SOURCE_REFERENCE' | 'DERIVED' | 'GENERATED_SCENE' | 'PUBLICATION_RENDITION'
  origin: 'USER_UPLOAD' | 'ML_OWN_ITEM' | 'ML_CATALOG' | 'COMPETITOR'
  rights_status: 'USER_OWNED' | 'SELLER_OWNED_CONFIRMED' | 'LICENSED' | 'REFERENCE_ONLY' | 'UNKNOWN'
  storage_bucket: string
  storage_key: string
  public_url: string | null
  sha256: string
  mime_type: string
  width: number
  height: number
  byte_size: number
  parent_asset_id: string | null
  provider: string | null
  model: string | null
  fidelity_status: 'ACCEPT' | 'REVIEW' | 'REJECT' | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface ListingImageInput {
  asset_id: string
  position: number
  role: PhotoRole
  shot_type?: string
}

export interface CreateOriginalAssetInput {
  user_id: string
  analysis_id?: string
  bytes: Buffer
  mime_type: string
  width: number
  height: number
  sha256: string
  storage_key: string
}

export interface CreateDerivedAssetInput {
  user_id: string
  analysis_id?: string
  parent_asset_id: string
  kind: 'DERIVED' | 'GENERATED_SCENE' | 'PUBLICATION_RENDITION'
  bytes: Buffer
  mime_type: string
  width: number
  height: number
  sha256: string
  storage_key: string
  public_url?: string
  provider?: string
  model?: string
  fidelity_status?: 'ACCEPT' | 'REVIEW' | 'REJECT'
  metadata?: Record<string, unknown>
}

export async function createOriginalAsset(input: CreateOriginalAssetInput): Promise<ImageAsset>
export async function createDerivedAsset(input: CreateDerivedAssetInput): Promise<ImageAsset>
export async function getOwnedAssets(userId: string, assetIds: string[]): Promise<ImageAsset[]>
export async function attachListingImages(listingId: string, userId: string, images: ListingImageInput[]): Promise<void>
```

`createDerivedAsset` requires `parent_asset_id`; originals cannot be updated into derived rows.

- [ ] **Step 6: Run schema/repository tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-assets.test.ts src/lib/assertive/__tests__/input-types-migration.test.ts`

Expected: PASS.

### Task 2: Secure Image Ingestion

**Files:**
- Create: `src/lib/assertive/safe-image-fetch.ts`
- Create: `src/lib/assertive/image-normalization.ts`
- Modify: `src/app/api/assertive/upload/route.ts`
- Modify: `src/app/api/assertive/analyze/route.ts`
- Test: `src/lib/assertive/__tests__/safe-image-fetch.test.ts`
- Test: `src/lib/assertive/__tests__/image-normalization.test.ts`
- Test: `src/app/api/assertive/upload/route.test.ts`

**Interfaces:**
- Consumes: multipart seller files or allowlisted Mercado Livre/Supabase remote image URLs.
- Produces: decoded immutable originals, normalized publication renditions, hashes, dimensions, and asset IDs.

- [ ] **Step 1: Add SSRF and streaming-limit tests**

```ts
it.each(['http://127.0.0.1/a.jpg', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.2/a.jpg'])(
  'rejects private target %s', async url => {
    await expect(fetchImageSafely(url)).rejects.toThrow('URL de imagem não permitida')
  }
)

it('revalidates redirect targets', async () => {
  mockRedirect('https://public.example/a.jpg', 'http://127.0.0.1/private')
  await expect(fetchImageSafely('https://public.example/a.jpg')).rejects.toThrow()
})
```

- [ ] **Step 2: Add decode and normalization tests with real fixture bytes**

Assert JPEG/PNG/WebP decoding, EXIF orientation, metadata stripping in public output, 1200x1200 canvas, bounded file size, and rejection of malformed or oversized-pixel images.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/safe-image-fetch.test.ts src/lib/assertive/__tests__/image-normalization.test.ts src/app/api/assertive/upload/route.test.ts`

Expected: FAIL because secure fetch/normalization modules and upload tests do not exist.

- [ ] **Step 4: Implement bounded secure fetching**

Allow HTTPS by default. Resolve DNS before every request, reject loopback/private/link-local/reserved IPv4 and IPv6 ranges, use `redirect: 'manual'`, revalidate up to three redirects, stream with an 8 MB limit, require an image content type plus successful Sharp decode, and abort after 20 seconds.

- [ ] **Step 5: Implement deterministic normalization**

```ts
export async function normalizeProductImage(input: Buffer): Promise<NormalizedImage> {
  const image = sharp(input, { limitInputPixels: 40_000_000 }).rotate()
  const metadata = await image.metadata()
  const buffer = await image
    .resize(1200, 1200, { fit: 'contain', background: '#ffffff', withoutEnlargement: false })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer()
  return { buffer, mime_type: 'image/jpeg', width: 1200, height: 1200, source: metadata }
}
```

- [ ] **Step 6: Change upload to return owned assets**

Store exact original bytes privately, compute SHA-256, create `ORIGINAL_EVIDENCE`, create a public normalized rendition linked to it, and return:

```json
{
  "assets": [{ "original_asset_id": "uuid", "rendition_asset_id": "uuid", "preview_url": "/api/assertive/assets/uuid" }],
  "urls": ["https://public-rendition.example/image.jpg"]
}
```

Keep `urls` only for persisted legacy clients. New analysis requests send `photo_asset_ids` and the server verifies ownership.

- [ ] **Step 7: Run ingestion tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/safe-image-fetch.test.ts src/lib/assertive/__tests__/image-normalization.test.ts src/app/api/assertive/upload/route.test.ts`

Expected: PASS.

### Task 3: Real Multimodal Transport

**Files:**
- Modify: `src/lib/assertive/ai.ts`
- Modify: `src/lib/assertive/ai-router.ts`
- Modify: `src/lib/assertive/truth.ts:306-335`
- Modify: `src/lib/assertive/photos.ts`
- Modify: `src/lib/assertive/visual-understanding.ts`
- Test: `src/lib/assertive/__tests__/ai-vision.test.ts`
- Test: `src/lib/assertive/__tests__/truth-adapters.test.ts`
- Test: `src/lib/assertive/__tests__/photos.test.ts`
- Test: `src/lib/assertive/__tests__/visual-understanding.test.ts`

**Interfaces:**
- Consumes: asset bytes/data URIs and task-specific image limits.
- Produces: validated multimodal requests, batched image analysis, and model metadata.

- [ ] **Step 1: Add transport-body tests**

Intercept provider `fetch` and assert that classification and fidelity calls contain one text part plus actual image parts. Assert URL strings do not appear only inside the prompt.

- [ ] **Step 2: Add eight-image batching regression**

```ts
it('analyzes all eight accepted photos without silent truncation', async () => {
  await identifyFromPhotos(config, eightImageUrls)
  expect(allSentImageParts()).toHaveLength(8)
  expect(visionCalls()).toHaveLength(2)
})
```

- [ ] **Step 3: Run vision tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/ai-vision.test.ts src/lib/assertive/__tests__/truth-adapters.test.ts src/lib/assertive/__tests__/photos.test.ts src/lib/assertive/__tests__/visual-understanding.test.ts`

Expected: FAIL because the client silently truncates to four and photo/visual classifiers pass URL text.

- [ ] **Step 4: Replace silent truncation with explicit batching**

Expose:

```ts
export async function runVisionBatches<T>(input: {
  task: AITask
  images: string[]
  batchSize: number
  execute: (images: string[], batchIndex: number) => Promise<T>
}): Promise<T[]>
```

Reject unsupported counts or process every image in stable batches. Record requested and sent counts.

- [ ] **Step 5: Send actual images in classifiers**

Call `runTaskJson(..., { images: batchDataUris })` from `photos.ts`, `understandProductVisuals`, and `verifyVisualMatch`. Key results by stable asset ID, validate all AI JSON with Zod, and treat malformed/missing results as explicit fallback events.

- [ ] **Step 6: Run multimodal tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/ai-vision.test.ts src/lib/assertive/__tests__/truth-adapters.test.ts src/lib/assertive/__tests__/photos.test.ts src/lib/assertive/__tests__/visual-understanding.test.ts`

Expected: PASS.

### Task 4: Gemini Image Editing Provider

**Files:**
- Create: `src/lib/assertive/image-generation.ts`
- Create: `src/lib/assertive/__tests__/image-generation.test.ts`

**Interfaces:**
- Consumes: normalized original bytes, operation type, category background, and product truth.
- Produces: decoded edited image bytes plus provider/model metadata.

- [ ] **Step 1: Add Gemini request/response tests**

```ts
it('sends the original image and requests image output', async () => {
  await enhanceProductImage(input)
  expect(geminiBody()).toMatchObject({
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  })
  expect(imageParts(geminiBody())).toHaveLength(1)
})

it('rejects a response without image bytes', async () => {
  mockGeminiResponse({ candidates: [{ content: { parts: [{ text: 'done' }] } }] })
  await expect(enhanceProductImage(input)).rejects.toThrow('não retornou uma imagem')
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-generation.test.ts`

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement the Gemini adapter**

Use `GEMINI_API_KEY` and `GEMINI_IMAGE_MODEL`, defaulting to the catalog-verified `gemini-2.5-flash-image`. Call `v1beta/models/{model}:generateContent`, pass one inline original image, request text/image modalities and 1:1 output, parse the first image part, enforce timeout/byte limits, and decode the result with Sharp.

- [ ] **Step 4: Use a strict operation prompt**

The enhancement prompt must say:

```text
Edit this exact product photo. Preserve every product pixel-level identity cue: geometry, proportions, color, material, texture, logo, labels, printed text, ports, buttons, connectors, quantity, visible wear, variant, and included accessories. Improve only background, exposure, white balance, crop, clarity, and natural shadow. Do not add or remove any product part. Do not create another viewing angle. Return one square marketplace product image without promotional text, watermark, border, or badge.
```

For secondary scenes, request a background/context change around the same product and forbid props that imply included accessories.

- [ ] **Step 5: Persist output metadata**

Return provider, model, operation, latency, prompt hash, source content hash, output content hash, and bytes. Never persist API keys or raw base64.

- [ ] **Step 6: Run provider tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-generation.test.ts`

Expected: PASS.

### Task 5: Multimodal Fidelity Gate

**Files:**
- Create: `src/lib/assertive/image-fidelity.ts`
- Modify: `src/lib/assertive/visual-understanding.ts`
- Test: `src/lib/assertive/__tests__/image-fidelity.test.ts`

**Interfaces:**
- Consumes: original and candidate image bytes plus protected product facts.
- Produces: `FidelityAssessment` with `ACCEPT | REVIEW | REJECT`, invariant results, and reason codes.

- [ ] **Step 1: Add assessment-schema tests**

```ts
it('rejects changed color, logo, connector, accessory, or quantity', async () => {
  mockVisionAssessment({ same_product: true, changes: ['COLOR_CHANGED'], confidence: 99 })
  expect((await assessImageFidelity(input)).decision).toBe('REJECT')
})

it('accepts background and lighting-only edits above threshold', async () => {
  mockVisionAssessment({ same_product: true, changes: ['BACKGROUND_ONLY', 'LIGHTING_ONLY'], confidence: 98 })
  expect((await assessImageFidelity(input)).decision).toBe('ACCEPT')
})
```

- [ ] **Step 2: Add malformed/low-confidence fallback tests**

Malformed output, confidence below 95, unreadable protected label text, or model failure must return `REVIEW`, never `ACCEPT`.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-fidelity.test.ts`

Expected: FAIL because the fidelity gate does not exist.

- [ ] **Step 4: Implement a Zod-validated paired-image judge**

Send original first and candidate second as actual image parts. Require explicit checks for geometry, color, material, logo/text, ports/controls, quantity, accessories, variant, wear/damage, and angle. Use stable reason codes and accept only when every protected invariant passes and confidence is at least 95.

- [ ] **Step 5: Persist assessment and fallback result**

`ACCEPT` creates an accepted derived/publication asset. `REVIEW` and `REJECT` mark the operation accordingly and return the normalized original rendition.

- [ ] **Step 6: Run fidelity tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-fidelity.test.ts src/lib/assertive/__tests__/visual-understanding.test.ts`

Expected: PASS.

### Task 6: Image Pipeline Integration

**Files:**
- Create: `src/lib/assertive/image-pipeline.ts`
- Modify: `src/lib/assertive/photos.ts`
- Modify: `src/lib/assertive/pipeline.ts:545-612,701-740`
- Modify: `src/lib/assertive/publication-readiness.ts`
- Modify: `src/app/api/assertive/listings/[id]/route.ts`
- Modify: `src/app/membros/assertive-ecommerce-ia/editor/[id]/page.tsx`
- Test: `src/lib/assertive/__tests__/image-pipeline.test.ts`
- Test: `src/lib/assertive/__tests__/photos.test.ts`
- Test: `src/lib/assertive/__tests__/publication-readiness.test.ts`

**Interfaces:**
- Consumes: owned original asset IDs, category context, truth, Gemini editor, and fidelity gate.
- Produces: ordered accepted publication renditions and legacy URL projection for the stable publisher.

- [ ] **Step 1: Add safe-fallback integration tests**

```ts
it('uses accepted AI output as the cover', async () => {
  mockEnhancementAccepted()
  expect((await buildListingGallery(input)).images[0].source).toBe('AI_ENHANCED')
})

it('falls back to normalized original when AI changes the product', async () => {
  mockEnhancementRejected('COLOR_CHANGED')
  const gallery = await buildListingGallery(input)
  expect(gallery.images[0].source).toBe('USER')
  expect(gallery.images[0].parent_asset_id).toBe(originalAsset.id)
})
```

- [ ] **Step 2: Add rights and competitor-boundary tests**

Assert `REFERENCE_ONLY`, `UNKNOWN`, and `COMPETITOR` assets cannot attach to `assertive_listing_images` or produce a publication URL.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-pipeline.test.ts src/lib/assertive/__tests__/photos.test.ts src/lib/assertive/__tests__/publication-readiness.test.ts`

Expected: FAIL because the orchestrator and asset gate do not exist.

- [ ] **Step 4: Implement idempotent orchestration**

For each seller-owned original: normalize; classify with actual pixels; improve the best cover candidate when `ASSERTIVE_IMAGE_ENHANCEMENT_ENABLED=true`; run fidelity; optionally create one accepted secondary scene; order distinct shot types; cap using `category.settings.max_pictures_per_item` with 12 as the fallback.

- [ ] **Step 5: Project accepted assets into the existing publisher**

Persist `assertive_listing_images`, asset metadata, operation outcomes, and content hashes. Continue filling `listing.photos` with accepted public rendition URLs so the stable payload builder remains unchanged. Readiness requires each new asset to be owned/authorized and accepted or a deterministic original rendition.

- [ ] **Step 6: Keep editor updates transactional**

Reorder/update through one route that writes `assertive_listing_images` positions and then projects URLs/metadata into the listing row. Do not update URL order separately from metadata.

- [ ] **Step 7: Show transparent image status**

Label images as `Original normalizada`, `Melhorada por IA`, or `Cena IA verificada`. Show rejected attempts only in diagnostics, not the default gallery.

- [ ] **Step 8: Run integration tests**

Run: `npm.cmd test -- src/lib/assertive/__tests__/image-pipeline.test.ts src/lib/assertive/__tests__/photos.test.ts src/lib/assertive/__tests__/publication-readiness.test.ts`

Expected: PASS.

### Task 7: Image Production Verification Gate

**Files:**
- Modify: `src/lib/assertive/__tests__/golden-regression.test.ts`
- Modify: `src/lib/assertive/observability.ts`
- Modify: `src/lib/assertive/analysis-progress.ts`

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces: a rollout-ready image checkpoint.

- [ ] **Step 1: Add golden real-byte fixtures**

Cover clean seller photo, cluttered background, multiple angles, changed color, added accessory, changed label, different variant, malformed file, oversized image, provider timeout, provider quota failure, and repeated idempotent execution.

- [ ] **Step 2: Assert observability without sensitive data**

Events include asset/operation IDs, hashes, model, latency, reason code, requested/sent counts, fallback, and cost. Assert event metadata contains no base64, API key, signed URL, or EXIF payload.

- [ ] **Step 3: Run all tests**

Run: `npm.cmd test`

Expected: every test passes.

- [ ] **Step 4: Run static and production checks**

Run: `npm.cmd run typecheck`

Expected: exit code 0.

Run: `npm.cmd run build`

Expected: successful Next.js production build.

- [ ] **Step 5: Run a provider smoke test without publishing**

With a non-sensitive fixture and production-equivalent `GEMINI_API_KEY`, execute one enhancement and fidelity comparison. Expected: an accepted improved image or a recorded safe fallback; no Mercado Livre `POST /items` call.

- [ ] **Step 6: Inspect migration and diff quality**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intended image pipeline, migration, test, package, spec, and plan files are changed.
