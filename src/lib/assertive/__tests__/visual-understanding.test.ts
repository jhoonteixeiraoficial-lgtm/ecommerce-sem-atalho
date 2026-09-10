import { beforeEach, describe, expect, it, vi } from 'vitest'

const runTaskJson = vi.hoisted(() => vi.fn())
vi.mock('../ai-router', () => ({ runTaskJson }))

import { understandProductVisuals, verifyVisualMatch } from '../visual-understanding'

describe('visual understanding uses pixels', () => {
  beforeEach(() => {
    runTaskJson.mockReset().mockResolvedValue({
      product_type: 'tool',
      visual_summary: 'Ferramenta preta',
      dominant_color: 'preto',
      shape: 'alongado',
      size_estimate: 'pequeno',
      visible_accessories: [],
      photo_strengths: [],
      photo_gaps: [],
      cover_improvement: 'fundo branco',
      fidelity_confidence: 'high',
      fidelity_reason: 'mesmo produto',
    })
  })

  it('anexa todas as imagens mesmo usando a configuração da plataforma', async () => {
    const images = ['https://seller.example/1.jpg', 'https://seller.example/2.jpg']
    await understandProductVisuals(images, null, 'Caneta Kitest')

    expect(runTaskJson.mock.calls[0][4].images).toEqual(images)
    expect(runTaskJson.mock.calls[0][3]).not.toContain(images[0])
  })

  it('anexa referências e candidata na comparação visual', async () => {
    runTaskJson.mockResolvedValue({ is_match: true, confidence: 98, reason: 'idêntico' })
    const refs = ['https://seller.example/1.jpg', 'https://seller.example/2.jpg']
    const candidate = 'https://candidate.example/image.jpg'
    await verifyVisualMatch(refs, candidate, null)

    expect(runTaskJson.mock.calls[0][4].images).toEqual([...refs, candidate])
    expect(runTaskJson.mock.calls[0][3]).not.toContain(candidate)
  })
})
