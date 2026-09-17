import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { mocks } = vi.hoisted(() => ({
  mocks: {
    searchMarketplaceVisualReferences: vi.fn(),
    searchWeb: vi.fn(),
    discoverWebImageCandidates: vi.fn(),
    fetchImageSafely: vi.fn(),
    createReferenceAsset: vi.fn(),
    getOwnedAssets: vi.fn(),
  },
}))

vi.mock('../research', () => ({
  searchMarketplaceVisualReferences: mocks.searchMarketplaceVisualReferences,
}))
vi.mock('../websearch', () => ({ searchWeb: mocks.searchWeb }))
vi.mock('../web-image-discovery', () => ({ discoverWebImageCandidates: mocks.discoverWebImageCandidates }))
vi.mock('../safe-image-fetch', () => ({ fetchImageSafely: mocks.fetchImageSafely }))
vi.mock('../image-assets', () => ({
  createReferenceAsset: mocks.createReferenceAsset,
  getOwnedAssets: mocks.getOwnedAssets,
}))

import { evaluateMatch } from '../matching'
import {
  acquireVisualReferences,
  evaluateVisualReference,
  type VisualReferenceCandidate,
} from '../visual-references'
import type { CreateReferenceAssetInput, ImageAsset } from '../image-assets'
import type { ProductTruth } from '../truth'

function truth(overrides: Partial<ProductTruth> = {}): ProductTruth {
  return {
    name: 'Parafusadeira Fulink FK-80PT Azul 20V',
    fields: {
      brand: { value: 'Fulink', confidence: 'confirmed', source: 'ml_item', evidence: 'Marca oficial' },
      model: { value: 'FK-80PT', confidence: 'confirmed', source: 'ml_item', evidence: 'Modelo oficial' },
      color: { value: 'Azul', confidence: 'confirmed', source: 'ml_item', evidence: 'Variação oficial' },
      voltage: { value: '20 V', confidence: 'confirmed', source: 'ml_item', evidence: 'Variação oficial' },
    },
    uncertain: [],
    evidence: ['Anúncio de origem'],
    confidence: 0.95,
    source_item_id: 'MLB54005757',
    source_catalog_product_id: 'MLB54005757',
    ...overrides,
  }
}

function candidate(overrides: Partial<VisualReferenceCandidate> = {}): VisualReferenceCandidate {
  return {
    source: 'ML_COMPETITOR',
    image_url: 'https://http2.mlstatic.com/furadeira.jpg',
    title: 'Parafusadeira Fulink FK-80PT Azul 20V',
    attributes: { BRAND: 'Fulink', MODEL: 'FK-80PT', COLOR: 'Azul', VOLTAGE: '20 V' },
    source_item_id: 'MLB99999999',
    source_catalog_product_id: 'MLB99999999',
    source_page_url: null,
    ...overrides,
  }
}

function imageAsset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'asset-1',
    user_id: 'user-1',
    analysis_id: 'analysis-1',
    kind: 'SOURCE_REFERENCE',
    origin: 'COMPETITOR',
    rights_status: 'REFERENCE_ONLY',
    storage_bucket: 'assertive-originals',
    storage_key: 'user-1/reference.jpg',
    public_url: null,
    sha256: 'sha-1',
    mime_type: 'image/jpeg',
    width: 800,
    height: 800,
    byte_size: 100,
    parent_asset_id: null,
    provider: null,
    model: null,
    fidelity_status: null,
    metadata: {},
    created_at: '2026-09-12T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.searchMarketplaceVisualReferences.mockResolvedValue([])
  mocks.searchWeb.mockResolvedValue({ available: false, content: '', sources: [], queries: [] })
  mocks.discoverWebImageCandidates.mockResolvedValue([])
  mocks.getOwnedAssets.mockResolvedValue([])
  mocks.fetchImageSafely.mockImplementation(async (source: string) => ({
    buffer: Buffer.from(source),
    mime_type: 'image/jpeg',
    width: 800,
    height: 800,
    final_url: source,
  }))
  mocks.createReferenceAsset.mockImplementation(async (input: CreateReferenceAssetInput) => imageAsset({
    id: `asset-${input.origin.toLowerCase()}-${input.sha256.slice(0, 6)}`,
    origin: input.origin,
    storage_key: input.storage_key,
    sha256: input.sha256,
    mime_type: input.mime_type,
    width: input.width,
    height: input.height,
    byte_size: input.bytes.byteLength,
    metadata: { ...input.metadata, source_url: input.source_url },
  }))
})

describe('visual reference identity boundary', () => {
  it.each([
    ['preta', 'Preto', '1 litro', '1000 mL', true],
    ['preta', 'Preto', '1,5 L', '1500 ml', true],
    ['preta', 'Branco', '1 litro', '1000 mL', false],
    ['preta', 'Preto', '1 litro', '500 mL', false],
    ['preta', 'Preto fosco', '1 litro', '1000 mL', false],
  ])('compares equivalent variants without accepting a different product: %s/%s %s/%s', (color, otherColor, capacity, otherCapacity, accepted) => {
    const product = truth({ fields: {
      ...truth().fields,
      color: { value: color, confidence: 'confirmed', source: 'user', evidence: 'seller' },
      capacity: { value: capacity, confidence: 'confirmed', source: 'user', evidence: 'seller' },
    } })
    const reference = candidate({ attributes: { ...candidate().attributes, COLOR: otherColor, CAPACITY: otherCapacity } })
    expect(evaluateVisualReference(product, reference).accepted).toBe(accepted)
  })

  it('accepts official source pictures without requiring copy-qualified facts', () => {
    const result = evaluateVisualReference(truth(), candidate({
      source: 'ML_SOURCE',
      source_item_id: 'MLB54005757',
      source_catalog_product_id: 'MLB54005757',
      title: null,
      attributes: {},
    }))

    expect(result).toMatchObject({ accepted: true, confidence: 1 })
    expect(result.reason_codes).toContain('SOURCE_ITEM_EXACT')
  })

  it('accepts a visually identified source while factual matching remains unchanged', () => {
    const sparseTruth = truth({ fields: {} })
    const visualCandidate = candidate({
      source: 'ML_SOURCE',
      source_item_id: sparseTruth.source_item_id,
      title: null,
      attributes: {},
    })

    expect(evaluateMatch(sparseTruth, {
      title: visualCandidate.title,
      attributes: visualCandidate.attributes,
      catalog_product_id: visualCandidate.source_catalog_product_id,
    }).usable_as_fact_source).toBe(false)
    expect(evaluateVisualReference(sparseTruth, visualCandidate)).toMatchObject({ accepted: true })
  })

  it('accepts strong identifiers and normalized model text', () => {
    const gtinTruth = truth({
      fields: {
        ...truth().fields,
        gtin: { value: '7891234567890', confidence: 'confirmed', source: 'photo', evidence: 'EAN' },
      },
    })

    expect(evaluateVisualReference(gtinTruth, candidate({
      attributes: { GTIN: '7891234567890', COLOR: 'Azul', VOLTAGE: '20V' },
    }))).toMatchObject({ accepted: true, confidence: 0.98 })
    expect(evaluateVisualReference(truth(), candidate({
      source: 'WEB',
      source_item_id: null,
      source_catalog_product_id: null,
      title: 'Loja oficial: Parafusadeira Fulink FK80PT profissional',
      attributes: {},
    }))).toMatchObject({ accepted: true, confidence: 0.82 })
  })

  it('rejects a confirmed variant conflict even when brand and model match', () => {
    const result = evaluateVisualReference(truth(), candidate({
      title: 'Parafusadeira Fulink FK-80PT Vermelha 127V',
      attributes: { BRAND: 'Fulink', MODEL: 'FK-80PT', COLOR: 'Vermelho', VOLTAGE: '127 V' },
    }))

    expect(result.accepted).toBe(false)
    expect(result.reason_codes).toContain('VARIANT_CONFLICT')
    expect(result.conflicts).toEqual(['Cor', 'Voltagem'])
  })

  it('rejects candidates supported only by a shared brand', () => {
    const result = evaluateVisualReference(truth(), candidate({
      title: 'Parafusadeira Fulink XPTO 12V',
      attributes: { BRAND: 'Fulink', MODEL: 'XPTO', VOLTAGE: '12 V' },
    }))

    expect(result).toMatchObject({ accepted: false, confidence: 0 })
  })

  it('does not treat a longer brand name as an exact brand match', () => {
    const result = evaluateVisualReference(truth(), candidate({
      title: 'Parafusadeira FulinkPro FK-80PT Azul 20V',
      attributes: { BRAND: 'FulinkPro', MODEL: 'FK-80PT', COLOR: 'Azul', VOLTAGE: '20 V' },
      source_item_id: null,
      source_catalog_product_id: null,
    }))

    expect(result).toMatchObject({ accepted: false, confidence: 0 })
  })

  it('rejects a model whose confirmed identifier is only a prefix of another variant', () => {
    const processorTruth = truth({
      name: 'Processador AMD Ryzen 5 5500',
      source_item_id: undefined,
      source_catalog_product_id: undefined,
      fields: {
        brand: { value: 'AMD', confidence: 'confirmed', source: 'description', evidence: 'AMD' },
        model: { value: 'Ryzen 5 5500', confidence: 'confirmed', source: 'description', evidence: 'Ryzen 5 5500' },
      },
    })

    expect(evaluateVisualReference(processorTruth, candidate({
      source: 'WEB',
      source_item_id: null,
      source_catalog_product_id: null,
      title: 'Processador AMD Ryzen 5 5500G com gráficos integrados',
      attributes: {},
    }))).toMatchObject({ accepted: false, confidence: 0 })

    expect(evaluateVisualReference(processorTruth, candidate({
      source: 'WEB',
      source_item_id: null,
      source_catalog_product_id: null,
      title: 'Processador AMD Ryzen 5 5500G',
      attributes: { BRAND: 'AMD', MODEL: 'Ryzen 5 5500G' },
    }))).toMatchObject({ accepted: false, confidence: 0 })
  })
})

describe('visual reference acquisition', () => {
  it('discovers reference images directly from an API-restricted source page', async () => {
    const sourcePage = 'https://produto.mercadolivre.com.br/MLB-5997713980-tenis-adidas-grand-court-_JM'
    mocks.discoverWebImageCandidates.mockImplementation(async (url: string) => (
      url === sourcePage ? ['https://http2.mlstatic.com/source-page-image.jpg'] : []
    ))

    const assets = await acquireVisualReferences({
      userId: 'user-1',
      analysisId: 'analysis-1',
      token: 'ml-token',
      truth: truth({
        source_item_id: 'MLB5997713980',
        source_catalog_product_id: undefined,
        source_permalink: sourcePage,
        source_title: 'Tênis Adidas Grand Court Base 3.0',
        source_pictures: [],
      }),
      maxAssets: 8,
    })

    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({
      origin: 'WEB_REFERENCE',
      rights_status: 'REFERENCE_ONLY',
      metadata: {
        source_page_url: sourcePage,
        source_item_id: 'MLB5997713980',
        identity_confidence: 1,
      },
    })
  })

  it('uses external composition references without substituting the seller identification photo', async () => {
    mocks.searchMarketplaceVisualReferences.mockResolvedValue([
      candidate({ source: 'ML_CATALOG', image_url: 'https://ml.example/catalog.jpg' }),
      candidate({ source: 'ML_SOURCE', image_url: 'https://ml.example/source.jpg', source_item_id: 'MLB54005757' }),
      candidate({ source: 'ML_COMPETITOR', image_url: 'https://ml.example/competitor.jpg' }),
    ])
    mocks.getOwnedAssets.mockResolvedValue([imageAsset({
      id: 'own-reference',
      kind: 'ORIGINAL_EVIDENCE',
      origin: 'USER_UPLOAD',
      rights_status: 'USER_OWNED',
      sha256: 'own-sha',
    })])

    const assets = await acquireVisualReferences({
      userId: 'user-1',
      analysisId: 'analysis-1',
      token: 'ml-token',
      truth: truth(),
      ownAssetIds: ['own-reference'],
      maxAssets: 8,
    })

    expect(assets.map(asset => asset.origin)).toEqual([
      'COMPETITOR',
      'ML_OWN_ITEM',
      'ML_CATALOG',
    ])
    expect(mocks.searchWeb).not.toHaveBeenCalled()
    expect(mocks.createReferenceAsset.mock.calls.map(([input]) => input.origin)).toEqual([
      'COMPETITOR',
      'ML_OWN_ITEM',
      'ML_CATALOG',
    ])
  })

  it('keeps the reference budget for external images rather than the seller input', async () => {
    mocks.searchMarketplaceVisualReferences.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => candidate({
        image_url: `https://ml.example/competitor-${index}.jpg`,
        source_item_id: `MLB-EXTERNAL-${index}`,
        source_catalog_product_id: `MLB-CATALOG-${index}`,
      }))
    )
    mocks.getOwnedAssets.mockResolvedValue([imageAsset({
      id: 'own-reference',
      kind: 'PUBLICATION_RENDITION',
      origin: 'USER_UPLOAD',
      rights_status: 'USER_OWNED',
      sha256: 'own-sha',
      parent_asset_id: 'own-original',
      public_url: 'https://cdn.example/own.jpg',
      fidelity_status: 'ACCEPT',
    })])

    const assets = await acquireVisualReferences({
      userId: 'user-1',
      analysisId: 'analysis-1',
      token: 'ml-token',
      truth: truth(),
      ownAssetIds: ['own-reference'],
      maxAssets: 8,
    })

    expect(assets).toHaveLength(8)
    expect(assets[0].origin).toBe('COMPETITOR')
    expect(assets.map(asset => asset.id)).not.toContain('own-reference')
    expect(mocks.getOwnedAssets).not.toHaveBeenCalled()
  })

  it('does not silently use seller uploads when no external reference exists', async () => {
    mocks.getOwnedAssets.mockResolvedValue([imageAsset({ id: 'own-reference', origin: 'USER_UPLOAD', kind: 'ORIGINAL_EVIDENCE', rights_status: 'USER_OWNED' })])
    const assets = await acquireVisualReferences({ userId: 'user-1', analysisId: 'analysis-1', token: 'ml-token', truth: truth(), ownAssetIds: ['own-reference'] })
    expect(assets).toEqual([])
    expect(mocks.getOwnedAssets).not.toHaveBeenCalled()
  })

  it('falls back to exact web pages, rejects tiny images and deduplicates bytes', async () => {
    mocks.searchMarketplaceVisualReferences.mockResolvedValue([
      candidate({ source: 'ML_COMPETITOR', image_url: 'https://ml.example/competitor.jpg' }),
    ])
    mocks.searchWeb.mockResolvedValue({
      available: true,
      content: '',
      queries: ['Fulink FK-80PT'],
      sources: [{
        title: 'Fulink FK80PT - fabricante',
        url: 'https://fulink.example/fk80pt',
        snippet: 'Parafusadeira Fulink FK-80PT Azul 20V',
      }],
    })
    mocks.discoverWebImageCandidates.mockResolvedValue([
      'https://fulink.example/tiny.jpg',
      'https://fulink.example/front.jpg',
      'https://fulink.example/front-copy.jpg',
    ])
    mocks.fetchImageSafely.mockImplementation(async (source: string) => ({
      buffer: source.includes('front') ? Buffer.from('same-image') : Buffer.from('tiny'),
      mime_type: 'image/jpeg',
      width: source.includes('tiny') ? 120 : 900,
      height: source.includes('tiny') ? 120 : 900,
      final_url: source,
    }))

    const assets = await acquireVisualReferences({
      userId: 'user-1',
      analysisId: 'analysis-1',
      token: 'ml-token',
      truth: truth(),
      maxAssets: 8,
    })

    expect(mocks.searchWeb).toHaveBeenCalledWith(expect.stringContaining('Fulink FK-80PT'), 6)
    expect(mocks.discoverWebImageCandidates).toHaveBeenCalledWith('https://fulink.example/fk80pt')
    expect(assets.map(asset => asset.origin)).toEqual(['COMPETITOR', 'WEB_REFERENCE'])
    expect(mocks.createReferenceAsset).toHaveBeenCalledTimes(2)
    expect(mocks.createReferenceAsset).toHaveBeenLastCalledWith(expect.objectContaining({
      origin: 'WEB_REFERENCE',
      rights_status: 'REFERENCE_ONLY',
      metadata: expect.objectContaining({
        source_page_url: 'https://fulink.example/fk80pt',
        identity_confidence: 0.82,
      }),
    }))
  })
})
