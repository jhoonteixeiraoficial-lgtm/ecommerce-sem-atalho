import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AIConfig } from './types'
import type { ProductTruth } from './truth'
import { enrichFromCatalog } from './truth'
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
import { generateListing, type GeneratedListing } from './generator'
import { computeCompleteness, computeScores } from './scoring'
import { requireMLToken, getSellerCapabilities, type SellerCapabilities } from './publisher'
import { searchQueryFor } from './truth'
import { decrypt } from './encryption'

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
  })

  await updateAnalysis(analysis.id, analysis.user_id, { status: 'analyzing' })

  const dna = extractDNA(research)

  // herda a ficha do produto de catálogo equivalente, quando marca e modelo batem
  let enriched = truth
  const best = research.competitors[0]
  if (best) {
    enriched = enrichFromCatalog(truth, best.attributes, best.title)
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

/** Etapa GENERATING: cria o anúncio. Não refaz a pesquisa. */
export async function runGeneration(
  analysis: AnalysisRow,
  config: AIConfig | null
): Promise<{ listingId: string; generated: GeneratedListing }> {
  const truth = analysis.product_truth as ProductTruth
  const research = analysis.research as ResearchResult
  const dna = analysis.dna as WinningListingDNA

  if (!truth?.name) throw new Error('A identificação do produto ainda não foi concluída.')
  if (!research?.competitors) throw new Error('A pesquisa de mercado ainda não foi executada.')

  const token = await requireMLToken(analysis.user_id)
  const { category, attributes } = await resolveCategoryContext(token, research.category_id)

  await updateAnalysis(analysis.id, analysis.user_id, { status: 'generating', error_message: null })

  const generated = await generateListing({
    config,
    truth,
    research,
    dna,
    category,
    attributes,
    tone: config?.default_tone,
  })

  const completeness = computeCompleteness(attributes, generated.attributes)
  const scores = computeScores({
    title: generated.title,
    description: generated.description,
    photos: analysis.photos || [],
    attributes: generated.attributes,
    schema: attributes,
    completeness,
    dna,
    titleLimit: maxTitleLength(category),
  })

  const status = completeness.missing_required.length > 0 ? 'needs_input' : 'ready'

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
        list: generated.attributes,
        alternatives: generated.title_alternatives,
        improvements: generated.improvements,
        price_rationale: generated.price_rationale,
        missing: generated.missing_attributes,
      },
      photos: analysis.photos || [],
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

  const status =
    listing.status === 'published' || listing.status === 'publishing'
      ? listing.status
      : completeness.missing_required.length > 0
        ? 'needs_input'
        : 'ready'

  await supabase
    .from('assertive_listings')
    .update({ completeness, scores, status, updated_at: new Date().toISOString() })
    .eq('id', listingId)
    .eq('user_id', userId)

  return { completeness, scores, status }
}
