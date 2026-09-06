import type { AIConfig } from './types'
import type { ProductTruth, PendingQuestion } from './truth'
import type { WinningListingDNA } from './dna'
import type { ResearchResult } from './research'
import type { ClassifiedAttribute, CategoryInfo } from './taxonomy'
import { generateJson } from './ai'
import { dnaToPrompt } from './dna'
import { maxTitleLength, prioritizeAttributes } from './taxonomy'
import { truthToPlainText } from './truth'

export interface ListingAttribute {
  id: string
  name: string
  value_name: string
  value_id?: string
  tier: string
  source: 'truth' | 'ai' | 'catalog' | 'user'
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
  "family_name": "nome curto do produto sem cor/voltagem/quantidade",
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

  const truthByAttr: Record<string, string> = {}
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
    if (attrId) truthByAttr[attrId] = field.value
  }

  function push(id: string, rawValue: string, source: ListingAttribute['source']) {
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
    })
  }

  // 1) fatos confirmados do produto têm prioridade sobre a IA
  for (const [attrId, value] of Object.entries(truthByAttr)) push(attrId, value, 'truth')
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
  { order: 2, title: 'Ângulo lateral', description: 'Mostra proporção e formato do produto', required: true },
  { order: 3, title: 'Detalhe técnico', description: 'Close nas conexões, acabamento ou parte funcional', required: true },
  { order: 4, title: 'Escala/medidas', description: 'Produto ao lado de referência de tamanho ou com medidas indicadas', required: false },
  { order: 5, title: 'Conteúdo da embalagem', description: 'Tudo que o comprador recebe, disposto lado a lado', required: false },
  { order: 6, title: 'Produto em uso', description: 'Aplicação real, mostrando o contexto de utilização', required: false },
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

  const titleLimit = maxTitleLength(category)
  // limita o schema enviado à IA para controlar custo, mantendo os mais relevantes
  const schema = prioritizeAttributes(attributes).slice(0, 45)

  const userPrompt = `PRODUTO A ANUNCIAR (fatos confirmados — não contradiga):
${truthToPlainText(truth)}

CATEGORIA OFICIAL: ${category?.name || 'não determinada'} (${category?.id || 'sem id'})
LIMITE DO TÍTULO: ${titleLimit} caracteres

INTELIGÊNCIA DE MERCADO (dados reais do Mercado Livre):
${dnaToPrompt(dna, research.competitors)}

FICHA TÉCNICA DISPONÍVEL NESTA CATEGORIA (preencha o máximo possível COM EVIDÊNCIA):
${attributeSchemaForPrompt(schema)}

TAREFA:
1. Título de até ${titleLimit} caracteres, usando os termos realmente buscados, começando pelo tipo de produto e incluindo marca e modelo quando confirmados.
2. Duas alternativas de título.
3. family_name: nome curto do produto, sem cor, voltagem ou quantidade.
4. Descrição original e profissional seguindo esta estrutura: ${dna.description_structure.join(' → ')}.
5. Preencha os atributos com evidência. Os sem evidência vão para "missing" com uma pergunta clara.
6. Plano de fotos adequado a este produto específico.
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
  })

  const title = String(raw.title || truth.name).trim().slice(0, titleLimit)
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

  const imagePlan: ImagePlanStep[] =
    raw.image_plan && raw.image_plan.length >= 3
      ? raw.image_plan.slice(0, 8).map((s, i) => ({
          order: i + 1,
          title: String(s.title || `Foto ${i + 1}`),
          description: String(s.description || ''),
          required: i < 3 || Boolean(s.required),
        }))
      : DEFAULT_IMAGE_PLAN

  const price = dna.price_context?.suggested ?? null
  const priceRationale = dna.price_context
    ? `Sugestão baseada em ${research.price_stats?.sample_size ?? 0} ofertas reais: mediana R$${dna.price_context.median.toFixed(2)}, faixa R$${dna.price_context.min.toFixed(2)}–R$${dna.price_context.max.toFixed(2)}. O valor sugerido fica levemente abaixo da mediana para ganhar relevância sem entrar em guerra de preço.`
    : 'Não há ofertas ativas suficientes nas referências para sugerir um preço com segurança. Defina o preço manualmente.'

  const improvements = (raw.improvements || []).map(String).filter(Boolean)
  if (rejected.length) {
    improvements.push(
      `${rejected.length} valor(es) de atributo foram descartados por não existirem na lista oficial do Mercado Livre — o anúncio não publica dado inválido.`
    )
  }

  return {
    title,
    title_alternatives: (raw.title_alternatives || [])
      .map(t => String(t).trim().slice(0, titleLimit))
      .filter(t => t && t !== title)
      .slice(0, 2),
    family_name: String(raw.family_name || truth.name).trim().slice(0, 60),
    description: String(raw.description || '').trim(),
    price,
    price_rationale: priceRationale,
    attributes: reconciled,
    missing_attributes: missing,
    image_plan: imagePlan,
    category_id: category?.id || research.category_id || '',
    improvements,
  }
}
