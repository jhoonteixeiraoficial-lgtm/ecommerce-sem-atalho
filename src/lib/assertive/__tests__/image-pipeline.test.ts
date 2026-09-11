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
  createReferenceAsset: vi.fn(),
  createGeneratedAsset: vi.fn(),
  fetchImageSafely: vi.fn(),
  editProductImage: vi.fn(),
  generateProductImage: vi.fn(),
  normalizeProductImage: vi.fn(),
  verifyImageFidelity: vi.fn(),
  verifyGeneratedImage: vi.fn(),
  createSafeCropVariants: vi.fn(),
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
  createReferenceAsset: mocks.createReferenceAsset,
  createGeneratedAsset: mocks.createGeneratedAsset,
}))
vi.mock('../image-enhancement', () => ({ preparePublicationImage: mocks.preparePublicationImage }))
vi.mock('../safe-image-fetch', () => ({ fetchImageSafely: mocks.fetchImageSafely }))
vi.mock('../gemini-image', () => ({
  editProductImage: mocks.editProductImage,
  generateProductImage: mocks.generateProductImage,
}))
vi.mock('../image-normalization', () => ({
  normalizeProductImage: mocks.normalizeProductImage,
  createSafeCropVariants: mocks.createSafeCropVariants,
}))
vi.mock('../image-fidelity', () => ({
  verifyImageFidelity: mocks.verifyImageFidelity,
  verifyGeneratedImage: mocks.verifyGeneratedImage,
}))

import { buildAnalysisListingGallery, buildGeneratedListingGallery, buildListingGallery } from '../image-pipeline'

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

const reference = {
  ...original,
  id: 'reference-1',
  kind: 'SOURCE_REFERENCE',
  origin: 'ML_CATALOG',
  rights_status: 'REFERENCE_ONLY',
  storage_key: 'reference.jpg',
  sha256: 'reference-hash',
} satisfies ImageAsset

const generated = {
  ...fallback,
  id: 'generated-1',
  kind: 'GENERATED_SCENE',
  origin: 'AI_GENERATED',
  rights_status: 'LICENSED',
  storage_key: 'generated.jpg',
  public_url: 'https://cdn.example/generated.jpg',
  sha256: 'generated-hash',
  parent_asset_id: reference.id,
  provider: 'gemini',
  model: 'gemini-3-pro-image',
  metadata: { truth_brief_hash: 'brief-hash', prompt_hash: 'prompt-hash', review_required: true },
} satisfies ImageAsset

describe('image publication pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getOwnedAssets.mockImplementation(async (_userId: string, ids: string[]) => {
      return [fallback, original, enhanced, reference, generated].filter(asset => ids.includes(asset.id))
    })
    mocks.downloadOwnedImageAsset.mockResolvedValue(Buffer.from('original-bytes'))
    mocks.getImageOperationByKey.mockResolvedValue(null)
    mocks.beginImageOperation.mockResolvedValue({ id: 'operation-1', status: 'RUNNING' })
    mocks.finishImageOperation.mockResolvedValue(undefined)
    mocks.createDerivedAsset.mockResolvedValue(enhanced)
    mocks.preparePublicationImage.mockResolvedValue({
      image: { buffer: Buffer.from('enhanced-bytes'), mime_type: 'image/jpeg', width: 1200, height: 1200 },
      ai_enhanced: true, fidelity_status: 'ACCEPT', provider: 'gemini', model: 'gemini-3-pro-image',
      attempts: 2, latency_ms: 100, fidelity: { status: 'ACCEPT', score: 99, reason: 'preservado' },
    })
    mocks.fetchImageSafely.mockResolvedValue({
      buffer: Buffer.from('reference-bytes'), mime_type: 'image/jpeg', width: 800, height: 800,
      final_url: 'https://source.example/product.jpg',
    })
    mocks.createReferenceAsset.mockResolvedValue(reference)
    mocks.editProductImage.mockResolvedValue({
      buffer: Buffer.from('generated-cover-bytes'), mime_type: 'image/png', provider: 'gemini', model: 'gemini-3-pro-image',
      attempts: 1, latency_ms: 100, prompt_hash: 'cover-prompt-hash', source_sha256: 'reference-hash',
      output_sha256: 'cover-output-hash',
    })
    mocks.generateProductImage.mockResolvedValue({
      buffer: Buffer.from('generated-bytes'), mime_type: 'image/png', provider: 'gemini', model: 'gemini-3-pro-image',
      attempts: 1, latency_ms: 100, prompt_hash: 'prompt-hash', truth_brief_hash: 'brief-hash',
      source_sha256: 'reference-hash', output_sha256: 'provider-output-hash',
    })
    mocks.normalizeProductImage.mockResolvedValue({
      buffer: Buffer.from('normalized-generated'), mime_type: 'image/jpeg', width: 1200, height: 1200,
      source: { width: 1024, height: 1024, format: 'png' },
    })
    mocks.createSafeCropVariants.mockImplementation(async (_buffer, count) => Array.from({ length: count }, (_, index) => ({
      key: `crop-${index + 1}`,
      buffer: Buffer.from(`crop-${index + 1}`),
      mime_type: 'image/jpeg' as const,
      width: 1200 as const,
      height: 1200 as const,
    })))
    mocks.verifyImageFidelity.mockResolvedValue({
      status: 'ACCEPT', score: 99, reason: 'Produto preservado.', reason_codes: ['BACKGROUND_LIGHTING_ONLY'],
    })
    mocks.verifyGeneratedImage.mockResolvedValue({
      status: 'ACCEPT', score: 96, reason: 'Briefing preservado.', reason_codes: ['FACTUAL_BRIEF_MATCH'],
    })
    mocks.createGeneratedAsset.mockResolvedValue(generated)
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

  it('gera capa revisável usando a imagem da URL somente como referência', async () => {
    const gallery = await buildGeneratedListingGallery({
      userId: 'user-1',
      analysisId: 'analysis-1',
      productName: 'Controle Sony DualSense',
      facts: [{ label: 'Cor', value: 'Branco' }],
      referenceUrls: ['https://source.example/product.jpg'],
      config: null,
      generationEnabled: true,
    })

    expect(mocks.createReferenceAsset).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', rights_status: 'REFERENCE_ONLY', source_url: 'https://source.example/product.jpg',
    }))
    expect(mocks.generateProductImage).toHaveBeenCalledWith(expect.objectContaining({
      productName: 'Controle Sony DualSense',
      reference: { buffer: Buffer.from('reference-bytes'), mime_type: 'image/jpeg' },
    }))
    expect(mocks.verifyImageFidelity).toHaveBeenCalledWith(expect.objectContaining({
      original: Buffer.from('reference-bytes'),
      candidate: Buffer.from('normalized-generated'),
      productName: 'Controle Sony DualSense',
    }))
    expect(gallery).toMatchObject({
      outcome: 'generated_pending_review',
      reviewRequiredAssetIds: ['generated-1'],
      urls: ['https://cdn.example/generated.jpg'],
    })
    expect(gallery.images[0]).toMatchObject({
      asset_id: 'generated-1', source: 'AI_GENERATED', label: 'Gerada por IA', parent_asset_id: 'reference-1',
    })
  })

  it('rejeita capa baseada em URL quando o produto visual foi alterado', async () => {
    mocks.verifyImageFidelity.mockResolvedValue({
      status: 'REJECT', score: 45, reason: 'Formato e controles mudaram.', reason_codes: ['GEOMETRY_CHANGED'],
    })

    const gallery = await buildGeneratedListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', productName: 'Controle Sony DualSense',
      facts: [{ label: 'Cor', value: 'Branco' }], referenceUrls: ['https://source.example/product.jpg'],
      config: null, generationEnabled: true,
    })

    expect(gallery).toMatchObject({ outcome: 'generation_failed', images: [], urls: [] })
    expect(gallery.warning).toContain('não preservou')
    expect(mocks.createGeneratedAsset).not.toHaveBeenCalled()
    expect(mocks.finishImageOperation).toHaveBeenCalledWith('operation-1', 'user-1', expect.objectContaining({
      status: 'REJECTED', error_code: 'GENERATED_FIDELITY_REJECTED',
    }))
  })

  it('tenta a próxima referência exata quando a primeira capa diverge', async () => {
    mocks.verifyImageFidelity
      .mockResolvedValueOnce({ status: 'REJECT', score: 30, reason: 'Produto alterado.', reason_codes: ['PRODUCT_CHANGED'] })
      .mockResolvedValueOnce({ status: 'ACCEPT', score: 99, reason: 'Produto preservado.', reason_codes: [] })

    const gallery = await buildGeneratedListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', productName: 'Caneta Kitest',
      facts: [{ label: 'Modelo', value: 'KA-250' }],
      referenceUrls: ['https://source.example/first.jpg', 'https://source.example/second.jpg'],
      config: null, generationEnabled: true,
      shot: { order: 1, title: 'Foto principal', description: 'Fundo branco', required: true },
    })

    expect(mocks.fetchImageSafely).toHaveBeenNthCalledWith(1, 'https://source.example/first.jpg')
    expect(mocks.fetchImageSafely).toHaveBeenNthCalledWith(2, 'https://source.example/second.jpg')
    expect(mocks.editProductImage).toHaveBeenCalledTimes(2)
    expect(gallery.outcome).toBe('generated_pending_review')
  })

  it('usa foto de produto exato do mercado como base quando a entrada foi uma foto', async () => {
    const gallery = await buildAnalysisListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', inputType: 'photo', renditionAssetIds: [fallback.id],
      referenceUrls: ['https://source.example/product.jpg'], productName: 'Caneta Kitest',
      facts: [{ label: 'Modelo', value: 'KA-250' }], identityReady: true, config: null, imageAIEnabled: true,
    })

    expect(mocks.fetchImageSafely).toHaveBeenCalledWith('https://source.example/product.jpg')
    expect(mocks.generateProductImage).toHaveBeenCalledWith(expect.objectContaining({
      reference: { buffer: Buffer.from('reference-bytes'), mime_type: 'image/jpeg' },
    }))
    expect(mocks.preparePublicationImage).not.toHaveBeenCalled()
    expect(gallery).toMatchObject({ outcome: 'generated_pending_review', urls: ['https://cdn.example/generated.jpg'] })
  })

  it('usa a foto própria como âncora quando o mercado não tem referência exata', async () => {
    mocks.createGeneratedAsset.mockImplementation(async input => ({ ...generated, parent_asset_id: input.parent_asset_id }))
    const imagePlan = [
      { order: 1, title: 'Foto principal', description: 'Fundo branco', required: true },
      { order: 2, title: 'Vista complementar', description: 'Produto exato', required: true },
      { order: 3, title: 'Detalhe', description: 'Detalhe visível', required: true },
      { order: 4, title: 'Em uso', description: 'Contexto real', required: false },
      { order: 5, title: 'Acabamento', description: 'Textura visível', required: false },
    ]

    const gallery = await buildAnalysisListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', inputType: 'photo', renditionAssetIds: [fallback.id],
      referenceUrls: [], productName: 'Produto identificado', facts: [{ label: 'Modelo', value: 'ABC' }],
      identityReady: true, config: null, imageAIEnabled: true, imagePlan,
    })

    expect(mocks.downloadOwnedImageAsset).toHaveBeenCalledWith('user-1', original.id)
    expect(mocks.editProductImage).toHaveBeenCalledWith(expect.objectContaining({
      source: Buffer.from('original-bytes'), mime_type: fallback.mime_type, mode: 'COVER_CLEANUP',
    }))
    expect(mocks.createReferenceAsset).not.toHaveBeenCalled()
    expect(gallery.outcome).toBe('generated_pending_review')
  })

  it('mantém a foto própria como capa quando a edição da capa é rejeitada', async () => {
    let generatedIndex = 0
    mocks.editProductImage.mockImplementation(async input => ({
      buffer: Buffer.from(input.mode === 'COVER_CLEANUP' ? 'bad-cover' : `detail-${input.shot.order}`),
      mime_type: 'image/png', provider: 'gemini', model: 'gemini-3-pro-image', attempts: 1, latency_ms: 10,
      prompt_hash: 'prompt-hash', source_sha256: 'source-hash', output_sha256: 'output-hash',
    }))
    mocks.normalizeProductImage.mockImplementation(async buffer => ({
      buffer, mime_type: 'image/jpeg', width: 1200, height: 1200, source: { width: 800, height: 800, format: 'png' },
    }))
    mocks.verifyImageFidelity.mockImplementation(async input => input.candidate.toString() === 'bad-cover'
      ? { status: 'REJECT', score: 20, reason: 'Capa alterada.', reason_codes: ['PRODUCT_CHANGED'] }
      : { status: 'ACCEPT', score: 99, reason: 'Preservado.', reason_codes: [] })
    mocks.createGeneratedAsset.mockImplementation(async input => ({
      ...generated, id: `generated-${++generatedIndex}`, public_url: `https://cdn.example/generated-${generatedIndex}.jpg`,
      parent_asset_id: input.parent_asset_id, metadata: input.metadata,
    }))
    const imagePlan = [
      { order: 1, title: 'Foto principal', description: 'Fundo branco', required: true },
      { order: 2, title: 'Detalhe 1', description: 'Recorte seguro', required: true },
      { order: 3, title: 'Detalhe 2', description: 'Recorte seguro', required: true },
      { order: 4, title: 'Detalhe 3', description: 'Recorte seguro', required: false },
      { order: 5, title: 'Detalhe 4', description: 'Recorte seguro', required: false },
    ]

    const gallery = await buildAnalysisListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', inputType: 'photo', renditionAssetIds: [fallback.id],
      referenceUrls: [], productName: 'Produto identificado', facts: [{ label: 'Modelo', value: 'ABC' }],
      identityReady: true, config: null, imageAIEnabled: true, imagePlan,
    })

    expect(gallery.images).toHaveLength(5)
    expect(gallery.images[0]).toMatchObject({ asset_id: fallback.id, role: 'MAIN', source: 'USER' })
    expect(gallery.reviewRequiredAssetIds).toHaveLength(4)
  })

  it('inclui a foto própria para completar o plano quando uma secundária é rejeitada', async () => {
    let generatedIndex = 0
    mocks.editProductImage.mockImplementation(async input => ({
      buffer: Buffer.from(`shot-${input.shot.order}`),
      mime_type: 'image/png', provider: 'gemini', model: 'gemini-3-pro-image', attempts: 1, latency_ms: 10,
      prompt_hash: 'prompt-hash', source_sha256: 'source-hash', output_sha256: 'output-hash',
    }))
    mocks.normalizeProductImage.mockImplementation(async buffer => ({
      buffer, mime_type: 'image/jpeg', width: 1200, height: 1200, source: { width: 800, height: 800, format: 'png' },
    }))
    mocks.verifyImageFidelity.mockImplementation(async input => input.candidate.toString() === 'shot-4'
      ? { status: 'REJECT', score: 20, reason: 'Produto alterado.', reason_codes: ['PRODUCT_CHANGED'] }
      : { status: 'ACCEPT', score: 99, reason: 'Preservado.', reason_codes: [] })
    mocks.createGeneratedAsset.mockImplementation(async input => ({
      ...generated, id: `generated-${++generatedIndex}`, public_url: `https://cdn.example/generated-${generatedIndex}.jpg`,
      parent_asset_id: input.parent_asset_id, metadata: input.metadata,
    }))
    const imagePlan = [
      { order: 1, title: 'Foto principal', description: 'Fundo branco', required: true },
      { order: 2, title: 'Detalhe 1', description: 'Recorte seguro', required: true },
      { order: 3, title: 'Detalhe 2', description: 'Recorte seguro', required: true },
      { order: 4, title: 'Detalhe 3', description: 'Recorte seguro', required: false },
      { order: 5, title: 'Detalhe 4', description: 'Recorte seguro', required: false },
    ]

    const gallery = await buildAnalysisListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', inputType: 'photo', renditionAssetIds: [fallback.id],
      referenceUrls: [], productName: 'Produto identificado', facts: [{ label: 'Modelo', value: 'ABC' }],
      identityReady: true, config: null, imageAIEnabled: true, imagePlan,
    })

    expect(gallery.images).toHaveLength(5)
    expect(gallery.images[0]).toMatchObject({ asset_id: 'generated-1', role: 'MAIN' })
    expect(gallery.images[4]).toMatchObject({ asset_id: fallback.id, role: 'DETAIL', source: 'USER' })
    expect(gallery.reviewRequiredAssetIds).toHaveLength(4)
  })

  it('completa a galeria com recortes locais quando o provedor de imagem está indisponível', async () => {
    let derivedIndex = 0
    mocks.editProductImage.mockRejectedValue(new Error('HTTP 429'))
    mocks.createDerivedAsset.mockImplementation(async input => ({
      ...fallback,
      id: `safe-crop-${++derivedIndex}`,
      public_url: `https://cdn.example/safe-crop-${derivedIndex}.jpg`,
      parent_asset_id: input.parent_asset_id,
      metadata: input.metadata || {},
    }))
    const imagePlan = [
      { order: 1, title: 'Foto principal', description: 'Fundo branco', required: true },
      { order: 2, title: 'Detalhe 1', description: 'Recorte seguro', required: true },
      { order: 3, title: 'Detalhe 2', description: 'Recorte seguro', required: true },
      { order: 4, title: 'Detalhe 3', description: 'Recorte seguro', required: false },
      { order: 5, title: 'Detalhe 4', description: 'Recorte seguro', required: false },
    ]

    const gallery = await buildAnalysisListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', inputType: 'photo', renditionAssetIds: [fallback.id],
      referenceUrls: [], productName: 'Produto identificado', facts: [{ label: 'Modelo', value: 'ABC' }],
      identityReady: true, config: null, imageAIEnabled: true, imagePlan,
    })

    expect(gallery.images).toHaveLength(5)
    expect(gallery.images.map(image => image.source)).toEqual(['USER', 'USER', 'USER', 'USER', 'USER'])
    expect(gallery.images.map(image => image.label)).toEqual([
      'Original normalizada',
      'Recorte da foto original',
      'Recorte da foto original',
      'Recorte da foto original',
      'Recorte da foto original',
    ])
    expect(gallery.reviewRequiredAssetIds).toEqual([])
    expect(gallery.outcome).toBe('normalized_fallback')
    expect(mocks.createSafeCropVariants).toHaveBeenCalledWith(Buffer.from('original-bytes'), 4)
  })

  it('gera uma galeria completa seguindo o plano visual', async () => {
    let generatedIndex = 0
    mocks.createGeneratedAsset.mockImplementation(async input => {
      generatedIndex += 1
      return {
        ...generated,
        id: `generated-${generatedIndex}`,
        public_url: `https://cdn.example/generated-${generatedIndex}.jpg`,
        parent_asset_id: input.parent_asset_id,
        metadata: input.metadata,
      }
    })
    const imagePlan = [
      { order: 1, title: 'Foto principal', description: 'Produto centralizado em fundo branco', required: true },
      { order: 2, title: 'Ângulo lateral', description: 'Formato do produto', required: true },
      { order: 3, title: 'Detalhe técnico', description: 'Controles visíveis', required: true },
      { order: 4, title: 'Em uso', description: 'Aplicação real confirmada', required: false },
      { order: 5, title: 'Conteúdo da embalagem', description: 'Produto e acessórios inclusos', required: false },
    ]

    const gallery = await buildAnalysisListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', inputType: 'description', renditionAssetIds: [],
      referenceUrls: ['https://source.example/front.jpg', 'https://source.example/side.jpg'],
      productName: 'Caneta Kitest', facts: [{ label: 'Modelo', value: 'KA-250' }],
      identityReady: true, config: null, imageAIEnabled: true, imagePlan, maxPictures: 6,
    })

    expect(gallery.images).toHaveLength(5)
    expect(gallery.images.map(image => image.role)).toEqual(['MAIN', 'DETAIL', 'DETAIL', 'LIFESTYLE', 'DETAIL'])
    expect(gallery.reviewRequiredAssetIds).toHaveLength(5)
    expect(mocks.editProductImage).toHaveBeenCalledTimes(5)
    expect(mocks.editProductImage).toHaveBeenCalledWith(expect.objectContaining({ mode: 'COVER_CLEANUP' }))
    expect(mocks.editProductImage).toHaveBeenCalledWith(expect.objectContaining({ mode: 'DETAIL_CLEANUP', shot: imagePlan[1] }))
    expect(mocks.editProductImage).toHaveBeenCalledWith(expect.objectContaining({ shot: imagePlan[3] }))
    expect(mocks.editProductImage).toHaveBeenCalledWith(expect.objectContaining({ shot: expect.objectContaining({ title: 'Acabamento' }) }))
    expect(mocks.generateProductImage).not.toHaveBeenCalled()
  })

  it('exige revisão humana reforçada quando o gate da referência fica indisponível', async () => {
    mocks.verifyImageFidelity.mockResolvedValue({
      status: 'REVIEW', score: 0, reason: 'Gate indisponível.', reason_codes: ['GATE_UNAVAILABLE'],
    })

    const gallery = await buildGeneratedListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', productName: 'Controle Sony DualSense',
      facts: [{ label: 'Cor', value: 'Branco' }], referenceUrls: ['https://source.example/product.jpg'],
      config: null, generationEnabled: true,
    })

    expect(gallery).toMatchObject({ outcome: 'generated_pending_review', reviewRequiredAssetIds: ['generated-1'] })
    expect(gallery.warning).toContain('validação automática')
    expect(mocks.createGeneratedAsset).toHaveBeenCalled()
  })

  it('gera capa por descrição sem inventar um asset pai', async () => {
    mocks.createGeneratedAsset.mockResolvedValue({ ...generated, parent_asset_id: null })

    const gallery = await buildGeneratedListingGallery({
      userId: 'user-1',
      analysisId: 'analysis-1',
      productName: 'Processador AMD Ryzen 5 5500',
      facts: [{ label: 'Modelo', value: 'Ryzen 5 5500' }],
      referenceUrls: [],
      config: null,
      generationEnabled: true,
    })

    expect(mocks.fetchImageSafely).not.toHaveBeenCalled()
    expect(mocks.generateProductImage).toHaveBeenCalledWith(expect.objectContaining({ reference: undefined }))
    expect(mocks.verifyGeneratedImage).toHaveBeenCalledWith(expect.objectContaining({
      candidate: Buffer.from('normalized-generated'), productName: 'Processador AMD Ryzen 5 5500',
    }))
    expect(mocks.createGeneratedAsset).toHaveBeenCalledWith(expect.objectContaining({ parent_asset_id: undefined }))
    expect(gallery.images[0]).toMatchObject({ source: 'AI_GENERATED', parent_asset_id: null })
  })

  it('não expõe imagem textual que contradiz o briefing confirmado', async () => {
    mocks.verifyGeneratedImage.mockResolvedValue({
      status: 'REJECT', score: 55, reason: 'Marca divergente.', reason_codes: ['FACTS_CONTRADICTED'],
    })

    const gallery = await buildGeneratedListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', productName: 'Processador AMD Ryzen 5 5500',
      facts: [{ label: 'Marca', value: 'AMD' }], referenceUrls: [], config: null, generationEnabled: true,
    })

    expect(gallery).toMatchObject({ outcome: 'generation_failed', images: [], urls: [] })
    expect(gallery.warning).toContain('briefing confirmado')
    expect(mocks.createGeneratedAsset).not.toHaveBeenCalled()
  })

  it('mantém revisão humana obrigatória quando o gate textual fica indisponível', async () => {
    mocks.createGeneratedAsset.mockResolvedValue({ ...generated, parent_asset_id: null })
    mocks.verifyGeneratedImage.mockResolvedValue({
      status: 'REVIEW', score: 0, reason: 'Gate indisponível.', reason_codes: ['GATE_UNAVAILABLE'],
    })

    const gallery = await buildGeneratedListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', productName: 'Processador AMD Ryzen 5 5500',
      facts: [{ label: 'Marca', value: 'AMD' }], referenceUrls: [], config: null, generationEnabled: true,
    })

    expect(gallery).toMatchObject({ outcome: 'generated_pending_review', reviewRequiredAssetIds: ['generated-1'] })
    expect(mocks.createGeneratedAsset).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ fidelity: expect.objectContaining({ status: 'REVIEW' }), review_required: true }),
    }))
  })

  it('retorna erro explícito em vez de esconder uma galeria vazia', async () => {
    mocks.generateProductImage.mockRejectedValue(new Error('provider unavailable'))

    const gallery = await buildGeneratedListingGallery({
      userId: 'user-1',
      analysisId: 'analysis-1',
      productName: 'Processador AMD Ryzen 5 5500',
      facts: [{ label: 'Modelo', value: 'Ryzen 5 5500' }],
      referenceUrls: [],
      config: null,
      generationEnabled: true,
    })

    expect(gallery).toMatchObject({
      outcome: 'generation_failed', images: [], urls: [], reviewRequiredAssetIds: [],
    })
    expect(gallery.warning).toContain('Não foi possível gerar')
    expect(mocks.finishImageOperation).toHaveBeenCalledWith('operation-1', 'user-1', expect.objectContaining({
      status: 'FAILED', error_code: 'AI_GENERATION_FAILED',
    }))
  })

  it('pede referência visual em vez de inventar produto por descrição', async () => {
    mocks.createGeneratedAsset.mockResolvedValue({ ...generated, parent_asset_id: null })

    const gallery = await buildAnalysisListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', inputType: 'description', renditionAssetIds: [], referenceUrls: [],
      productName: 'Processador AMD Ryzen 5 5500', facts: [{ label: 'Modelo', value: 'Ryzen 5 5500' }],
      identityReady: true, config: null, imageAIEnabled: true,
    })

    expect(gallery).toMatchObject({ outcome: 'identity_required', images: [], urls: [] })
    expect(gallery.warning).toMatch(/foto|referência visual/i)
    expect(mocks.generateProductImage).not.toHaveBeenCalled()
  })

  it('explica quais dados faltam antes de gerar imagem por descrição', async () => {
    const gallery = await buildAnalysisListingGallery({
      userId: 'user-1', analysisId: 'analysis-1', inputType: 'description', renditionAssetIds: [], referenceUrls: [],
      productName: 'Produto não identificado', facts: [], identityReady: false, config: null, imageAIEnabled: true,
    })

    expect(gallery).toMatchObject({ outcome: 'identity_required', images: [], urls: [] })
    expect(gallery.warning).toContain('identidade')
    expect(mocks.generateProductImage).not.toHaveBeenCalled()
  })
})
