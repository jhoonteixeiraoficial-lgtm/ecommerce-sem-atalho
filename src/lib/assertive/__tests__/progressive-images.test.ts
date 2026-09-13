import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { ImageAsset } from '../image-assets'
import type { ImageJob, ImageJobSnapshot, ProgressiveImageSlotPlan } from '../image-job-contract'
import {
  runNextProgressiveImageJob,
  type ProgressiveImageDependencies,
  type ProgressiveJobExecutionContext,
} from '../progressive-images'

const NOW = new Date('2026-09-12T18:00:00.000Z')

function job(overrides: Partial<ImageJob> = {}): ImageJob {
  return {
    id: 'slot-job',
    user_id: 'user-1',
    analysis_id: 'analysis-1',
    listing_id: 'listing-1',
    kind: 'GENERATE_SLOT',
    position: 0,
    role: 'MAIN',
    shot: { title: 'Foto principal', description: 'Fundo branco', required: true },
    status: 'RUNNING',
    reference_asset_ids: ['reference-1'],
    output_asset_id: null,
    generation_nonce: 'nonce-1',
    attempt_count: 1,
    max_attempts: 3,
    next_attempt_at: null,
    lock_token: 'lock-1',
    locked_at: NOW.toISOString(),
    error_code: null,
    error_message: null,
    metadata: {},
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  }
}

function imageAsset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'reference-1',
    user_id: 'user-1',
    analysis_id: 'analysis-1',
    kind: 'SOURCE_REFERENCE',
    origin: 'COMPETITOR',
    rights_status: 'REFERENCE_ONLY',
    storage_bucket: 'assertive-originals',
    storage_key: 'user-1/reference.jpg',
    public_url: null,
    sha256: 'reference-sha',
    mime_type: 'image/jpeg',
    width: 1200,
    height: 1200,
    byte_size: 100,
    parent_asset_id: null,
    provider: null,
    model: null,
    fidelity_status: null,
    metadata: {},
    created_at: NOW.toISOString(),
    ...overrides,
  }
}

function context(): ProgressiveJobExecutionContext {
  return {
    listing: {
      id: 'listing-1',
      user_id: 'user-1',
      analysis_id: 'analysis-1',
      status: 'needs_input',
      title: 'Parafusadeira Fulink FK-80PT',
    },
    analysis: {
      id: 'analysis-1',
      user_id: 'user-1',
      input_data: { photo_asset_ids: [] },
    },
    truth: {
      name: 'Parafusadeira Fulink FK-80PT',
      fields: {
        brand: { value: 'Fulink', confidence: 'confirmed', source: 'ml_item', evidence: 'Marca' },
        model: { value: 'FK-80PT', confidence: 'confirmed', source: 'ml_item', evidence: 'Modelo' },
      },
      uncertain: [],
      evidence: [],
      confidence: 0.95,
    },
    facts: [{ label: 'Modelo', value: 'FK-80PT' }],
    ownAssetIds: [],
    token: 'ml-token',
    config: null,
  }
}

function snapshot(jobs: ImageJob[]): ImageJobSnapshot {
  const reference = jobs.find(candidate => candidate.kind === 'REFERENCE_SEARCH')
  const slots = Array.from({ length: 6 }, (_, position) => {
    const current = jobs.find(candidate => candidate.kind === 'GENERATE_SLOT' && candidate.position === position)
    return {
      position,
      role: (position === 0 ? 'MAIN' : position <= 2 ? 'DETAIL' : position <= 4 ? 'LIFESTYLE' : 'INFORMATIONAL') as ProgressiveImageSlotPlan['role'],
      title: typeof current?.shot.title === 'string' ? current.shot.title : `Imagem ${position + 1}`,
      description: typeof current?.shot.description === 'string' ? current.shot.description : 'Descrição',
      required: Boolean(current?.shot.required),
      status: current?.status || 'SUCCEEDED',
      asset_id: current?.output_asset_id || null,
      preview_url: null,
      attempts: current?.attempt_count || 0,
      error_code: current?.error_code || null,
      error_message: current?.error_message || null,
      auto_verdict: null,
      manual: !current,
    }
  })
  return {
    listing_id: 'listing-1',
    target_count: 6,
    ready_count: slots.filter(slot => slot.status === 'SUCCEEDED').length,
    visible_count: 0,
    active_count: slots.filter(slot => slot.status === 'RUNNING').length,
    reference_status: reference?.status || 'SUCCEEDED',
    reference_count: reference?.reference_asset_ids.length || 0,
    reference_origins: reference?.reference_asset_ids.length ? ['COMPETITOR'] : [],
    runnable: jobs.some(candidate => ['QUEUED', 'RETRYABLE', 'RUNNING'].includes(candidate.status)),
    slots,
  }
}

function createState(options: {
  next: ImageJob
  acquiredReferences?: ImageAsset[]
  coverPassed?: boolean
  duplicateId?: string | null
  generationError?: Error
}) {
  const jobs = [options.next]
  const listingImages: Array<{ position: number; asset_id: string }> = []
  const acquiredReferences = options.acquiredReferences || [imageAsset()]
  let claimed = false
  const dependencies: ProgressiveImageDependencies = {
    claimJob: async () => {
      if (claimed) return null
      claimed = true
      return options.next
    },
    getSnapshot: async () => snapshot(jobs),
    loadContext: async () => context(),
    acquireReferences: async () => acquiredReferences,
    completeReference: async (_jobId, _userId, _lockToken, assetIds) => {
      options.next.status = 'SUCCEEDED'
      options.next.reference_asset_ids = assetIds
      options.next.lock_token = null
    },
    transitionJob: async (_jobId, _userId, _lockToken, patch) => {
      options.next.status = patch.status
      options.next.error_code = patch.error_code || null
      options.next.error_message = patch.error_message || null
      options.next.next_attempt_at = patch.next_attempt_at || null
      options.next.lock_token = null
    },
    loadReferences: async () => acquiredReferences.slice(0, 3).map(asset => ({
      asset,
      buffer: Buffer.from(`bytes-${asset.id}`),
      mime_type: asset.mime_type,
    })),
    generateImage: async input => {
      if (options.generationError) throw options.generationError
      return {
        buffer: Buffer.from(`generated-${input.shot?.order}`),
        mime_type: 'image/png',
        provider: 'gemini',
        model: 'image-model',
        attempts: 1,
        latency_ms: 10,
        prompt_hash: 'prompt-hash',
        truth_brief_hash: 'truth-hash',
        source_sha256: 'source-hash',
        reference_sha256s: ['reference-hash'],
        output_sha256: 'provider-output-hash',
      }
    },
    normalizeImage: async buffer => ({
      buffer,
      mime_type: 'image/jpeg',
      width: 1200,
      height: 1200,
      source: { width: 1200, height: 1200, format: 'jpeg', orientation: 1 },
    }),
    verifyFidelity: async () => ({
      status: 'ACCEPT',
      score: 96,
      reason: 'Produto preservado.',
      reason_codes: ['REFERENCE_IDENTITY_PRESERVED'],
      composition_is_new: true,
    }),
    assessCover: async () => ({
      passed: options.coverPassed !== false,
      square: true,
      white_border_ratio: options.coverPassed === false ? 0.2 : 0.98,
      reason: options.coverPassed === false ? 'Fundo colorido.' : null,
    }),
    findDuplicate: async () => options.duplicateId || null,
    loadGalleryComparisons: async () => [],
    persistGeneratedAsset: async input => imageAsset({
      id: `generated-${options.next.position}`,
      kind: 'GENERATED_SCENE',
      origin: 'AI_GENERATED',
      rights_status: 'LICENSED',
      storage_bucket: 'assertive',
      storage_key: input.storage_key,
      public_url: `https://cdn.example/generated-${options.next.position}.jpg`,
      sha256: input.sha256,
      parent_asset_id: input.parent_asset_id || null,
      provider: input.provider,
      model: input.model,
      fidelity_status: 'ACCEPT',
      metadata: input.metadata,
    }),
    attachSlot: async (_listingId, _userId, position, assetId) => {
      listingImages.push({ position, asset_id: assetId })
      options.next.status = 'REVIEW'
      options.next.output_asset_id = assetId
      options.next.lock_token = null
    },
    recordEvent: async () => true,
    now: () => new Date(NOW),
  }
  return { jobs, listingImages, dependencies }
}

describe('progressive image orchestrator', () => {
  it('completes reference acquisition before changing a generation slot', async () => {
    const referenceJob = job({
      id: 'reference-job',
      kind: 'REFERENCE_SEARCH',
      position: null,
      role: null,
      shot: {},
      reference_asset_ids: [],
    })
    const state = createState({ next: referenceJob, acquiredReferences: [imageAsset()] })

    const result = await runNextProgressiveImageJob({ listingId: 'listing-1', userId: 'user-1' }, state.dependencies)

    expect(result.processed_kind).toBe('REFERENCE_SEARCH')
    expect(state.jobs[0].status).toBe('SUCCEEDED')
    expect(state.listingImages).toEqual([])
  })

  it('generates and projects only the claimed slot', async () => {
    const state = createState({ next: job({ position: 3, role: 'LIFESTYLE' }) })

    const result = await runNextProgressiveImageJob({ listingId: 'listing-1', userId: 'user-1' }, state.dependencies)

    expect(result.processed_position).toBe(3)
    expect(state.listingImages).toEqual([{ position: 3, asset_id: 'generated-3' }])
    expect(state.jobs[0].status).toBe('REVIEW')
  })

  it('does not attach a cover that fails the white-background gate', async () => {
    const state = createState({ next: job({ position: 0, role: 'MAIN' }), coverPassed: false })

    const result = await runNextProgressiveImageJob({ listingId: 'listing-1', userId: 'user-1' }, state.dependencies)

    expect(result.snapshot.slots[0]).toMatchObject({
      status: 'RETRYABLE',
      error_code: 'IMAGE_BACKGROUND_REJECTED',
    })
    expect(state.listingImages).toEqual([])
  })

  it('retries a composition that duplicates an exact reference', async () => {
    const state = createState({ next: job({ position: 2, role: 'DETAIL' }), duplicateId: 'reference-1' })

    const result = await runNextProgressiveImageJob({ listingId: 'listing-1', userId: 'user-1' }, state.dependencies)

    expect(result.snapshot.slots[2]).toMatchObject({
      status: 'RETRYABLE',
      error_code: 'IMAGE_DUPLICATE_REJECTED',
    })
    expect(state.listingImages).toEqual([])
  })

  it('backs off after a transient provider failure', async () => {
    const state = createState({
      next: job({ position: 4, role: 'LIFESTYLE' }),
      generationError: new Error('image-model retornou HTTP 503: provider payload secret'),
    })

    const result = await runNextProgressiveImageJob({ listingId: 'listing-1', userId: 'user-1' }, state.dependencies)

    expect(result.snapshot.slots[4]).toMatchObject({
      status: 'RETRYABLE',
      error_code: 'IMAGE_PROVIDER_UNAVAILABLE',
      error_message: 'O provedor de imagens está temporariamente indisponível.',
    })
    expect(JSON.stringify(result)).not.toContain('provider payload secret')
    expect(new Date(state.jobs[0].next_attempt_at || 0).getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('fails immediately when the image provider is not configured', async () => {
    const state = createState({
      next: job({ position: 4, role: 'LIFESTYLE' }),
      generationError: new Error('GEMINI_API_KEY ausente para geração de imagem.'),
    })

    const result = await runNextProgressiveImageJob({ listingId: 'listing-1', userId: 'user-1' }, state.dependencies)

    expect(result.snapshot.slots[4]).toMatchObject({
      status: 'FAILED',
      error_code: 'IMAGE_PROVIDER_CONFIGURATION',
    })
    expect(state.jobs[0].next_attempt_at).toBeNull()
  })
})
