import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AIConfig } from './types'
import type { ProductTruth } from './truth'
import { enrichFromCatalog } from './truth'

type Mutable<T> = { -readonly [P in keyof T]: T[P] }
import { exactFactSources, exactProductReferenceUrls, researchMarket, type ResearchResult } from './research'
import { extractDNA, type WinningListingDNA } from './dna'
import {
  getCategory,
  getCategoryAttributes,
  getCategorySaleTerms,
  classifyAttributes,
  maxTitleLength,
  type ClassifiedAttribute,
  type CategoryInfo,
} from './taxonomy'
import { generateListing, type GeneratedListing, type ImagePlanStep, type ListingAttribute } from './generator'
import { enrichAttributes, type EnrichedAttribute } from './enrichment'
import { computeCompleteness, computeScores } from './scoring'
import {
  requireMLToken,
  getSellerCapabilities,
  getSellerShippingPreferences,
  buildItemPayload,
  predictMLTitle,
  getAutoAppendedAttributeIds,
  validateListing,
  resolveShippingMode,
  hasMandatoryFreeShippingIssue,
  type SellerCapabilities,
  type ShippingMode,
  type TitleControlMode,
} from './publisher'
import { categoryDiscoveryHint, searchQueryFor } from './truth'
import { decrypt } from './encryption'
import { collectAndClassifyPhotos, type PhotoMeta } from './photos'
import { computeEffectiveRequirements, type PublicationRequirements } from './publication-requirements'
import { targetedAttributeResearch } from './targeted-research'
import { observeAnalysisStage, recordAnalysisStageEvent } from './observability'
import { buildBlockingQuestions } from './blocking-questions'
import { buildAnalysisListingGallery, type ListingGallery } from './image-pipeline'
import { attachListingImages } from './image-assets'
import { buildCopyBrief } from './copy-brief'
import { hasPendingImageReview } from './publication-readiness'
import { buildProgressiveImageSlots, type ProgressiveImageSlotPlan } from './image-job-contract'
import { ensureProgressiveImageJobs } from './image-jobs'

export type AnalysisStage =
  | 'input'
  | 'identifying'
  | 'researching'
  | 'analyzing'
  | 'generating'
  | 'needs_input'
  | 'ready'
  | 'validating'
  | 'ready_to_publish'
  | 'publishing'
  | 'published'
  | 'failed'

export interface AnalysisRow {
  id: string
  user_id: string
  product_name: string
  category_id: string | null
  domain_id: string | null
  input_type: 'photo' | 'single_image' | 'multi_image' | 'description' | 'url' | 'gtin' | 'brand_model'
  input_data: Record<string, unknown>
  product_truth: ProductTruth | Record<string, never>
  research: ResearchResult | Record<string, never>
  dna: WinningListingDNA | Record<string, never>
  photos: string[]
  status: AnalysisStage
  error_message: string | null
  created_at: string
  updated_at: string
}

export function normalizeProgressiveImagePlan(
  imagePlan: ImagePlanStep[] = [],
  facts: Array<{ label: string; value: string }> = []
): ProgressiveImageSlotPlan[] {
  return buildProgressiveImageSlots(imagePlan, facts)
}

export async function loadAnalysis(analysisId: string, userId: string): Promise<AnalysisRow | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('assertive_analyses')
    .select('*')
    // isolamento entre usuários: a análise só é acessível ao dono
    .eq('id', analysisId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as AnalysisRow | null) ?? null
}

export async function updateAnalysis(
  analysisId: string,
  userId: string,
  patch: Record<string, unknown>
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('assertive_analyses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', analysisId)
    .eq('user_id', userId)
  if (error) throw new Error(`Falha ao persistir análise: ${error.message}`)
}

export async function getUserAIConfig(userId: string): Promise<AIConfig | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('assertive_ai_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null

  // a chave fica criptografada em repouso
  let api_key = data.api_key as string | null
  if (api_key?.includes(':')) {
    try {
      api_key = decrypt(api_key)
    } catch {
      api_key = null
    }
  }

  return { ...(data as AIConfig), api_key: api_key || undefined }
}

// ---------------------------------------------------------------- etapas
export interface CategoryContext {
  category: CategoryInfo | null
  attributes: ClassifiedAttribute[]
  itemAttributes: ClassifiedAttribute[]
  variationAttributes: ClassifiedAttribute[]
  saleTerms: ClassifiedAttribute[]
  capabilities?: SellerCapabilities | null
  eligibility: { listingAllowed: boolean; status: string | null }
  limits: { title: number; pictures: number; variationPictures: number }
}

export async function resolveCategoryContext(
  token: string,
  categoryId: string | null
): Promise<CategoryContext> {
  if (!categoryId) {
    return {
      category: null,
      attributes: [],
      itemAttributes: [],
      variationAttributes: [],
      saleTerms: [],
      eligibility: { listingAllowed: false, status: null },
      limits: { title: 60, pictures: 12, variationPictures: 10 },
    }
  }

  const categoryTask = getCategory(token, categoryId).catch(() => {
    throw new Error(`Não foi possível carregar os dados oficiais da categoria ${categoryId}.`)
  })
  const capabilitiesTask = getSellerCapabilities(token).catch(() => null)
  const saleTermsTask = getCategorySaleTerms(token, categoryId).catch(() => [])
  let rawAttrs: Awaited<ReturnType<typeof getCategoryAttributes>>
  try {
    rawAttrs = await getCategoryAttributes(token, categoryId)
  } catch {
    throw new Error(`Não foi possível carregar o schema oficial da categoria ${categoryId}.`)
  }
  const [category, capabilities, rawSaleTerms] = await Promise.all([
    categoryTask,
    capabilitiesTask,
    saleTermsTask,
  ])

  const categoryStatus = category.settings?.status?.toLowerCase() || null
  const listingAllowed = category.settings?.listing_allowed !== false
    && (!categoryStatus || categoryStatus === 'enabled' || categoryStatus === 'active')
  if (!listingAllowed) {
    throw new Error(`A categoria ${categoryId} não aceita novas publicações no Mercado Livre.`)
  }

  const attributes = classifyAttributes(rawAttrs, {
    requireSellerPackage: capabilities?.user_product_model ?? false,
  })
  const saleTerms = classifyAttributes(rawSaleTerms)

  return {
    category,
    attributes,
    itemAttributes: attributes.filter(attribute => !attribute.isVariationOnly),
    variationAttributes: attributes.filter(attribute => attribute.isVariationOnly),
    saleTerms,
    capabilities,
    eligibility: { listingAllowed: true, status: categoryStatus },
    limits: {
          title: Math.min(maxTitleLength(category), 60),
          pictures: category.settings?.max_pictures_per_item || 12,
          variationPictures: category.settings?.max_pictures_per_item_var || 10,
        },
  }
}

/**
 * P0.3: Category Sanity Guard
 * Verifica se os atributos required/catalog_required da categoria são
 * semanticamente compatíveis com o produto identificado.
 * Ex: produto automotivo NÃO deve ter atributos "SABOR", "FORMATO_DO_SUCO".
 *
 * Retorna:
 * - ok: true se sem mismatch
 * - mismatches: lista de problemas encontrados
 * - hasHardMismatch: true se cross-domain mismatch claro (ex: cadeira vs sucos)
 */
export function checkCategorySanity(
  categoryAttributes: Array<{ id: string; name?: string; tier?: string }>,
  productName: string,
): { ok: boolean; mismatches: string[]; hasHardMismatch: boolean } {
  const REQUIRED = categoryAttributes.filter(a => a.tier === 'required' || a.tier === 'catalog_required')
  const requiredIds = REQUIRED.map(a => a.id.toUpperCase())

  const mismatches: string[] = []
  let hardMismatchCount = 0

  // Domínios de atributos que são clear signal de categoria errada
  const DOMAIN_SIGNALS: Record<string, string[]> = {
    FOOD_BEVERAGE: ['SABOR', 'FORMATO_DO_SUCO', 'SABOR_DO_SUco', 'TIPO_DE_BEBIDA', 'CONTEUDO_LIQUIDO', 'PORCAO'],
    AUTOMOTIVE: ['TIPO_DE_VEICULO', 'ANO_DO_MODELO', 'COMBUSTIVEL', 'MOTOR', 'CAMBIO'],
    REAL_ESTATE: ['TIPO_DE_IMOVEL', 'AREA_TOTAL', 'QUARTOS', 'VAGAS'],
    FASHION: ['GENDER', 'TAMANHO', 'COMPRIMENTO_DA LENGUA', 'FECHO'],
    PET: ['ANIMAL', 'PORCAO', 'TIPO_DE_ANIMAL'],
    FURNITURE: ['TIPO_DE_MOSTRA', 'MATERIAL_DO_ESTOFADO', 'RECLINAVEL', 'AJUSTE_DE_ALTURA'],
  }

  const productLower = productName.toLowerCase()
  const isChair = /cadeira|poltrona|ergonom|escritorio|diretor|gamer/i.test(productLower)
  const isElectronic = /notebook|computador|celular|smartphone|monitor|teclado|mouse|headphone|fone|ssd|memoria|placa/i.test(productLower)
  const isFood = /suco|leite|cafe|cha|acucar|arroz|feijao|oleo|molho|condimento|concentrado|bebida|pó/i.test(productLower)
  const isAutomotive = /automotiv|carro|moto|pneu|oleo|motor|freio|suspensao/i.test(productLower)

  // Mapeamento de produto → domínios proibidos
  const PROHIBITED_DOMAINS: string[][] = []
  if (isChair || isElectronic) PROHIBITED_DOMAINS.push(DOMAIN_SIGNALS.FOOD_BEVERAGE)
  if (isFood) {
    PROHIBITED_DOMAINS.push(DOMAIN_SIGNALS.AUTOMOTIVE)
    PROHIBITED_DOMAINS.push(DOMAIN_SIGNALS.FURNITURE)
  }
  if (isAutomotive) {
    PROHIBITED_DOMAINS.push(DOMAIN_SIGNALS.FOOD_BEVERAGE)
    PROHIBITED_DOMAINS.push(DOMAIN_SIGNALS.FURNITURE)
  }

  for (const prohibited of PROHIBITED_DOMAINS) {
    for (const id of requiredIds) {
      if (prohibited.includes(id)) {
        mismatches.push(`Atributo "${id}" não se aplica a "${productName}"`)
        hardMismatchCount++
      }
    }
  }

  // Check genérico: se a categoria tem muitos atributos de domínio conflitante
  for (const [domain, ids] of Object.entries(DOMAIN_SIGNALS)) {
    const overlap = requiredIds.filter(id => ids.includes(id))
    if (overlap.length >= 2) {
      const otherDomains = Object.entries(DOMAIN_SIGNALS)
        .filter(([d]) => d !== domain)
        .some(([, otherIds]) => requiredIds.some(id => otherIds.includes(id)))
      if (otherDomains) {
        mismatches.push(`Categoria contém ${overlap.length} atributos do domínio "${domain}": ${overlap.join(', ')}`)
        hardMismatchCount++
      }
    }
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    hasHardMismatch: hardMismatchCount >= 2,
  }
}

/** Etapa RESEARCHING: pesquisa de mercado + DNA. Não reexecuta a identificação. */
export async function runResearch(
  analysis: AnalysisRow,
  opts: { queryOverride?: string; categoryOverride?: string } = {}
): Promise<{ research: ResearchResult; dna: WinningListingDNA; truth: ProductTruth }> {
  const truth = analysis.product_truth as ProductTruth
  if (!truth?.name) throw new Error('A identificação do produto ainda não foi concluída.')

  const token = await requireMLToken(analysis.user_id)
  const query = searchQueryFor(truth, opts.queryOverride)

  await updateAnalysis(analysis.id, analysis.user_id, { status: 'researching', error_message: null })

  const research = await observeAnalysisStage(
    {
      analysis_id: analysis.id,
      user_id: analysis.user_id,
      stage: 'research',
      metadata: { input_type: analysis.input_type, category_source: truth.source_category_id ? 'url_source' : 'discovery' },
    },
    () => researchMarket(token, query, {
      deepLimit: 8,
      categoryHint: opts.categoryOverride || null,
      sourceCategoryId: truth.source_category_id || null,
      sourceDomainId: truth.source_domain_id || null,
      domainHint: categoryDiscoveryHint(truth) || null,
      // permite classificar EXACT vs COMPARABLE
      truth,
    })
  )

  await updateAnalysis(analysis.id, analysis.user_id, { status: 'analyzing' })

  const dna = await observeAnalysisStage(
    {
      analysis_id: analysis.id,
      user_id: analysis.user_id,
      stage: 'dna',
      metadata: { references: research.competitors.length, exact_catalog_matches: research.exact_catalog_count },
    },
    async () => extractDNA(research)
  )

  // Só produto EXATO alimenta a ficha. Comparável jamais vira fato.
  let enriched = truth
  for (const source of exactFactSources(research)) {
    enriched = enrichFromCatalog(enriched, source.attributes, source.title)
  }

  await updateAnalysis(analysis.id, analysis.user_id, {
    research,
    dna,
    product_truth: enriched,
    category_id: research.category_id,
    domain_id: research.domain_id,
    status: 'generating',
  })

  return { research, dna, truth: enriched }
}

/**
 * Auto-resolve blockers de uma validação ML e pesquisa atributos faltantes.
 * Retorna true se algum dado foi alterado (pode tentar revalidar).
 */
async function autoResolveAndResearch(
  token: string,
  issues: Array<{ severity: string; code: string; attribute_ids?: string[]; suggested_value?: { value_id?: string; value_name?: string } }>,
  resolvedAttributes: EnrichedAttribute[],
  categoryAttributes: ClassifiedAttribute[],
  truth: ProductTruth,
  research: ResearchResult,
  config: AIConfig | null
): Promise<boolean> {
  let changed = false

  // 1. Auto-aplicar suggested_values do ML
  for (const issue of issues) {
    if (issue.severity !== 'error') continue
    if (!issue.suggested_value) continue
    for (const attrId of issue.attribute_ids || []) {
      const existing = resolvedAttributes.find(a => a.id === attrId)
      if (existing?.value_name?.trim()) continue // já preenchido
      if (existing) {
        existing.value_name = issue.suggested_value.value_name || issue.suggested_value.value_id || ''
        existing.source = 'catalog'
        existing.status = 'AUTO_FILLED'
        existing.evidence = `Valor sugerido pela validação oficial do Mercado Livre (${issue.code})`
      } else {
        const spec = categoryAttributes.find(a => a.id === attrId)
        resolvedAttributes.push({
          id: attrId,
          name: spec?.name || attrId,
          value_name: issue.suggested_value.value_name || issue.suggested_value.value_id || '',
          source: 'catalog',
          tier: spec?.tier || 'recommended',
          status: 'AUTO_FILLED',
          evidence: `Valor sugerido pela validação oficial do Mercado Livre (${issue.code})`,
          isVariationOnly: spec?.isVariationOnly,
        })
      }
      changed = true
    }
  }

  // 2. Para atributos ainda vazios sem suggested_value, tentar pesquisa direcionada
  const exactProducts = exactFactSources(research)

  for (const issue of issues) {
    if (issue.severity !== 'error') continue
    for (const attrId of issue.attribute_ids || []) {
      if (resolvedAttributes.some(a => a.id === attrId && a.value_name?.trim())) continue
      const spec = categoryAttributes.find(a => a.id === attrId)
      if (!spec) continue

      // Pular seller_package — não inventar dimensões
      if (attrId.startsWith('SELLER_PACKAGE_')) continue

      const result = await targetedAttributeResearch(config, truth, spec, exactProducts)
      if (result?.value) {
        const existing = resolvedAttributes.find(a => a.id === attrId)
        if (existing) {
          existing.value_name = result.value
          existing.source = 'catalog'
          existing.status = 'AUTO_FILLED'
          existing.evidence = result.evidence
          existing.source_url = result.source_url
        } else {
          resolvedAttributes.push({
            id: attrId,
            name: spec.name,
            value_name: result.value,
            source: 'catalog',
            tier: spec.tier,
            status: 'AUTO_FILLED',
            evidence: result.evidence,
            source_url: result.source_url,
            isVariationOnly: spec.isVariationOnly,
          })
        }
        changed = true
      }
    }
  }

  return changed
}

/** Etapa GENERATING: cria o anúncio. Não refaz a pesquisa. */
export async function runGeneration(
  analysis: AnalysisRow,
  config: AIConfig | null
): Promise<{ listingId: string; generated: GeneratedListing }> {
  const truth = analysis.product_truth as ProductTruth
  const research = analysis.research as ResearchResult
  const dna = analysis.dna as WinningListingDNA
  const progressiveImagesEnabled = process.env.ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED === 'true'

  if (!truth?.name) throw new Error('A identificação do produto ainda não foi concluída.')
  if (!research?.category_id && !research?.query) {
    throw new Error('A pesquisa de mercado ainda não foi executada.')
  }

  const token = await requireMLToken(analysis.user_id)
  let { category, attributes } = await observeAnalysisStage(
    {
      analysis_id: analysis.id,
      user_id: analysis.user_id,
      stage: 'category_schema',
      metadata: { category_id: research.category_id },
    },
    () => resolveCategoryContext(token, research.category_id)
  )

  // P0.3: Category Sanity Guard — verificar se categoria é compatível com o produto
  let categoryReresolved = false
  let categoryChangeReason = ''
  let categoryChangeEvidence = ''

  if (research.category_id && attributes.length > 0) {
    const sanity = checkCategorySanity(attributes, truth.name)
    if (!sanity.ok) {
      const isLocked = research.category_source === 'url_source'
      const msg = `Category sanity: ${sanity.mismatches.join('; ')}`

      if (sanity.hasHardMismatch && isLocked) {
        // HARD MISMATCH + LOCKED: a categoria da URL é semanticamente errada
        // Marcar como suspeita e tentar re-resolução
        console.error(`[SANITY] HARD MISMATCH on locked category ${research.category_id}: ${msg}`)
        categoryChangeReason = `HARD_MISMATCH: ${sanity.mismatches.join('; ')}`

        // Tentar re-resolução usando discoverDomain com o nome do produto
        try {
          const { discoverDomain } = await import('./taxonomy')
          const domains = await discoverDomain(token, truth.name)
          if (domains.length > 0 && domains[0].category_id !== research.category_id) {
            const newCatId = domains[0].category_id
            const newAttrs = await import('./taxonomy').then(m => m.getCategoryAttributes(token, newCatId)).catch(() => [])
            const newSanity = checkCategorySanity(newAttrs, truth.name)

            if (newSanity.ok || !newSanity.hasHardMismatch) {
              const previousCategoryId = research.category_id
              categoryChangeEvidence = `Re-resolved from ${previousCategoryId} to ${newCatId} (${domains[0].category_name})`
              console.log(`[SANITY] Category re-resolved: ${previousCategoryId} → ${newCatId}`)

              // Atualizar research para usar a nova categoria
              ;(research as Mutable<ResearchResult>).category_id = newCatId
              ;(research as Mutable<ResearchResult>).category_name = domains[0].category_name
              ;(research as Mutable<ResearchResult>).category_source = 'sanity_reresolution'
              ;(research as Mutable<ResearchResult>).domain_id = domains[0].domain_id || research.domain_id
              ;(research as Mutable<ResearchResult>).domain_name = domains[0].domain_name || research.domain_name
              ;(research as Mutable<ResearchResult>).category_resolution = {
                category_id: newCatId,
                category_name: domains[0].category_name,
                domain_id: domains[0].domain_id || research.domain_id,
                source: 'sanity_reresolution',
                confidence: 0.8,
                candidates: domains,
                reasons: [categoryChangeReason, categoryChangeEvidence],
                warnings: [],
              }
              categoryReresolved = true

              // Re-resolver contexto da categoria
              const newCtx = await observeAnalysisStage(
                {
                  analysis_id: analysis.id,
                  user_id: analysis.user_id,
                  stage: 'category_schema',
                  metadata: { category_id: newCatId, reason: 'sanity_reresolution' },
                },
                () => resolveCategoryContext(token, newCatId)
              )
              category = newCtx.category
              attributes = newCtx.attributes
            } else {
              categoryChangeEvidence = `Re-resolution failed: new category ${newCatId} also has mismatches`
              console.error(`[SANITY] Re-resolution failed for ${newCatId}`)
            }
          }
        } catch (e) {
          categoryChangeEvidence = `Re-resolution error: ${e instanceof Error ? e.message : 'unknown'}`
          console.error(`[SANITY] Re-resolution error: ${e}`)
        }
      } else if (sanity.hasHardMismatch) {
        // HARD MISMATCH + UNlocked: categoria descoberta é claramente errada
        console.error(`[SANITY] HARD MISMATCH on category ${research.category_id}: ${msg}`)
        categoryChangeReason = `HARD_MISMATCH: ${sanity.mismatches.join('; ')}`
      } else {
        // SOFT mismatch: warning apenas
        const logFn = isLocked ? console.warn : console.error
        logFn(`[SANITY] Category ${research.category_id} soft mismatch: ${msg}`)
      }
    }
  }

  await updateAnalysis(analysis.id, analysis.user_id, {
    status: 'generating',
    error_message: null,
    ...(categoryReresolved
      ? { research, category_id: research.category_id, domain_id: research.domain_id }
      : {}),
  })

  // Preserva o que o vendedor já editou: regenerar não apaga trabalho dele.
  const supabasePrev = createAdminClient()
  const { data: previous } = await supabasePrev
    .from('assertive_listings')
    .select('id, status, attributes, photos, price, title, description, listing_type_id, shipping_mode, free_shipping, free_shipping_mandatory')
    .eq('analysis_id', analysis.id)
    .eq('user_id', analysis.user_id)
    .is('ml_item_id', null)
    .maybeSingle()

  const userOverrides = ((previous?.attributes?.list || []) as ListingAttribute[]).filter(
    a => a.source === 'user'
  )
  const listingTypeId = previous?.listing_type_id === 'gold_pro' ? 'gold_pro' : 'gold_special'
  const requestedShippingMode = ['me2', 'me1', 'custom'].includes(previous?.shipping_mode || '')
    ? previous?.shipping_mode as ShippingMode
    : undefined
  let shippingMode: ShippingMode = requestedShippingMode || 'me2'
  let freeShipping = Boolean(previous?.free_shipping || previous?.free_shipping_mandatory)
  let freeShippingMandatory = Boolean(previous?.free_shipping_mandatory)

  const generated = await observeAnalysisStage(
    {
      analysis_id: analysis.id,
      user_id: analysis.user_id,
      stage: 'generation',
      metadata: { category_id: category?.id || research.category_id, price_basis: research.price_basis },
    },
    () => generateListing({
      config,
      truth,
      research,
      dna,
      category,
      attributes,
      tone: config?.default_tone,
    })
  )

  const previousTitle = typeof previous?.title === 'string' ? previous.title.trim() : ''
  const previousDescription = typeof previous?.description === 'string' ? previous.description.trim() : ''
  const previousPrice = Number(previous?.price)
  if (previousTitle) generated.title = previousTitle
  if (previousDescription) generated.description = previousDescription
  if (Number.isFinite(previousPrice) && previousPrice > 0) generated.price = previousPrice
  await recordAnalysisStageEvent({
    analysis_id: analysis.id,
    user_id: analysis.user_id,
    stage: 'pricing',
    event: 'completed',
    duration_ms: 0,
    metadata: {
      basis: Number.isFinite(previousPrice) && previousPrice > 0 ? 'SELLER_OVERRIDE' : research.price_basis,
      auto_applied: Boolean(generated.price) && !(Number.isFinite(previousPrice) && previousPrice > 0),
    },
  })

  // AUTOFILL-FIRST: resolve tudo que for pesquisável antes de perguntar ao vendedor.
  const enrichment = await observeAnalysisStage(
    {
      analysis_id: analysis.id,
      user_id: analysis.user_id,
      stage: 'attribute_autofill',
      metadata: { schema_attributes: attributes.length, exact_fact_sources: exactFactSources(research).length },
    },
    () => enrichAttributes({
      config,
      truth,
      schema: attributes,
      exactProductAttributes: exactFactSources(research),
      current: [...userOverrides, ...generated.attributes],
    })
  )

  const finalAttributes = enrichment.attributes
  const completeness = computeCompleteness(attributes, finalAttributes)

  // PHOTO PIPELINE: a flag nova desacopla a galeria da geração do restante do anúncio.
  const userPhotos = ((previous?.photos as string[] | undefined)?.length
    ? (previous!.photos as string[])
    : analysis.photos || []) as string[]

  // P0.7: fotos da source URL (ML URL informada pelo usuário)
  const sourcePhotos = (truth.source_pictures || []) as string[]
  const exactReferencePhotos = exactProductReferenceUrls(research)
  const generatedReferencePhotos = [...new Set([...sourcePhotos, ...exactReferencePhotos])]

  const renditionAssetIds = Array.isArray(analysis.input_data?.photo_asset_ids)
    ? analysis.input_data.photo_asset_ids.filter((id): id is string => typeof id === 'string' && Boolean(id))
    : []
  const imageBrief = buildCopyBrief({ truth, category })
  const confirmedFactIds = new Set(imageBrief.facts.map(fact => fact.id))
  const identityReady = truth.confidence >= 0.7
    && confirmedFactIds.has('product_type')
    && ['brand', 'model', 'variant', 'material', 'color'].some(id => confirmedFactIds.has(id))
  let photoResult: Awaited<ReturnType<typeof collectAndClassifyPhotos>>
  let photos: string[]
  let photoMetadata: PhotoMeta[]
  let assetGallery: ListingGallery

  if (progressiveImagesEnabled) {
    const preservedPhotos = Array.isArray(previous?.photos)
      ? previous.photos.filter((url): url is string => typeof url === 'string' && Boolean(url))
      : []
    const preservedMetadata = previous?.attributes?.photo_metadata
    photoMetadata = Array.isArray(preservedMetadata)
      ? preservedMetadata as PhotoMeta[]
      : preservedPhotos.map((url, position) => ({
          url,
          role: position === 0 ? 'MAIN' : 'DETAIL',
          source: 'USER',
          score: 100,
          ai_enhanced: false,
          position,
        }))
    photos = preservedPhotos
    photoResult = {
      photos: photoMetadata,
      stats: {
        total_found: preservedPhotos.length,
        from_exact_product: 0,
        from_competitor: 0,
        classified: preservedPhotos.length,
        deduplicated: 0,
      },
      category_requirements: { background: 'white_pure', min_photos: 4, recommended_photos: 6, shot_types: [] },
      photo_gap: {
        reference_candidates: generatedReferencePhotos.length + renditionAssetIds.length,
        missing_count: Math.max(0, 6 - preservedPhotos.length),
        missing_roles: [],
        recommendations: [],
      },
    }
    assetGallery = {
      images: [],
      urls: photos,
      listingImages: [],
      outcome: 'progressive_pending',
      reviewRequiredAssetIds: [],
    }
  } else {
    try {
      photoResult = await observeAnalysisStage(
        {
          analysis_id: analysis.id,
          user_id: analysis.user_id,
          stage: 'photos',
          metadata: { user_photos: userPhotos.length, source_photos: sourcePhotos.length },
        },
        () => collectAndClassifyPhotos({
          research,
          truth,
          config,
          userPhotos,
          sourcePhotos,
          domainId: research.domain_id,
        })
      )
    } catch (error) {
      await recordAnalysisStageEvent({
        analysis_id: analysis.id,
        user_id: analysis.user_id,
        stage: 'photos',
        event: 'fallback',
        error_code: 'PHOTO_PIPELINE_FALLBACK',
        error_message: error instanceof Error ? error.message : 'Falha na pipeline de fotos',
      })
      photoResult = {
        photos: userPhotos.map((url, i) => ({
          url,
          role: (i === 0 ? 'MAIN' : 'DETAIL') as PhotoMeta['role'],
          source: 'USER' as PhotoMeta['source'],
          score: 100,
          ai_enhanced: false,
          position: i,
        })),
        stats: { total_found: 0, from_exact_product: 0, from_competitor: 0, classified: 0, deduplicated: 0 },
        category_requirements: { background: 'white_pure', min_photos: 4, recommended_photos: 6, shot_types: [] },
        photo_gap: {
          reference_candidates: 0,
          missing_count: Math.max(0, 6 - userPhotos.length),
          missing_roles: [],
          recommendations: [],
        },
      }
    }
    assetGallery = await observeAnalysisStage(
      {
        analysis_id: analysis.id,
        user_id: analysis.user_id,
        stage: renditionAssetIds.length ? 'image_enhancement' : 'image_generation',
        metadata: {
          input_type: analysis.input_type,
          requested_assets: renditionAssetIds.length,
          reference_assets: generatedReferencePhotos.length,
        },
      },
      () => buildAnalysisListingGallery({
        userId: analysis.user_id,
        analysisId: analysis.id,
        inputType: analysis.input_type,
        renditionAssetIds,
        referenceUrls: generatedReferencePhotos,
        productName: truth.name,
        facts: imageBrief.facts.map(fact => ({ label: fact.label, value: fact.value })),
        identityReady,
        config,
        maxPictures: category?.settings?.max_pictures_per_item || 12,
        imagePlan: generated.image_plan,
      })
    )
    photos = assetGallery.urls
    photoMetadata = assetGallery.images
  }

  const scores = computeScores({
    title: generated.title,
    description: generated.description,
    photos,
    attributes: finalAttributes,
    schema: attributes,
    completeness,
    dna,
    titleLimit: Math.min(maxTitleLength(category), 60),
  })

  // PRE-PUBLISH VALIDATION: montar payload e validar no ML automaticamente
  let publicationRequirements: PublicationRequirements | null = null
  const resolvedAttributes = [...finalAttributes]
  let titleControlMode: TitleControlMode = 'seller'
  let predictedTitle = generated.title
  let catAttrs: Array<{ id: string; tags?: Record<string, boolean> }> = []

  if (!progressiveImagesEnabled && generated.title?.trim() && generated.price && generated.price > 0 && photos.length > 0) {
    try {
      const token = await requireMLToken(analysis.user_id)
      const capabilities = await getSellerCapabilities(token).catch(() => null)
      const shippingPreferences = capabilities
        ? await getSellerShippingPreferences(token, capabilities.ml_user_id)
        : null
      try {
        shippingMode = resolveShippingMode(requestedShippingMode, shippingPreferences)
      } catch {
        shippingMode = resolveShippingMode(undefined, shippingPreferences)
      }
      const catId = generated.category_id || research.category_id || ''

      // Detectar title_control_mode
      titleControlMode = capabilities?.user_product_model ? 'user_product' : 'seller'

      // Buscar atributos da categoria para saber quais o ML auto-appende ao título
      if (catId && titleControlMode === 'user_product') {
        catAttrs = await getCategoryAttributes(token, catId).catch(() => [])
      }

      const buildPayload = () => buildItemPayload({
        title: generated.title,
        family_name: generated.family_name,
        category_id: catId,
        price: Number(generated.price),
        available_quantity: 1,
        condition: 'new',
        listing_type_id: listingTypeId,
        shipping_mode: shippingMode,
        free_shipping: freeShipping,
        free_shipping_mandatory: freeShippingMandatory,
        attributes: resolvedAttributes,
        pictures: photos,
      }, capabilities, shippingPreferences)

      // Predição do título final (modo user_product)
      if (titleControlMode === 'user_product') {
        predictedTitle = predictMLTitle(generated.family_name, resolvedAttributes, catAttrs)
      }

      // Validation loop iterativo — max 5 tentativas
      const MAX_VALIDATION_ATTEMPTS = 5
      const validation = await observeAnalysisStage(
        {
          analysis_id: analysis.id,
          user_id: analysis.user_id,
          stage: 'preflight',
          metadata: { category_id: catId },
        },
        async () => {
          let result = await validateListing(token, buildPayload())
          for (
            let attempt = 0;
            attempt < MAX_VALIDATION_ATTEMPTS && (!result.valid || hasMandatoryFreeShippingIssue(result.issues));
            attempt++
          ) {
            let autoFixed = false
            if (hasMandatoryFreeShippingIssue(result.issues) && !freeShippingMandatory) {
              freeShipping = true
              freeShippingMandatory = true
              autoFixed = true
            } else {
              autoFixed = await autoResolveAndResearch(
                token, result.issues, resolvedAttributes, attributes, truth, research, config
              )
            }
            if (!autoFixed) break // nada mais para resolver
            await recordAnalysisStageEvent({
              analysis_id: analysis.id,
              user_id: analysis.user_id,
              stage: 'preflight',
              event: 'retry',
              metadata: { attempt: attempt + 2 },
            })
            result = await validateListing(token, buildPayload())
          }
          return result
        }
      )

      publicationRequirements = computeEffectiveRequirements(attributes, validation.issues, resolvedAttributes)
    } catch {
      // pre-publish validation falhou: segue sem — o usuário poderá revalidar manualmente
    }
  }

  const hasRealBlockers = progressiveImagesEnabled
    || !generated.title?.trim() || !generated.price || generated.price <= 0 || photos.length === 0
    || assetGallery.reviewRequiredAssetIds.length > 0
    || (publicationRequirements && publicationRequirements.blocker_count > 0)
  const status = hasRealBlockers ? 'needs_input' : 'ready'

  const supabase = createAdminClient()

  const listingValues = {
      title: generated.title,
      description: generated.description,
      price: generated.price,
      category_id: generated.category_id,
      family_name: generated.family_name,
      attributes: {
        list: resolvedAttributes,
        alternatives: generated.title_alternatives,
        improvements: generated.improvements,
        price_rationale: generated.price_rationale,
        // apenas o que o autofill não conseguiu resolver
        missing: enrichment.remaining,
        autofill: enrichment.stats,
        research_sources: enrichment.web.sources,
        web_research: { used: enrichment.web.used, reason: enrichment.web.reason },
        reasoning_provider: enrichment.reasoning_provider,
        // photo pipeline
        photo_metadata: photoMetadata,
        photo_stats: photoResult.stats,
        photo_gap_analysis: photoResult.photo_gap,
        image_review: {
          outcome: assetGallery.outcome,
          required_asset_ids: progressiveImagesEnabled && Array.isArray(previous?.attributes?.image_review?.required_asset_ids)
            ? previous.attributes.image_review.required_asset_ids
            : assetGallery.reviewRequiredAssetIds,
          confirmed_asset_ids: progressiveImagesEnabled && Array.isArray(previous?.attributes?.image_review?.confirmed_asset_ids)
            ? previous.attributes.image_review.confirmed_asset_ids
            : [],
          warning: assetGallery.warning || null,
        },
        // pre-publish validation
        publication_requirements: publicationRequirements,
        blocking_questions: publicationRequirements
          ? buildBlockingQuestions(publicationRequirements, attributes, resolvedAttributes)
          : [],
        // title control
        title_control_mode: titleControlMode,
        predicted_title: predictedTitle,
        auto_appended_attributes: catAttrs.length > 0 ? getAutoAppendedAttributeIds(catAttrs) : [],
      },
      photos,
      image_plan: generated.image_plan,
      completeness,
      scores,
      status,
      available_quantity: 1,
      listing_type_id: listingTypeId,
      shipping_mode: shippingMode,
      free_shipping: freeShipping,
      free_shipping_mandatory: freeShippingMandatory,
  }

  let listing: { id: string } | null = null
  let listingError: { message?: string } | null = null
  if (progressiveImagesEnabled && previous?.id) {
    if (['publishing', 'published'].includes(previous.status || '')) {
      throw new Error('O anúncio não aceita regeneração de imagens.')
    }
    const result = await supabase
      .from('assertive_listings')
      .update(listingValues)
      .eq('id', previous.id)
      .eq('user_id', analysis.user_id)
      .is('ml_item_id', null)
      .select('id')
      .single()
    listing = result.data
    listingError = result.error
  } else {
    if (!progressiveImagesEnabled) {
      // O caminho legado mantém a substituição integral para rollback comportamental.
      await supabase
        .from('assertive_listings')
        .delete()
        .eq('analysis_id', analysis.id)
        .eq('user_id', analysis.user_id)
        .is('ml_item_id', null)
    }
    const result = await supabase
      .from('assertive_listings')
      .insert({
        analysis_id: analysis.id,
        user_id: analysis.user_id,
        variation_index: 0,
        ...listingValues,
      })
      .select('id')
      .single()
    listing = result.data
    listingError = result.error
  }

  if (listingError || !listing) throw new Error('Não foi possível salvar o anúncio gerado.')

  if (assetGallery.listingImages.length) {
    try {
      await attachListingImages(listing.id, analysis.user_id, assetGallery.listingImages)
    } catch (attachError) {
      await supabase.from('assertive_listings').delete().eq('id', listing.id).eq('user_id', analysis.user_id)
      throw attachError
    }
  }

  if (progressiveImagesEnabled) {
    const progressiveSlots = normalizeProgressiveImagePlan(
      generated.image_plan,
      imageBrief.facts.map(fact => ({ label: fact.label, value: fact.value }))
    )
    await ensureProgressiveImageJobs({
      listingId: listing.id,
      analysisId: analysis.id,
      userId: analysis.user_id,
      imagePlan: progressiveSlots.map(slot => ({ order: slot.position + 1, ...slot.shot })),
      facts: imageBrief.facts.map(fact => ({ label: fact.label, value: fact.value })),
    })
  }

  await updateAnalysis(analysis.id, analysis.user_id, { status })

  return { listingId: listing.id, generated }
}

/** Recalcula completude e scores após edição do usuário — sem custo de IA. */
export async function recomputeListing(listingId: string, userId: string) {
  const supabase = createAdminClient()
  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('id', listingId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!listing) throw new Error('Anúncio não encontrado.')

  const { data: analysis } = await supabase
    .from('assertive_analyses')
    .select('dna, research')
    .eq('id', listing.analysis_id)
    .eq('user_id', userId)
    .maybeSingle()

  const token = await requireMLToken(userId)
  const { category, attributes } = await resolveCategoryContext(token, listing.category_id)

  const attrList = (listing.attributes?.list || []) as GeneratedListing['attributes']
  const dna = (analysis?.dna || {}) as WinningListingDNA
  const safeDna: WinningListingDNA = {
    title_patterns: dna.title_patterns || [],
    important_keywords: dna.important_keywords || [],
    must_have_attributes: dna.must_have_attributes || [],
    high_value_attributes: dna.high_value_attributes || [],
    description_structure: dna.description_structure || [],
    image_patterns: dna.image_patterns || { median_count: 0, max_count: 0, recommendation: '' },
    price_context: dna.price_context || null,
    logistics_patterns: dna.logistics_patterns || { free_shipping_pct: 0, fulfillment_pct: 0, note: '' },
    common_weaknesses: dna.common_weaknesses || [],
    opportunities: dna.opportunities || [],
    references_analyzed: dna.references_analyzed || 0,
  }

  const completeness = computeCompleteness(attributes, attrList)
  const scores = computeScores({
    title: listing.title || '',
    description: listing.description || '',
    photos: (listing.photos || []) as string[],
    attributes: attrList,
    schema: attributes,
    completeness,
    dna: safeDna,
    titleLimit: Math.min(maxTitleLength(category), 60),
  })

  // Status: não rebaixa status de 'ready_to_publish' por schema interno.
  // 'needs_input' só quando faltam dados reais do ML (título, preço, foto).
  const hasRealBlockers = !listing.title?.trim() || !listing.price || Number(listing.price) <= 0 || !listing.photos?.length
    || hasPendingImageReview(listing.attributes || {})
  const status =
    listing.status === 'published' || listing.status === 'publishing'
      ? listing.status
      : hasRealBlockers
        ? 'needs_input'
        : 'ready'

  await supabase
    .from('assertive_listings')
    .update({ completeness, scores, status, updated_at: new Date().toISOString() })
    .eq('id', listingId)
    .eq('user_id', userId)

  return { completeness, scores, status }
}
