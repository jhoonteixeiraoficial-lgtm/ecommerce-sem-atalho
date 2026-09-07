import type { AIConfig } from './types'
import type { ProductTruth, PendingQuestion, DataStatus } from './truth'
import type { ClassifiedAttribute } from './taxonomy'
import { matchAttributeValue, type ListingAttribute } from './generator'
import { runTaskJson } from './ai-router'
import { searchWeb, buildManufacturerQuery, type WebSource } from './websearch'

/**
 * AUTOFILL-FIRST.
 *
 * Ordem de resolução (para de descer assim que encontra evidência):
 *   1. USER_OVERRIDE / dado já confirmado
 *   2. ProductTruth
 *   3. produto EXATO no catálogo do Mercado Livre
 *   4. derivação determinística
 *   5. retrieval web (fabricante/manual/datasheet) + raciocínio sobre as fontes
 *   6. inferência sem fonte -> NEEDS_CONFIRMATION
 *   7. UNKNOWN / NOT_APPLICABLE
 *
 * Só chega ao usuário o que sobrou depois de tudo isso.
 */

export interface EnrichedAttribute extends ListingAttribute {
  status: DataStatus
  evidence?: string
  source_url?: string
}

export interface AutofillStats {
  applicable: number
  already_filled: number
  from_exact_product: number
  from_derivation: number
  from_web: number
  inferred_needs_confirmation: number
  not_applicable: number
  unknown: number
  user_input_required: number
  auto_fill_percent: number
}

export interface EnrichmentResult {
  attributes: EnrichedAttribute[]
  remaining: PendingQuestion[]
  stats: AutofillStats
  web: { used: boolean; reason?: string; sources: WebSource[]; queries: string[] }
  reasoning_provider: string
}

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

/** Atributos que dependem exclusivamente do vendedor: não pesquisar na web. */
const SELLER_ONLY = new Set([
  'SELLER_SKU',
  'SELLER_PACKAGE_HEIGHT',
  'SELLER_PACKAGE_WIDTH',
  'SELLER_PACKAGE_LENGTH',
  'SELLER_PACKAGE_WEIGHT',
])

function normalizeUnitValue(
  rawValue: string,
  spec: ClassifiedAttribute
): string {
  if (spec.value_type !== 'number_unit') return rawValue
  const allowedIds = (spec.allowed_units || []).map(u => u.id.toLowerCase())
  const defaultUnit = spec.default_unit || ''
  const numPart = rawValue.replace(/[^0-9.,]/g, '').trim()
  if (!numPart) return rawValue
  const lower = rawValue.toLowerCase()
  for (const u of spec.allowed_units || []) {
    if (lower.includes(u.id.toLowerCase()) || lower.includes(u.name.toLowerCase())) {
      return `${numPart} ${u.id}`
    }
  }
  return defaultUnit ? `${numPart} ${defaultUnit}` : numPart
}

function put(
  out: Map<string, EnrichedAttribute>,
  spec: ClassifiedAttribute,
  rawValue: string,
  status: DataStatus,
  source: ListingAttribute['source'],
  evidence?: string,
  source_url?: string
): boolean {
  if (out.has(spec.id)) return false
  const value = rawValue?.trim()
  if (!value) return false

  let value_id: string | undefined
  let value_name = value

  if (spec.values?.length) {
    const match = matchAttributeValue(value, spec.values)
    if (match) {
      value_id = match.id
      value_name = match.name
    } else if (spec.fixedValues) {
      return false
    }
  }

  if (spec.value_type === 'number_unit' && !value_name.match(/[a-z]/i)) {
    value_name = normalizeUnitValue(value_name, spec)
  }

  if (spec.value_max_length && value_name.length > spec.value_max_length) {
    value_name = value_name.slice(0, spec.value_max_length)
  }

  out.set(spec.id, {
    id: spec.id,
    name: spec.name,
    value_name,
    value_id,
    tier: spec.tier,
    source,
    status,
    evidence,
    source_url,
  })
  return true
}

/** Regras determinísticas: consequência lógica de dados já confirmados. */
function deriveDeterministic(
  out: Map<string, EnrichedAttribute>,
  schema: ClassifiedAttribute[]
): number {
  const byId = new Map(schema.map(a => [a.id, a]))
  let count = 0

  const saleFormat = out.get('SALE_FORMAT')?.value_name?.toLowerCase()
  const isKit = out.get('IS_KIT')?.value_name?.toLowerCase()

  // venda por unidade implica 1 unidade por embalagem
  if (saleFormat === 'unidade' && !out.has('UNITS_PER_PACK')) {
    const spec = byId.get('UNITS_PER_PACK')
    if (spec && put(out, spec, '1', 'AUTO_FILLED', 'catalog', 'Consequência de "Formato de venda: Unidade"')) {
      count++
    }
  }

  // unidade única implica que não é kit
  if ((saleFormat === 'unidade' || out.get('UNITS_PER_PACK')?.value_name === '1') && !out.has('IS_KIT')) {
    const spec = byId.get('IS_KIT')
    if (spec && put(out, spec, 'Não', 'AUTO_FILLED', 'catalog', 'Produto vendido por unidade')) count++
  }

  // kit declarado exige quantidade, não o contrário
  if (isKit === 'não' && !out.has('UNITS_PER_KIT')) {
    const spec = byId.get('UNITS_PER_KIT')
    if (spec && put(out, spec, '1', 'AUTO_FILLED', 'catalog', 'Produto não é kit')) count++
  }

  return count
}

interface WebExtraction {
  attributes?: Array<{
    id?: string
    value?: string
    status?: string
    evidence?: string
    source_url?: string
  }>
  not_applicable?: Array<{ id?: string; why?: string }>
  unknown?: string[]
}

const EXTRACTION_SYSTEM = `Você é um pesquisador técnico de produtos. Recebe FONTES REAIS coletadas na web e deve extrair fatos.

REGRAS ABSOLUTAS:
1. Só afirme um valor se ele estiver EXPLÍCITO nas fontes fornecidas. Cite o trecho como evidência.
2. Se as fontes falam de outro produto (marca/modelo diferente), IGNORE. Nunca use dado de produto parecido.
3. Se as fontes divergirem entre si, use status "CONFLICT" e descreva a divergência.
4. Se o atributo não se aplica a este tipo de produto, coloque em "not_applicable".
5. Se não encontrou nas fontes, coloque o id em "unknown". Não invente.
6. Respeite a lista de valores permitidos quando informada.

status permitidos: "AUTO_FILLED" (achou na fonte) | "CONFLICT" (fontes divergem)

Responda SOMENTE com JSON:
{
  "attributes": [ { "id": "WEIGHT", "value": "120 g", "status": "AUTO_FILLED", "evidence": "trecho literal da fonte", "source_url": "https://..." } ],
  "not_applicable": [ { "id": "VOLTAGE", "why": "produto não é elétrico" } ],
  "unknown": ["MAX_MEASUREMENT_DISTANCE"]
}`

function describeAttributes(specs: ClassifiedAttribute[]): string {
  return specs
    .map(a => {
      const parts = [`${a.id} (${a.name})`]
      if (a.values?.length) {
        parts.push(`valores permitidos: ${a.values.slice(0, 14).map(v => v.name).join(' / ')}`)
      } else if (a.value_type === 'number_unit') {
        parts.push('número + unidade')
      } else if (a.value_type === 'boolean') {
        parts.push('Sim / Não')
      }
      return `- ${parts.join(' — ')}`
    })
    .join('\n')
}

export interface EnrichmentInput {
  config: AIConfig | null
  truth: ProductTruth
  schema: ClassifiedAttribute[]
  /** SOMENTE produtos classificados como EXACT_PRODUCT. Comparáveis não entram aqui. */
  exactProductAttributes: Array<{ title: string; attributes: Record<string, string> }>
  /** atributos já presentes (ex.: gerados ou informados pelo usuário) */
  current?: ListingAttribute[]
  /** desliga o retrieval web (economia em reprocessamentos) */
  skipWeb?: boolean
}

export async function enrichAttributes(input: EnrichmentInput): Promise<EnrichmentResult> {
  const { config, truth, schema, exactProductAttributes } = input
  const applicableSchema = schema.filter(a => !a.isVariationOnly)
  const byId = new Map(applicableSchema.map(a => [a.id, a]))
  const out = new Map<string, EnrichedAttribute>()

  const stats: AutofillStats = {
    applicable: applicableSchema.length,
    already_filled: 0,
    from_exact_product: 0,
    from_derivation: 0,
    from_web: 0,
    inferred_needs_confirmation: 0,
    not_applicable: 0,
    unknown: 0,
    user_input_required: 0,
    auto_fill_percent: 0,
  }

  // ---- 1. atributos já existentes (inclui edições do usuário) têm prioridade
  for (const a of input.current || []) {
    const spec = byId.get(a.id)
    if (!spec) continue
    const isUser = a.source === 'user'
    out.set(a.id, {
      ...a,
      status: isUser ? 'USER_OVERRIDE' : 'CONFIRMED',
    })
    stats.already_filled++
  }

  // ---- 2. ProductTruth
  for (const [key, field] of Object.entries(truth.fields)) {
    const attrId = TRUTH_TO_ATTR[key]
    const spec = attrId ? byId.get(attrId) : undefined
    if (!spec) continue
    const status: DataStatus =
      field.status === 'USER_OVERRIDE' || field.source === 'user'
        ? 'USER_OVERRIDE'
        : field.confidence === 'confirmed'
          ? 'CONFIRMED'
          : 'AUTO_FILLED'
    if (put(out, spec, field.value, status, 'truth', field.evidence, field.source_url)) {
      stats.already_filled++
    }
  }

  // ---- 3. produto EXATO do catálogo (única fonte de fato entre anúncios)
  for (const exact of exactProductAttributes) {
    for (const [attrId, value] of Object.entries(exact.attributes)) {
      const spec = byId.get(attrId)
      if (!spec) continue
      if (
        put(
          out,
          spec,
          value,
          'AUTO_FILLED',
          'catalog',
          `Ficha do produto exato no catálogo do Mercado Livre: "${exact.title}"`
        )
      ) {
        stats.from_exact_product++
      }
    }
  }

  // ---- 4. GTIN resolver dedicado
  if (!out.has('GTIN') && byId.has('GTIN')) {
    const gtinResult = await resolveGTIN({
      truth,
      exactProductAttributes,
      config,
    })
    if (gtinResult.value) {
      const gtinSpec = byId.get('GTIN')!
      if (put(out, gtinSpec, gtinResult.value, gtinResult.status, gtinResult.source, gtinResult.evidence, gtinResult.source_url)) {
        stats.from_web++
      }
    }
  }

  // ---- 5. derivação determinística
  stats.from_derivation += deriveDeterministic(out, applicableSchema)

  // ---- 6. retrieval web + raciocínio sobre as fontes
  const notApplicable = new Set<string>()
  const web: EnrichmentResult['web'] = { used: false, sources: [], queries: [] }
  let reasoning_provider = 'nenhum'

  const stillMissing = applicableSchema.filter(
    a => !out.has(a.id) && !SELLER_ONLY.has(a.id) && a.tier !== 'optional'
  )

  if (stillMissing.length && !input.skipWeb) {
    const query = buildManufacturerQuery(
      truth.name,
      truth.fields.brand?.value,
      truth.fields.model?.value,
      stillMissing.map(a => a.name)
    )
    const search = await searchWeb(query)
    web.used = search.available
    web.reason = search.unavailable_reason
    web.sources = search.sources
    web.queries = search.queries

    if (search.available) {
      const sourcesBlock = search.sources
        .map((s, i) => `[${i + 1}] ${s.title || s.url}\nURL: ${s.url}\n${s.snippet}`)
        .join('\n\n')

      try {
        const extracted = await runTaskJson<WebExtraction>(
          'attribute_enrichment',
          config,
          EXTRACTION_SYSTEM,
          `PRODUTO (não confunda com produtos parecidos):
${truth.name}
Marca: ${truth.fields.brand?.value || 'não confirmada'}
Modelo: ${truth.fields.model?.value || 'não confirmado'}

ATRIBUTOS QUE PRECISO PREENCHER:
${describeAttributes(stillMissing)}

RESUMO DA PESQUISA:
${search.content.slice(0, 4000)}

FONTES COLETADAS:
${sourcesBlock.slice(0, 6000)}`,
          { maxTokens: 3000 }
        )

        for (const item of extracted.attributes || []) {
          if (!item?.id || !item?.value) continue
          const spec = byId.get(String(item.id))
          if (!spec) continue
          const conflicting = String(item.status || '').toUpperCase() === 'CONFLICT'
          if (
            put(
              out,
              spec,
              String(item.value),
              conflicting ? 'CONFLICT' : 'AUTO_FILLED',
              'catalog',
              item.evidence?.slice(0, 400),
              item.source_url
            )
          ) {
            stats.from_web++
          }
        }

        for (const na of extracted.not_applicable || []) {
          if (na?.id && byId.has(String(na.id))) notApplicable.add(String(na.id))
        }
      } catch {
        // extração falhou: os campos seguem para as etapas seguintes
      }
    }
  }

  // ---- 6. inferência sem fonte: entra como NEEDS_CONFIRMATION, nunca como fato
  const afterWeb = applicableSchema.filter(
    a =>
      !out.has(a.id) &&
      !notApplicable.has(a.id) &&
      !SELLER_ONLY.has(a.id) &&
      (a.tier === 'required' || a.tier === 'catalog_required' || a.tier === 'recommended')
  )

  if (afterWeb.length) {
    try {
      const inferred = await runTaskJson<WebExtraction>(
        'attribute_enrichment',
        config,
        `Você é um especialista em fichas técnicas de produtos para marketplace.

Recebe um produto e atributos ainda vazios. Para cada um, decida:
- se o atributo NÃO SE APLICA a este tipo de produto -> "not_applicable"
- se você tem alta confiança no valor típico deste produto específico -> "attributes" com status "NEEDS_CONFIRMATION"
- se não sabe -> "unknown"

REGRAS:
1. NUNCA afirme como certo. Tudo aqui será confirmado pelo vendedor.
2. Não invente marca, modelo, GTIN, garantia ou medidas de embalagem. Esses vão para "unknown".
3. Só sugira quando a característica for consequência clara do tipo de produto.
4. Respeite os valores permitidos.

Responda SOMENTE JSON:
{"attributes":[{"id":"IS_WIRELESS","value":"Não","status":"NEEDS_CONFIRMATION","evidence":"por que é provável"}],"not_applicable":[{"id":"SHOE_SIZE","why":"não é calçado"}],"unknown":["GTIN"]}`,
        `PRODUTO: ${truth.name}
Marca: ${truth.fields.brand?.value || 'não confirmada'}
Modelo: ${truth.fields.model?.value || 'não confirmado'}
Dados confirmados: ${Object.entries(truth.fields).map(([k, v]) => `${k}=${v.value}`).join(', ') || 'nenhum'}

ATRIBUTOS VAZIOS:
${describeAttributes(afterWeb)}`,
        { maxTokens: 2500 }
      )

      for (const item of inferred.attributes || []) {
        if (!item?.id || !item?.value) continue
        const spec = byId.get(String(item.id))
        if (!spec) continue
        if (
          put(
            out,
            spec,
            String(item.value),
            'NEEDS_CONFIRMATION',
            'ai',
            item.evidence?.slice(0, 300) || 'Sugestão do Assertive — confirme antes de publicar'
          )
        ) {
          stats.inferred_needs_confirmation++
        }
      }

      for (const na of inferred.not_applicable || []) {
        if (na?.id && byId.has(String(na.id))) notApplicable.add(String(na.id))
      }
    } catch {
      // segue sem inferência
    }
  }

  const { reasoningEngineStatus } = await import('./ai-router')
  reasoning_provider = reasoningEngineStatus().engine

  // ---- 7. o que sobrou vira pergunta (o mínimo possível)
  stats.not_applicable = notApplicable.size

  const remaining: PendingQuestion[] = []
  for (const spec of applicableSchema) {
    if (out.has(spec.id) || notApplicable.has(spec.id)) continue

    const critical = spec.tier === 'required' || spec.tier === 'catalog_required'
    if (!critical && spec.tier !== 'recommended') {
      stats.unknown++
      continue
    }

    remaining.push({
      field: spec.id,
      label: spec.name,
      why: SELLER_ONLY.has(spec.id)
        ? 'Só você tem esta informação'
        : critical
          ? 'Obrigatório para publicar e não encontrado nas fontes'
          : 'Recomendado: melhora a posição na busca',
      options: spec.values?.slice(0, 15).map(v => v.name),
    })
    if (critical) stats.user_input_required++
    else stats.unknown++
  }

  // perguntas herdadas da identificação continuam válidas
  for (const u of truth.uncertain) {
    const attrId = TRUTH_TO_ATTR[u.field]
    if (attrId && out.has(attrId)) continue
    if (remaining.some(r => r.field === u.field || r.label.toLowerCase() === u.label.toLowerCase())) continue
    remaining.push(u)
  }

  const autoFilled =
    stats.from_exact_product + stats.from_derivation + stats.from_web + stats.inferred_needs_confirmation
  stats.auto_fill_percent = stats.applicable
    ? Math.round(((stats.already_filled + autoFilled) / stats.applicable) * 100)
    : 0

  return {
    attributes: [...out.values()],
    remaining: remaining.slice(0, 20),
    stats,
    web,
    reasoning_provider,
  }
}

// ---------------------------------------------------------------- GTIN resolver

interface GTINResult {
  value: string | null
  status: DataStatus
  source: ListingAttribute['source']
  evidence?: string
  source_url?: string
}

function validateGTIN(gtin: string): boolean {
  const digits = gtin.replace(/[^0-9]/g, '')
  if (digits.length !== 8 && digits.length !== 12 && digits.length !== 13 && digits.length !== 14) return false
  if (/^0+$/.test(digits)) return false
  if (/^(.)\1+$/.test(digits)) return false
  return true
}

async function resolveGTIN(input: {
  truth: ProductTruth
  exactProductAttributes: Array<{ title: string; attributes: Record<string, string> }>
  config: AIConfig | null
}): Promise<GTINResult> {
  const { truth, exactProductAttributes, config } = input
  const INVALID = /^(na|n\/a|não informado|nao informado|0+|n\/a\.?|indefinido|indisponivel|indisponível|desconhecido)$/i

  // 1. Truth já tem GTIN?
  const truthGTIN = truth.fields.gtin?.value
  if (truthGTIN && !INVALID.test(truthGTIN) && validateGTIN(truthGTIN)) {
    return {
      value: truthGTIN,
      status: 'CONFIRMED',
      source: 'truth',
      evidence: truth.fields.gtin?.evidence,
      source_url: truth.fields.gtin?.source_url,
    }
  }

  // 2. EXACT_PRODUCT catalog attributes
  for (const exact of exactProductAttributes) {
    const gtinVal = exact.attributes['GTIN'] || exact.attributes['EAN'] || exact.attributes['UPC']
    if (gtinVal && !INVALID.test(gtinVal) && validateGTIN(gtinVal)) {
      return {
        value: gtinVal,
        status: 'AUTO_FILLED',
        source: 'catalog',
        evidence: `GTIN do produto exato no catálogo ML: "${exact.title}"`,
      }
    }
  }

  // 3. Web search specifically for GTIN
  if (config) {
    try {
      const brand = truth.fields.brand?.value || ''
      const model = truth.fields.model?.value || ''
      const name = truth.name || ''
      const query = `GTIN EAN "${brand}" "${model}" ${name}`.trim()

      const { searchWeb } = await import('./websearch')
      const search = await searchWeb(query)

      if (search.available) {
        const sourcesBlock = search.sources
          .map((s, i) => `[${i + 1}] ${s.title || s.url}\nURL: ${s.url}\n${s.snippet}`)
          .join('\n\n')

        const extracted = await runTaskJson<{ gtin?: string }>(
          'attribute_enrichment',
          config,
          `Você é um pesquisador de GTIN/EAN. Extraia o código de barras EXATO do produto das fontes fornecidas.

REGRAS:
1. GTIN deve ter 8, 12, 13 ou 14 dígitos numéricos.
2. NÃO invente GTIN. Só use se estiver EXPLÍCITO nas fontes.
3. Confirme que o GTIN pertence ao produto certo (mesma marca, modelo, variante, capacidade, cor).
4. Se não encontrar, retorne {"gtin": null}.

Responda SOMENTE JSON: {"gtin": "código" ou null}`,
          `PRODUTO: ${name}
Marca: ${brand}
Modelo: ${model}

FONTES:
${sourcesBlock.slice(0, 3000)}`,
          { maxTokens: 500 }
        )

        if (extracted.gtin && validateGTIN(extracted.gtin) && !INVALID.test(extracted.gtin)) {
          return {
            value: extracted.gtin,
            status: 'AUTO_FILLED',
            source: 'catalog',
            evidence: `GTIN encontrado via pesquisa web`,
            source_url: search.sources[0]?.url,
          }
        }
      }
    } catch {
      // GTIN web search failed: segue sem
    }
  }

  return { value: null, status: 'UNKNOWN', source: 'ai' }
}
