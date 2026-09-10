import { afterEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]))
vi.mock('node:dns/promises', () => ({ lookup }))
import { fetchImageSafely } from '../safe-image-fetch'

describe('fetchImageSafely SSRF boundary', () => {
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

  it('rejeita pelo content-length antes de carregar mais de 8MB', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('x', {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': String(9 * 1024 * 1024) },
    }))

    await expect(fetchImageSafely('https://public.example/photo.jpg')).rejects.toThrow('excede 8MB')
  })
})
