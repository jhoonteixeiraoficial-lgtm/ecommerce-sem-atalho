import { beforeEach, describe, expect, it, vi } from 'vitest'

const runTaskJsonWithMeta = vi.hoisted(() => vi.fn())
vi.mock('../ai-router', () => ({ runTaskJsonWithMeta }))

import { verifyGeneratedImage, verifyImageFidelity, verifyReferenceGuidedImage } from '../image-fidelity'

const accepted = {
  same_product: true,
  geometry_preserved: true,
  color_preserved: true,
  material_texture_preserved: true,
  branding_preserved: true,
  labels_preserved: true,
  ports_controls_preserved: true,
  quantity_preserved: true,
  accessories_preserved: true,
  variant_preserved: true,
  wear_damage_preserved: true,
  viewpoint_preserved: true,
  new_elements: [],
  missing_elements: [],
  score: 99,
  reason: 'Somente fundo e iluminação mudaram.',
}

describe('image fidelity gate', () => {
  beforeEach(() => {
    runTaskJsonWithMeta.mockReset().mockResolvedValue({
      data: accepted,
      meta: { provider: 'gemini', model: 'gemini-3.1-pro-preview', tier: 'vision', latency_ms: 10, attempts: 1 },
    })
  })

  it('compara pixels do original e da candidata e aceita somente preservação integral', async () => {
    const result = await verifyImageFidelity({
      original: Buffer.from('original'),
      candidate: Buffer.from('candidate'),
      original_mime_type: 'image/webp',
      candidate_mime_type: 'image/jpeg',
      productName: 'Caneta Kitest KA250',
      config: null,
    })

    expect(runTaskJsonWithMeta.mock.calls[0][4].images).toHaveLength(2)
    expect(runTaskJsonWithMeta.mock.calls[0][4].maxTokens).toBeGreaterThanOrEqual(1400)
    expect(runTaskJsonWithMeta.mock.calls[0][4].images[0]).toMatch(/^data:image\/webp;base64,/)
    expect(runTaskJsonWithMeta.mock.calls[0][4].images[1]).toMatch(/^data:image\/jpeg;base64,/)
    expect(result).toMatchObject({ status: 'ACCEPT', score: 99, provider: 'gemini' })
  })

  it('rejeita alteração de marca mesmo com score alto', async () => {
    runTaskJsonWithMeta.mockResolvedValue({
      data: { ...accepted, branding_preserved: false, score: 100, reason: 'Marca mudou.' },
      meta: { provider: 'gemini', model: 'vision', tier: 'vision', latency_ms: 10, attempts: 1 },
    })

    const result = await verifyImageFidelity({
      original: Buffer.from('original'), candidate: Buffer.from('candidate'),
      original_mime_type: 'image/jpeg', candidate_mime_type: 'image/jpeg', config: null,
    })

    expect(result.status).toBe('REJECT')
    expect(result.reason_codes).toContain('BRANDING_CHANGED')
  })

  it('rejeita porta ou controle alterado mesmo sem outra divergência', async () => {
    runTaskJsonWithMeta.mockResolvedValue({
      data: { ...accepted, ports_controls_preserved: false, score: 100, reason: 'Conector mudou.' },
      meta: { provider: 'gemini', model: 'vision', tier: 'vision', latency_ms: 10, attempts: 1 },
    })
    const result = await verifyImageFidelity({
      original: Buffer.from('original'), candidate: Buffer.from('candidate'),
      original_mime_type: 'image/jpeg', candidate_mime_type: 'image/jpeg', config: null,
    })
    expect(result).toMatchObject({ status: 'REJECT', reason_codes: ['PORTS_CONTROLS_CHANGED'] })
  })

  it('permite recorte de detalhe sem tratar itens fora do quadro como alteração do produto', async () => {
    runTaskJsonWithMeta.mockResolvedValue({
      data: {
        ...accepted,
        accessories_preserved: false,
        viewpoint_preserved: false,
        missing_elements: ['embalagem fora do recorte'],
        score: 99,
        reason: 'Mesmo produto em close-up.',
      },
      meta: { provider: 'gemini', model: 'vision', tier: 'vision', latency_ms: 10, attempts: 1 },
    })

    const result = await verifyImageFidelity({
      original: Buffer.from('original'), candidate: Buffer.from('candidate'),
      original_mime_type: 'image/jpeg', candidate_mime_type: 'image/jpeg', config: null,
      compositionMode: 'DETAIL_CROP',
    })

    expect(result).toMatchObject({ status: 'ACCEPT', score: 99 })
  })

  it('envia para revisão humana quando todos os checks passam com confiança moderada', async () => {
    runTaskJsonWithMeta.mockResolvedValue({
      data: { ...accepted, score: 85, reason: 'Produto preservado, confiança moderada.' },
      meta: { provider: 'gemini', model: 'vision', tier: 'vision', latency_ms: 10, attempts: 1 },
    })

    const result = await verifyImageFidelity({
      original: Buffer.from('original'), candidate: Buffer.from('candidate'),
      original_mime_type: 'image/jpeg', candidate_mime_type: 'image/jpeg', config: null,
    })

    expect(result).toMatchObject({ status: 'REVIEW', score: 85 })
  })

  it('manda para revisão quando a avaliação é inválida', async () => {
    runTaskJsonWithMeta.mockResolvedValue({ data: { score: 100 }, meta: {} })
    const result = await verifyImageFidelity({
      original: Buffer.from('original'), candidate: Buffer.from('candidate'),
      original_mime_type: 'image/jpeg', candidate_mime_type: 'image/jpeg', config: null,
    })
    expect(result.status).toBe('REVIEW')
    expect(result.reason_codes).toContain('MALFORMED_ASSESSMENT')
  })
})

describe('generated image quality gate', () => {
  beforeEach(() => {
    runTaskJsonWithMeta.mockReset().mockResolvedValue({
      data: {
        product_depiction_clear: true,
        matches_confirmed_facts: true,
        single_product_focus: true,
        marketplace_ready: true,
        invented_text_or_branding: false,
        contradictions: [],
        score: 96,
        reason: 'Imagem coerente com o briefing.',
      },
      meta: { provider: 'gemini', model: 'vision', latency_ms: 12, attempts: 1 },
    })
  })

  it('aprova uma capa estruturalmente coerente com os fatos confirmados', async () => {
    const result = await verifyGeneratedImage({
      candidate: Buffer.from('candidate'), mime_type: 'image/jpeg', productName: 'Ryzen 5 5500',
      facts: [{ label: 'Marca', value: 'AMD' }, { label: 'Modelo', value: '5500' }], config: null,
    })

    expect(runTaskJsonWithMeta.mock.calls[0][4].images[0]).toMatch(/^data:image\/jpeg;base64,/)
    expect(runTaskJsonWithMeta.mock.calls[0][4].maxTokens).toBeGreaterThanOrEqual(1400)
    expect(runTaskJsonWithMeta.mock.calls[0][3]).toContain('Marca: AMD')
    expect(result).toMatchObject({ status: 'ACCEPT', score: 96 })
  })

  it('rejeita branding inventado ou contradições visuais', async () => {
    runTaskJsonWithMeta.mockResolvedValue({
      data: {
        product_depiction_clear: true,
        matches_confirmed_facts: false,
        single_product_focus: true,
        marketplace_ready: true,
        invented_text_or_branding: true,
        contradictions: ['Marca divergente'],
        score: 72,
        reason: 'A imagem inventou outra marca.',
      },
      meta: { provider: 'gemini', model: 'vision', latency_ms: 12, attempts: 1 },
    })

    const result = await verifyGeneratedImage({
      candidate: Buffer.from('candidate'), mime_type: 'image/jpeg', productName: 'Ryzen 5 5500',
      facts: [{ label: 'Marca', value: 'AMD' }], config: null,
    })

    expect(result.status).toBe('REJECT')
    expect(result.reason_codes).toContain('INVENTED_TEXT_OR_BRANDING')
    expect(result.reason_codes).toContain('FACTS_CONTRADICTED')
  })
})

describe('multi-reference generated image gate', () => {
  const guidedAccepted = {
    same_product: true,
    geometry_preserved: true,
    variant_preserved: true,
    color_preserved: true,
    branding_preserved: true,
    quantity_preserved: true,
    components_preserved: true,
    composition_is_new: true,
    score: 96,
    reason: 'Mesmo produto em composição nova.',
  }

  const input = {
    references: [
      { buffer: Buffer.from('reference-a'), mime_type: 'image/jpeg' },
      { buffer: Buffer.from('reference-b'), mime_type: 'image/webp' },
    ],
    candidate: Buffer.from('candidate'),
    candidate_mime_type: 'image/png',
    productName: 'Parafusadeira Fulink FK-80PT',
    facts: [{ label: 'Modelo', value: 'FK-80PT' }],
    config: null,
  }

  beforeEach(() => {
    runTaskJsonWithMeta.mockReset().mockResolvedValue({
      data: guidedAccepted,
      meta: { provider: 'gemini', model: 'vision', latency_ms: 12, attempts: 1 },
    })
  })

  it('sends references before the candidate and accepts only a new clean composition', async () => {
    const result = await verifyReferenceGuidedImage(input)

    expect(runTaskJsonWithMeta.mock.calls[0][4].images).toEqual([
      `data:image/jpeg;base64,${Buffer.from('reference-a').toString('base64')}`,
      `data:image/webp;base64,${Buffer.from('reference-b').toString('base64')}`,
      `data:image/png;base64,${Buffer.from('candidate').toString('base64')}`,
    ])
    expect(result).toMatchObject({ status: 'ACCEPT', composition_is_new: true })
  })

  it('rejects a different variant even when the scene is attractive', async () => {
    runTaskJsonWithMeta.mockResolvedValue({
      data: { ...guidedAccepted, variant_preserved: false, score: 99, reason: 'Variante divergente.' },
      meta: { provider: 'gemini', model: 'vision', latency_ms: 12, attempts: 1 },
    })

    await expect(verifyReferenceGuidedImage(input)).resolves.toMatchObject({
      status: 'REJECT',
      reason_codes: expect.arrayContaining(['VARIANT_CHANGED']),
    })
  })

  it('rejects a copied composition', async () => {
    runTaskJsonWithMeta.mockResolvedValue({
      data: { ...guidedAccepted, composition_is_new: false, score: 99, reason: 'Composição copiada.' },
      meta: { provider: 'gemini', model: 'vision', latency_ms: 12, attempts: 1 },
    })

    await expect(verifyReferenceGuidedImage(input)).resolves.toMatchObject({
      status: 'REJECT',
      composition_is_new: false,
      reason_codes: expect.arrayContaining(['COMPOSITION_NOT_NEW']),
    })
  })

  it('returns REVIEW when structure cannot be assessed', async () => {
    runTaskJsonWithMeta.mockRejectedValue(new Error('503'))

    await expect(verifyReferenceGuidedImage(input)).resolves.toMatchObject({
      status: 'REVIEW',
      reason_codes: ['GATE_UNAVAILABLE'],
    })
  })
})
