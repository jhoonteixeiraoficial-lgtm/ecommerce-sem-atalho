import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createOriginalAsset: vi.fn(),
  createDerivedAsset: vi.fn(),
  normalizeProductImage: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({ response: null, authorizedUser: { id: 'user-1' } }),
}))
vi.mock('@/lib/assertive/image-assets', () => ({
  createOriginalAsset: mocks.createOriginalAsset,
  createDerivedAsset: mocks.createDerivedAsset,
}))
vi.mock('@/lib/assertive/image-normalization', () => ({ normalizeProductImage: mocks.normalizeProductImage }))

const { POST } = await import('./route')

describe('POST /api/assertive/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.normalizeProductImage.mockResolvedValue({
      buffer: Buffer.from('normalized'),
      mime_type: 'image/jpeg',
      width: 1200,
      height: 1200,
      source: { width: 640, height: 480, format: 'jpeg' },
    })
    mocks.createOriginalAsset.mockResolvedValue({ id: 'original-1' })
    mocks.createDerivedAsset.mockResolvedValue({ id: 'rendition-1', public_url: 'https://cdn.example/rendition.jpg' })
  })

  it('preserva o original privado e retorna a rendição normalizada com asset id', async () => {
    const form = new FormData()
    form.append('files', new File([Buffer.from('seller-photo')], 'produto.jpg', { type: 'image/jpeg' }))

    const response = await POST(new Request('http://localhost/api/assertive/upload', { method: 'POST', body: form }) as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.createOriginalAsset).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', mime_type: 'image/jpeg', width: 640, height: 480, sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }))
    expect(mocks.createDerivedAsset).toHaveBeenCalledWith(expect.objectContaining({
      parent_asset_id: 'original-1', kind: 'PUBLICATION_RENDITION', fidelity_status: 'ACCEPT',
    }))
    expect(body).toEqual({
      assets: [{ original_asset_id: 'original-1', rendition_asset_id: 'rendition-1', preview_url: 'https://cdn.example/rendition.jpg' }],
      urls: ['https://cdn.example/rendition.jpg'],
    })
  })

  it('não persiste arquivo que falha na decodificação', async () => {
    mocks.normalizeProductImage.mockRejectedValue(new Error('Imagem inválida'))
    const form = new FormData()
    form.append('files', new File([Buffer.from('fake')], 'produto.jpg', { type: 'image/jpeg' }))

    const response = await POST(new Request('http://localhost/api/assertive/upload', { method: 'POST', body: form }) as never)

    expect(response.status).toBe(400)
    expect(mocks.createOriginalAsset).not.toHaveBeenCalled()
  })
})
