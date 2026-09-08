# ASSERTIVE STABILIZATION — P0.1/P0.2 PROOF + P0.7 PHOTO TRACE + FIX

## Context
P0.1 (Source Snapshot) + P0.2 (Category Lock) + P0.3 (Sanity Guard) were implemented in commit `289736e`.
Now we need to:
1. Prove the category fix works with a real Kitest KA-250 URL
2. Harden the sanity guard for HARD cross-domain mismatches
3. Trace the photo pipeline to find why photos = 0
4. Fix the root cause of photos = 0

## ROOT CAUSE (Photos = 0)
`collectAndClassifyPhotos` (`photos.ts:112`) ONLY collects photos from `EXACT_PRODUCT` competitors.
When a user provides an ML URL, the source URL's own photos are NEVER fetched or passed.
If no EXACT_PRODUCT competitors exist → `totalFound === 0 && userPhotos.length === 0` → early return empty.

## Plan

### Task 1: Add source_pictures to ProductTruth + MLItemLite
**File:** `truth.ts`
- Add `source_pictures?: string[]` to `ProductTruth` interface (line ~71)
- Add `pictures?: Array<{ url: string }>` to `MLItemLite` interface (line ~264)
- In `identifyFromUrl`, capture `item.pictures` from both catalog and item strategies
- Return `source_pictures` in the ProductTruth

### Task 2: Add sourcePhotos to CollectPhotosInput
**File:** `photos.ts`
- Add `sourcePhotos?: string[]` to `CollectPhotosInput` (line ~62)
- Add `'SOURCE_URL'` to `PhotoSource` type (line 8)
- Before the EXACT_PRODUCT loop, inject `sourcePhotos` as `INPUT_SOURCE_EXACT` candidates with highest priority
- These bypass the EXACT filter entirely

### Task 3: Pass source_pictures through pipeline
**File:** `pipeline.ts`
- In `runGeneration`, extract `truth.source_pictures` and pass as `sourcePhotos` to `collectAndClassifyPhotos`

### Task 4: Hard sanity guard for cross-domain mismatch
**File:** `pipeline.ts`
- In `checkCategorySanity`, when HARD mismatch detected AND `category_lock = true`:
  - Set `SOURCE_CATEGORY_SUSPECT = true`
  - Log `original_source_category_id`, `category_change_reason`
  - The pipeline should attempt re-resolution using catalog API
  - Persist all change metadata

### Task 5: Run real Kitest URL test
- Execute pipeline with Kitest KA-250 URL
- Capture all metrics (category, photos, attributes)
- Verify: CATEGORY_SANITY = PASS, JUICE_ATTRIBUTES = 0, PHOTOS > 0

### Task 6: Typecheck + Tests + Build + Deploy
- Only deploy if Kitest URL test shows PHOTOS > 0

## Verification
- TYPECHECK: PASS
- TESTS: 455+ PASS
- KITEST URL: PHOTOS > 0, CATEGORY = correct
- HOMENOW: no regression
- BUILD: PASS
- DEPLOY: only if all above pass
