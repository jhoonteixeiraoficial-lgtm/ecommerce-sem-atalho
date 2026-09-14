import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { adminClient } = vi.hoisted(() => ({
  adminClient: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => adminClient,
}))

import { buildProgressiveImageSlots } from '../image-job-contract'
import {
  buildImageJobSnapshot,
  attachGeneratedImageSlot,
  attachManualImageSlot,
  claimNextImageJob,
  completeReferenceImageJob,
  confirmImageJob,
  dismissImageJob,
  ensureProgressiveImageJobs,
  findImageReviewJob,
  getImageJobSnapshot,
  retryImageJob,
  transitionImageJob,
  type SnapshotImageAsset,
} from '../image-jobs'
import type { ImageJob } from '../image-job-contract'

const NOW = '2026-09-12T18:00:00.000Z'

function job(overrides: Partial<ImageJob>): ImageJob {
  return {
    id: 'job-1',
    user_id: 'user-1',
    analysis_id: 'analysis-1',
    listing_id: 'listing-1',
    kind: 'GENERATE_SLOT',
    position: 0,
    role: 'MAIN',
    shot: { title: 'Foto principal', description: 'Fundo branco puro', required: true },
    status: 'QUEUED',
    reference_asset_ids: [],
    output_asset_id: null,
    generation_nonce: 'nonce-1',
    attempt_count: 0,
    max_attempts: 3,
    next_attempt_at: null,
    lock_token: null,
    locked_at: null,
    error_code: null,
    error_message: null,
    metadata: {},
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

function asset(overrides: Partial<SnapshotImageAsset>): SnapshotImageAsset {
  return {
    id: 'asset-1',
    user_id: 'user-1',
    analysis_id: 'analysis-1',
    kind: 'GENERATED_SCENE',
    origin: 'AI_GENERATED',
    rights_status: 'LICENSED',
    storage_bucket: 'assertive',
    storage_key: 'user-1/generated.jpg',
    public_url: 'https://cdn.example/generated.jpg',
    sha256: 'generated-sha',
    mime_type: 'image/jpeg',
    width: 1200,
    height: 1200,
    byte_size: 100,
    parent_asset_id: null,
    provider: 'gemini',
    model: 'gemini-3-pro-image',
    fidelity_status: 'ACCEPT',
    metadata: {
      truth_brief_hash: 'brief-hash',
      prompt_hash: 'prompt-hash',
      review_required: true,
      auto_verdict: 'ACCEPT',
    },
    created_at: NOW,
    ...overrides,
  }
}

describe('progressive image job contract', () => {
  it('always creates the approved six-position composition', () => {
    const slots = buildProgressiveImageSlots([
      { order: 1, title: 'Hero customizada', description: 'Produto no centro', required: true },
      { order: 6, title: 'Embalagem e dimensões', description: 'Mostre medidas da caixa', required: false },
    ], [])

    expect(slots.map(slot => `${slot.position}:${slot.role}`)).toEqual([
      '0:MAIN',
      '1:DETAIL',
      '2:DETAIL',
      '3:LIFESTYLE',
      '4:LIFESTYLE',
      '5:INFORMATIONAL',
    ])
    expect(slots[0].shot.title).toBe('Hero customizada')
    expect(slots[5].shot).toEqual({
      title: 'Vista técnica segura',
      description: 'Enquadramento complementar somente com partes comprovadas nas referências',
      required: false,
    })
  })

  it('uses packaging only when confirmed facts support it', () => {
    const slots = buildProgressiveImageSlots([
      { order: 6, title: 'Embalagem original', description: 'Produto junto da caixa', required: false },
    ], [{ label: 'Conteúdo da embalagem', value: 'Produto e caixa original' }])

    expect(slots[5]).toMatchObject({
      role: 'PACKAGING',
      shot: { title: 'Embalagem original' },
    })
  })

  it('does not infer packaging evidence from a brand that merely contains kit', () => {
    const slots = buildProgressiveImageSlots([
      { order: 6, title: 'Itens do kit', description: 'Mostre acessórios e caixa', required: false },
    ], [{ label: 'Marca', value: 'Kitest' }])

    expect(slots[5]).toMatchObject({
      role: 'INFORMATIONAL',
      shot: { title: 'Vista técnica segura' },
    })
  })
})

describe('progressive image job snapshot', () => {
  it('requests bootstrap when an editable progressive draft has no durable jobs yet', () => {
    const snapshot = buildImageJobSnapshot({
      listingId: 'listing-1',
      listingStatus: 'needs_input',
      jobs: [],
      linkedImages: [],
      assets: [],
      now: new Date(NOW),
    })

    expect(snapshot.runnable).toBe(true)
  })

  it('shows generated and manual outputs without leaking private references', () => {
    const jobs = [
      job({
        id: 'reference-job',
        kind: 'REFERENCE_SEARCH',
        position: null,
        role: null,
        shot: {},
        status: 'SUCCEEDED',
        reference_asset_ids: ['reference-1'],
      }),
      job({ id: 'cover-job', position: 0, status: 'REVIEW', output_asset_id: 'generated-cover', reference_asset_ids: ['reference-1'] }),
      job({ id: 'detail-job', position: 2, role: 'DETAIL', reference_asset_ids: ['reference-1'] }),
    ]
    const snapshot = buildImageJobSnapshot({
      listingId: 'listing-1',
      listingStatus: 'needs_input',
      jobs,
      linkedImages: [
        { position: 0, role: 'MAIN', asset_id: 'generated-cover' },
        { position: 1, role: 'DETAIL', asset_id: 'manual-detail' },
      ],
      assets: [
        asset({
          id: 'reference-1',
          kind: 'SOURCE_REFERENCE',
          origin: 'COMPETITOR',
          rights_status: 'REFERENCE_ONLY',
          storage_bucket: 'assertive-originals',
          storage_key: 'user-1/reference.jpg',
          public_url: 'https://private.example/reference.jpg',
          parent_asset_id: null,
          provider: null,
          model: null,
          fidelity_status: null,
          metadata: { source_url: 'https://shop.example/secret-product-page' },
        }),
        asset({ id: 'generated-cover', public_url: 'https://cdn.example/cover.jpg' }),
        asset({
          id: 'manual-detail',
          kind: 'PUBLICATION_RENDITION',
          origin: 'USER_UPLOAD',
          rights_status: 'USER_OWNED',
          parent_asset_id: 'manual-original',
          provider: null,
          model: null,
          public_url: 'https://cdn.example/manual.jpg',
          metadata: {},
        }),
      ],
      now: new Date(NOW),
    })

    expect(snapshot).toMatchObject({
      listing_id: 'listing-1',
      target_count: 6,
      ready_count: 1,
      visible_count: 2,
      reference_status: 'SUCCEEDED',
      reference_count: 1,
      reference_origins: ['COMPETITOR'],
      runnable: true,
    })
    expect(snapshot.slots).toHaveLength(6)
    expect(snapshot.slots[0]).toMatchObject({ status: 'REVIEW', preview_url: 'https://cdn.example/cover.jpg' })
    expect(snapshot.slots[1]).toMatchObject({ status: 'SUCCEEDED', preview_url: 'https://cdn.example/manual.jpg', manual: true })
    expect(JSON.stringify(snapshot)).not.toContain('private.example')
    expect(JSON.stringify(snapshot)).not.toContain('shop.example')
  })

  it('counts the seller own safe rendition as a verified private reference', () => {
    const snapshot = buildImageJobSnapshot({
      listingId: 'listing-1',
      listingStatus: 'needs_input',
      jobs: [
        job({
          id: 'reference-job',
          kind: 'REFERENCE_SEARCH',
          position: null,
          role: null,
          shot: {},
          status: 'SUCCEEDED',
          reference_asset_ids: ['reference-1', 'own-rendition', 'foreign-rendition'],
        }),
      ],
      linkedImages: [],
      assets: [
        asset({
          id: 'reference-1',
          kind: 'SOURCE_REFERENCE',
          origin: 'COMPETITOR',
          rights_status: 'REFERENCE_ONLY',
          public_url: null,
          parent_asset_id: null,
          provider: null,
          model: null,
          fidelity_status: null,
          metadata: {},
        }),
        asset({
          id: 'own-rendition',
          kind: 'PUBLICATION_RENDITION',
          origin: 'USER_UPLOAD',
          rights_status: 'USER_OWNED',
          parent_asset_id: 'own-original',
          provider: 'local',
          model: 'sharp-v1',
          metadata: {},
        }),
        asset({
          id: 'foreign-rendition',
          kind: 'PUBLICATION_RENDITION',
          origin: 'COMPETITOR',
          rights_status: 'REFERENCE_ONLY',
          parent_asset_id: 'foreign-original',
          provider: 'local',
          model: 'sharp-v1',
          metadata: {},
        }),
      ],
      now: new Date(NOW),
    })

    expect(snapshot).toMatchObject({
      reference_status: 'SUCCEEDED',
      reference_count: 2,
      reference_origins: ['COMPETITOR', 'USER_UPLOAD'],
    })
  })

  it('stops automatic work after reference acquisition exhausts its attempts', () => {
    const jobs = [
      job({
        id: 'reference-job',
        kind: 'REFERENCE_SEARCH',
        position: null,
        role: null,
        shot: {},
        status: 'FAILED',
        attempt_count: 3,
        error_code: 'REFERENCE_SEARCH_FAILED',
        error_message: 'Nenhuma referência exata foi encontrada.',
      }),
      ...buildProgressiveImageSlots([], []).map(slot => job({
        id: `slot-${slot.position}`,
        position: slot.position,
        role: slot.role,
        shot: slot.shot,
      })),
    ]
    const snapshot = buildImageJobSnapshot({
      listingId: 'listing-1',
      listingStatus: 'needs_input',
      jobs,
      linkedImages: [],
      assets: [],
      now: new Date(NOW),
    })

    expect(snapshot.runnable).toBe(false)
    expect(snapshot.slots.every(slot => slot.error_code === 'REFERENCE_SEARCH_FAILED')).toBe(true)
  })

  it('makes an expired lock runnable again', () => {
    const snapshot = buildImageJobSnapshot({
      listingId: 'listing-1',
      listingStatus: 'needs_input',
      jobs: [job({
        kind: 'REFERENCE_SEARCH',
        position: null,
        role: null,
        shot: {},
        status: 'RUNNING',
        locked_at: '2026-09-12T17:55:00.000Z',
        lock_token: 'expired-token',
        attempt_count: 1,
      })],
      linkedImages: [],
      assets: [],
      now: new Date(NOW),
    })

    expect(snapshot.runnable).toBe(true)
  })

  it('requests server cleanup when the final attempt expires while still locked', () => {
    const snapshot = buildImageJobSnapshot({
      listingId: 'listing-1',
      listingStatus: 'needs_input',
      jobs: [job({
        kind: 'REFERENCE_SEARCH',
        position: null,
        role: null,
        shot: {},
        status: 'RUNNING',
        locked_at: '2026-09-12T17:55:00.000Z',
        lock_token: 'expired-final-token',
        attempt_count: 3,
        max_attempts: 3,
      })],
      linkedImages: [],
      assets: [],
      now: new Date(NOW),
    })

    expect(snapshot.runnable).toBe(true)
  })
})

describe('progressive image job store', () => {
  beforeEach(() => {
    adminClient.rpc.mockReset()
    adminClient.from.mockReset()
  })

  it('retries a transient gateway timeout while reading the snapshot', async () => {
    let listingReads = 0
    adminClient.from.mockImplementation((table: string) => {
      const result = table === 'assertive_listings'
        ? (++listingReads === 1
            ? { data: null, error: { message: 'Gateway Timeout' } }
            : { data: { id: 'listing-1', status: 'needs_input' }, error: null })
        : { data: [], error: null }
      const query: Record<string, unknown> = {}
      query.select = vi.fn(() => query)
      query.eq = vi.fn(() => query)
      query.in = vi.fn(() => Promise.resolve(result))
      query.maybeSingle = vi.fn(() => Promise.resolve(result))
      query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => (
        Promise.resolve(result).then(resolve, reject)
      )
      return query
    })

    const snapshot = await getImageJobSnapshot('listing-1', 'user-1')

    expect(snapshot).toMatchObject({ listing_id: 'listing-1', target_count: 6 })
    expect(listingReads).toBe(2)
  })

  it('bootstraps the normalized six-slot contract through the atomic RPC', async () => {
    adminClient.rpc.mockResolvedValue({ data: null, error: null })

    await ensureProgressiveImageJobs({
      listingId: 'listing-1',
      analysisId: 'analysis-1',
      userId: 'user-1',
      imagePlan: [{ order: 1, title: 'Capa personalizada', description: 'Produto centralizado', required: true }],
      facts: [],
    })

    expect(adminClient.rpc).toHaveBeenCalledWith('assertive_bootstrap_image_jobs', {
      p_listing_id: 'listing-1',
      p_user_id: 'user-1',
      p_slots: expect.arrayContaining([
        expect.objectContaining({ position: 0, role: 'MAIN' }),
        expect.objectContaining({ position: 5, role: 'INFORMATIONAL' }),
      ]),
    })
    expect(adminClient.rpc.mock.calls[0][1].p_slots).toHaveLength(6)
  })

  it('claims with a fresh lock token and returns the claimed row', async () => {
    const claimed = job({ id: 'claimed-job', kind: 'REFERENCE_SEARCH', position: null, role: null, shot: {}, status: 'RUNNING' })
    adminClient.rpc.mockImplementation((_, args: { p_lock_token: string }) => Promise.resolve({
      data: [{ ...claimed, lock_token: args.p_lock_token }],
      error: null,
    }))

    await expect(claimNextImageJob('listing-1', 'user-1')).resolves.toMatchObject({
      ...claimed,
      lock_token: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(adminClient.rpc).toHaveBeenCalledWith('assertive_claim_image_job', {
      p_listing_id: 'listing-1',
      p_user_id: 'user-1',
      p_lock_token: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
  })

  it('updates a running job only through its owner, listing and lock token', async () => {
    function query(response: { data: unknown; error: unknown }) {
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        update: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue(response),
      }
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.update.mockReturnValue(builder)
      return builder
    }
    const lookup = query({ data: { listing_id: 'listing-1' }, error: null })
    const update = query({ data: { id: 'job-1' }, error: null })
    adminClient.from.mockReturnValueOnce(lookup).mockReturnValueOnce(update)

    await transitionImageJob('job-1', 'user-1', 'lock-1', {
      status: 'FAILED',
      error_code: 'GENERATION_FAILED',
      error_message: 'x'.repeat(1200),
    })

    expect(lookup.eq.mock.calls).toEqual(expect.arrayContaining([
      ['id', 'job-1'],
      ['user_id', 'user-1'],
      ['status', 'RUNNING'],
      ['lock_token', 'lock-1'],
    ]))
    expect(update.eq.mock.calls).toEqual(expect.arrayContaining([
      ['id', 'job-1'],
      ['listing_id', 'listing-1'],
      ['user_id', 'user-1'],
      ['status', 'RUNNING'],
      ['lock_token', 'lock-1'],
    ]))
    expect(update.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'FAILED',
      lock_token: null,
      locked_at: null,
      error_message: 'x'.repeat(1000),
    }))
  })

  it('requeues one position through the atomic reset RPC', async () => {
    adminClient.rpc.mockResolvedValue({ data: null, error: null })

    await retryImageJob('listing-1', 'user-1', 3)

    expect(adminClient.rpc).toHaveBeenCalledWith('assertive_reset_image_slot', {
      p_listing_id: 'listing-1',
      p_user_id: 'user-1',
      p_position: 3,
      p_status: 'QUEUED',
    })
  })

  it('confirms or dismisses one position through atomic owner-scoped RPCs', async () => {
    adminClient.rpc.mockResolvedValue({ data: null, error: null })

    await confirmImageJob('listing-1', 'user-1', 2, 'generated-2')
    await dismissImageJob('listing-1', 'user-1', 4)

    expect(adminClient.rpc.mock.calls).toEqual([
      ['assertive_confirm_image_slot', {
        p_listing_id: 'listing-1',
        p_user_id: 'user-1',
        p_position: 2,
        p_asset_id: 'generated-2',
      }],
      ['assertive_reset_image_slot', {
        p_listing_id: 'listing-1',
        p_user_id: 'user-1',
        p_position: 4,
        p_status: 'DISMISSED',
      }],
    ])
  })

  it('assigns a user-owned rendition to one fixed slot atomically', async () => {
    adminClient.rpc.mockResolvedValue({ data: null, error: null })

    await attachManualImageSlot('listing-1', 'user-1', 1, 'manual-1')

    expect(adminClient.rpc).toHaveBeenCalledWith('assertive_attach_manual_image_slot', {
      p_listing_id: 'listing-1',
      p_user_id: 'user-1',
      p_position: 1,
      p_asset_id: 'manual-1',
    })
  })

  it('locates a review asset without returning private job fields', async () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      then: vi.fn(),
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.then.mockImplementation((resolve: (value: unknown) => unknown) => Promise.resolve({
      data: [
        { position: 0, status: 'SUCCEEDED', output_asset_id: 'generated-0' },
        { position: 2, status: 'REVIEW', output_asset_id: 'generated-2' },
      ],
      error: null,
    }).then(resolve))
    adminClient.from.mockReturnValue(builder)

    await expect(findImageReviewJob('listing-1', 'user-1', 'generated-2')).resolves.toEqual({
      progressive: true,
      position: 2,
    })
    expect(builder.eq.mock.calls).toEqual(expect.arrayContaining([
      ['listing_id', 'listing-1'],
      ['user_id', 'user-1'],
      ['kind', 'GENERATE_SLOT'],
    ]))
  })

  it('completes references and projects generated output only through atomic RPCs', async () => {
    adminClient.rpc.mockResolvedValue({ data: null, error: null })

    await completeReferenceImageJob('job-1', 'user-1', 'lock-1', ['reference-1', 'reference-2'])
    await attachGeneratedImageSlot('listing-1', 'user-1', 4, 'generated-4', 'lock-2')

    expect(adminClient.rpc.mock.calls).toEqual([
      ['assertive_complete_reference_job', {
        p_job_id: 'job-1',
        p_user_id: 'user-1',
        p_lock_token: 'lock-1',
        p_asset_ids: ['reference-1', 'reference-2'],
      }],
      ['assertive_upsert_listing_image_slot', {
        p_listing_id: 'listing-1',
        p_user_id: 'user-1',
        p_position: 4,
        p_asset_id: 'generated-4',
        p_lock_token: 'lock-2',
      }],
    ])
  })
})
