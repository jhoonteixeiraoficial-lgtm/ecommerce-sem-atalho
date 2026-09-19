import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPublishableAttribute } from './attribute-evidence'
import { generateProductImage, type GenerateProductImageInput, type ProductImageGenerationResult } from './gemini-image'
import type { ListingAttribute } from './generator'
import type { PhotoRecipe } from './visual-recipe'
import {
  createGeneratedAsset,
  downloadOwnedImageAsset,
  getOwnedAssets,
  type CreateGeneratedAssetInput,
  type ImageAsset,
} from './image-assets'
import { verifyReferenceGuidedImage, type ImageFidelityResult } from './image-fidelity'
import { buildProgressiveImageSlots, type ImageJob, type ImageJobRunResult, type ImageJobSnapshot } from './image-job-contract'
import {
  attachGeneratedImageSlot,
  claimNextImageJob,
  completeReferenceImageJob,
  getImageJobSnapshot,
  transitionImageJob,
  type ImageJobTransitionPatch,
} from './image-jobs'
import { normalizeProductImage, type NormalizedImage } from './image-normalization'
import { assessWhiteCover, findNearDuplicate, type PerceptualComparison, type WhiteCoverAssessment } from './image-quality'
import { mapLimitSettled } from './ml-api'
import { recordAnalysisStageEvent, type AnalysisStageEvent } from './observability'
import type { AIConfig } from './types'
import type { ProductTruth } from './truth'
import { acquireVisualReferences, type AcquireVisualReferencesInput } from './visual-references'

interface ProgressiveListingContext {
  id: string
  user_id: string
  analysis_id: string
  status: string
  title: string
  attributes?: { list?: ListingAttribute[]; photo_recipe?: PhotoRecipe } | null
}

interface ProgressiveAnalysisContext {
  id: string
  user_id: string
  input_data: Record<string, unknown>
}

export interface ProgressiveJobExecutionContext {
  listing: ProgressiveListingContext
  analysis: ProgressiveAnalysisContext
  truth: ProductTruth
  facts: Array<{ label: string; value: string }>
  ownAssetIds: string[]
  token: string | null
  config: AIConfig | null
}

export interface LoadedImageReference {
  asset: ImageAsset
  buffer: Buffer
  mime_type: string
  /** URL pública da referência (foto do usuário ou do concorrente) p/ img2img */
  url: string | null
}

export interface RunNextProgressiveImageJobInput {
  listingId: string
  userId: string
  token?: string | null
  config?: AIConfig | null
}

export interface ProgressiveImageDependencies {
  claimJob(listingId: string, userId: string): Promise<ImageJob | null>
  getSnapshot(listingId: string, userId: string): Promise<ImageJobSnapshot>
  loadContext(input: RunNextProgressiveImageJobInput): Promise<ProgressiveJobExecutionContext>
  acquireReferences(input: AcquireVisualReferencesInput): Promise<ImageAsset[]>
  completeReference(jobId: string, userId: string, lockToken: string, assetIds: string[]): Promise<void>
  transitionJob(
    jobId: string,
    userId: string,
    lockToken: string,
    patch: ImageJobTransitionPatch
  ): Promise<void>
  loadReferences(job: ImageJob, userId: string): Promise<LoadedImageReference[]>
  generateImage(input: GenerateProductImageInput): Promise<ProductImageGenerationResult>
  normalizeImage(buffer: Buffer): Promise<NormalizedImage>
  verifyFidelity(input: Parameters<typeof verifyReferenceGuidedImage>[0]): Promise<
    ImageFidelityResult & { composition_is_new: boolean }
  >
  assessCover(buffer: Buffer): Promise<WhiteCoverAssessment>
  findDuplicate(candidate: Buffer, comparisons: PerceptualComparison[], threshold: number): Promise<string | null>
  loadGalleryComparisons(listingId: string, userId: string, excludePosition: number): Promise<PerceptualComparison[]>
  persistGeneratedAsset(input: CreateGeneratedAssetInput): Promise<ImageAsset>
  attachSlot(listingId: string, userId: string, position: number, assetId: string, lockToken: string): Promise<void>
  recordEvent(event: AnalysisStageEvent): Promise<boolean>
  now(): Date
}

class ProgressiveImageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryAfterMs = 5_000
  ) {
    super(message)
    this.name = 'ProgressiveImageError'
  }
}

function confirmedFacts(truth: ProductTruth): Array<{ label: string; value: string }> {
  return Object.entries(truth.fields || {})
    .filter(([, field]) => field.value?.trim() && (
      field.confidence === 'confirmed'
      || ['CONFIRMED', 'AUTO_FILLED', 'USER_OVERRIDE'].includes(field.status || '')
    ))
    .map(([key, field]) => ({
      label: key.replace(/_/g, ' '),
      value: field.value.trim(),
    }))
    .slice(0, 20)
}

const VISUAL_ATTRIBUTE_KEYS: Record<string, string> = {
  BRAND: 'brand',
  MODEL: 'model',
  GTIN: 'gtin',
  EAN: 'gtin',
  UPC: 'gtin',
  MPN: 'part_number',
  PART_NUMBER: 'part_number',
  COLOR: 'color',
  MAIN_COLOR: 'color',
  MATERIAL: 'material',
  BODY_MATERIAL: 'material',
  VOLTAGE: 'voltage',
  POWER: 'power',
  CAPACITY: 'capacity',
  UNITS_PER_PACK: 'units_per_pack',
  LINE: 'line',
  VARIANT: 'variant',
}

function visualReferenceTruth(context: ProgressiveJobExecutionContext): ProductTruth {
  const fields = { ...context.truth.fields }
  for (const attribute of context.listing.attributes?.list || []) {
    const key = VISUAL_ATTRIBUTE_KEYS[attribute.id.toUpperCase()]
    const value = attribute.value_name?.trim()
    if (!key || !value || !isPublishableAttribute(attribute)) continue
    const current = fields[key]
    if (current && (
      current.confidence === 'confirmed'
      || ['CONFIRMED', 'AUTO_FILLED', 'USER_OVERRIDE'].includes(current.status || '')
    )) continue
    fields[key] = {
      value,
      confidence: 'confirmed',
      source: attribute.source === 'user'
        ? 'user'
        : attribute.source === 'catalog'
          ? 'ml_catalog'
          : 'derived',
      evidence: attribute.evidence?.trim() || `Atributo ${attribute.name} confirmado no anúncio`,
      status: attribute.status,
      source_url: attribute.source_url,
    }
  }
  return { ...context.truth, fields }
}

function previousFailure(job: ImageJob): GenerateProductImageInput['previousFailure'] {
  const value = job.metadata.previous_failure
  if (!value || typeof value !== 'object') return undefined
  const failure = value as { code?: unknown; message?: unknown }
  return typeof failure.code === 'string' && typeof failure.message === 'string'
    ? { code: failure.code, message: failure.message }
    : undefined
}

async function loadDefaultContext(input: RunNextProgressiveImageJobInput): Promise<ProgressiveJobExecutionContext> {
  const supabase = createAdminClient()
  const { data: listing, error: listingError } = await supabase
    .from('assertive_listings')
    .select('id,user_id,analysis_id,status,title,attributes')
    .eq('id', input.listingId)
    .eq('user_id', input.userId)
    .maybeSingle()
  if (listingError) throw new Error(`Falha ao consultar anúncio: ${listingError.message}`)
  if (!listing) throw new ProgressiveImageError('IMAGE_LISTING_NOT_FOUND', 'Anúncio não encontrado.', 0)
  if (['publishing', 'published'].includes(listing.status)) {
    throw new ProgressiveImageError('IMAGE_LISTING_IMMUTABLE', 'O anúncio não aceita novas imagens.', 0)
  }

  const { data: analysis, error: analysisError } = await supabase
    .from('assertive_analyses')
    .select('id,user_id,input_data,product_truth')
    .eq('id', listing.analysis_id)
    .eq('user_id', input.userId)
    .maybeSingle()
  if (analysisError) throw new Error(`Falha ao consultar análise: ${analysisError.message}`)
  const truth = analysis?.product_truth as ProductTruth | null | undefined
  if (!analysis || !truth || typeof truth.name !== 'string' || !truth.name.trim() || !truth.fields) {
    throw new ProgressiveImageError('IMAGE_IDENTITY_MISSING', 'A identidade do produto não está disponível.', 0)
  }

  const [token, config] = await Promise.all([
    input.token !== undefined
      ? Promise.resolve(input.token)
      : import('./publisher').then(module => module.getValidMLToken(input.userId)),
    input.config !== undefined
      ? Promise.resolve(input.config)
      : import('./pipeline').then(module => module.getUserAIConfig(input.userId)),
  ])
  const inputData = analysis.input_data && typeof analysis.input_data === 'object'
    ? analysis.input_data as Record<string, unknown>
    : {}
  const rawAssetIds = Array.isArray(inputData.photo_asset_ids) ? inputData.photo_asset_ids : []
  return {
    listing: listing as ProgressiveListingContext,
    analysis: { id: analysis.id, user_id: analysis.user_id, input_data: inputData },
    truth,
    facts: confirmedFacts(truth),
    ownAssetIds: rawAssetIds.filter((assetId): assetId is string => typeof assetId === 'string' && Boolean(assetId)),
    token,
    config,
  }
}

function diverseAssets(job: ImageJob, assets: ImageAsset[]): ImageAsset[] {
  const byId = new Map(assets.map(asset => [asset.id, asset]))
  const ordered = job.reference_asset_ids.map(id => byId.get(id)).filter((asset): asset is ImageAsset => Boolean(asset))
  const selected: ImageAsset[] = []
  const usedOrigins = new Set<string>()
  for (const asset of ordered) {
    if (usedOrigins.has(asset.origin)) continue
    usedOrigins.add(asset.origin)
    selected.push(asset)
    if (selected.length === 3) return selected
  }
  for (const asset of ordered) {
    if (selected.some(current => current.id === asset.id)) continue
    selected.push(asset)
    if (selected.length === 3) break
  }
  return selected
}

async function loadDefaultReferences(job: ImageJob, userId: string): Promise<LoadedImageReference[]> {
  const assets = diverseAssets(job, await getOwnedAssets(userId, job.reference_asset_ids))
  return mapLimitSettled(assets, 3, async asset => ({
    asset,
    buffer: await downloadOwnedImageAsset(userId, asset.id),
    mime_type: asset.mime_type,
    url: asset.public_url ?? null,
  }))
}

async function loadDefaultGalleryComparisons(
  listingId: string,
  userId: string,
  excludePosition: number
): Promise<PerceptualComparison[]> {
  const supabase = createAdminClient()
  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('id')
    .eq('id', listingId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!listing) return []
  const { data, error } = await supabase
    .from('assertive_listing_images')
    .select('asset_id,position')
    .eq('listing_id', listingId)
    .neq('position', excludePosition)
  if (error) throw new Error(`Falha ao consultar imagens existentes: ${error.message}`)
  const ids = [...new Set((data || []).map(row => row.asset_id as string).filter(Boolean))]
  const assets = await getOwnedAssets(userId, ids)
  return mapLimitSettled(assets, 3, async asset => ({
    id: asset.id,
    buffer: await downloadOwnedImageAsset(userId, asset.id),
  }))
}

const defaultDependencies: ProgressiveImageDependencies = {
  claimJob: claimNextImageJob,
  getSnapshot: getImageJobSnapshot,
  loadContext: loadDefaultContext,
  acquireReferences: acquireVisualReferences,
  completeReference: completeReferenceImageJob,
  transitionJob: transitionImageJob,
  loadReferences: loadDefaultReferences,
  generateImage: generateProductImage,
  normalizeImage: normalizeProductImage,
  verifyFidelity: verifyReferenceGuidedImage,
  assessCover: assessWhiteCover,
  findDuplicate: findNearDuplicate,
  loadGalleryComparisons: loadDefaultGalleryComparisons,
  persistGeneratedAsset: createGeneratedAsset,
  attachSlot: attachGeneratedImageSlot,
  recordEvent: recordAnalysisStageEvent,
  now: () => new Date(),
}

function executionError(error: unknown): ProgressiveImageError {
  if (error instanceof ProgressiveImageError) return error
  const message = error instanceof Error ? error.message : String(error || 'Falha desconhecida')
  if (/GEMINI_API_KEY ausente|Nenhum modelo Gemini|api[_ -]?key.*(?:invalid|not valid)|API_KEY_INVALID/i.test(message)) {
    return new ProgressiveImageError(
      'IMAGE_PROVIDER_CONFIGURATION',
      'A geração de imagens não está configurada corretamente.',
      0
    )
  }
  if (/\b429\b|resource_exhausted|rate.?limit/i.test(message)) {
    return new ProgressiveImageError(
      'IMAGE_PROVIDER_RATE_LIMITED',
      'O provedor de imagens limitou temporariamente as solicitações.',
      60_000
    )
  }
  if (/\b503\b|unavailable|overloaded/i.test(message)) {
    return new ProgressiveImageError(
      'IMAGE_PROVIDER_UNAVAILABLE',
      'O provedor de imagens está temporariamente indisponível.',
      30_000
    )
  }
  if (/abort|timeout|timed out|tempo limite/i.test(message)) {
    return new ProgressiveImageError(
      'IMAGE_PROVIDER_TIMEOUT',
      'A geração de imagem excedeu o tempo limite.',
      30_000
    )
  }
  return new ProgressiveImageError('IMAGE_JOB_FAILED', 'Não foi possível concluir esta imagem.', 10_000)
}

async function settleFailure(
  job: ImageJob,
  error: unknown,
  dependencies: ProgressiveImageDependencies
): Promise<'RETRYABLE' | 'FAILED'> {
  if (!job.lock_token) throw new Error('Job de imagem sem lock válido.')
  const failure = executionError(error)
  const requiresExplicitRetry = ['IMAGE_FIDELITY_REJECTED', 'IMAGE_BACKGROUND_REJECTED', 'IMAGE_DUPLICATE_REJECTED'].includes(failure.code)
  const status = !requiresExplicitRetry && failure.retryAfterMs > 0 && job.attempt_count < job.max_attempts ? 'RETRYABLE' : 'FAILED'
  await dependencies.transitionJob(job.id, job.user_id, job.lock_token, {
    status,
    next_attempt_at: status === 'RETRYABLE'
      ? new Date(dependencies.now().getTime() + failure.retryAfterMs).toISOString()
      : null,
    error_code: failure.code,
    error_message: failure.message,
    metadata: {
      ...job.metadata,
      previous_failure: {
        code: failure.code,
        message: failure.message,
        attempt: job.attempt_count,
      },
    },
  })
  return status
}

async function safelyRecord(
  dependencies: ProgressiveImageDependencies,
  event: AnalysisStageEvent
): Promise<void> {
  await dependencies.recordEvent(event).catch(() => false)
}

function assertJobContext(job: ImageJob, context: ProgressiveJobExecutionContext): void {
  if (
    context.listing.id !== job.listing_id
    || context.listing.user_id !== job.user_id
    || context.listing.analysis_id !== job.analysis_id
    || context.analysis.id !== job.analysis_id
    || context.analysis.user_id !== job.user_id
  ) {
    throw new ProgressiveImageError('IMAGE_CONTEXT_MISMATCH', 'O contexto do job de imagem é inválido.', 0)
  }
}

export async function runReferenceSearchJob(
  job: ImageJob,
  context: ProgressiveJobExecutionContext,
  dependencies: ProgressiveImageDependencies = defaultDependencies
): Promise<void> {
  if (job.kind !== 'REFERENCE_SEARCH' || !job.lock_token) throw new Error('Job de referência inválido.')
  try {
    assertJobContext(job, context)
    const assets = await dependencies.acquireReferences({
      userId: job.user_id,
      analysisId: job.analysis_id,
      token: context.token || '',
      truth: visualReferenceTruth(context),
      ownAssetIds: context.ownAssetIds,
      maxAssets: 8,
    })
    if (!assets.length) {
      throw new ProgressiveImageError(
        'REFERENCE_NOT_FOUND',
        'Nenhuma referência visual exata foi encontrada.',
        30_000
      )
    }
    await dependencies.completeReference(job.id, job.user_id, job.lock_token, assets.map(asset => asset.id))
    await safelyRecord(dependencies, {
      analysis_id: job.analysis_id,
      user_id: job.user_id,
      stage: 'photos',
      event: 'completed',
      metadata: {
        image_job_id: job.id,
        accepted_reference_count: assets.length,
        origins: [...new Set(assets.map(asset => asset.origin))],
      },
    })
  } catch (error) {
    const status = await settleFailure(job, error, dependencies)
    const failure = executionError(error)
    await safelyRecord(dependencies, {
      analysis_id: job.analysis_id,
      user_id: job.user_id,
      stage: 'photos',
      event: status === 'RETRYABLE' ? 'retry' : 'failed',
      error_code: failure.code,
      error_message: failure.message,
      metadata: { image_job_id: job.id, attempt: job.attempt_count },
    })
  }
}

interface RecipeShot {
  type?: string
  angle?: string
  background?: string
  lighting?: string
  composition?: string
  buyer_doubt?: string
  overlay_theme?: string | null
}

/** Tiro da Receita Visual (salvo nos atributos do anúncio), pela posição do job. */
function readRecipeShot(context: ProgressiveJobExecutionContext, position: number): RecipeShot | undefined {
  return context.listing.attributes?.photo_recipe?.shots?.[position]
}

export async function runGenerationSlotJob(
  job: ImageJob,
  context: ProgressiveJobExecutionContext,
  dependencies: ProgressiveImageDependencies = defaultDependencies
): Promise<void> {
  if (job.kind !== 'GENERATE_SLOT' || job.position === null || !job.role || !job.lock_token) {
    throw new Error('Job de geração inválido.')
  }
  try {
    assertJobContext(job, context)
    const references = await dependencies.loadReferences(job, job.user_id)
    if (!references.length) {
      throw new ProgressiveImageError('REFERENCE_UNAVAILABLE', 'As referências visuais não puderam ser carregadas.', 30_000)
    }
    const generationTruth = visualReferenceTruth(context)
    const productName = context.listing.title.trim() || generationTruth.name
    const facts = confirmedFacts(generationTruth)
    const normalizedShot = buildProgressiveImageSlots([{
      order: job.position + 1,
      title: typeof job.shot.title === 'string' ? job.shot.title : `Imagem ${job.position + 1}`,
      description: typeof job.shot.description === 'string' ? job.shot.description : 'Composição segura do produto',
      required: job.shot.required === true,
    }], facts)[job.position].shot
    const generated = await dependencies.generateImage({
      productName,
      facts,
      references: references.map(reference => ({ buffer: reference.buffer, mime_type: reference.mime_type })),
      shot: {
        order: job.position + 1,
        ...normalizedShot,
      },
      // Receita Visual do anúncio escalado: replica a estratégia da foto
      // vencedora (ângulo, luz, composição, dúvida do comprador), nunca os pixels.
      recipeShot: readRecipeShot(context, job.position),
      referenceUrls: references.map(r => r.url).filter((u): u is string => Boolean(u)),
      role: job.role,
      previousFailure: previousFailure(job),
      apiKey: context.config?.provider === 'gemini' ? context.config.api_key : undefined,
    })
    const normalized = await dependencies.normalizeImage(generated.buffer)
    if (job.position === 0) {
      const cover = await dependencies.assessCover(normalized.buffer)
      if (!cover.passed) {
        throw new ProgressiveImageError(
          'IMAGE_BACKGROUND_REJECTED',
          cover.reason || 'A capa não possui fundo branco seguro.'
        )
      }
    }
    const duplicatedReference = await dependencies.findDuplicate(
      normalized.buffer,
      references.map(reference => ({ id: reference.asset.id, buffer: reference.buffer })),
      4
    )
    if (duplicatedReference) {
      throw new ProgressiveImageError(
        'IMAGE_DUPLICATE_REJECTED',
        'A composição gerada repete uma referência visual.'
      )
    }
    const galleryComparisons = await dependencies.loadGalleryComparisons(
      job.listing_id,
      job.user_id,
      job.position
    )
    const duplicatedOutput = await dependencies.findDuplicate(normalized.buffer, galleryComparisons, 6)
    if (duplicatedOutput) {
      throw new ProgressiveImageError(
        'IMAGE_DUPLICATE_REJECTED',
        'A composição gerada repete outra posição da galeria.'
      )
    }
    const fidelity = await dependencies.verifyFidelity({
      references: references.map(reference => ({ buffer: reference.buffer, mime_type: reference.mime_type })),
      candidate: normalized.buffer,
      candidate_mime_type: normalized.mime_type,
      productName,
      facts,
      config: context.config,
    })
    if (fidelity.status === 'REJECT') {
      throw new ProgressiveImageError('IMAGE_FIDELITY_REJECTED', fidelity.reason)
    }

    const outputHash = createHash('sha256').update(normalized.buffer).digest('hex')
    const output = await dependencies.persistGeneratedAsset({
      user_id: job.user_id,
      analysis_id: job.analysis_id,
      parent_asset_id: references[0].asset.id,
      bytes: normalized.buffer,
      mime_type: normalized.mime_type,
      width: normalized.width,
      height: normalized.height,
      sha256: outputHash,
      storage_key: `${job.user_id}/${job.analysis_id}/progressive-${job.position}-${job.generation_nonce}-${outputHash.slice(0, 20)}.jpg`,
      provider: generated.provider,
      model: generated.model,
      metadata: {
        truth_brief_hash: generated.truth_brief_hash,
        prompt_hash: generated.prompt_hash,
        source_sha256: generated.source_sha256,
        reference_sha256s: generated.reference_sha256s,
        provider_output_sha256: generated.output_sha256,
        review_required: true,
        review_status: 'PENDING',
        auto_verdict: fidelity.status,
        role: job.role,
        image_plan_step: normalizedShot,
        image_job_id: job.id,
        generation_nonce: job.generation_nonce,
        fidelity,
      },
    })
    await dependencies.attachSlot(job.listing_id, job.user_id, job.position, output.id, job.lock_token)
    await safelyRecord(dependencies, {
      analysis_id: job.analysis_id,
      user_id: job.user_id,
      stage: 'image_generation',
      event: 'completed',
      metadata: {
        image_job_id: job.id,
        position: job.position,
        role: job.role,
        asset_id: output.id,
        auto_verdict: fidelity.status,
        reference_count: references.length,
      },
    })
  } catch (error) {
    const status = await settleFailure(job, error, dependencies)
    const failure = executionError(error)
    await safelyRecord(dependencies, {
      analysis_id: job.analysis_id,
      user_id: job.user_id,
      stage: 'image_generation',
      event: status === 'RETRYABLE' ? 'retry' : 'failed',
      error_code: failure.code,
      error_message: failure.message,
      metadata: { image_job_id: job.id, position: job.position, attempt: job.attempt_count },
    })
  }
}

export async function runNextProgressiveImageJob(
  input: RunNextProgressiveImageJobInput,
  dependencies: ProgressiveImageDependencies = defaultDependencies
): Promise<ImageJobRunResult> {
  const claimed = await dependencies.claimJob(input.listingId, input.userId)
  if (!claimed) {
    return {
      snapshot: await dependencies.getSnapshot(input.listingId, input.userId),
      processed_kind: null,
      processed_position: null,
    }
  }

  let context: ProgressiveJobExecutionContext
  try {
    context = await dependencies.loadContext(input)
  } catch (error) {
    await settleFailure(claimed, error, dependencies)
    return {
      snapshot: await dependencies.getSnapshot(input.listingId, input.userId),
      processed_kind: claimed.kind,
      processed_position: claimed.position,
    }
  }
  if (claimed.kind === 'REFERENCE_SEARCH') {
    await runReferenceSearchJob(claimed, context, dependencies)
  } else {
    await runGenerationSlotJob(claimed, context, dependencies)
  }
  return {
    snapshot: await dependencies.getSnapshot(input.listingId, input.userId),
    processed_kind: claimed.kind,
    processed_position: claimed.position,
  }
}
