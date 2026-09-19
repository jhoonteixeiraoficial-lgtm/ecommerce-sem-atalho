import type { AIConfig } from './types'
import type { ProductTruth, PendingQuestion, DataStatus, TruthField } from './truth'
import type { WinningListingDNA } from './dna'
import type { ResearchResult } from './research'
import type { ClassifiedAttribute, CategoryInfo } from './taxonomy'
import { generateJson } from './ai'
import { maxTitleLength, prioritizeAttributes } from './taxonomy'
import { buildCopyBrief, type CopyBrief } from './copy-brief'
import { factualDescription as safeDescription, guardTitle, verifyDescriptionClaims } from './copy-guard'
import { getPhotoRequirements } from './category-photos'

export interface ListingAttribute {
  id: string
  name: string
  value_name: string
  value_id?: string
  tier: string
  source: 'truth' | 'ai' | 'catalog' | 'user'
  /** Optional only for persisted drafts created before evidence status existed. */
  status?: DataStatus
  evidence?: string
  source_url?: string
  isVariationOnly?: boolean
}

export interface ImagePlanStep {
  order: number
  title: string
  description: string
  required: boolean
}

export interface GeneratedListing {
  title: string
  title_alternatives: string[]
  family_name: string
  description: string
  price: number | null
  price_rationale: string
  attributes: ListingAttribute[]
  /** atributos aplicáveis que ficaram sem valor por falta de evidência */
  missing_attributes: PendingQuestion[]
  image_plan: ImagePlanStep[]
  category_id: string
  improvements: string[]
}

const GENERATOR_SYSTEM = `Você é um especialista sênior em anúncios do Mercado Livre Brasil: SEO, catálogo, ficha técnica e conversão.

MISSÃO: criar um anúncio ORIGINAL, mais completo e mais profissional que as referências analisadas.

REGRAS ABSOLUTAS:
1. NUNCA invente informação. Só use dados confirmados do produto ou padrões estruturais das referências.
2. NUNCA copie o texto de um concorrente. Use as referências apenas para entender estrutura e termos.
3. NUNCA invente garantia, certificação, compatibilidade, material, medidas ou conteúdo da embalagem.
4. Para cada atributo da ficha técnica: preencha SOMENTE se houver evidência nos dados do produto.
   Se não houver evidência, coloque o id do atributo em "missing" com uma pergunta objetiva ao vendedor.
5. Quando o atributo tiver lista de valores permitidos, use EXATAMENTE um dos valores da lista.
   Valores numéricos NUNCA podem ser aproximados: se o produto é 250V e a lista só tem 220V,
   o atributo vai para "missing". Aproximar número é o mesmo que mentir na ficha técnica.
6. O título deve ser natural e legível. Sem repetir palavras. Sem "promoção", "frete grátis" ou emojis.
7. Escreva em português do Brasil, tom profissional e direto.

Responda SOMENTE com JSON válido:
{
  "title": "título principal dentro do limite de caracteres",
  "title_alternatives": ["alternativa 1", "alternativa 2"],
  "family_name": "tipo do produto + marca + linha/modelo (para catálogo ML — NÃO incluir atributos que o ML adiciona automaticamente ao título, como cor quando o ML usa MAIN_COLOR/COLOR; incluir atributos importantes de busca que o ML NÃO adiciona)",
  "description": "descrição completa em texto puro, com seções separadas por linhas em branco",
  "attributes": [ { "id": "BRAND", "value_name": "Kitest" } ],
  "missing": [ { "id": "VOLTAGE", "label": "Voltagem", "why": "não informado pelo vendedor" } ],
  "image_plan": [ { "title": "Foto principal", "description": "produto centralizado em fundo branco", "required": true } ],
  "improvements": ["o que este anúncio faz melhor que as referências"]
}`

function attributeSchemaForPrompt(attrs: ClassifiedAttribute[]): string {
  return attrs
    .map(a => {
      const parts = [`${a.id} | ${a.name} | ${a.tier}`]
      if (a.values?.length) {
        const sample = a.values.slice(0, 12).map(v => v.name)
        parts.push(
          `valores permitidos${a.values.length > 12 ? ` (${a.values.length} no total, exemplos)` : ''}: ${sample.join(' / ')}`
        )
      } else if (a.value_type === 'number_unit') {
        parts.push(`número + unidade (ex.: "12 V")${a.default_unit ? `, unidade padrão ${a.default_unit}` : ''}`)
      } else if (a.value_type === 'number') {
        parts.push('apenas número')
      } else if (a.value_type === 'boolean') {
        parts.push('valores permitidos: Sim / Não')
      }
      if (a.hint) parts.push(`dica: ${a.hint}`)
      return `- ${parts.join(' — ')}`
    })
    .join('\n')
}

/**
 * Normaliza preservando o separador decimal.
 * Sem isso "1.2V" e "12V" viram a mesma string e o sistema escolhe o valor errado.
 */
export function normalizeValue(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/,(\d)/g, '.$1')
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.$/, '')
}

/** true quando o valor é essencialmente numérico (ex.: "12V", "1.5 m", "220"). */
function isNumericValue(s: string): boolean {
  return /^[\d.,]+\s*[a-z%°]*$/i.test(s.trim())
}

/**
 * Encontra o valor oficial correspondente.
 * Valores numéricos exigem correspondência exata — aproximação aqui gera ficha errada.
 */
export function matchAttributeValue(
  input: string,
  values: Array<{ id: string; name: string }>
): { id: string; name: string } | null {
  const target = normalizeValue(input)
  if (!target) return null

  const exact = values.find(v => normalizeValue(v.name) === target)
  if (exact) return exact

  if (isNumericValue(input)) return null

  // texto: aceita correspondência por continência, com termo suficientemente longo
  return (
    values.find(v => {
      const n = normalizeValue(v.name)
      if (n.length < 3 || target.length < 3) return false
      return n === target || n.includes(target) || target.includes(n)
    }) || null
  )
}

function normalizedPhrase(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

function formatProductType(value: string): string {
  const connectors = new Set(['a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'para'])
  return value.trim().split(/\s+/).map((word, index) => {
    const lower = word.toLocaleLowerCase('pt-BR')
    if (index > 0 && connectors.has(lower)) return lower
    if (/^[A-Z0-9]{2,5}$/.test(word)) return word
    return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)
  }).join(' ')
}

function compactMeasurements(value: string): string {
  return value
    .replace(/(\d)\s+(V|W|A|HZ)\b/gi, (_match, number: string, unit: string) => `${number}${unit.toUpperCase()}`)
    .replace(/\s*(?:\/|\|)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function trimAtWord(value: string, limit: number): string {
  if (value.length <= limit) return value
  const clipped = value.slice(0, limit + 1)
  const boundary = clipped.lastIndexOf(' ')
  return (boundary > 0 ? clipped.slice(0, boundary) : value.slice(0, limit)).trim()
}

function completeTitle(value: string, limit: number): string {
  let clean = trimAtWord(compactMeasurements(value), limit)
    .replace(/\s*[+/,;:|&-]+\s*$/g, '')
    .trim()
  const openParen = clean.lastIndexOf('(')
  if (openParen > clean.lastIndexOf(')')) clean = clean.slice(0, openParen).trim()
  return trimAtWord(clean, limit)
}

function titleWords(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || []
}

function measurementClaims(value: string): string[] {
  return value.match(/\b\d+(?:[.,]\d+)?\s*(?:hz|kg|cm|mm|ml|v|w|a|g|m|l)\b|\b\d+(?:[.,]\d+)?\s*%/gi) || []
}

function hasUnsupportedMeasurement(value: string, truth: ProductTruth): boolean {
  const supportedValues = [
    truth.name,
    ...Object.values(truth.fields)
      .filter(field => field.confidence === 'confirmed' || field.status === 'CONFIRMED' || field.status === 'AUTO_FILLED' || field.status === 'USER_OVERRIDE')
      .map(field => field.value),
    truth.identity?.voltage,
    truth.identity?.kit_pack,
    truth.identity?.dimensions,
  ].filter((fact): fact is string => Boolean(fact))
  const supported = new Set(supportedValues.flatMap(measurementClaims).map(normalizeValue))
  return measurementClaims(value).some(claim => !supported.has(normalizeValue(claim)))
}

/** Título factual: identidade confirmada prevalece sobre texto livre da IA. */
export function buildSemanticTitle(truth: ProductTruth, proposed: string, limit: number, keywords: string[] = []): string {
  const identity = truth.identity
  const productType = identity?.product_type || truth.fields.product_type?.value
  const brand = identity?.brand || truth.fields.brand?.value
  const model = identity?.model || truth.fields.model?.value

  if (!productType || (!brand && !model) || truth.confidence < 0.7) {
    return completeTitle(proposed.trim() || truth.name, limit)
  }

  const proposedTitle = completeTitle(proposed.trim(), limit)
  const proposedWords = titleWords(proposedTitle)
  const containsPart = (part: string | null | undefined) => !part
    || titleWords(part).every(word => proposedWords.includes(word))
  const repeatsIdentityToken = [...new Set([productType, brand, model]
    .flatMap(part => titleWords(part || ''))
    .filter(word => word.length >= 4))]
    .some(word => proposedWords.filter(candidate => candidate === word).length > 1)
  const prohibitedClaim = /\b(?:frete\s+gr[aá]tis|imperd[ií]vel|oferta|promo[cç][aã]o)\b/i.test(proposedTitle)

  if (
    proposedTitle
    && containsPart(productType)
    && containsPart(brand)
    && containsPart(model)
    && !repeatsIdentityToken
    && !prohibitedClaim
    && !hasUnsupportedMeasurement(proposedTitle, truth)
  ) {
    return proposedTitle
  }

  const parts: string[] = []
  const add = (raw: string | null | undefined) => {
    const value = compactMeasurements(raw || '')
    if (!value) return
    const normalized = normalizedPhrase(value)
    const current = normalizedPhrase(parts.join(' '))
    if (normalized && current.includes(normalized)) return
    parts.push(value)
  }

  add(formatProductType(productType))
  add(brand)
  add(model)
  add(identity?.family_or_line)
  add(identity?.variant)
  add(identity?.voltage || truth.fields.voltage?.value)
  if (identity?.kit_pack && !/^1(?:\s|$)/.test(identity.kit_pack)) add(identity.kit_pack)

  for (const field of ['material', 'capacity', 'power'] as const) {
    const fact = truth.fields[field]
    if (!fact || fact.confidence !== 'confirmed' || fact.status === 'CONFLICT' || fact.status === 'NEEDS_CONFIRMATION') continue
    add(fact.value)
  }

  // Termos realmente buscados (pesquisa + DNA dos vencedores) preenchem o
  // orçamento de caracteres restante. Só entram palavras novas, sem medida
  // não confirmada e sem estourar o limite.
  const usedWords = new Set(titleWords(parts.join(' ')))
  let addedKeywords = 0
  for (const keyword of keywords) {
    if (addedKeywords >= 3 || parts.join(' ').length >= limit) break
    const phrase = compactMeasurements(String(keyword || '').trim())
    if (!phrase || phrase.length < 3) continue
    // mantém a grafia original (acentos/maiúsculas) e só usa palavras novas
    const fresh = phrase.split(/\s+/).filter(word => {
      const tokens = titleWords(word)
      return tokens.length === 1 && !usedWords.has(tokens[0])
    })
    if (!fresh.length) continue
    if (hasUnsupportedMeasurement(fresh.join(' '), truth)) continue
    const candidate = `${parts.join(' ')} ${fresh.join(' ')}`.trim()
    if (candidate.length > limit) continue
    parts.push(fresh.join(' '))
    for (const word of fresh) for (const token of titleWords(word)) usedWords.add(token)
    addedKeywords++
  }

  return completeTitle(parts.join(' '), limit)
}

const DESCRIPTION_LABELS: Record<string, string> = {
  brand: 'Marca',
  model: 'Modelo',
  family_or_line: 'Linha',
  line: 'Linha',
  variant: 'Variante',
  color: 'Cor',
  material: 'Material',
  voltage: 'Voltagem',
  power: 'Potência',
  capacity: 'Capacidade',
  dimensions: 'Dimensões',
  length: 'Comprimento',
  width: 'Largura',
  height: 'Altura',
  weight: 'Peso',
  units_per_pack: 'Unidades por embalagem',
  condition: 'Condição',
  gtin: 'GTIN',
}

function confirmedDescriptionFields(truth: ProductTruth) {
  return Object.entries(truth.fields).filter(([, field]) =>
    field.confidence === 'confirmed'
    || field.status === 'CONFIRMED'
    || field.status === 'AUTO_FILLED'
    || field.status === 'USER_OVERRIDE'
  )
}

/** Perguntas e respostas construídas SOMENTE com fatos confirmados. */
function factualFaq(truth: ProductTruth): string[] {
  const get = (key: string) => truth.fields[key]?.value?.trim()
  const condition = get('condition')
  const faq: Array<[string, string]> = []
  const brand = get('brand')
  if (brand) faq.push(['De qual marca é este produto?', `A marca confirmada deste produto é ${brand}.`])
  if (get('model')) faq.push(['Qual é o modelo?', `O modelo confirmado é ${get('model')}.`])
  if (condition) faq.push(['O produto é novo ou usado?', `Condição registrada no anúncio: ${condition}.`])
  if (get('capacity')) faq.push(['Qual a capacidade?', `A capacidade confirmada é ${get('capacity')}.`])
  if (get('voltage')) faq.push(['Funciona em qual voltagem?', `A voltagem confirmada é ${get('voltage')}.`])
  if (get('material')) faq.push(['De que material é feito?', `O material confirmado é ${get('material')}.`])
  const units = get('units_per_pack')
  if (units && !/^1$/.test(units.replace(/\D/g, '') || '1')) faq.push(['Quantas unidades vêm no pacote?', `A embalagem contém ${units}.`])
  return faq.map(([question, answer]) => `- ${question} ${answer}`)
}

function factualDescription(title: string, truth: ProductTruth): string {
  const facts = confirmedDescriptionFields(truth)
    .filter(([key]) => DESCRIPTION_LABELS[key])
    .map(([key, field]) => ({ label: DESCRIPTION_LABELS[key], value: field.value, key }))
  const highlightLabels = new Set(['brand', 'model', 'material', 'capacity', 'power', 'voltage', 'color', 'line', 'family_or_line'])
  const highlights = facts.filter(fact => highlightLabels.has(fact.key))
  const productType = truth.identity?.product_type || truth.fields.product_type?.value || truth.name
  const productFunction = truth.identity?.function || truth.fields.function?.value
  const variant = truth.identity?.variant || truth.fields.variant?.value
  const overview = productFunction
    ? `${productType} indicado para ${productFunction}. Todos os dados abaixo são confirmados, para você escolher com segurança.`
    : `${productType} com identidade e especificações verificadas, para facilitar uma compra segura.`
  const faq = factualFaq(truth)
  return [
    title,
    '',
    'Sobre o produto',
    overview,
    ...(variant ? [`Variação: ${variant}.`] : []),
    '',
    'Destaques do produto',
    `- Produto: ${productType}`,
    ...(productFunction ? [`- Aplicação: ${productFunction}`] : []),
    ...highlights.map(fact => `- ${fact.label}: ${fact.value}`),
    ...(facts.length ? ['', 'Especificações confirmadas', ...facts.map(fact => `- ${fact.label}: ${fact.value}`)] : []),
    ...(faq.length ? ['', 'Dúvidas frequentes', ...faq] : []),
    '',
    'Antes de comprar',
    'Confira modelo, variação e demais especificações confirmadas para garantir que esta é a opção adequada para sua necessidade.',
  ].join('\n').trim()
}

function hasUnsupportedDescriptionClaim(description: string, truth: ProductTruth): boolean {
  const facts = confirmedDescriptionFields(truth).map(([, field]) => normalizedPhrase(field.value))
  const unsupportedMeasurements = description.match(/\b\d+(?:[.,]\d+)?\s*(?:v|w|a|hz|kg|g|cm|mm|m|ml|l|anos?|meses?|%)\b/gi)
    ?.some(claim => !facts.some(fact => fact.includes(normalizedPhrase(claim)))) ?? false
  const hasWarrantyFact = Object.keys(truth.fields).some(key => /warranty|garantia/i.test(key))
  const hasPackageFact = Object.keys(truth.fields).some(key => /accessor|included|package_contents|conteudo/i.test(key))
  const unsupportedWarranty = /\bgarantia\b/i.test(description) && !hasWarrantyFact
  const unsupportedPackage = /\b(?:acompanha|inclus[oa]s?|conte[uú]do da embalagem)\b/i.test(description) && !hasPackageFact
  const unsupportedCertification = /\b(?:anatel|certifica(?:do|ção)|inmetro)\b/i.test(description)
    && !facts.some(fact => /anatel|certifica|inmetro/.test(fact))

  return unsupportedMeasurements || unsupportedWarranty || unsupportedPackage || unsupportedCertification
}

function guardDescription(proposed: string, title: string, truth: ProductTruth): string {
  const repaired = proposed
    .split('\n')
    .filter(line => !hasUnsupportedDescriptionClaim(line, truth))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const substantiveLines = repaired.split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(line => line.length >= 20)

  if (!repaired || repaired.length < 80 || substantiveLines.length < 2) {
    return factualDescription(title, truth)
  }

  const facts = confirmedDescriptionFields(truth)
    .filter(([key]) => DESCRIPTION_LABELS[key])
    .map(([key, field]) => `- ${DESCRIPTION_LABELS[key]}: ${field.value}`)
  const sections = [repaired]
  if (facts.length && !/especifica[cç][oõ]es confirmadas/i.test(repaired)) {
    sections.push(['Especificações confirmadas', ...facts].join('\n'))
  }
  const faq = factualFaq(truth)
  if (faq.length && !/d[uú]vidas frequentes/i.test(repaired)) {
    sections.push(['Dúvidas frequentes', ...faq].join('\n'))
  }
  if (!/antes de comprar/i.test(repaired)) {
    sections.push('Antes de comprar\nConfira modelo, variação e especificações confirmadas antes de concluir a compra.')
  }
  return sections.join('\n\n')
}

function titleCandidateScore(value: string, brief: CopyBrief): number {
  const candidateWords = titleWords(value)
  const uniqueWords = new Set(candidateWords)
  const keywordScore = brief.keywords.reduce((score, keyword) => {
    const words = titleWords(keyword)
    return score + (words.length && words.every(word => uniqueWords.has(word)) ? 20 + words.length : 0)
  }, 0)
  const repeated = candidateWords.filter((word, index) => word.length >= 4 && candidateWords.indexOf(word) !== index).length
  return keywordScore + Math.min(value.length, brief.category.title_limit) / 10 - repeated * 15
}

/**
 * Valida cada atributo gerado contra o schema oficial da categoria.
 * Valores que não existem na lista permitida são descartados — nada é forçado.
 */
function reconcileAttributes(
  generated: Array<{ id?: string; value_name?: string }>,
  truth: ProductTruth,
  schema: ClassifiedAttribute[]
): { attributes: ListingAttribute[]; rejected: string[] } {
  const byId = new Map(schema.map(a => [a.id, a]))
  const attributes: ListingAttribute[] = []
  const rejected: string[] = []
  const seen = new Set<string>()

  const truthByAttr: Record<string, TruthField> = {}
  const TRUTH_TO_ATTR: Record<string, string> = {
    brand: 'BRAND',
    model: 'MODEL',
    gtin: 'GTIN',
    sku: 'SELLER_SKU',
    color: 'COLOR',
    material: 'MATERIAL',
    voltage: 'VOLTAGE',
    power: 'POWER',
    capacity: 'CAPACITY',
    length: 'LENGTH',
    width: 'WIDTH',
    height: 'HEIGHT',
    weight: 'WEIGHT',
    units_per_pack: 'UNITS_PER_PACK',
    line: 'LINE',
    part_number: 'PART_NUMBER',
  }
  for (const [key, field] of Object.entries(truth.fields)) {
    const attrId = TRUTH_TO_ATTR[key]
    if (attrId) truthByAttr[attrId] = field
  }

  function push(
    id: string,
    rawValue: string,
    source: ListingAttribute['source'],
    provenance?: Pick<ListingAttribute, 'status' | 'evidence' | 'source_url'>
  ) {
    if (seen.has(id)) return
    const spec = byId.get(id)
    if (!spec) return
    const value = rawValue.trim()
    if (!value) return

    let value_id: string | undefined
    let value_name = value

    if (spec.values?.length) {
      const match = matchAttributeValue(value, spec.values)
      if (match) {
        value_id = match.id
        value_name = match.name
      } else if (spec.fixedValues) {
        // o ML recusaria este valor: descartar em vez de publicar algo inválido
        rejected.push(`${id}="${value}" (fora da lista permitida)`)
        return
      }
    }

    if (spec.value_max_length && value_name.length > spec.value_max_length) {
      value_name = value_name.slice(0, spec.value_max_length)
    }

    seen.add(id)
    attributes.push({
      id,
      name: spec.name,
      value_name,
      value_id,
      tier: spec.tier,
      source,
      status: provenance?.status ?? (source === 'ai' ? 'NEEDS_CONFIRMATION' : undefined),
      evidence: provenance?.evidence,
      source_url: provenance?.source_url,
      isVariationOnly: spec.isVariationOnly,
    })
  }

  // 1) fatos confirmados do produto têm prioridade sobre a IA
  for (const [attrId, field] of Object.entries(truthByAttr)) {
    push(attrId, field.value, 'truth', {
      status: field.status ?? (field.confidence === 'confirmed' ? 'CONFIRMED' : 'NEEDS_CONFIRMATION'),
      evidence: field.evidence,
      source_url: field.source_url,
    })
  }
  // 2) complementa com o que a IA derivou dos dados
  for (const g of generated) {
    if (g?.id && g?.value_name) push(String(g.id), String(g.value_name), 'ai')
  }

  return { attributes, rejected }
}

function buildMissing(
  schema: ClassifiedAttribute[],
  filled: ListingAttribute[],
  aiMissing: Array<{ id?: string; label?: string; why?: string }>
): PendingQuestion[] {
  const filledIds = new Set(filled.map(a => a.id))
  const byId = new Map(schema.map(a => [a.id, a]))
  const out: PendingQuestion[] = []
  const seen = new Set<string>()

  function add(id: string, why: string) {
    if (filledIds.has(id) || seen.has(id)) return
    const spec = byId.get(id)
    if (!spec) return
    seen.add(id)
    out.push({
      field: id,
      label: spec.name,
      why,
      options: spec.values?.slice(0, 12).map(v => v.name),
    })
  }

  // obrigatórios e recomendados que ficaram vazios são sempre perguntados
  for (const a of schema) {
    if (a.tier === 'required' || a.tier === 'catalog_required') {
      add(a.id, 'Obrigatório para publicar no Mercado Livre')
    }
  }
  for (const m of aiMissing) {
    if (m?.id) add(String(m.id), m.why || 'Sem evidência nos dados do produto')
  }
  for (const a of schema) {
    if (a.tier === 'recommended') add(a.id, 'Recomendado: melhora a posição na busca e a ficha técnica')
  }

  return out.slice(0, 25)
}

const DEFAULT_IMAGE_PLAN: ImagePlanStep[] = [
  { order: 1, title: 'Foto principal', description: 'Produto inteiro, centralizado, fundo branco, sem textos ou selos', required: true },
  { order: 2, title: 'Vista complementar', description: 'Outro enquadramento comprovado pelas referências exatas', required: true },
  { order: 3, title: 'Detalhe técnico', description: 'Close somente em controles, conexões ou partes visíveis', required: true },
  { order: 4, title: 'Produto em uso', description: 'Aplicação real sem adicionar itens ao produto', required: false },
  { order: 5, title: 'Acabamento', description: 'Textura, material e detalhes visíveis', required: false },
  { order: 6, title: 'Vista aproximada', description: 'Composição aproximada preservando a variante confirmada', required: false },
]

export interface GenerateInput {
  config: AIConfig | null
  truth: ProductTruth
  research: ResearchResult
  dna: WinningListingDNA
  category: CategoryInfo | null
  attributes: ClassifiedAttribute[]
  tone?: string
  targetMarginPct?: number
}

export async function generateListing(input: GenerateInput): Promise<GeneratedListing> {
  const { config, truth, research, dna, category, attributes } = input

  const titleLimit = Math.min(maxTitleLength(category), 60)
  const photoRequirements = getPhotoRequirements(research.domain_id)
  // o plano de fotos precisa superar a mediana real das referências vencedoras
  const referencePhotoMedian = dna.image_patterns?.median_count ?? 0
  const referencePhotoMax = dna.image_patterns?.max_count ?? 0
  const recommendedPhotos = Math.min(
    Math.max(photoRequirements.recommended_photos, referencePhotoMedian ? referencePhotoMedian + 1 : 5),
    7
  )
  // limita o schema enviado à IA para controlar custo, mantendo os mais relevantes
  const schema = prioritizeAttributes(attributes).slice(0, 45)
  const copyBrief = buildCopyBrief({
    truth,
    category,
    keywords: [...(research.keywords || []), ...(dna.important_keywords || [])],
    titleShapes: dna.title_patterns.length ? ['TIPO + MARCA + MODELO + DIFERENCIAL CONFIRMADO'] : [],
    descriptionShapes: dna.description_structure,
  })

  const userPrompt = `BRIEF CONGELADO DO PRODUTO (use somente estes fatos na copy):
${JSON.stringify(copyBrief)}

CATEGORIA OFICIAL: ${category?.name || 'não determinada'} (${category?.id || 'sem id'})
LIMITE DO TÍTULO: ${titleLimit} caracteres
PLANO VISUAL DA CATEGORIA: ${JSON.stringify({
    recommended_photos: recommendedPhotos,
    shot_types: photoRequirements.shot_types,
    restrictions: photoRequirements.restrictions,
    referencias_vencedoras: referencePhotoMedian > 0
      ? { mediana_de_fotos: referencePhotoMedian, maximo_de_fotos: referencePhotoMax, nota: 'Seu plano deve cobrir todos os enquadramentos que as referências usam e ainda adicionar valor.' }
      : 'sem medição de fotos das referências',
  })}

PADRÕES COMPETITIVOS PERMITIDOS (estrutura, nunca valores dos concorrentes):
${copyBrief.benchmark_patterns.title_shapes.join(' | ') || 'sem padrão confiável'}
${copyBrief.benchmark_patterns.description_shapes.join(' | ') || 'estrutura factual'}

TÍTULOS REAIS DOS ANÚNCIOS CAMPEÕES DESTA BUSCA (aprenda a ESTRUTURA, a ordem
dos termos e as palavras-chave que eles usam; NUNCA copie um título inteiro):
${(research.competitors || [])
  .filter(c => c.title)
  .sort((a, b) => (b.competitive_reference_strength || 0) - (a.competitive_reference_strength || 0))
  .slice(0, 5)
  .map((c, i) => `${i + 1}. ${c.title}`)
  .join('\n') || 'nenhum título de campeão disponível — use os termos-chave do brief'}

FICHA TÉCNICA DISPONÍVEL NESTA CATEGORIA (preencha o máximo possível COM EVIDÊNCIA):
${attributeSchemaForPrompt(schema)}

TAREFA:
1. Título de até ${titleLimit} caracteres, usando os termos realmente buscados, começando pelo tipo de produto e incluindo marca e modelo quando confirmados. Use as KEYWORDS do brief: são os termos com maior volume de busca e dos anúncios vencedores.
2. Duas alternativas de título.
3. family_name: nome factual do produto para o catálogo do ML, com tipo, marca e modelo protegidos. Máximo 60 caracteres.
4. Descrição original e profissional, que converte: parágrafos curtos, benefícios práticos derivados APENAS dos fatos do brief (explique o que um fato confirmado significa na prática, sem criar fatos novos) e uma seção final "Dúvidas frequentes" respondida só com fatos do brief. Omita garantia, certificação, compatibilidade, conteúdo da embalagem, medidas ou desempenho que não estejam no brief.
5. Preencha os atributos com evidência. Os sem evidência vão para "missing" com uma pergunta clara.
6. Plano de ${Math.max(5, recommendedPhotos)} fotos ou mais (até 7) adequado a este produto específico, cobrindo os enquadramentos que as referências vencedoras usam. Não proponha embalagem, acessórios, medidas, textos ou detalhes que não estejam confirmados no brief.
7. Em "improvements", diga objetivamente o que este anúncio entrega a mais que as referências.

Tom: ${input.tone || 'profissional'}.`

  interface RawListing {
    title?: string
    title_alternatives?: string[]
    family_name?: string
    description?: string
    attributes?: Array<{ id?: string; value_name?: string }>
    missing?: Array<{ id?: string; label?: string; why?: string }>
    image_plan?: Array<{ title?: string; description?: string; required?: boolean }>
    improvements?: string[]
  }

  const raw = await generateJson<RawListing>(config, GENERATOR_SYSTEM, userPrompt, {
    temperature: 0.5,
    maxTokens: 6000,
    workload: 'draft',
  })

  const rawTitleGuard = guardTitle(copyBrief, completeTitle(String(raw.title || truth.name), titleLimit), titleLimit)
  const titleCandidates = [raw.title, ...(raw.title_alternatives || [])]
    .map(candidate => String(candidate || '').trim())
    .filter(Boolean)
    .map(candidate => guardTitle(copyBrief, buildSemanticTitle(truth, candidate, titleLimit, copyBrief.keywords), titleLimit))
  const titleGuard = titleCandidates
    .filter(candidate => candidate.accepted)
    .sort((a, b) => titleCandidateScore(b.value, copyBrief) - titleCandidateScore(a.value, copyBrief))[0]
    || guardTitle(copyBrief, buildSemanticTitle(truth, String(raw.title || truth.name), titleLimit, copyBrief.keywords), titleLimit)
  const title = titleGuard.value
  const rawFamilyGuard = guardTitle(copyBrief, completeTitle(String(raw.family_name || truth.name), 60), 60)
  const familyGuard = guardTitle(
    copyBrief,
    buildSemanticTitle(truth, String(raw.family_name || truth.name), 60),
    60
  )
  const familyName = familyGuard.value
  const rawDescriptionGuard = verifyDescriptionClaims(String(raw.description || ''), copyBrief)
  const proposedDescription = guardDescription(String(raw.description || ''), title, truth)
  const descriptionGuard = verifyDescriptionClaims(proposedDescription, copyBrief)
  const description = descriptionGuard.valid ? proposedDescription : safeDescription(copyBrief, title)
  const { attributes: reconciled, rejected } = reconcileAttributes(
    raw.attributes || [],
    truth,
    attributes
  )
  const missing = buildMissing(attributes, reconciled, raw.missing || [])

  // perguntas ainda pendentes do ProductTruth entram na mesma fila
  for (const u of truth.uncertain) {
    if (!missing.some(m => m.label.toLowerCase() === u.label.toLowerCase())) {
      missing.push(u)
    }
  }

  const proposedImagePlan: ImagePlanStep[] =
    raw.image_plan && raw.image_plan.length >= 3
      ? raw.image_plan.slice(0, 7).map((s, i) => ({
          order: i + 1,
          title: String(s.title || `Foto ${i + 1}`),
          description: String(s.description || ''),
          required: i < 3 || Boolean(s.required),
        }))
      : DEFAULT_IMAGE_PLAN
  const imagePlan = [...proposedImagePlan, ...DEFAULT_IMAGE_PLAN.slice(proposedImagePlan.length)]
    .slice(0, Math.max(5, Math.min(7, proposedImagePlan.length)))
    .map((step, index) => ({ ...step, order: index + 1 }))

  const priceBasis = dna.price_context?.basis || research.price_basis
  const price = priceBasis === 'EXACT_PRODUCT' ? dna.price_context?.suggested ?? null : null
  const priceRationale = dna.price_context && priceBasis === 'EXACT_PRODUCT'
    ? `Sugestão baseada em ${dna.price_context.sample_size || research.price_stats?.sample_size || 0} oferta(s) real(is) do produto exato: mediana R$${dna.price_context.median.toFixed(2)}, faixa R$${dna.price_context.min.toFixed(2)}–R$${dna.price_context.max.toFixed(2)}. O valor sugerido fica levemente abaixo da mediana para ganhar relevância sem entrar em guerra de preço.`
    : dna.price_context && priceBasis === 'COMPARABLE_PRODUCT'
      ? `A faixa observada vem de ${dna.price_context.sample_size || research.price_stats?.sample_size || 0} oferta(s) de produtos comparáveis, não do produto exato. Use-a apenas como referência e confirme o preço manualmente.`
      : 'Não há ofertas ativas suficientes nas referências para sugerir um preço com segurança. Defina o preço manualmente.'

  const improvements = (raw.improvements || []).map(String).filter(Boolean)
  const guardReasons = [...new Set([
    ...titleGuard.reason_codes,
    ...rawTitleGuard.reason_codes,
    ...familyGuard.reason_codes,
    ...rawFamilyGuard.reason_codes,
    ...rawDescriptionGuard.reason_codes,
    ...descriptionGuard.reason_codes,
  ])]
  if (guardReasons.length) improvements.push(`COPY_GUARD: ${guardReasons.join(', ')}`)
  if (rejected.length) {
    improvements.push(
      `${rejected.length} valor(es) de atributo foram descartados por não existirem na lista oficial do Mercado Livre — o anúncio não publica dado inválido.`
    )
  }

  return {
    title,
    title_alternatives: (raw.title_alternatives || [])
      .map(t => guardTitle(copyBrief, buildSemanticTitle(truth, String(t), titleLimit), titleLimit))
      .filter(result => result.accepted)
      .map(result => result.value)
      .filter(t => t && t !== title)
      .filter((alternative, index, alternatives) => alternatives.indexOf(alternative) === index)
      .slice(0, 2),
    family_name: familyName,
    description,
    price,
    price_rationale: priceRationale,
    attributes: reconciled,
    missing_attributes: missing,
    image_plan: imagePlan,
    category_id: category?.id || research.category_id || '',
    improvements,
  }
}
