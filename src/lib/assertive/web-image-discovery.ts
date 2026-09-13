import 'server-only'

import { assertPublicHttpsUrl, createPinnedRemoteDispatcher } from './safe-remote-url'

const MAX_HTML_BYTES = 1024 * 1024
const MAX_REDIRECTS = 3
const MAX_RESULTS = 12
const MAX_RAW_CANDIDATES = 120

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/g, (_, digits: string) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([^\s"'<>\/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  for (const match of tag.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

function collectJsonLdImages(value: unknown, output: string[], imageContext = false): void {
  if (output.length >= MAX_RAW_CANDIDATES || value === null || value === undefined) return
  if (typeof value === 'string') {
    if (imageContext) output.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectJsonLdImages(entry, output, imageContext)
    return
  }
  if (typeof value !== 'object') return

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase()
    if (normalizedKey === 'image') {
      collectJsonLdImages(child, output, true)
    } else if (normalizedKey === 'contenturl' || (imageContext && normalizedKey === 'url')) {
      collectJsonLdImages(child, output, true)
    } else {
      collectJsonLdImages(child, output, imageContext)
    }
  }
}

function extractImageMetadata(html: string): string[] {
  const output: string[] = []
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0])
    const key = (attributes.property || attributes.name || '').toLowerCase()
    if (['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'].includes(key) && attributes.content) {
      output.push(attributes.content)
      if (output.length >= MAX_RAW_CANDIDATES) return output
    }
  }

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = parseAttributes(match[1])
    if (attributes.type?.toLowerCase().split(';')[0].trim() !== 'application/ld+json') continue
    try {
      collectJsonLdImages(JSON.parse(match[2]), output)
    } catch {
      // Invalid structured metadata is ignored; scripts are never executed.
    }
    if (output.length >= MAX_RAW_CANDIDATES) break
  }
  return output
}

async function readBoundedHtml(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_HTML_BYTES) throw new Error('Página remota excede 1MB.')
  if (!response.body) throw new Error('Página remota vazia.')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_HTML_BYTES) {
      await reader.cancel()
      throw new Error('Página remota excede 1MB.')
    }
    chunks.push(value)
  }
  if (!size) return ''
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8').decode(bytes)
}

async function normalizeCandidates(raw: string[], baseUrl: URL): Promise<string[]> {
  const output: string[] = []
  const seen = new Set<string>()
  for (const source of raw) {
    let candidate: URL
    try {
      candidate = new URL(source.trim(), baseUrl)
      candidate.hash = ''
      if (seen.has(candidate.href)) continue
      await assertPublicHttpsUrl(candidate)
    } catch {
      continue
    }
    seen.add(candidate.href)
    output.push(candidate.href)
    if (output.length >= MAX_RESULTS) break
  }
  return output
}

export async function discoverWebImageCandidates(pageUrl: string): Promise<string[]> {
  let url: URL
  try {
    url = new URL(pageUrl)
  } catch {
    throw new Error('URL remota não permitida.')
  }

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const addresses = await assertPublicHttpsUrl(url)
    const dispatcher = createPinnedRemoteDispatcher(addresses)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      const requestInit: RequestInit & { dispatcher: typeof dispatcher } = {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'AssertiveImageDiscovery/1.0',
        },
        dispatcher,
      }
      const response = await fetch(url, requestInit)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location || redirect === MAX_REDIRECTS) throw new Error('Redirecionamento remoto inválido.')
        try {
          url = new URL(location, url)
        } catch {
          throw new Error('Redirecionamento remoto inválido.')
        }
        continue
      }
      if (!response.ok) throw new Error(`Não foi possível consultar a página (HTTP ${response.status}).`)
      const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || ''
      if (!['text/html', 'application/xhtml+xml'].includes(contentType)) {
        throw new Error('O endereço não retornou HTML válido.')
      }
      const html = await readBoundedHtml(response)
      return normalizeCandidates(extractImageMetadata(html), url)
    } finally {
      clearTimeout(timer)
      await dispatcher.destroy()
    }
  }
  throw new Error('Redirecionamento remoto inválido.')
}
