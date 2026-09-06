import type { ClassifiedAttribute } from './taxonomy'
import type { ListingAttribute } from './generator'
import type { WinningListingDNA } from './dna'

export interface ScoreDetail {
  score: number
  max: number
  label: string
  notes: string[]
}

export interface AssertiveScores {
  total: number
  seo: ScoreDetail
  technical_sheet: ScoreDetail
  images: ScoreDetail
  description: ScoreDetail
  attributes: ScoreDetail
}

export interface CompletenessResult {
  /** percentual de completude da ficha técnica, ponderado por importância */
  percent: number
  filled: number
  applicable: number
  required_total: number
  required_filled: number
  missing_required: string[]
  missing_recommended: string[]
}

const TIER_WEIGHT: Record<string, number> = {
  required: 4,
  catalog_required: 3,
  recommended: 2,
  optional: 1,
}

export function computeCompleteness(
  schema: ClassifiedAttribute[],
  filled: ListingAttribute[]
): CompletenessResult {
  const filledIds = new Set(filled.map(a => a.id))
  const applicable = schema.filter(a => !a.isVariationOnly)

  let weightTotal = 0
  let weightFilled = 0
  const missing_required: string[] = []
  const missing_recommended: string[] = []
  let required_total = 0
  let required_filled = 0

  for (const a of applicable) {
    const w = TIER_WEIGHT[a.tier] ?? 1
    weightTotal += w
    const isFilled = filledIds.has(a.id)
    if (isFilled) weightFilled += w

    if (a.tier === 'required' || a.tier === 'catalog_required') {
      required_total++
      if (isFilled) required_filled++
      else missing_required.push(a.name)
    } else if (a.tier === 'recommended' && !isFilled) {
      missing_recommended.push(a.name)
    }
  }

  return {
    percent: weightTotal ? Math.round((weightFilled / weightTotal) * 100) : 0,
    filled: filled.length,
    applicable: applicable.length,
    required_total,
    required_filled,
    missing_required,
    missing_recommended,
  }
}

interface ScoreInput {
  title: string
  description: string
  photos: string[]
  attributes: ListingAttribute[]
  schema: ClassifiedAttribute[]
  completeness: CompletenessResult
  dna: WinningListingDNA
  titleLimit: number
}

function scoreSeo(input: ScoreInput): ScoreDetail {
  const notes: string[] = []
  let score = 0
  const title = input.title.trim()
  const lower = title.toLowerCase()

  // uso do espaço disponível do título (títulos curtos perdem alcance)
  const ratio = title.length / input.titleLimit
  if (ratio >= 0.75) score += 30
  else if (ratio >= 0.55) {
    score += 20
    notes.push(`Título usa ${Math.round(ratio * 100)}% do limite — há espaço para mais termos relevantes`)
  } else {
    score += 8
    notes.push(`Título curto (${title.length}/${input.titleLimit}) — está perdendo alcance na busca`)
  }

  // cobertura das palavras realmente buscadas
  const keywords = input.dna.important_keywords.slice(0, 10)
  const hit = keywords.filter(k => lower.includes(k)).length
  const coverage = keywords.length ? hit / keywords.length : 0
  score += Math.round(coverage * 35)
  if (coverage < 0.4 && keywords.length) {
    notes.push(`Título cobre ${hit} de ${keywords.length} termos mais buscados da categoria`)
  }

  // marca e modelo no título
  const brand = input.attributes.find(a => a.id === 'BRAND')?.value_name?.toLowerCase()
  const model = input.attributes.find(a => a.id === 'MODEL')?.value_name?.toLowerCase()
  if (brand && lower.includes(brand)) score += 10
  else if (brand) notes.push('Marca não aparece no título')
  if (model && lower.includes(model)) score += 10
  else if (model) notes.push('Modelo não aparece no título')

  // penaliza repetição e ruído
  const words = lower.split(/\s+/).filter(w => w.length > 3)
  const unique = new Set(words)
  if (unique.size === words.length) score += 10
  else notes.push('Há palavras repetidas no título')

  if (/(frete gr[áa]tis|promo[çc][ãa]o|imperd[íi]vel|barato|!!)/i.test(title)) {
    score -= 15
    notes.push('Título contém termos promocionais que o Mercado Livre penaliza')
  }

  if (/[\p{Emoji_Presentation}]/u.test(title)) {
    score -= 10
    notes.push('Remova emojis do título')
  }

  return { score: Math.max(0, Math.min(100, score + 5)), max: 100, label: 'SEO', notes }
}

function scoreTechnicalSheet(input: ScoreInput): ScoreDetail {
  const c = input.completeness
  const notes: string[] = []
  if (c.missing_required.length) {
    notes.push(`Faltam ${c.missing_required.length} atributo(s) obrigatório(s): ${c.missing_required.slice(0, 4).join(', ')}`)
  }
  if (c.missing_recommended.length) {
    notes.push(`${c.missing_recommended.length} atributo(s) recomendado(s) ainda vazios`)
  }
  const avgRef = input.dna.must_have_attributes.length
  if (avgRef && c.filled > avgRef) {
    notes.push(`Ficha mais completa que o padrão das referências (${c.filled} vs ${avgRef} atributos)`)
  }
  return { score: c.percent, max: 100, label: 'Ficha técnica', notes }
}

function scoreImages(input: ScoreInput): ScoreDetail {
  const notes: string[] = []
  const count = input.photos.length
  const target = Math.max(input.dna.image_patterns.median_count + 2, 6)
  const score = Math.min(100, Math.round((count / target) * 100))

  if (count === 0) notes.push('Nenhuma foto adicionada — o anúncio não pode ser publicado sem imagem')
  else if (count < target) notes.push(`${count} foto(s). As referências usam mediana de ${input.dna.image_patterns.median_count}; recomendamos ${target}`)
  else notes.push(`${count} fotos — acima do padrão das referências`)

  return { score, max: 100, label: 'Imagens', notes }
}

function scoreDescription(input: ScoreInput): ScoreDetail {
  const notes: string[] = []
  const text = input.description.trim()
  const len = text.length
  let score = 0

  if (len >= 900) score += 45
  else if (len >= 500) {
    score += 32
    notes.push('Descrição pode ser mais detalhada')
  } else if (len >= 200) {
    score += 18
    notes.push('Descrição curta — está perdendo oportunidade de responder dúvidas')
  } else {
    notes.push('Descrição muito curta ou ausente')
  }

  const sections = text.split(/\n\s*\n/).filter(s => s.trim().length > 30)
  score += Math.min(sections.length, 6) * 6

  if (/^\s*[-•*]\s/m.test(text)) score += 12
  else notes.push('Use tópicos para facilitar a leitura')

  if (/especifica[çc]/i.test(text)) score += 8
  if (/(embalagem|conte[úu]do|acompanha)/i.test(text)) score += 7

  if (/(https?:\/\/|whatsapp|telefone|\(\d{2}\))/i.test(text)) {
    score -= 30
    notes.push('Contatos ou links externos são proibidos e podem derrubar o anúncio')
  }

  return { score: Math.max(0, Math.min(100, score)), max: 100, label: 'Descrição', notes }
}

function scoreAttributes(input: ScoreInput): ScoreDetail {
  const applicable = input.schema.filter(a => !a.isVariationOnly).length
  const filled = input.attributes.length
  const notes: string[] = []
  if (applicable) notes.push(`${filled} de ${applicable} atributos aplicáveis preenchidos`)
  const score = applicable ? Math.round((filled / applicable) * 100) : 0
  return { score, max: 100, label: 'Atributos', notes }
}

export function computeScores(input: ScoreInput): AssertiveScores {
  const seo = scoreSeo(input)
  const technical_sheet = scoreTechnicalSheet(input)
  const images = scoreImages(input)
  const description = scoreDescription(input)
  const attributes = scoreAttributes(input)

  // ponderação: ficha técnica e SEO pesam mais na performance real do anúncio
  const total = Math.round(
    seo.score * 0.28 +
      technical_sheet.score * 0.28 +
      images.score * 0.18 +
      description.score * 0.16 +
      attributes.score * 0.1
  )

  return { total, seo, technical_sheet, images, description, attributes }
}

/** Contagem de atributos das referências, para comparação honesta. */
export function referenceAttributeAverage(dna: WinningListingDNA): number {
  return dna.must_have_attributes.length + dna.high_value_attributes.length
}
