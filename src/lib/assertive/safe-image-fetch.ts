import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import sharp from 'sharp'

const MAX_BYTES = 8 * 1024 * 1024
const MAX_REDIRECTS = 3

function forbiddenIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0)
    || a >= 224
}

function forbiddenIp(address: string): boolean {
  if (isIP(address) === 4) return forbiddenIpv4(address)
  if (isIP(address) !== 6) return true
  const normalized = address.toLowerCase()
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (mapped) return forbiddenIpv4(mapped)
  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('ff')
    || normalized.startsWith('2001:db8')
}

async function assertPublicHttps(url: URL): Promise<void> {
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('URL de imagem não permitida.')
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('URL de imagem não permitida.')
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => [])
  if (!addresses.length || addresses.some(result => forbiddenIp(result.address))) {
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
    await assertPublicHttps(url)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { Accept: 'image/jpeg,image/png,image/webp' },
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        if (!location || redirect === MAX_REDIRECTS) throw new Error('Redirecionamento de imagem inválido.')
        url = new URL(location, url)
        continue
      }
      if (!response.ok) throw new Error(`Não foi possível baixar a imagem (HTTP ${response.status}).`)
      const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
      if (!contentType.startsWith('image/')) throw new Error('O endereço não retornou uma imagem válida.')
      const buffer = await readBounded(response)
      const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata()
      if (!metadata.width || !metadata.height || !metadata.format) throw new Error('Imagem inválida ou corrompida.')
      return { buffer, mime_type: contentType, width: metadata.width, height: metadata.height, final_url: url.toString() }
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error('Redirecionamento de imagem inválido.')
}
