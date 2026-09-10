import { afterEach, describe, expect, it, vi } from 'vitest'
import { editProductImage } from '../gemini-image'

function imageResponse(value: string, mimeType = 'image/png') {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from(value).toString('base64'), mimeType } }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('Gemini product image editing', () => {
  afterEach(() => vi.restoreAllMocks())

  it('envia a imagem original e um prompt que proíbe mutações do produto', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse('edited'))

    const result = await editProductImage({
      source: Buffer.from('original'),
      mime_type: 'image/jpeg',
      apiKey: 'test-key',
      models: ['gemini-3-pro-image'],
      mode: 'COVER_CLEANUP',
      productName: 'Caneta Kitest KA250',
    })

    const [url, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(String(url)).toContain('/models/gemini-3-pro-image:generateContent')
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-key' })
    expect(body.contents[0].parts[1].inlineData.data).toBe(Buffer.from('original').toString('base64'))
    expect(body.contents[0].parts[0].text).toContain('NÃO altere')
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE'])
    expect(result).toMatchObject({ model: 'gemini-3-pro-image', attempts: 1, mime_type: 'image/png' })
    expect(result.prompt_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.source_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.output_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.buffer.toString()).toBe('edited')
  })

  it('tenta o fallback cadastrado quando o modelo principal não está disponível', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(imageResponse('fallback'))

    const result = await editProductImage({
      source: Buffer.from('original'),
      mime_type: 'image/jpeg',
      apiKey: 'test-key',
      models: ['unavailable-image-model', 'gemini-3.1-flash-image'],
      mode: 'DETAIL_CLEANUP',
    })

    expect(result.model).toBe('gemini-3.1-flash-image')
    expect(result.attempts).toBe(2)
  })
})
