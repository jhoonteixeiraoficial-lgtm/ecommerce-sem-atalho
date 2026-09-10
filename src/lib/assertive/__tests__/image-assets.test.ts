import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { isPublicationAssetAllowed, type ImageAsset } from '../image-assets'

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
})
