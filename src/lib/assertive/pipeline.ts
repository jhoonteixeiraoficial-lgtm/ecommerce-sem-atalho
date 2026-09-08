import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AIConfig } from './types'
import type { ProductTruth } from './truth'
import { enrichFromCatalog } from './truth'

type Mutable<T> = { -readonly [P in keyof T]: T[P] }
import { researchMarket, type ResearchResult } from './research'
import { extractDNA, type WinningListingDNA } from './dna'
import {
  getCategory,
  getCategoryAttributes,
  classifyAttributes,
  maxTitleLength,
  type ClassifiedAttribute,
  type CategoryInfo,
} from './taxonomy'
import { generateListing, type GeneratedListing, type ListingAttribute } from './generator'
import { enrichAttributes, type EnrichedAttribute } from './enrichment'
import { computeCompleteness, computeScores } from './scoring'
import { requireMLToken, getSellerCapabilities, buildItemPayload, buildItemPayloadWithMeta, predictMLTitle, getAutoAppendedAttributeIds, validateListing, type SellerCapabilities, type TitleControlMode } from './publisher'
import { searchQueryFor } from './truth'
import { decrypt } from './encryption'
import { collectAndClassifyPhotos, type PhotoMeta } from './photos'
import { computeEffectiveRequirements, type PublicationRequirements } from './publication-requirements'
import { targetedAttributeResearch } from './targeted-research'

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
  input_type: 'photo' | 'description' | 'url'
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
  await supabase
    .from('assertive_analyses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', analysisId)
    .eq('user_id', userId)
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
  capabilities?: SellerCapabilities | null
}

export async function resolveCategoryContext(
  token: string,
  categoryId: string | null
): Promise<CategoryContext> {
  if (!categoryId) return { category: null, attributes: [] }

  const [category, rawAttrs, capabilities] = await Promise.all([
    getCategory(token, categoryId).catch(() => null),
    getCategoryAttributes(token, categoryId).catch(() => []),
    getSellerCapabilities(token).catch(() => null),
  ])

  return {
    category,
    attributes: classifyAttributes(rawAttrs, {
      requireSellerPackage: capabilities?.user_product_model ?? false,
    }),
    capabilities,
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

  const research = await researchMarket(token, query, {
    deepLimit: 8,
    categoryHint: opts.categoryOverride || null,
    sourceCategoryId: truth.source_category_id || null,
    // permite classificar EXACT vs COMPARABLE
    truth,
  })

  await updateAnalysis(analysis.id, analysis.user_id, { status: 'analyzing' })

  const dna = extractDNA(research)

  // Só produto EXATO alimenta a ficha. Comparável jamais vira fato.
  let enriched = truth
  for (const ref of research.competitors) {
    if (!ref.usable_as_fact_source) continue
    enriched = enrichFromCatalog(enriched, ref.attributes, ref.title)
  }

  await updateAnalysis(analysis.id, analysis.user_id, {
    research,
    dna,
    product_truth: enriched,
    category_id: research.category_id,
    domain_id: research.domain_id,
    // P0.2: category lock log
    category_source: research.category_source,
    category_lock: research.category_source === 'url_source',
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
      } else {
        const spec = categoryAttributes.find(a => a.id === attrId)
        resolvedAttributes.push({
          id: attrId,
          name: spec?.name || attrId,
          value_name: issue.suggested_value.value_name || issue.suggested_value.value_id || '',
          source: 'catalog',
          tier: spec?.tier || 'recommended',
          status: 'AUTO_FILLED',
        })
      }
      changed = true
    }
  }

  // 2. Para atributos ainda vazios sem suggested_value, tentar pesquisa direcionada
  const exactProducts = research.competitors
    .filter(c => c.usable_as_fact_source)
    .map(c => ({ title: c.title, attributes: c.attributes }))

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
        } else {
          resolvedAttributes.push({
            id: attrId,
            name: spec.name,
            value_name: result.value,
            source: 'catalog',
            tier: spec.tier,
            status: 'AUTO_FILLED',
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

  if (!truth?.name) throw new Error('A identificação do produto ainda não foi concluída.')
  if (!research?.category_id && !research?.query) {
    throw new Error('A pesquisa de mercado ainda não foi executada.')
  }

  const token = await requireMLToken(analysis.user_id)
  const { category, attributes } = await resolveCategoryContext(token, research.category_id)

  // P0.3: Category Sanity Guard — verificar se categoria é compatível com o produto
  let categoryChanged = false
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
        categoryChanged = true

        // Tentar re-resolução usando discoverDomain com o nome do produto
        try {
          const { discoverDomain } = await import('./taxonomy')
          const domains = await discoverDomain(token, truth.name)
          if (domains.length > 0 && domains[0].category_id !== research.category_id) {
            const newCatId = domains[0].category_id
            const newAttrs = await import('./taxonomy').then(m => m.getCategoryAttributes(token, newCatId)).catch(() => [])
            const newSanity = checkCategorySanity(newAttrs, truth.name)

            if (newSanity.ok || !newSanity.hasHardMismatch) {
              categoryChangeEvidence = `Re-resolved from ${research.category_id} to ${newCatId} (${domains[0].category_name})`
              console.log(`[SANITY] Category re-resolved: ${research.category_id} → ${newCatId}`)

              // Atualizar research para usar a nova categoria
              ;(research as Mutable<ResearchResult>).category_id = newCatId
              ;(research as Mutable<ResearchResult>).category_name = domains[0].category_name
              ;(research as Mutable<ResearchResult>).category_source = 'sanity_reresolution'

              // Re-resolver contexto da categoria
              const newCtx = await resolveCategoryContext(token, newCatId)
              Object.assign({ category, attributes }, newCtx)
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

  await updateAnalysis(analysis.id, analysis.user_id, { status: 'generating', error_message: null })

  // Preserva o que o vendedor já editou: regenerar não apaga trabalho dele.
  const supabasePrev = createAdminClient()
  const { data: previous } = await supabasePrev
    .from('assertive_listings')
    .select('attributes, photos, price, title, description')
    .eq('analysis_id', analysis.id)
    .eq('user_id', analysis.user_id)
    .is('ml_item_id', null)
    .maybeSingle()

  const userOverrides = ((previous?.attributes?.list || []) as ListingAttribute[]).filter(
    a => a.source === 'user'
  )

  const generated = await generateListing({
    config,
    truth,
    research,
    dna,
    category,
    attributes,
    tone: config?.default_tone,
  })

  // AUTOFILL-FIRST: resolve tudo que for pesquisável antes de perguntar ao vendedor.
  const enrichment = await enrichAttributes({
    config,
    truth,
    schema: attributes,
    exactProductAttributes: research.competitors
      .filter(c => c.usable_as_fact_source)
      .map(c => ({ title: c.title, attributes: c.attributes })),
    current: [...userOverrides, ...generated.attributes],
  })

  const finalAttributes = enrichment.attributes
  const completeness = computeCompleteness(attributes, finalAttributes)

  // PHOTO PIPELINE: coleta fotos de concorrentes, classifica e deduplica
  const userPhotos = ((previous?.photos as string[] | undefined)?.length
    ? (previous!.photos as string[])
    : analysis.photos || []) as string[]

  // P0.7: fotos da source URL (ML URL informada pelo usuário)
  const sourcePhotos = (truth.source_pictures || []) as string[]

  let photoResult: Awaited<ReturnType<typeof collectAndClassifyPhotos>>
  try {
    photoResult = await collectAndClassifyPhotos({
      research,
      truth,
      config,
      userPhotos,
      sourcePhotos,
      domainId: research.domain_id,
    })
  } catch {
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
    }
  }

  const photos = photoResult.photos.map(p => p.url)
  const photoMetadata = photoResult.photos

  const scores = computeScores({
    title: generated.title,
    description: generated.description,
    photos,
    attributes: finalAttributes,
    schema: attributes,
    completeness,
    dna,
    titleLimit: maxTitleLength(category),
  })

  // PRE-PUBLISH VALIDATION: montar payload e validar no ML automaticamente
  let publicationRequirements: PublicationRequirements | null = null
  let resolvedAttributes = [...finalAttributes]
  let titleControlMode: TitleControlMode = 'seller'
  let predictedTitle = generated.title
  let catAttrs: Array<{ id: string; tags?: Record<string, boolean> }> = []

  if (generated.title?.trim() && generated.price && generated.price > 0 && photos.length > 0) {
    try {
      const token = await requireMLToken(analysis.user_id)
      const capabilities = await getSellerCapabilities(token).catch(() => null)
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
        listing_type_id: 'gold_special',
        attributes: resolvedAttributes,
        pictures: photos,
      }, capabilities)

      // Predição do título final (modo user_product)
      if (titleControlMode === 'user_product') {
        predictedTitle = predictMLTitle(generated.family_name, resolvedAttributes, catAttrs)
      }

      // Validation loop iterativo — max 5 tentativas
      const MAX_VALIDATION_ATTEMPTS = 5
      let validation = await validateListing(token, buildPayload())

      for (let attempt = 0; attempt < MAX_VALIDATION_ATTEMPTS && !validation.valid; attempt++) {
        const autoFixed = await autoResolveAndResearch(
          token, validation.issues, resolvedAttributes, attributes, truth, research, config
        )
        if (!autoFixed) break // nada mais para resolver

        validation = await validateListing(token, buildPayload())
      }

      publicationRequirements = computeEffectiveRequirements(attributes, validation.issues, resolvedAttributes)
    } catch {
      // pre-publish validation falhou: segue sem — o usuário poderá revalidar manualmente
    }
  }

  const hasRealBlockers = !generated.title?.trim() || !generated.price || generated.price <= 0 || photos.length === 0
    || (publicationRequirements && publicationRequirements.blocker_count > 0)
  const status = hasRealBlockers ? 'needs_input' : 'ready'

  const supabase = createAdminClient()

  // regerar substitui o rascunho anterior — evita anúncios duplicados na conta do usuário
  await supabase
    .from('assertive_listings')
    .delete()
    .eq('analysis_id', analysis.id)
    .eq('user_id', analysis.user_id)
    .is('ml_item_id', null)

  const { data: listing, error } = await supabase
    .from('assertive_listings')
    .insert({
      analysis_id: analysis.id,
      user_id: analysis.user_id,
      variation_index: 0,
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
        // pre-publish validation
        publication_requirements: publicationRequirements,
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
    })
    .select('id')
    .single()

  if (error || !listing) throw new Error('Não foi possível salvar o anúncio gerado.')

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
    titleLimit: maxTitleLength(category),
  })

  // Status: não rebaixa status de 'ready_to_publish' por schema interno.
  // 'needs_input' só quando faltam dados reais do ML (título, preço, foto).
  const hasRealBlockers = !listing.title?.trim() || !listing.price || Number(listing.price) <= 0 || !listing.photos?.length
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
