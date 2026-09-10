import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  normalizeProductImage: vi.fn(),
  editProductImage: vi.fn(),
  verifyImageFidelity: vi.fn(),
}))
vi.mock('../image-normalization', () => ({ normalizeProductImage: mocks.normalizeProductImage }))
vi.mock('../gemini-image', () => ({ editProductImage: mocks.editProductImage }))
vi.mock('../image-fidelity', () => ({ verifyImageFidelity: mocks.verifyImageFidelity }))

import { preparePublicationImage } from '../image-enhancement'

const normalized = (value: string) => ({
  buffer: Buffer.from(value),
  mime_type: 'image/jpeg' as const,
  width: 1200 as const,
  height: 1200 as const,
  source: { width: 100, height: 100, format: 'jpeg' },
})

describe('safe image enhancement workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.normalizeProductImage
      .mockResolvedValueOnce(normalized('normalized-original'))
      .mockResolvedValueOnce(normalized('normalized-ai'))
    mocks.editProductImage.mockResolvedValue({
      buffer: Buffer.from('ai-output'), mime_type: 'image/png', provider: 'gemini', model: 'gemini-image', attempts: 1, latency_ms: 10,
    })
    mocks.verifyImageFidelity.mockResolvedValue({ status: 'ACCEPT', score: 99, reason: 'ok', provider: 'gemini', model: 'vision' })
  })

  it('usa a edição somente após ACCEPT explícito do gate', async () => {
    const result = await preparePublicationImage({ source: Buffer.from('source'), source_mime_type: 'image/jpeg', enabled: true })

    expect(result.image.buffer.toString()).toBe('normalized-ai')
    expect(result).toMatchObject({ ai_enhanced: true, fidelity_status: 'ACCEPT', model: 'gemini-image' })
  })

  it.each(['REVIEW', 'REJECT'] as const)('volta ao original normalizado quando o gate retorna %s', async status => {
    mocks.verifyImageFidelity.mockResolvedValue({ status, score: 70, reason: 'incerto', provider: 'gemini', model: 'vision' })
    const result = await preparePublicationImage({ source: Buffer.from('source'), source_mime_type: 'image/jpeg', enabled: true })

    expect(result.image.buffer.toString()).toBe('normalized-original')
    expect(result).toMatchObject({ ai_enhanced: false, fidelity_status: 'ACCEPT', fallback_reason: `FIDELITY_${status}` })
  })

  it('normaliza sem custo quando a feature está desabilitada', async () => {
    const result = await preparePublicationImage({ source: Buffer.from('source'), source_mime_type: 'image/jpeg', enabled: false })
    expect(mocks.editProductImage).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ai_enhanced: false, fallback_reason: 'FEATURE_DISABLED' })
  })
})
