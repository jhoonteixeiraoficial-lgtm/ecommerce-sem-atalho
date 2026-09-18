/**
 * WebSearchProvider — camada de RETRIEVAL.
 *
 * Responsabilidade única: localizar páginas reais (fabricante, manual, datasheet,
 * ficha técnica) e devolver trechos + URLs verificáveis.
 *
 * NÃO decide fatos. NÃO resolve conflitos. NÃO preenche ProductTruth.
 * Quem raciocina sobre estas fontes é o motor de reasoning (Claude) — ver ai-router.
 */

export interface WebSource {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResult {
  available: boolean
  /** resumo textual bruto retornado pelo provedor de busca */
  content: string
  sources: WebSource[]
  queries: string[]
  unavailable_reason?: string
}

const GEMINI_SEARCH_MODEL = process.env.GEMINI_SEARCH_MODEL || 'gemini-3.5-flash-lite'

interface GroundingChunk {
  web?: { uri?: string; title?: string }
}

interface GroundingSupport {
  segment?: { text?: string }
  groundingChunkIndices?: number[]
}

/**
 * Retrieval via Google Search Grounding do Gemini.
 * Requer quota de grounding habilitada na chave (planos gratuitos costumam
 * responder 429 RESOURCE_EXHAUSTED assim que `tools` é enviado).
 */
async function searchWebGrounding(query: string, maxSources = 6): Promise<WebSearchResult> {
  if (process.env.ASSERTIVE_WEB_SEARCH_ENABLED === 'false') {
    return {
      available: false, content: '', sources: [], queries: [],
      unavailable_reason: 'Busca web complementar desativada para economia; pesquisa no Mercado Livre permanece disponível.',
    }
  }
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      available: false,
      content: '',
      sources: [],
      queries: [],
      unavailable_reason: 'GEMINI_API_KEY ausente: retrieval web desativado.',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_SEARCH_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: query }] }],
          tools: [{ google_search: {} }],
        }),
        signal: controller.signal,
      }
    )

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const quota = res.status === 429
      return {
        available: false,
        content: '',
        sources: [],
        queries: [],
        unavailable_reason: quota
          ? 'Quota de Google Search Grounding esgotada na chave atual do Gemini.'
          : `Retrieval web indisponível (HTTP ${res.status}): ${body.slice(0, 140)}`,
      }
    }

    const data = await res.json()
    const candidate = data?.candidates?.[0]
    const content: string = (candidate?.content?.parts || [])
      .map((p: { text?: string }) => p.text || '')
      .join('\n')
      .trim()

    const meta = candidate?.groundingMetadata
    const chunks: GroundingChunk[] = meta?.groundingChunks || []
    const supports: GroundingSupport[] = meta?.groundingSupports || []

    // associa cada URL ao trecho que a sustenta
    const snippetByChunk = new Map<number, string>()
    for (const s of supports) {
      const text = s.segment?.text?.trim()
      if (!text) continue
      for (const i of s.groundingChunkIndices || []) {
        if (!snippetByChunk.has(i)) snippetByChunk.set(i, text)
      }
    }

    const sources: WebSource[] = chunks
      .map((c, i) => ({
        title: c.web?.title?.trim() || '',
        url: c.web?.uri?.trim() || '',
        snippet: snippetByChunk.get(i) || '',
      }))
      .filter(s => s.url)
      .slice(0, maxSources)

    if (!content && !sources.length) {
      return {
        available: false,
        content: '',
        sources: [],
        queries: meta?.webSearchQueries || [],
        unavailable_reason: 'A busca não retornou fontes utilizáveis.',
      }
    }

    return {
      available: true,
      content,
      sources,
      queries: meta?.webSearchQueries || [],
    }
  } catch (e) {
    return {
      available: false,
      content: '',
      sources: [],
      queries: [],
      unavailable_reason: e instanceof Error ? e.message : 'Falha no retrieval web.',
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fallback GRATUITO de retrieval: DuckDuckGo HTML, sem chave e sem custo.
 * Serve ao mesmo contrato do Grounding (trechos + URLs); quem raciocina
 * sobre as fontes continua sendo o motor de reasoning.
 */
async function duckduckgoSearch(query: string, maxSources: number): Promise<WebSearchResult> {
  const { load } = await import('cheerio')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
    })
    if (!res.ok) {
      return {
        available: false, content: '', sources: [], queries: [],
        unavailable_reason: `Fallback gratuito de busca indisponível (HTTP ${res.status}).`,
      }
    }
    const html = await res.text()
    const $ = load(html)
    const sources: WebSource[] = []
    $('.result').each((_, node) => {
      if (sources.length >= maxSources) return
      const anchor = $(node).find('a.result__a').first()
      if (!anchor.length) return
      let url = anchor.attr('href') || ''
      if (url.includes('duckduckgo.com/l/')) {
        try { url = new URLSearchParams(new URL(`https:${url.startsWith('//') ? url : `//${url}`}`).search).get('uddg') || '' } catch { url = '' }
      }
      const title = anchor.text().replace(/\s+/g, ' ').trim()
      const snippet = $(node).find('.result__snippet').first().text().replace(/\s+/g, ' ').trim()
      if (!url.startsWith('https://') || !title) return
      sources.push({ title, url, snippet })
    })
    if (!sources.length) {
      return {
        available: false, content: '', sources: [], queries: [],
        unavailable_reason: 'A busca gratuita não retornou fontes utilizáveis.',
      }
    }
    return {
      available: true,
      content: sources.map(s => `${s.title} — ${s.snippet} (${s.url})`).join('\n'),
      sources,
      queries: [query],
    }
  } catch {
    return {
      available: false, content: '', sources: [], queries: [],
      unavailable_reason: 'Fallback gratuito de busca falhou.',
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Retrieval web: Grounding quando há quota; fallback gratuito (DuckDuckGo) sempre que ele falha. */
export async function searchWeb(query: string, maxSources = 6): Promise<WebSearchResult> {
  if (process.env.ASSERTIVE_WEB_SEARCH_ENABLED === 'false') {
    return {
      available: false, content: '', sources: [], queries: [],
      unavailable_reason: 'Busca web complementar desativada para economia; pesquisa no Mercado Livre permanece disponível.',
    }
  }
  const primary = await searchWebGrounding(query, maxSources)
  if (primary.available) return primary
  const fallback = await duckduckgoSearch(query, maxSources)
  if (fallback.available) return fallback
  return primary
}

/** Consulta focada em documentação oficial do fabricante. */
export function buildManufacturerQuery(
  productName: string,
  brand: string | undefined,
  model: string | undefined,
  missingLabels: string[]
): string {
  const id = [brand, model].filter(Boolean).join(' ')
  const target = id || productName
  const fields = missingLabels.slice(0, 8).join(', ')
  return `Ficha técnica oficial do produto ${target}${id ? ` (${productName})` : ''}.
Preciso destes dados: ${fields}.
Busque no site oficial do fabricante, manual do produto, datasheet ou catálogo oficial.
Para cada dado encontrado informe o valor exato e a fonte. Se um dado não constar nas fontes oficiais, diga explicitamente que não foi encontrado.`
}
