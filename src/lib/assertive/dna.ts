import type { CompetitorDossier, ResearchResult } from './research'

export interface WinningListingDNA {
  /** padrões reais observados nos títulos das melhores referências */
  title_patterns: string[]
  /** termos que mais aparecem nas referências fortes + tendências reais de busca */
  important_keywords: string[]
  /** atributos presentes em quase todas as referências fortes */
  must_have_attributes: Array<{ id: string; presence_pct: number; common_values: string[] }>
  /** atributos que diferenciam as referências mais fortes das mais fracas */
  high_value_attributes: Array<{ id: string; presence_pct: number; common_values: string[] }>
  description_structure: string[]
  image_patterns: { median_count: number; max_count: number; recommendation: string }
  price_context: { min: number; max: number; median: number; suggested: number } | null
  logistics_patterns: { free_shipping_pct: number; fulfillment_pct: number; note: string }
  common_weaknesses: string[]
  opportunities: string[]
  references_analyzed: number
}

const STOPWORDS = new Set([
  'de','da','do','das','dos','com','para','em','no','na','nos','nas','e','ou','a','o','as','os',
  'um','uma','uns','umas','por','sem','sob','ao','aos','à','às','the','and','of','p','pra','mais',
  'kit','un','und','unidade','unidades','novo','nova','original','promoção','frete','grátis',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function topCounted<T>(items: T[], limit: number): T[] {
  const counts = new Map<T, number>()
  for (const i of items) counts.set(i, (counts.get(i) || 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([v]) => v)
}

/**
 * Sintetiza o DNA das melhores referências.
 * Totalmente determinístico: nada aqui é inventado por IA.
 */
export function extractDNA(research: ResearchResult): WinningListingDNA {
  const refs = research.competitors
  const total = refs.length || 1

  // ---- títulos
  const titlePatterns: string[] = []
  const strongest = [...refs].sort((a, b) => b.strength_score - a.strength_score).slice(0, 5)
  for (const r of strongest) {
    if (r.title) titlePatterns.push(r.title)
  }

  // ---- palavras-chave: interseção entre títulos fortes e tendências reais da categoria
  const titleTokens = refs.flatMap(r => tokenize(r.title))
  const trendTokens = research.keywords.flatMap(k => tokenize(k))
  const tokenFreq = new Map<string, number>()
  for (const t of titleTokens) tokenFreq.set(t, (tokenFreq.get(t) || 0) + 2)
  for (const t of trendTokens) tokenFreq.set(t, (tokenFreq.get(t) || 0) + 3)

  const important_keywords = [...tokenFreq.entries()]
    .filter(([t]) => !/^\d+$/.test(t))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([t]) => t)

  // ---- atributos
  const attrPresence = new Map<string, number>()
  const attrValues = new Map<string, string[]>()
  for (const r of refs) {
    for (const [id, value] of Object.entries(r.attributes)) {
      attrPresence.set(id, (attrPresence.get(id) || 0) + 1)
      const list = attrValues.get(id) || []
      list.push(value)
      attrValues.set(id, list)
    }
  }

  const attrStats = [...attrPresence.entries()].map(([id, count]) => ({
    id,
    presence_pct: Math.round((count / total) * 100),
    common_values: topCounted(attrValues.get(id) || [], 3),
  }))

  const must_have_attributes = attrStats
    .filter(a => a.presence_pct >= 70)
    .sort((a, b) => b.presence_pct - a.presence_pct)

  // atributos mais presentes no topo do que no fim do ranking = diferencial competitivo
  const topHalf = strongest
  const bottomHalf = [...refs].sort((a, b) => a.strength_score - b.strength_score).slice(0, 5)
  const inTop = new Map<string, number>()
  const inBottom = new Map<string, number>()
  for (const r of topHalf) for (const id of Object.keys(r.attributes)) inTop.set(id, (inTop.get(id) || 0) + 1)
  for (const r of bottomHalf) for (const id of Object.keys(r.attributes)) inBottom.set(id, (inBottom.get(id) || 0) + 1)

  const high_value_attributes = attrStats
    .filter(a => {
      const t = (inTop.get(a.id) || 0) / (topHalf.length || 1)
      const b = (inBottom.get(a.id) || 0) / (bottomHalf.length || 1)
      return t - b >= 0.3 && a.presence_pct < 70
    })
    .sort((a, b) => b.presence_pct - a.presence_pct)
    .slice(0, 12)

  // ---- imagens
  const pictureCounts = refs.map(r => r.picture_count).filter(n => n > 0)
  const medianPics = Math.round(median(pictureCounts))
  const maxPics = pictureCounts.length ? Math.max(...pictureCounts) : 0

  // ---- descrição
  const withDescription = refs.filter(r => r.short_description).length


  // ---- logística
  const freePct = Math.round((refs.filter(r => r.shipping.free_shipping).length / total) * 100)
  const fulPct = Math.round((refs.filter(r => r.shipping.fulfillment).length / total) * 100)

  // ---- fraquezas e oportunidades (baseadas em números reais)
  const common_weaknesses: string[] = []
  const opportunities: string[] = []

  const avgAttrs = refs.reduce((a, r) => a + r.attribute_count, 0) / total
  if (avgAttrs < 12) {
    common_weaknesses.push(`Ficha técnica rasa: as referências têm em média ${avgAttrs.toFixed(0)} atributos preenchidos`)
    opportunities.push('Preencher a ficha técnica completa é o diferencial mais fácil nesta categoria')
  }
  if (medianPics > 0 && medianPics < 6) {
    common_weaknesses.push(`Poucas fotos: mediana de ${medianPics} imagens por referência`)
    opportunities.push(`Publicar de ${Math.max(medianPics + 2, 6)} a 8 fotos coloca o anúncio acima da média`)
  }
  if (withDescription < total * 0.5) {
    common_weaknesses.push('Boa parte das referências não tem descrição estruturada')
    opportunities.push('Descrição completa e organizada aumenta conversão e reduz perguntas')
  }
  if (freePct < 50) {
    opportunities.push(`Apenas ${freePct}% das referências oferecem frete grátis — pode ser um diferencial`)
  }
  if (fulPct >= 50) {
    common_weaknesses.push(`${fulPct}% das referências usam Mercado Envios Full — a logística é competitiva aqui`)
  }
  if (refs.some(r => r.catalog_required)) {
    opportunities.push('Existem produtos com catálogo obrigatório: competir pela buy box exige preço e reputação fortes')
  }

  const description_structure = [
    'Abertura com o produto e sua aplicação principal',
    'Benefícios reais em tópicos curtos',
    'Especificações técnicas confirmadas',
    ...(refs.some(r => r.attributes.COMPATIBILITY || r.attributes.VEHICLE_COMPATIBILITY)
      ? ['Compatibilidade']
      : []),
    'Conteúdo da embalagem',
    'Modo de uso e cuidados',
    'Observações e garantia',
  ]

  const priceStats = research.price_stats

  return {
    title_patterns: titlePatterns,
    important_keywords,
    must_have_attributes,
    high_value_attributes,
    description_structure,
    image_patterns: {
      median_count: medianPics,
      max_count: maxPics,
      recommendation:
        medianPics > 0
          ? `As referências usam entre ${Math.min(...pictureCounts)} e ${maxPics} imagens (mediana ${medianPics}).`
          : 'Não foi possível medir a quantidade de imagens das referências.',
    },
    price_context: priceStats
      ? {
          min: priceStats.min,
          max: priceStats.max,
          median: priceStats.median,
          // sugestão: levemente abaixo da mediana, respeitando o piso do mercado
          suggested: Math.max(
            priceStats.min,
            Math.round(priceStats.median * 0.97 * 100) / 100
          ),
        }
      : null,
    logistics_patterns: {
      free_shipping_pct: freePct,
      fulfillment_pct: fulPct,
      note:
        fulPct >= 50
          ? 'Maioria das referências usa Full — prazo de entrega é fator decisivo'
          : freePct >= 50
            ? 'Frete grátis é o padrão da categoria'
            : 'Logística ainda não é diferencial consolidado nesta categoria',
    },
    common_weaknesses,
    opportunities,
    references_analyzed: refs.length,
  }
}

/** Resumo compacto do DNA para enviar à IA sem estourar tokens. */
export function dnaToPrompt(dna: WinningListingDNA, refs: CompetitorDossier[]): string {
  const lines: string[] = []

  lines.push(`REFERÊNCIAS ANALISADAS: ${dna.references_analyzed}`)

  if (dna.title_patterns.length) {
    lines.push('\nTÍTULOS DAS REFERÊNCIAS MAIS FORTES:')
    dna.title_patterns.slice(0, 5).forEach((t, i) => lines.push(`${i + 1}. ${t}`))
  }

  if (dna.important_keywords.length) {
    lines.push(`\nTERMOS RELEVANTES (busca real + títulos fortes): ${dna.important_keywords.slice(0, 14).join(', ')}`)
  }

  if (dna.must_have_attributes.length) {
    lines.push('\nATRIBUTOS PRESENTES NA MAIORIA:')
    dna.must_have_attributes.slice(0, 12).forEach(a =>
      lines.push(`- ${a.id} (${a.presence_pct}%): ex. ${a.common_values.slice(0, 2).join(' | ')}`)
    )
  }

  if (dna.high_value_attributes.length) {
    lines.push('\nATRIBUTOS QUE DIFERENCIAM OS MAIS FORTES:')
    dna.high_value_attributes.slice(0, 8).forEach(a =>
      lines.push(`- ${a.id}: ex. ${a.common_values.slice(0, 2).join(' | ')}`)
    )
  }

  if (dna.price_context) {
    lines.push(
      `\nPREÇOS REAIS: mínimo R$${dna.price_context.min.toFixed(2)}, mediana R$${dna.price_context.median.toFixed(2)}, máximo R$${dna.price_context.max.toFixed(2)}`
    )
  }

  lines.push(
    `\nLOGÍSTICA: ${dna.logistics_patterns.free_shipping_pct}% frete grátis, ${dna.logistics_patterns.fulfillment_pct}% Full`
  )

  if (dna.common_weaknesses.length) {
    lines.push('\nFRAQUEZAS DAS REFERÊNCIAS:')
    dna.common_weaknesses.forEach(w => lines.push(`- ${w}`))
  }

  const descSamples = refs
    .filter(r => r.short_description)
    .slice(0, 2)
    .map(r => r.short_description!.slice(0, 400))
  if (descSamples.length) {
    lines.push('\nAMOSTRA DE DESCRIÇÃO DAS REFERÊNCIAS (apenas para entender estrutura, NÃO copiar):')
    descSamples.forEach((d, i) => lines.push(`[${i + 1}] ${d}`))
  }

  return lines.join('\n')
}
