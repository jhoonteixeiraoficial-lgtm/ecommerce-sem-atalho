import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const lookup = vi.hoisted(() => vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]))
vi.mock('node:dns/promises', () => ({ lookup }))
import { fetchImageSafely } from '../safe-image-fetch'

describe('fetchImageSafely SSRF boundary', () => {
  beforeEach(() => {
    lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  afterEach(() => vi.restoreAllMocks())

  it.each([
    'http://127.0.0.1/a.jpg',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.2/a.jpg',
    'https://localhost/a.jpg',
    'file:///etc/passwd',
  ])('rejeita destino não permitido: %s', async url => {
    await expect(fetchImageSafely(url)).rejects.toThrow('URL de imagem não permitida')
  })

  it('revalida e bloqueia o destino de cada redirect', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/private.jpg' },
    }))

    await expect(fetchImageSafely('https://public.example/photo.jpg')).rejects.toThrow('URL de imagem não permitida')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fixa a conexão no endereço público já validado contra DNS rebinding', async () => {
    const image = await sharp({
      create: { width: 2, height: 2, channels: 3, background: 'white' },
    }).jpeg().toBuffer()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(image, {
      headers: { 'content-type': 'image/jpeg' },
    }))

    await fetchImageSafely('https://public.example/photo.jpg')

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://public.example/photo.jpg'),
      expect.objectContaining({ dispatcher: expect.anything() })
    )
  })

  it('rejeita pelo content-length antes de carregar mais de 8MB', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x', {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': String(9 * 1024 * 1024) },
    }))

    await expect(fetchImageSafely('https://public.example/photo.jpg')).rejects.toThrow('excede 8MB')
  })

  it('rejeita SVG e conteúdo cujo MIME não corresponde ao formato decodificado', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="white"/></svg>'
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(svg, { headers: { 'content-type': 'image/svg+xml' } }))
      .mockResolvedValueOnce(new Response(svg, { headers: { 'content-type': 'image/jpeg' } }))

    await expect(fetchImageSafely('https://public.example/photo.svg')).rejects.toThrow('formato não permitido')
    await expect(fetchImageSafely('https://public.example/disguised.jpg')).rejects.toThrow('não corresponde')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
