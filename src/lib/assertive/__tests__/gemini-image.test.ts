import { afterEach, describe, expect, it, vi } from 'vitest'
import { editProductImage, generateProductImage } from '../gemini-image'

function imageResponse(value: string, mimeType = 'image/png') {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from(value).toString('base64'), mimeType } }] } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('Gemini product image editing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

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

describe('Gemini product image generation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('gera uma capa usando somente a identidade e os fatos confirmados', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse('generated'))

    const result = await generateProductImage({
      productName: 'Processador AMD Ryzen 5 5500',
      facts: [
        { label: 'Marca', value: 'AMD' },
        { label: 'Modelo', value: 'Ryzen 5 5500' },
      ],
      apiKey: 'test-key',
      models: ['gemini-3-pro-image'],
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.contents[0].parts).toHaveLength(1)
    expect(body.contents[0].parts[0].text).toContain('Processador AMD Ryzen 5 5500')
    expect(body.contents[0].parts[0].text).toContain('Marca: AMD')
    expect(body.contents[0].parts[0].text).toMatch(/não invente/i)
    expect(result).toMatchObject({ model: 'gemini-3-pro-image', source_sha256: null })
    expect(result.truth_brief_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.buffer.toString()).toBe('generated')
  })

  it('usa a foto da URL apenas como referência visual para uma nova composição', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse('generated-from-reference'))
    const reference = Buffer.from('reference')

    const result = await generateProductImage({
      productName: 'Controle Sony DualSense',
      facts: [{ label: 'Cor', value: 'Branco' }],
      reference: { buffer: reference, mime_type: 'image/jpeg' },
      apiKey: 'test-key',
      models: ['gemini-3-pro-image'],
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body))
    expect(body.contents[0].parts[1].inlineData).toEqual({
      data: reference.toString('base64'),
      mimeType: 'image/jpeg',
    })
    expect(body.contents[0].parts[0].text).toContain('referência visual')
    expect(body.contents[0].parts[0].text).toContain('marca-d’água')
    expect(result.source_sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('sends up to three exact references and requests a new composition', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(imageResponse('multi-reference'))
    const references = ['a', 'b', 'c', 'd'].map(value => ({
      buffer: Buffer.from(`reference-${value}`),
      mime_type: 'image/jpeg',
    }))

    const result = await generateProductImage({
      productName: 'Parafusadeira Fulink FK-80PT',
      facts: [{ label: 'Modelo', value: 'FK-80PT' }],
      references,
      shot: { order: 1, title: 'Foto principal', description: 'Fundo branco', required: true },
      apiKey: 'test-key',
      models: ['image-model'],
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.contents[0].parts.filter((part: { inlineData?: unknown }) => part.inlineData)).toHaveLength(3)
    expect(body.contents[0].parts[0].text).toMatch(/composição nova/i)
    expect(result.reference_sha256s).toHaveLength(3)
    expect(result.source_sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('recorre à chave de sistema quando a chave Gemini do usuário é inválida', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'system-key')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('invalid key', { status: 400 }))
      .mockResolvedValueOnce(imageResponse('generated-with-system-key'))

    const result = await generateProductImage({
      productName: 'Caneta Kitest KA-250',
      facts: [{ label: 'Modelo', value: 'KA-250' }],
      apiKey: 'invalid-user-key',
      models: ['gemini-image'],
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': 'invalid-user-key' })
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ 'x-goog-api-key': 'system-key' })
    expect(result.attempts).toBe(2)
    expect(result.buffer.toString()).toBe('generated-with-system-key')
  })
})
