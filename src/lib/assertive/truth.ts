import type { AIConfig } from './types'
import { generateJson, toDataUri } from './ai'
import { mlGet } from './ml-api'

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
  category_hint?: string
  /** P0.1: source snapshot quando input é URL do ML */
  source_category_id?: string
  source_category_name?: string
  source_domain_id?: string
  source_catalog_product_id?: string
  /** P0.7: fotos do próprio item da URL de entrada */
  source_item_id?: string
  source_pictures?: string[]
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
}

function normalizeConfidence(c?: string): TruthConfidence {
  if (c === 'confirmed') return 'confirmed'
  if (c === 'high') return 'high'
  return 'low'
}

function buildTruth(raw: RawIdentification, source: TruthSource, baseEvidence: string): ProductTruth {
  const fields: Record<string, TruthField> = {}
  const uncertain: PendingQuestion[] = []

  for (const [key, val] of Object.entries(raw.fields || {})) {
    const value = String(val?.value ?? '').trim()
    if (!value || /^(n\/?a|null|desconhecid|indefinid|não sei)/i.test(value)) continue

    const confidence = normalizeConfidence(val?.confidence)
    const field: TruthField = {
      value,
      confidence,
      source: confidence === 'low' ? 'inference' : source,
      evidence: val?.evidence?.trim() || baseEvidence,
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

  return {
    name,
    fields,
    uncertain,
    evidence: [baseEvidence],
    confidence: Math.min(Math.max(Number(raw.confidence) || 0.5, 0), 1),
    category_hint: raw.category_hint?.trim() || undefined,
  }
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

  // Converte antes de chamar a IA para produzir um erro claro se a imagem estiver inacessível.
  const dataUris: string[] = []
  for (const url of imageUrls.slice(0, 4)) {
    try {
      dataUris.push(await toDataUri(url))
    } catch (e) {
      throw new Error(
        `Não foi possível ler a foto enviada. ${e instanceof Error ? e.message : ''}`.trim()
      )
    }
  }

  const raw = await generateJson<RawIdentification>(
    config,
    IDENTIFY_SYSTEM,
    `Analise ${dataUris.length > 1 ? `as ${dataUris.length} fotos` : 'a foto'} deste produto que será anunciado no Mercado Livre.

Leia com atenção qualquer texto visível: marca, modelo, código, voltagem, medidas e informações da embalagem.
Só afirme o que consegue LER ou VER. O que não estiver visível deve ir para "uncertain".${
      extraContext ? `\n\nContexto informado pelo vendedor: "${extraContext.slice(0, 500)}"` : ''
    }`,
    { images: dataUris, temperature: 0.2 }
  )

  return buildTruth(raw, 'photo', 'Identificado a partir da foto enviada pelo vendedor')
}

interface MLItemLite {
  id: string
  title?: string
  category_id?: string
  domain_id?: string
  user_product_id?: string
  attributes?: Array<{ id: string; name?: string; value_name?: string }>
  pictures?: Array<{ url?: string; secure_url?: string }>
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
            }
          }
        }

        const sourcePictures = (product.pictures?.length ? product.pictures : sourceItem?.pictures || [])
          .map(p => p.secure_url || p.url)
          .filter((picture): picture is string => Boolean(picture))

        return {
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
        }
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
            fields[key] = {
              value: a.value_name,
              confidence: 'confirmed',
              source: 'ml_catalog',
              evidence: `Ficha oficial do catálogo do Mercado Livre (${a.id})`,
            }
          }
        }
        const sourcePictures = (product.pictures || [])
          .map(p => p.secure_url || p.url)
          .filter((u): u is string => Boolean(u))
        return {
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
        }
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
            fields[key] = {
              value: a.value_name,
              confidence: 'confirmed',
              source: 'ml_item',
              evidence: `Ficha técnica do anúncio ${itemId}`,
            }
          }
        }
        const sourcePictures = (item.pictures || [])
          .map(p => p.secure_url || p.url)
          .filter((u): u is string => Boolean(u))
        return {
          name: item.title,
          fields,
          uncertain: [],
          evidence: [`Anúncio ${itemId} lido pela API oficial`],
          confidence: 0.9,
          source_category_id: item.category_id,
          source_item_id: itemId,
          source_pictures: sourcePictures,
        }
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
    }
    answered.add(key)
  }

  return {
    ...truth,
    fields,
    uncertain: truth.uncertain.filter(u => !answered.has(u.field)),
  }
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

  // Só herda a ficha quando marca E modelo batem: evita colar dados de outro produto.
  const matches =
    Boolean(brand && catBrand && brand === catBrand) &&
    Boolean(model && catModel && (model === catModel || catModel.includes(model) || model.includes(catModel)))

  if (!matches) return truth

  const fields = { ...truth.fields }
  for (const [attrId, value] of Object.entries(catalogAttributes)) {
    const key = ATTR_TO_CANONICAL[attrId]
    if (!key || fields[key] || !value) continue
    fields[key] = {
      value,
      confidence: 'high',
      source: 'ml_catalog',
      evidence: `Ficha do produto de catálogo "${productName}" (marca e modelo idênticos)`,
    }
  }

  return {
    ...truth,
    fields,
    evidence: [...truth.evidence, `Ficha enriquecida pelo catálogo oficial: ${productName}`],
  }
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
