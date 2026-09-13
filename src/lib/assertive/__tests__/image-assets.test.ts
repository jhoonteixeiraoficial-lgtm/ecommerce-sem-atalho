import { beforeEach, describe, expect, it, vi } from 'vitest'

const { adminClient } = vi.hoisted(() => ({
  adminClient: {
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
import { createReferenceAsset, isPublicationAssetAllowed, type ImageAsset } from '../image-assets'

const asset = {
  id: 'asset-1',
  user_id: 'user-1',
  analysis_id: null,
  kind: 'PUBLICATION_RENDITION',
  origin: 'USER_UPLOAD',
  rights_status: 'USER_OWNED',
  storage_bucket: 'assertive',
  storage_key: 'user-1/photo.jpg',
  public_url: 'https://example.com/photo.jpg',
  sha256: 'hash',
  mime_type: 'image/jpeg',
  width: 1200,
  height: 1200,
  byte_size: 100,
  parent_asset_id: 'original-1',
  provider: null,
  model: null,
  fidelity_status: 'ACCEPT',
  metadata: {},
  created_at: '2026-09-09T00:00:00.000Z',
} satisfies ImageAsset

describe('image asset publication boundary', () => {
  it('aceita rendition pública vinculada a original do vendedor', () => {
    expect(isPublicationAssetAllowed(asset)).toBe(true)
  })

  it.each([
    { origin: 'COMPETITOR' as const },
    { rights_status: 'REFERENCE_ONLY' as const },
    { rights_status: 'UNKNOWN' as const },
    { fidelity_status: 'REJECT' as const },
    { parent_asset_id: null },
  ])('rejeita ativo sem direito ou fidelidade: %o', override => {
    expect(isPublicationAssetAllowed({ ...asset, ...override })).toBe(false)
  })

  it('aceita cena gerada sem pai quando a proveniência factual está completa', () => {
    expect(isPublicationAssetAllowed({
      ...asset,
      kind: 'GENERATED_SCENE',
      origin: 'ML_CATALOG',
      rights_status: 'LICENSED',
      parent_asset_id: null,
      provider: 'gemini',
      model: 'gemini-3-pro-image',
      metadata: {
        truth_brief_hash: 'brief-hash',
        prompt_hash: 'prompt-hash',
        review_required: true,
      },
    })).toBe(true)
  })

  it('rejeita cena gerada sem pai quando falta proveniência factual', () => {
    expect(isPublicationAssetAllowed({
      ...asset,
      kind: 'GENERATED_SCENE',
      origin: 'ML_CATALOG',
      rights_status: 'LICENSED',
      parent_asset_id: null,
      provider: 'gemini',
      model: 'gemini-3-pro-image',
      metadata: { review_required: true },
    })).toBe(false)
  })
})

describe('reference asset persistence', () => {
  beforeEach(() => {
    adminClient.from.mockReset()
    adminClient.storage.from.mockReset()
  })

  it('reuses one matching private reference when historical duplicates exist', async () => {
    const existing = {
      ...asset,
      kind: 'SOURCE_REFERENCE' as const,
      origin: 'COMPETITOR' as const,
      rights_status: 'REFERENCE_ONLY' as const,
      public_url: null,
      parent_asset_id: null,
      fidelity_status: null,
    }
    let limited = false
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      limit: vi.fn(() => {
        limited = true
        return query
      }),
      maybeSingle: vi.fn(() => Promise.resolve(limited
        ? { data: existing, error: null }
        : { data: null, error: { message: 'multiple rows returned' } })),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    adminClient.from.mockReturnValue(query)

    await expect(createReferenceAsset({
      user_id: 'user-1',
      analysis_id: 'analysis-1',
      bytes: Buffer.from('reference'),
      mime_type: 'image/jpeg',
      width: 800,
      height: 800,
      sha256: existing.sha256,
      storage_key: 'user-1/analysis-1/reference.jpg',
      source_url: 'https://source.example/reference.jpg',
      origin: 'COMPETITOR',
      rights_status: 'REFERENCE_ONLY',
      metadata: { source_item_id: 'MLB1' },
    })).resolves.toEqual(existing)
    expect(adminClient.storage.from).not.toHaveBeenCalled()
  })
})
