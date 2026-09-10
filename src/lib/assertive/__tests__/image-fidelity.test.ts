import { beforeEach, describe, expect, it, vi } from 'vitest'

const runTaskJsonWithMeta = vi.hoisted(() => vi.fn())
vi.mock('../ai-router', () => ({ runTaskJsonWithMeta }))

import { verifyImageFidelity } from '../image-fidelity'

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
      mime_type: 'image/jpeg',
      productName: 'Caneta Kitest KA250',
      config: null,
    })

    expect(runTaskJsonWithMeta.mock.calls[0][4].images).toHaveLength(2)
    expect(runTaskJsonWithMeta.mock.calls[0][4].images[0]).toMatch(/^data:image\/jpeg;base64,/)
    expect(result).toMatchObject({ status: 'ACCEPT', score: 99, provider: 'gemini' })
  })

  it('rejeita alteração de marca mesmo com score alto', async () => {
    runTaskJsonWithMeta.mockResolvedValue({
      data: { ...accepted, branding_preserved: false, score: 100, reason: 'Marca mudou.' },
      meta: { provider: 'gemini', model: 'vision', tier: 'vision', latency_ms: 10, attempts: 1 },
    })

    const result = await verifyImageFidelity({
      original: Buffer.from('original'), candidate: Buffer.from('candidate'), mime_type: 'image/jpeg', config: null,
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
      original: Buffer.from('original'), candidate: Buffer.from('candidate'), mime_type: 'image/jpeg', config: null,
    })
    expect(result).toMatchObject({ status: 'REJECT', reason_codes: ['PORTS_CONTROLS_CHANGED'] })
  })

  it('manda para revisão quando a avaliação é inválida', async () => {
    runTaskJsonWithMeta.mockResolvedValue({ data: { score: 100 }, meta: {} })
    const result = await verifyImageFidelity({
      original: Buffer.from('original'), candidate: Buffer.from('candidate'), mime_type: 'image/jpeg', config: null,
    })
    expect(result.status).toBe('REVIEW')
    expect(result.reason_codes).toContain('MALFORMED_ASSESSMENT')
  })
})
