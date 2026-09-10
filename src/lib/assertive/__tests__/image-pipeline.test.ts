import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '../image-assets'

const mocks = vi.hoisted(() => ({
  getOwnedAssets: vi.fn(),
  downloadOwnedImageAsset: vi.fn(),
  createDerivedAsset: vi.fn(),
  getImageOperationByKey: vi.fn(),
  beginImageOperation: vi.fn(),
  finishImageOperation: vi.fn(),
  preparePublicationImage: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('../image-assets', async importOriginal => ({
  ...(await importOriginal<typeof import('../image-assets')>()),
  getOwnedAssets: mocks.getOwnedAssets,
  downloadOwnedImageAsset: mocks.downloadOwnedImageAsset,
  createDerivedAsset: mocks.createDerivedAsset,
  getImageOperationByKey: mocks.getImageOperationByKey,
  beginImageOperation: mocks.beginImageOperation,
  finishImageOperation: mocks.finishImageOperation,
}))
vi.mock('../image-enhancement', () => ({ preparePublicationImage: mocks.preparePublicationImage }))

import { buildListingGallery } from '../image-pipeline'

const original = {
  id: 'original-1', user_id: 'user-1', analysis_id: null, kind: 'ORIGINAL_EVIDENCE', origin: 'USER_UPLOAD',
  rights_status: 'USER_OWNED', storage_bucket: 'assertive-originals', storage_key: 'original.jpg', public_url: null,
  sha256: 'source-hash', mime_type: 'image/jpeg', width: 640, height: 480, byte_size: 100, parent_asset_id: null,
  provider: null, model: null, fidelity_status: null, metadata: {}, created_at: '2026-09-09',
} satisfies ImageAsset

const fallback = {
  ...original, id: 'rendition-1', kind: 'PUBLICATION_RENDITION', storage_bucket: 'assertive',
  storage_key: 'normalized.jpg', public_url: 'https://cdn.example/normalized.jpg', sha256: 'normalized-hash',
  width: 1200, height: 1200, parent_asset_id: original.id, provider: 'local', model: 'sharp-v1', fidelity_status: 'ACCEPT',
} satisfies ImageAsset

const enhanced = {
  ...fallback, id: 'enhanced-1', storage_key: 'enhanced.jpg', public_url: 'https://cdn.example/enhanced.jpg',
  sha256: 'enhanced-hash', provider: 'gemini', model: 'gemini-3-pro-image',
} satisfies ImageAsset

describe('image publication pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getOwnedAssets.mockImplementation(async (_userId: string, ids: string[]) => {
      return [fallback, original, enhanced].filter(asset => ids.includes(asset.id))
    })
    mocks.downloadOwnedImageAsset.mockResolvedValue(Buffer.from('original-bytes'))
    mocks.getImageOperationByKey.mockResolvedValue(null)
    mocks.beginImageOperation.mockResolvedValue({ id: 'operation-1', status: 'RUNNING' })
    mocks.createDerivedAsset.mockResolvedValue(enhanced)
    mocks.preparePublicationImage.mockResolvedValue({
      image: { buffer: Buffer.from('enhanced-bytes'), mime_type: 'image/jpeg', width: 1200, height: 1200 },
      ai_enhanced: true, fidelity_status: 'ACCEPT', provider: 'gemini', model: 'gemini-3-pro-image',
      attempts: 2, latency_ms: 100, fidelity: { status: 'ACCEPT', score: 99, reason: 'preservado' },
    })
  })

  it('usa saída Gemini somente quando o gate a aprovou', async () => {
    const gallery = await buildListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', renditionAssetIds: [fallback.id], productName: 'Caneta Kitest',
      config: null, enhancementEnabled: true,
    })

    expect(gallery.urls).toEqual([enhanced.public_url])
    expect(gallery.images[0]).toMatchObject({ asset_id: enhanced.id, source: 'AI_ENHANCED', parent_asset_id: original.id })
    expect(mocks.finishImageOperation).toHaveBeenCalledWith('operation-1', 'user-1', expect.objectContaining({
      status: 'SUCCEEDED', output_asset_id: enhanced.id,
    }))
  })

  it('volta para a rendição normalizada quando a IA é rejeitada', async () => {
    mocks.preparePublicationImage.mockResolvedValue({
      image: { buffer: Buffer.from('normalized'), mime_type: 'image/jpeg', width: 1200, height: 1200 },
      ai_enhanced: false, fidelity_status: 'ACCEPT', provider: null, model: null, attempts: 1, latency_ms: 50,
      fallback_reason: 'FIDELITY_REJECT', fidelity: { status: 'REJECT', score: 20, reason: 'cor alterada' },
    })

    const gallery = await buildListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', renditionAssetIds: [fallback.id], config: null, enhancementEnabled: true,
    })

    expect(gallery.urls).toEqual([fallback.public_url])
    expect(gallery.images[0]).toMatchObject({ asset_id: fallback.id, source: 'USER', parent_asset_id: original.id })
    expect(mocks.createDerivedAsset).not.toHaveBeenCalled()
    expect(mocks.finishImageOperation).toHaveBeenCalledWith('operation-1', 'user-1', expect.objectContaining({ status: 'REJECTED' }))
  })

  it('reutiliza operação concluída sem cobrar outra edição', async () => {
    mocks.getImageOperationByKey.mockResolvedValue({ id: 'operation-1', status: 'SUCCEEDED', output_asset_id: enhanced.id })

    const gallery = await buildListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', renditionAssetIds: [fallback.id], config: null, enhancementEnabled: true,
    })

    expect(gallery.urls).toEqual([enhanced.public_url])
    expect(mocks.preparePublicationImage).not.toHaveBeenCalled()
    expect(mocks.beginImageOperation).not.toHaveBeenCalled()
  })

  it('rejeita referência sem direito de publicação', async () => {
    mocks.getOwnedAssets.mockResolvedValue([{ ...fallback, rights_status: 'REFERENCE_ONLY' }])
    await expect(buildListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', renditionAssetIds: [fallback.id], config: null,
    })).rejects.toThrow('não está aprovada')
  })
})
