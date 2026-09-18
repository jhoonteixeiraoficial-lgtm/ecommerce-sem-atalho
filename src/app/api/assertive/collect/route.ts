import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { resolveCollectToken } from '@/lib/assertive/collect-token'
import { parsePublicSearch } from '@/lib/assertive/public-search'
import { publicSearchCacheKey } from '@/lib/assertive/public-search-cache'
import { parsePublicListing } from '@/lib/assertive/public-listing'
import { ehPaginaAntiBot, extrairItemIdDaUrl, sanitizarHtmlPdp } from '@/lib/assertive/public-html-sanitize'
import { checkRateLimit } from '@/lib/security'

export const runtime = 'nodejs'

/**
 * Ingestão da COLETA PASSIVA pelo navegador (userscript).
 * O usuário manda para cá as páginas do Mercado Livre que ELE MESMO visita —
 * nada é requisitado ao ML por este endpoint; nada de credenciais do ML.
 *
 * Auth: Bearer esc_… (token pessoal gerado em /api/assertive/collect/token)
 */

const schema = z.object({
  kind: z.enum(['search', 'listing']),
  url: z.string().url().max(2000),
  html: z.string().min(100).max(1_500_000),
})

const HOSTS_ML = ['www.mercadolivre.com.br', 'produto.mercadolivre.com.br', 'lista.mercadolivre.com.br']
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

async function admin() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}

/**
 * CORS para o userscript: ele roda na origem do Mercado Livre e chama o app
 * direto do navegador. Autenticação é por Bearer token próprio (sem cookies),
 * então liberar origens arbitrárias não amplia privilégio de sessão alguma.
 */
function comCors(response: Response): Response {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'authorization, content-type')
  response.headers.set('Access-Control-Max-Age', '86400')
  return response
}

export async function OPTIONS() {
  return comCors(new Response(null, { status: 204 }))
}

function urlValidaDeColeta(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null
    if (!HOSTS_ML.includes(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

/** Deriva a consulta de uma página de busca a partir da URL (mesma slug do ML). */
function derivarConsultaDeBusca(url: URL): string | null {
  if (url.hostname !== 'lista.mercadolivre.com.br' || /[_/]/.test(url.pathname.slice(1))) return null
  if (['offset', 'page', 'sort', 'order', 'shipping', 'seller_id'].some(key => url.searchParams.has(key))) return null
  const porParametro = url.searchParams.get('q') || url.searchParams.get('as_word')
  if (porParametro?.trim()) return porParametro.trim().slice(0, 200)
  let slug: string
  try { slug = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, '')) } catch { return null }
  if (!slug || slug.includes('/')) return null
  const consulta = slug.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  return consulta ? consulta.slice(0, 200) : null
}

async function salvarCache(key: string, payload: unknown, ttlHoras = 6) {
  const supabase = await admin()
  const { error } = await supabase.from('assertive_ml_cache').upsert(
    {
      cache_key: key,
      payload: payload as Record<string, unknown>,
      expires_at: new Date(Date.now() + ttlHoras * 3600000).toISOString(),
    },
    { onConflict: 'cache_key' }
  )
  if (error) throw new Error('Cache de coleta indisponível')
}

export async function POST(req: NextRequest) {
  return comCors(await manipular(req))
}

async function manipular(req: NextRequest) {
  const userId = await resolveCollectToken(req.headers.get('authorization'))
  if (!userId) {
    return Response.json({ error: 'Token de coleta inválido. Gere um novo em Configurações.' }, { status: 401 })
  }

  // Navegação humana gera poucas páginas por minuto; 60/min é folgado e ainda
  // impede que um browser comprometido vire funil de dados.
  const rateLimit = checkRateLimit(`assertive-collect-${userId}`, 60, 60000)
  if (!rateLimit.allowed) {
    return Response.json({ error: 'Muitas coletas em sequência.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Corpo inválido.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Payload de coleta inválido.' }, { status: 400 })
  }

  const { kind, url: rawUrl, html } = parsed.data
  const url = urlValidaDeColeta(rawUrl)
  if (!url) {
    return Response.json({ error: 'URL fora dos domínios do Mercado Livre.' }, { status: 400 })
  }
  const clean = new URL(url.origin + url.pathname)
  for (const key of ['q', 'as_word', 'pdp_filters', 'item_id', 'searchVariation']) {
    const value = url.searchParams.get(key)
    if (value) clean.searchParams.set(key, value)
  }
  // Links orgânicos da busca trazem o anúncio só no fragmento (wid=MLB...).
  const sourceHash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const safeHash = new URLSearchParams()
  for (const key of ['wid', 'item_id']) {
    const value = sourceHash.get(key)
    if (value) safeHash.set(key, value)
  }
  if ([...safeHash.keys()].length) clean.hash = safeHash.toString()
  const pageUrl = clean.href
  const scopedKey = (key: string) => `BROWSER:${userId}:${key}`
  const observadoEm = new Date().toISOString()

  if (ehPaginaAntiBot(html)) {
    return Response.json(
      { error: 'O Mercado Livre mostrou uma verificação anti-bot. Resolva o desafio no navegador e reabra a página.' },
      { status: 409 }
    )
  }

  try {
    if (kind === 'search') {
      const consulta = derivarConsultaDeBusca(url)
      if (!consulta) {
        return Response.json({ error: 'Não reconheci esta página como busca (sem consulta na URL).' }, { status: 422 })
      }
      const snapshot = parsePublicSearch(html, consulta, observadoEm)
      if (!snapshot.available) {
        return Response.json(
          { error: 'A página não contém anúncios reconhecíveis da busca.' },
          { status: 422 }
        )
      }
      await salvarCache(scopedKey(publicSearchCacheKey(consulta)), { ...snapshot, source: 'BROWSER_USER' })
      return Response.json({ ok: true, kind, query: consulta, entries: snapshot.entries.length })
    }

    // kind === 'listing'
    const htmlSanitizado = sanitizarHtmlPdp(html)
    const idDaUrl = extrairItemIdDaUrl(pageUrl)
    let resolvido: { itemId: string; title: string } | null = null

    const tentar = (itemId: string | null) =>
      itemId ? parsePublicListing(htmlSanitizado, pageUrl, itemId, observadoEm) : null

    let pagina = tentar(idDaUrl)
    if (!pagina && !idDaUrl && /\/p\/MLB\d+/.test(url.pathname)) {
      // Catálogo sem filtro de item: a própria página anuncia "Anúncio #NNN"
      const anunciado = html.match(/Anúncio\s*#(\d+)/)?.[1]
      pagina = anunciado ? tentar(`MLB${anunciado}`) : null
    }
    if (pagina && pagina.seller.verified) {
      resolvido = { itemId: pagina.seller.item_id!, title: pagina.title }
    }
    if (!resolvido) {
      return Response.json(
        { error: 'A página não confirma vendedor e anúncio. Abra a página completa de um anúncio.' },
        { status: 422 }
      )
    }

    const payload = { url: pageUrl, html: htmlSanitizado, observed_at: observadoEm, source: 'BROWSER_USER' }
    await salvarCache(scopedKey(`PUBLIC_LISTING:v1:${hash(pageUrl)}`), payload)
    await salvarCache(scopedKey(`PUBLIC_LISTING_ID:v1:${resolvido.itemId}`), payload)

    return Response.json({ ok: true, kind, item_id: resolvido.itemId, title: resolvido.title })
  } catch {
    console.error('[assertive-collect] processing_failed')
    return Response.json({ error: 'Falha ao processar a coleta.' }, { status: 500 })
  }
}
