import type { AIConfig } from './types'
import { generateJson, toDataUri } from './ai'
import { runVisionBatches } from './ai-router'
import { mlGet } from './ml-api'
import {
  buildCanonicalIdentity,
  isValidGtin,
  isPlausibleSellerSku,
  rankIdentityCandidates,
  sameIdentityToken,
  type CanonicalProductIdentity,
} from './identity'

export type TruthSource =
  | 'user'
  | 'photo'
  | 'description'
  | 'ml_item'
  | 'ml_catalog'
  | 'exact_product'
  | 'manufacturer'
  | 'manual'
  | 'datasheet'
  | 'derived'
  | 'inference'
export type TruthConfidence = 'confirmed' | 'high' | 'low'

/**
 * Status do dado. UNKNOWN e NOT_APPLICABLE são coisas diferentes:
 *   UNKNOWN        -> existe para este produto, mas não foi encontrado
 *   NOT_APPLICABLE -> não se aplica a este produto
 * Nunca usar NOT_APPLICABLE para inflar completude.
 */
export type DataStatus =
  | 'CONFIRMED'
  | 'AUTO_FILLED'
  | 'NEEDS_CONFIRMATION'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE'
  | 'CONFLICT'
  | 'USER_OVERRIDE'

export interface TruthField {
  value: string
  confidence: TruthConfidence
  source: TruthSource
  evidence: string
  status?: DataStatus
  source_url?: string
  retrieved_at?: string
  /** valores divergentes encontrados em fontes confiáveis */
  conflict?: Array<{ value: string; source: TruthSource; source_url?: string }>
}

/** USER_OVERRIDE e CONFIRMED nunca podem ser sobrescritos por enriquecimento. */
export function isProtectedField(field: TruthField | undefined): boolean {
  if (!field) return false
  return field.status === 'USER_OVERRIDE' || field.source === 'user'
}

export interface PendingQuestion {
  field: string
  label: string
  why: string
  suggestion?: string
  options?: string[]
}

export interface ProductTruth {
  /** nome canônico do produto */
  name: string
  /** campos factuais indexados por chave canônica (brand, model, color, ...) */
  fields: Record<string, TruthField>
  /** campos que a IA achou provável mas NÃO confirmou */
  uncertain: PendingQuestion[]
  /** trilha de evidências do que originou a identificação */
  evidence: string[]
  confidence: number
  /** Presente em toda análise nova; opcional apenas para linhas legadas persistidas. */
  identity?: CanonicalProductIdentity
  category_hint?: string
  /** P0.1: source snapshot quando input é URL do ML */
  source_category_id?: string
  source_category_name?: string
  source_domain_id?: string
  source_catalog_product_id?: string
  /** P0.7: fotos do próprio item da URL de entrada */
  source_item_id?: string
  source_pictures?: string[]
  source_title?: string
  source_attributes?: Array<{ id: string; name?: string; value_name?: string }>
  source_seller?: { id: number; nickname?: string }
  source_permalink?: string
  source_variations?: unknown[]
  source_condition?: string
  source_user_product_id?: string
}

const CANONICAL_KEYS = [
  'brand',
  'model',
  'gtin',
  'sku',
  'color',
  'material',
  'voltage',
  'power',
  'capacity',
  'length',
  'width',
  'height',
  'weight',
  'units_per_pack',
  'compatibility',
  'line',
  'part_number',
  'product_type',
  'function',
  'family_or_line',
  'variant',
  'kit_pack',
  'dimensions',
  'condition',
] as const

const IDENTIFY_SYSTEM = `Você é um especialista sênior em identificação de produtos para o Mercado Livre Brasil.

MISSÃO: identificar EXATAMENTE o produto, sem inventar nada.

REGRAS ABSOLUTAS:
1. Só marque um campo como "confirmed" se a informação estiver LITERALMENTE visível no texto/imagem (ex.: escrito na embalagem).
2. Use "high" quando for muito provável mas não estiver escrito.
3. Use "low" quando for apenas um palpite — nesse caso o campo vai para confirmação do usuário.
4. NUNCA invente marca, modelo, voltagem, medidas, garantia ou compatibilidade.
5. Se não souber, OMITA o campo. Omitir é sempre melhor que errar.
6. O nome do produto deve ser específico e comercial, do jeito que um vendedor anunciaria.
7. Responda em português do Brasil.
8. Se houver ambiguidade, retorne 2 a 3 "candidates" completos. Eles serão ranqueados por identificadores literais antes da pesquisa.

Responda SOMENTE com JSON válido:
{
  "name": "nome específico e comercial do produto",
  "search_query": "termos ideais para buscar este produto no Mercado Livre (3 a 6 palavras)",
  "category_hint": "categoria provável em português",
  "confidence": 0.0,
  "fields": {
    "brand":   { "value": "...", "confidence": "confirmed|high|low", "evidence": "por que você afirma isso" },
    "model":   { "value": "...", "confidence": "confirmed|high|low", "evidence": "..." }
  },
  "uncertain": [
    { "field": "voltage", "label": "Voltagem", "why": "não está visível na foto", "suggestion": "12V", "options": ["12V","24V","110V","220V"] }
  ]
}

Chaves permitidas em "fields": ${CANONICAL_KEYS.join(', ')}.`

interface RawIdentification {
  name?: string
  product_type?: string
  function?: string
  search_query?: string
  category_hint?: string
  confidence?: number
  fields?: Record<string, { value?: string; confidence?: string; evidence?: string }>
  uncertain?: Array<{
    field?: string
    label?: string
    why?: string
    suggestion?: string
    options?: string[]
  }>
  evidence?: string[]
  candidates?: RawIdentification[]
}

function selectIdentityCandidate(raw: RawIdentification): RawIdentification {
  const candidates = raw.candidates || []
  if (!candidates.length) return raw

  const ranked = rankIdentityCandidates(candidates.map(candidate => ({
    name: candidate.name || '',
    product_type: candidate.product_type || candidate.fields?.product_type?.value,
    function: candidate.function || candidate.fields?.function?.value,
    brand: candidate.fields?.brand?.value,
    model: candidate.fields?.model?.value,
    gtin: candidate.fields?.gtin?.value,
    confidence: Number(candidate.confidence) || 0,
    evidence: candidate.evidence || Object.values(candidate.fields || {}).map(field => field.evidence || '').filter(Boolean),
  })))
  const winner = candidates.find(candidate => candidate.name === ranked[0]?.name)
  return winner || raw
}

function normalizeConfidence(c?: string): TruthConfidence {
  if (c === 'confirmed') return 'confirmed'
  if (c === 'high') return 'high'
  return 'low'
}

function finalizeTruth(
  truth: Omit<ProductTruth, 'identity'>,
  sourceAttributes: Array<{ id: string; value_name?: string }> = []
): ProductTruth {
  return {
    ...truth,
    identity: buildCanonicalIdentity({
      name: truth.name,
      fields: truth.fields,
      categoryHint: truth.category_hint,
      evidence: truth.evidence,
      confidence: truth.confidence,
      sourceAttributes,
    }),
  }
}

function buildTruth(raw: RawIdentification, source: TruthSource, baseEvidence: string): ProductTruth {
  raw = selectIdentityCandidate(raw)
  const fields: Record<string, TruthField> = {}
  const uncertain: PendingQuestion[] = []
  const rawFields = { ...(raw.fields || {}) }
  if (raw.product_type && !rawFields.product_type) {
    rawFields.product_type = { value: raw.product_type, confidence: 'high', evidence: baseEvidence }
  }
  if (raw.function && !rawFields.function) {
    rawFields.function = { value: raw.function, confidence: 'high', evidence: baseEvidence }
  }

  for (const [key, val] of Object.entries(rawFields)) {
    const value = String(val?.value ?? '').trim()
    if (!value || /^(n\/?a|null|desconhecid|indefinid|não sei)/i.test(value)) continue

    const confidence = normalizeConfidence(val?.confidence)
    const field: TruthField = {
      value,
      confidence,
      source: confidence === 'low' ? 'inference' : source,
      evidence: val?.evidence?.trim() || baseEvidence,
      status: confidence === 'confirmed' ? 'CONFIRMED' : 'NEEDS_CONFIRMATION',
    }

    // Palpite não vira fato: vai para a fila de confirmação do usuário.
    if (confidence === 'low') {
      uncertain.push({
        field: key,
        label: key,
        why: field.evidence,
        suggestion: value,
      })
      continue
    }
    fields[key] = field
  }

  for (const u of raw.uncertain || []) {
    if (!u?.field) continue
    if (uncertain.some(x => x.field === u.field)) continue
    uncertain.push({
      field: u.field,
      label: u.label || u.field,
      why: u.why || 'Informação não confirmada pela análise.',
      suggestion: u.suggestion,
      options: u.options?.filter(Boolean).slice(0, 8),
    })
  }

  const name = String(raw.name || '').trim()
  if (!name) throw new Error('Não foi possível identificar o produto. Tente uma foto mais nítida ou descreva o produto.')

  return finalizeTruth({
    name,
    fields,
    uncertain,
    evidence: [baseEvidence, ...(raw.evidence || [])],
    confidence: Math.min(Math.max(Number(raw.confidence) || 0.5, 0), 1),
    category_hint: raw.category_hint?.trim() || undefined,
  })
}

/** Consulta ideal para buscar o produto no Mercado Livre. */
export function searchQueryFor(truth: ProductTruth, override?: string): string {
  if (override?.trim()) return override.trim()
  const brand = truth.fields.brand?.value
  const model = truth.fields.model?.value
  const parts = [truth.name]
  if (brand && !truth.name.toLowerCase().includes(brand.toLowerCase())) parts.push(brand)
  if (model && !truth.name.toLowerCase().includes(model.toLowerCase())) parts.push(model)
  return parts.join(' ').slice(0, 150)
}

// ---------------------------------------------------------------- entradas
export async function identifyFromDescription(
  config: AIConfig | null,
  description: string
): Promise<ProductTruth> {
  const raw = await generateJson<RawIdentification>(
    config,
    IDENTIFY_SYSTEM,
    `Um vendedor quer anunciar este produto no Mercado Livre. Identifique-o com precisão:\n\n"""${description.trim().slice(0, 4000)}"""\n\nUse apenas o que está escrito acima. Não complete lacunas com suposições.`,
    { temperature: 0.2 }
  )
  const truth = buildTruth(raw, 'description', 'Informado pelo vendedor na descrição')
  if (raw.search_query) truth.evidence.push(`Busca sugerida: ${raw.search_query}`)
  return truth
}

export async function identifyFromPhotos(
  config: AIConfig | null,
  imageUrls: string[],
  extraContext?: string
): Promise<ProductTruth> {
  if (!imageUrls.length) throw new Error('Nenhuma foto enviada.')

  const batches = await runVisionBatches({
    images: imageUrls.slice(0, 8),
    batchSize: 4,
    execute: async (batch, batchIndex) => {
      let dataUris: string[]
      try {
        dataUris = await Promise.all(batch.map(toDataUri))
      } catch (error) {
        throw new Error(
          `Não foi possível ler a foto enviada. ${error instanceof Error ? error.message : ''}`.trim()
        )
      }
      return generateJson<RawIdentification>(
        config,
        IDENTIFY_SYSTEM,
        `Analise o lote ${batchIndex + 1} das fotos deste produto que será anunciado no Mercado Livre.

      Leia com atenção qualquer texto visível: marca, modelo, código, voltagem, medidas e informações da embalagem.
      Consolide apenas o que for consistente dentro deste lote e registre divergências em "uncertain".
      Só afirme o que consegue LER ou VER. O que não estiver visível deve ir para "uncertain".${
          extraContext ? `\n\nContexto informado pelo vendedor: "${extraContext.slice(0, 500)}"` : ''
        }`,
        { images: dataUris, temperature: 0.2 }
      )
    },
  })

  return buildTruth(mergePhotoIdentifications(batches), 'photo', 'Identificado a partir da foto enviada pelo vendedor')
}

function mergePhotoIdentifications(results: RawIdentification[]): RawIdentification {
  if (results.length === 1) return results[0]
  const ranked = [...results].sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))
  const merged: RawIdentification = {
    ...ranked[0],
    fields: {},
    evidence: [...new Set(results.flatMap(result => result.evidence || []))],
    uncertain: [],
  }
  const fieldNames = new Set(results.flatMap(result => Object.keys(result.fields || {})))

  for (const field of fieldNames) {
    const observations = results
      .map(result => result.fields?.[field])
      .filter((value): value is NonNullable<typeof value> => Boolean(value?.value?.trim()))
    const values = new Set(observations.map(value => value.value!.trim().toLocaleLowerCase('pt-BR')))
    if (values.size === 1) {
      merged.fields![field] = observations.sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence))[0]
    } else if (values.size > 1) {
      merged.uncertain!.push({
        field,
        label: field,
        why: 'As fotos apresentam valores divergentes.',
        options: [...new Set(observations.map(value => value.value!.trim()))].slice(0, 8),
      })
    }
  }

  for (const uncertain of results.flatMap(result => result.uncertain || [])) {
    if (uncertain.field && !merged.uncertain!.some(item => item.field === uncertain.field)) {
      merged.uncertain!.push(uncertain)
    }
  }
  return merged
}

function confidenceRank(confidence?: string): number {
  if (confidence === 'confirmed') return 3
  if (confidence === 'high') return 2
  return 1
}

interface MLItemLite {
  id: string
  title?: string
  category_id?: string
  domain_id?: string
  user_product_id?: string
  attributes?: Array<{ id: string; name?: string; value_name?: string }>
  pictures?: Array<{ url?: string; secure_url?: string }>
  seller_id?: number
  permalink?: string
  variations?: unknown[]
  condition?: string
}

interface MLUserProductLite {
  id: string
  name?: string
  user_id?: number
  domain_id?: string
  catalog_product_id?: string | null
  attributes?: Array<{
    id: string
    name?: string
    values?: Array<{ id?: string | null; name?: string }>
  }>
  pictures?: Array<{ url?: string; secure_url?: string }>
}

const ATTR_TO_CANONICAL: Record<string, string> = {
  PRODUCT_TYPE: 'product_type',
  BRAND: 'brand',
  MODEL: 'model',
  GTIN: 'gtin',
  SELLER_SKU: 'sku',
  COLOR: 'color',
  MATERIAL: 'material',
  VOLTAGE: 'voltage',
  POWER: 'power',
  CAPACITY: 'capacity',
  LENGTH: 'length',
  WIDTH: 'width',
  HEIGHT: 'height',
  WEIGHT: 'weight',
  UNITS_PER_PACK: 'units_per_pack',
  LINE: 'line',
  PART_NUMBER: 'part_number',
  CONDITION: 'condition',
}

interface MLCatalogProductLite {
  id: string
  name?: string
  family_name?: string
  domain_id?: string
  category_id?: string
  attributes?: Array<{ id: string; name?: string; value_name?: string }>
  pictures?: Array<{ url?: string; secure_url?: string }>
}

function catalogFields(
  productId: string,
  attributes: NonNullable<MLCatalogProductLite['attributes']>
): Record<string, TruthField> {
  const fields: Record<string, TruthField> = {}
  for (const attribute of attributes) {
    const key = ATTR_TO_CANONICAL[attribute.id]
    const value = attribute.value_name?.trim()
    if (!key || !value || fields[key]) continue
    if (key === 'sku' && !isPlausibleSellerSku(value)) continue
    if (key === 'model' && (value.length > 60 || value.split(/\s+/).length > 8)) continue
    fields[key] = {
      value,
      confidence: 'confirmed',
      source: 'ml_catalog',
      evidence: `Ficha oficial do catálogo do Mercado Livre ${productId} (${attribute.id})`,
      status: 'CONFIRMED',
    }
  }
  return fields
}

function truthFromCatalog(
  product: MLCatalogProductLite,
  overrides: Record<string, TruthField> = {}
): ProductTruth {
  const attributes = product.attributes || []
  const fields = { ...catalogFields(product.id, attributes), ...overrides }
  const name = product.name?.trim() || product.family_name?.trim() || Object.values(overrides).map(field => field.value).join(' ')
  const sourcePictures = (product.pictures || [])
    .map(picture => picture.secure_url || picture.url)
    .filter((url): url is string => Boolean(url))

  return finalizeTruth({
    name,
    fields,
    uncertain: [],
    evidence: [`Produto de catálogo oficial do Mercado Livre (${product.id})`],
    confidence: 0.98,
    source_category_id: product.category_id,
    source_domain_id: product.domain_id,
    source_catalog_product_id: product.id,
    source_pictures: sourcePictures,
    source_title: name,
    source_attributes: attributes,
  }, attributes)
}

async function findCatalogProduct(
  token: string | null,
  query: string,
  matches: (product: MLCatalogProductLite) => boolean
): Promise<MLCatalogProductLite | null> {
  if (!token) return null
  const search = await mlGet<{ results?: Array<{ id?: string }> }>(
    `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(query.slice(0, 150))}`,
    token,
    { ttl: 600, persist: true }
  ).catch(() => null)

  for (const candidate of (search?.results || []).slice(0, 8)) {
    if (!candidate.id) continue
    const product = await mlGet<MLCatalogProductLite>(`/products/${candidate.id}`, token, { ttl: 3600, persist: true })
      .catch(() => null)
    if (product && matches(product)) return product
  }
  return null
}

function userField(value: string, label: string): TruthField {
  return {
    value,
    confidence: 'confirmed',
    source: 'user',
    evidence: `${label} informado pelo vendedor`,
    status: 'USER_OVERRIDE',
  }
}

export async function identifyFromGtin(
  _config: AIConfig | null,
  rawGtin: string,
  mlToken: string | null
): Promise<ProductTruth> {
  const gtin = rawGtin.replace(/\D/g, '')
  if (!isValidGtin(gtin)) throw new Error('Informe um GTIN/EAN válido com 8, 12, 13 ou 14 dígitos.')

  const product = await findCatalogProduct(mlToken, gtin, candidate => {
    const value = candidate.attributes?.find(attribute => ['GTIN', 'EAN', 'UPC'].includes(attribute.id))?.value_name || ''
    return value.replace(/\D/g, '') === gtin
  })

  if (product) return truthFromCatalog(product)

  return finalizeTruth({
    name: `Produto GTIN ${gtin}`,
    fields: { gtin: userField(gtin, 'GTIN') },
    uncertain: [
      { field: 'brand', label: 'Marca', why: 'O catálogo não retornou um produto exato para este GTIN.' },
      { field: 'model', label: 'Modelo', why: 'O catálogo não retornou um produto exato para este GTIN.' },
    ],
    evidence: ['GTIN informado pelo vendedor; produto exato ainda não confirmado no catálogo'],
    confidence: 0.45,
  })
}

export async function identifyFromBrandModel(
  _config: AIConfig | null,
  rawBrand: string,
  rawModel: string,
  mlToken: string | null
): Promise<ProductTruth> {
  const brand = rawBrand.trim()
  const model = rawModel.trim()
  if (!brand || !model) throw new Error('Informe marca e modelo para identificar o produto.')

  const product = await findCatalogProduct(mlToken, `${brand} ${model}`, candidate => {
    const attributes = candidate.attributes || []
    const candidateBrand = attributes.find(attribute => attribute.id === 'BRAND')?.value_name || ''
    const candidateModel = attributes.find(attribute => attribute.id === 'MODEL')?.value_name || ''
    return sameIdentityToken(brand, candidateBrand) && sameIdentityToken(model, candidateModel)
  })
  const overrides = {
    brand: userField(brand, 'Marca'),
    model: userField(model, 'Modelo'),
  }

  if (product) return truthFromCatalog(product, overrides)

  return finalizeTruth({
    name: `${brand} ${model}`,
    fields: overrides,
    uncertain: [{ field: 'product_type', label: 'Tipo de produto', why: 'Marca e modelo não bastaram para confirmar o tipo de produto.' }],
    evidence: ['Marca e modelo informados pelo vendedor'],
    confidence: 0.6,
  })
}

export type ProductIdentificationInput =
  | { type: 'url'; url: string }
  | { type: 'description'; description: string }
  | { type: 'single_image' | 'multi_image' | 'photo'; photos: string[]; context?: string }
  | { type: 'gtin'; gtin: string }
  | { type: 'brand_model'; brand: string; model: string }

export async function identifyProduct(
  config: AIConfig | null,
  input: ProductIdentificationInput,
  mlToken: string | null
): Promise<ProductTruth> {
  switch (input.type) {
    case 'url':
      return identifyFromUrl(config, input.url, mlToken)
    case 'description':
      return identifyFromDescription(config, input.description)
    case 'single_image':
    case 'multi_image':
    case 'photo':
      return identifyFromPhotos(config, input.photos, input.context)
    case 'gtin':
      return identifyFromGtin(config, input.gtin, mlToken)
    case 'brand_model':
      return identifyFromBrandModel(config, input.brand, input.model, mlToken)
  }
}

export async function identifyFromUrl(
  config: AIConfig | null,
  url: string,
  mlToken: string | null
): Promise<ProductTruth> {
  const itemMatch = url.match(/MLB-?(\d{6,})/i)
  const itemId = itemMatch ? `MLB${itemMatch[1]}` : null
  const userProductMatch = url.match(/MLBU-?(\d{6,})/i)
  const userProductId = userProductMatch ? `MLBU${userProductMatch[1]}` : null

  // 1) User Product (/up/MLBU...) da conta conectada.
  // O user product fornece identidade/fotos; o anúncio associado fornece a categoria.
  if (userProductId && mlToken) {
    try {
      const product = await mlGet<MLUserProductLite>(`/user-products/${userProductId}`, mlToken, { ttl: 600 })
      if (product?.name) {
        let sourceItem: MLItemLite | null = null
        if (product.user_id) {
          const search = await mlGet<{ results?: string[] }>(
            `/users/${product.user_id}/items/search?user_product_id=${userProductId}`,
            mlToken,
            { ttl: 300 }
          ).catch(() => null)
          const associatedItemId = search?.results?.[0]
          if (associatedItemId) {
            sourceItem = await mlGet<MLItemLite>(`/items/${associatedItemId}`, mlToken, { ttl: 600 }).catch(() => null)
          }
        }

        const fields: Record<string, TruthField> = {}
        const sourceAttributes = [
          ...(product.attributes || []).map(a => ({ id: a.id, value_name: a.values?.[0]?.name })),
          ...(sourceItem?.attributes || []),
        ]
        for (const a of sourceAttributes) {
          const key = ATTR_TO_CANONICAL[a.id]
          const value = a.value_name?.trim()
          if (!key || !value || fields[key]) continue
          if (key === 'sku' && !isPlausibleSellerSku(value)) continue
          // MODEL em anúncios antigos pode conter uma descrição inteira. Só aceite
          // como modelo quando for curto e estiver literalmente no título oficial.
          if (key === 'model') {
            const normalizedName = product.name.replace(/[^a-z0-9]/gi, '').toLowerCase()
            const normalizedValue = value.replace(/[^a-z0-9]/gi, '').toLowerCase()
            if (value.length > 60 || !normalizedName.includes(normalizedValue)) continue
          }
          fields[key] = {
            value,
            confidence: 'confirmed',
            source: 'ml_item',
            evidence: `Ficha oficial do user product ${userProductId} (${a.id})`,
            status: 'CONFIRMED',
          }
        }

        if (!fields.model) {
          const model = product.name.match(/\b(?=[a-z0-9-]*[a-z])(?=[a-z0-9-]*\d)[a-z]{1,8}-?\d{2,}[a-z0-9-]*\b/i)?.[0]
          if (model) {
            fields.model = {
              value: model.toUpperCase(),
              confidence: 'confirmed',
              source: 'ml_item',
              evidence: `Modelo escrito no título oficial do user product ${userProductId}`,
              status: 'CONFIRMED',
            }
          }
        }

        if (!fields.voltage) {
          const voltages = [...product.name.matchAll(/\b(\d{1,3})\s*v\b/gi)]
            .map(match => `${match[1]}V`)
          const uniqueVoltages = [...new Set(voltages)]
          if (uniqueVoltages.length) {
            fields.voltage = {
              value: uniqueVoltages.join('/'),
              confidence: 'confirmed',
              source: 'ml_item',
              evidence: `Voltagem escrita no título oficial do user product ${userProductId}`,
              status: 'CONFIRMED',
            }
          }
        }

        const sourcePictures = (product.pictures?.length ? product.pictures : sourceItem?.pictures || [])
          .map(p => p.secure_url || p.url)
          .filter((picture): picture is string => Boolean(picture))

        return finalizeTruth({
          name: product.name,
          fields,
          uncertain: [],
          evidence: [
            sourceItem?.id
              ? `User product ${userProductId} e anúncio ${sourceItem.id} lidos pela API oficial`
              : `User product ${userProductId} lido pela API oficial`,
          ],
          confidence: 1,
          source_category_id: sourceItem?.category_id,
          source_domain_id: sourceItem?.domain_id || product.domain_id,
          source_catalog_product_id: product.catalog_product_id || undefined,
          source_item_id: sourceItem?.id || userProductId,
          source_pictures: sourcePictures,
          source_title: sourceItem?.title || product.name,
          source_attributes: sourceAttributes,
          source_seller: product.user_id ? { id: product.user_id } : undefined,
          source_permalink: sourceItem?.permalink,
          source_variations: sourceItem?.variations,
          source_condition: sourceItem?.condition,
          source_user_product_id: userProductId,
        }, sourceAttributes)
      }
    } catch {
      /* user product de outra conta pode retornar 403; segue para o slug */
    }
  }

  // 2) Produto de catálogo (acessível a aplicações externas)
  if (itemId && mlToken) {
    try {
      const product = await mlGet<{
        name?: string
        family_name?: string
        domain_id?: string
        category_id?: string
        id?: string
        attributes?: Array<{ id: string; value_name?: string }>
        pictures?: Array<{ url?: string; secure_url?: string }>
      }>(`/products/${itemId}`, mlToken, { ttl: 3600 })

      if (product?.name) {
        const fields: Record<string, TruthField> = {}
        for (const a of product.attributes || []) {
          const key = ATTR_TO_CANONICAL[a.id]
          if (key && a.value_name) {
            if (key === 'sku' && !isPlausibleSellerSku(a.value_name)) continue
            fields[key] = {
              value: a.value_name,
              confidence: 'confirmed',
              source: 'ml_catalog',
              evidence: `Ficha oficial do catálogo do Mercado Livre (${a.id})`,
              status: 'CONFIRMED',
            }
          }
        }
        const sourcePictures = (product.pictures || [])
          .map(p => p.secure_url || p.url)
          .filter((u): u is string => Boolean(u))
        const sourceAttributes = product.attributes || []
        return finalizeTruth({
          name: product.name,
          fields,
          uncertain: [],
          evidence: [`Produto de catálogo oficial do Mercado Livre (${itemId})`],
          confidence: 0.95,
          source_category_id: product.category_id,
          source_domain_id: product.domain_id,
          source_catalog_product_id: product.id,
          source_item_id: itemId,
          source_pictures: sourcePictures,
          source_title: product.name,
          source_attributes: sourceAttributes,
        }, sourceAttributes)
      }
    } catch {
      /* segue para as próximas estratégias */
    }
  }

  // 3) Anúncio do próprio vendedor (a API só libera itens da própria conta)
  if (itemId && mlToken) {
    try {
      const item = await mlGet<MLItemLite>(`/items/${itemId}`, mlToken, { ttl: 600 })
      if (item?.title) {
        const fields: Record<string, TruthField> = {}
        for (const a of item.attributes || []) {
          const key = ATTR_TO_CANONICAL[a.id]
          if (key && a.value_name) {
            if (key === 'sku' && !isPlausibleSellerSku(a.value_name)) continue
            fields[key] = {
              value: a.value_name,
              confidence: 'confirmed',
              source: 'ml_item',
              evidence: `Ficha técnica do anúncio ${itemId}`,
              status: 'CONFIRMED',
            }
          }
        }
        const sourcePictures = (item.pictures || [])
          .map(p => p.secure_url || p.url)
          .filter((u): u is string => Boolean(u))
        const sourceAttributes = item.attributes || []
        return finalizeTruth({
          name: item.title,
          fields,
          uncertain: [],
          evidence: [`Anúncio ${itemId} lido pela API oficial`],
          confidence: 0.9,
          source_category_id: item.category_id,
          source_item_id: itemId,
          source_pictures: sourcePictures,
          source_title: item.title,
          source_attributes: sourceAttributes,
          source_seller: item.seller_id ? { id: item.seller_id } : undefined,
          source_permalink: item.permalink,
          source_variations: item.variations,
          source_condition: item.condition,
          source_user_product_id: item.user_product_id,
        }, sourceAttributes)
      }
    } catch {
      /* anúncios de terceiros retornam 403 — cai no slug */
    }
  }

  // 4) Slug da URL — funciona para anúncios de terceiros, que a API bloqueia
  const clean = url.split('?')[0]
  const segments = clean.split('/').filter(Boolean)
  const slug = segments
    .filter(s => s.includes('-') && !/^MLB-?\d/i.test(s) && !s.includes('.'))
    .sort((a, b) => b.length - a.length)[0]

  const fromSlug = slug
    ? decodeURIComponent(slug).replace(/-/g, ' ').replace(/\b_?JM\b/gi, '').trim()
    : ''

  if (!fromSlug || fromSlug.length < 4) {
    throw new Error(
      'Não foi possível ler este link. Cole a URL completa do anúncio do Mercado Livre, ou use a aba Foto/Descrição.'
    )
  }

  const truth = await identifyFromDescription(config, fromSlug)
  truth.evidence = [`Identificado pelo título do anúncio na URL: "${fromSlug}"`]
  return truth
}

// ---------------------------------------------------------------- edição
/** Aplica respostas do usuário — vira fato confirmado, com origem registrada. */
export function applyUserAnswers(
  truth: ProductTruth,
  answers: Record<string, string>
): ProductTruth {
  const fields = { ...truth.fields }
  const answered = new Set<string>()

  for (const [key, rawValue] of Object.entries(answers)) {
    const value = String(rawValue ?? '').trim()
    if (!value) continue
    fields[key] = {
      value,
      confidence: 'confirmed',
      source: 'user',
      evidence: 'Confirmado pelo vendedor',
      status: 'USER_OVERRIDE',
    }
    answered.add(key)
  }

  return finalizeTruth({
    ...truth,
    fields,
    uncertain: truth.uncertain.filter(u => !answered.has(u.field)),
  })
}

/** Enriquece o ProductTruth com a ficha do produto de catálogo equivalente. */
export function enrichFromCatalog(
  truth: ProductTruth,
  catalogAttributes: Record<string, string>,
  productName: string
): ProductTruth {
  const brand = truth.fields.brand?.value?.toLowerCase()
  const model = truth.fields.model?.value?.toLowerCase()
  const catBrand = catalogAttributes.BRAND?.toLowerCase()
  const catModel = catalogAttributes.MODEL?.toLowerCase()
  const gtin = truth.fields.gtin?.value?.replace(/\D/g, '')
  const catGtin = (catalogAttributes.GTIN || catalogAttributes.EAN || catalogAttributes.UPC)?.replace(/\D/g, '')

  // GTIN idêntico ou marca+modelo idênticos são evidência de produto exato.
  const matches =
    Boolean(gtin && catGtin && gtin === catGtin) || (
      Boolean(brand && catBrand && brand === catBrand) &&
      Boolean(model && catModel && (model === catModel || catModel.includes(model) || model.includes(catModel)))
    )

  if (!matches) return truth

  const fields = { ...truth.fields }
  for (const [attrId, value] of Object.entries(catalogAttributes)) {
    const key = ATTR_TO_CANONICAL[attrId]
    if (!key || !value) continue
    const existing = fields[key]
    if (existing) {
      const sameValue = existing.value
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase()
        === value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (sameValue) continue
      const alreadyRecorded = existing.conflict?.some(conflict => conflict.value === value)
      fields[key] = {
        ...existing,
        status: isProtectedField(existing) ? 'USER_OVERRIDE' : 'CONFLICT',
        conflict: alreadyRecorded
          ? existing.conflict
          : [...(existing.conflict || []), { value, source: 'ml_catalog' }],
      }
      continue
    }
    fields[key] = {
      value,
      confidence: 'high',
      source: 'ml_catalog',
      evidence: `Ficha do produto de catálogo "${productName}" (marca e modelo idênticos)`,
      status: 'AUTO_FILLED',
    }
  }

  return finalizeTruth({
    ...truth,
    fields,
    evidence: [...truth.evidence, `Ficha enriquecida pelo catálogo oficial: ${productName}`],
  })
}

export function truthToPlainText(truth: ProductTruth): string {
  const lines = [`Produto: ${truth.name}`]
  for (const [key, f] of Object.entries(truth.fields)) {
    lines.push(`- ${key}: ${f.value} (${f.confidence === 'confirmed' ? 'confirmado' : 'provável'})`)
  }
  if (truth.uncertain.length) {
    lines.push(`Não confirmado: ${truth.uncertain.map(u => u.label).join(', ')}`)
  }
  return lines.join('\n')
}
