import sharp from 'sharp'
import {
  assertPublicHttpsUrl,
  createPinnedRemoteDispatcher,
  type PublicRemoteAddress,
} from './safe-remote-url'

const MAX_BYTES = 8 * 1024 * 1024
const MAX_REDIRECTS = 3
const ALLOWED_REMOTE_FORMATS = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

async function assertSafeImageUrl(url: URL): Promise<PublicRemoteAddress[]> {
  try {
    return await assertPublicHttpsUrl(url)
  } catch {
    throw new Error('URL de imagem não permitida.')
  }
}

async function readBounded(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_BYTES) throw new Error('Imagem remota excede 8MB.')
  if (!response.body) throw new Error('Imagem remota vazia.')

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new Error('Imagem remota excede 8MB.')
    }
    chunks.push(Buffer.from(value))
  }
  if (!size) throw new Error('Imagem remota vazia.')
  return Buffer.concat(chunks, size)
}

export interface FetchedImage {
  buffer: Buffer
  mime_type: string
  width: number
  height: number
  final_url: string
}

export async function fetchImageSafely(source: string): Promise<FetchedImage> {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new Error('URL de imagem não permitida.')
  }

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const addresses = await assertSafeImageUrl(url)
    const dispatcher = createPinnedRemoteDispatcher(addresses)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const requestInit: RequestInit & { dispatcher: typeof dispatcher } = {
        signal: controller.signal,
        redirect: 'manual',
        headers: { Accept: 'image/jpeg,image/png,image/webp' },
        dispatcher,
      }
      const response = await fetch(url, requestInit)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location || redirect === MAX_REDIRECTS) throw new Error('Redirecionamento de imagem inválido.')
        url = new URL(location, url)
        continue
      }
      if (!response.ok) throw new Error(`Não foi possível baixar a imagem (HTTP ${response.status}).`)
      const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
      const expectedFormat = ALLOWED_REMOTE_FORMATS.get(contentType)
      if (!expectedFormat) {
        await response.body?.cancel()
        throw new Error('O endereço retornou um formato não permitido.')
      }
      const buffer = await readBounded(response)
      const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata()
      if (!metadata.width || !metadata.height || !metadata.format) throw new Error('Imagem inválida ou corrompida.')
      if (metadata.format !== expectedFormat) throw new Error('O MIME da imagem não corresponde ao formato decodificado.')
      return { buffer, mime_type: contentType, width: metadata.width, height: metadata.height, final_url: url.toString() }
    } finally {
      clearTimeout(timer)
      await dispatcher.destroy()
    }
  }
  throw new Error('Redirecionamento de imagem inválido.')
}
