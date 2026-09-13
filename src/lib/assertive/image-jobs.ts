import 'server-only'

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ImagePlanStep } from './generator'
import {
  buildProgressiveImageSlots,
  type ImageJob,
  type ImageJobSnapshot,
  type ImageJobStatus,
} from './image-job-contract'
import { isPublicationAssetAllowed, type ImageAsset } from './image-assets'
import type { PhotoRole } from './photos'

export type SnapshotImageAsset = ImageAsset

export interface SnapshotListingImage {
  position: number
  role: PhotoRole
  asset_id: string
}

export interface BuildImageJobSnapshotInput {
  listingId: string
  listingStatus: string
  jobs: ImageJob[]
  linkedImages: SnapshotListingImage[]
  assets: SnapshotImageAsset[]
  now?: Date
}

export interface EnsureProgressiveImageJobsInput {
  listingId: string
  analysisId: string
  userId: string
  imagePlan?: ImagePlanStep[]
  facts?: Array<{ label: string; value: string }>
}

export interface ImageJobTransitionPatch {
  status: Extract<ImageJobStatus, 'RETRYABLE' | 'REVIEW' | 'SUCCEEDED' | 'FAILED'>
  reference_asset_ids?: string[]
  output_asset_id?: string | null
  next_attempt_at?: string | null
  error_code?: string | null
  error_message?: string | null
  metadata?: Record<string, unknown>
}

const LOCK_LEASE_MS = 3 * 60 * 1000

function dateTime(value: string | null): number {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function jobCanRun(job: ImageJob, now: number): boolean {
  if (job.status === 'RUNNING') return dateTime(job.locked_at) < now - LOCK_LEASE_MS
  if (job.attempt_count >= job.max_attempts) return false
  if (job.status === 'QUEUED') return true
  if (job.status === 'RETRYABLE') return !job.next_attempt_at || dateTime(job.next_attempt_at) <= now
  return false
}

function publicPreview(asset: SnapshotImageAsset | undefined): string | null {
  if (!asset || !isPublicationAssetAllowed(asset)) return null
  if (asset.kind === 'GENERATED_SCENE' && asset.origin !== 'AI_GENERATED') return null
  return asset.public_url
}

function autoVerdict(asset: SnapshotImageAsset | undefined): 'ACCEPT' | 'REVIEW' | null {
  const direct = asset?.metadata.auto_verdict
  if (direct === 'ACCEPT' || direct === 'REVIEW') return direct
  const fidelity = asset?.metadata.fidelity
  if (fidelity && typeof fidelity === 'object') {
    const status = (fidelity as { status?: unknown }).status
    if (status === 'ACCEPT' || status === 'REVIEW') return status
  }
  return null
}

export function buildImageJobSnapshot(input: BuildImageJobSnapshotInput): ImageJobSnapshot {
  const now = (input.now || new Date()).getTime()
  const assets = new Map(input.assets.map(asset => [asset.id, asset]))
  const linked = new Map(input.linkedImages.map(image => [image.position, image]))
  const referenceJob = input.jobs.find(job => job.kind === 'REFERENCE_SEARCH')
  const generationJobs = input.jobs.filter(
    (job): job is ImageJob & { position: number; role: PhotoRole } => (
      job.kind === 'GENERATE_SLOT' && job.position !== null && job.role !== null
    )
  )
  const jobsByPosition = new Map(generationJobs.map(job => [job.position, job]))
  const referenceAssets = [...new Set(referenceJob?.reference_asset_ids || [])]
    .map(id => assets.get(id))
    .filter((asset): asset is SnapshotImageAsset => {
      if (!asset) return false
      return (
        (
          asset.kind === 'SOURCE_REFERENCE'
          && ['REFERENCE_ONLY', 'SELLER_OWNED_CONFIRMED', 'LICENSED'].includes(asset.rights_status)
        )
        || (
          asset.kind === 'ORIGINAL_EVIDENCE'
          && asset.origin === 'USER_UPLOAD'
          && asset.rights_status === 'USER_OWNED'
        )
        || (
          ['DERIVED', 'PUBLICATION_RENDITION'].includes(asset.kind)
          && asset.origin === 'USER_UPLOAD'
          && ['USER_OWNED', 'SELLER_OWNED_CONFIRMED', 'LICENSED'].includes(asset.rights_status)
        )
      )
    })
  const defaults = buildProgressiveImageSlots([], [])

  const slots = defaults.map(defaultSlot => {
    const currentJob = jobsByPosition.get(defaultSlot.position)
    const currentLink = linked.get(defaultSlot.position)
    const linkedAsset = currentLink ? assets.get(currentLink.asset_id) : undefined
    const jobOutputMatchesLink = Boolean(
      currentJob?.output_asset_id
        && currentLink?.asset_id === currentJob.output_asset_id
    )
    const selectedAsset = currentJob
      ? (jobOutputMatchesLink ? linkedAsset : undefined)
      : linkedAsset
    const previewUrl = publicPreview(selectedAsset)
    const manual = Boolean(previewUrl && (!currentJob || selectedAsset?.origin !== 'AI_GENERATED'))
    const status: ImageJobStatus = currentJob?.status || (previewUrl ? 'SUCCEEDED' : 'QUEUED')
    const blockedByReference = currentJob?.status === 'QUEUED'
      && referenceJob
      && ['FAILED', 'DISMISSED'].includes(referenceJob.status)
    const title = typeof currentJob?.shot.title === 'string' && currentJob.shot.title.trim()
      ? currentJob.shot.title.trim()
      : defaultSlot.shot.title
    const description = typeof currentJob?.shot.description === 'string' && currentJob.shot.description.trim()
      ? currentJob.shot.description.trim()
      : defaultSlot.shot.description

    return {
      position: defaultSlot.position,
      role: currentJob?.role || currentLink?.role || defaultSlot.role,
      title,
      description,
      required: typeof currentJob?.shot.required === 'boolean'
        ? currentJob.shot.required
        : defaultSlot.shot.required,
      status,
      asset_id: previewUrl ? selectedAsset?.id || null : null,
      preview_url: previewUrl,
      attempts: currentJob?.attempt_count || 0,
      error_code: blockedByReference ? referenceJob.error_code : currentJob?.error_code || null,
      error_message: blockedByReference ? referenceJob.error_message : currentJob?.error_message || null,
      auto_verdict: autoVerdict(selectedAsset),
      manual,
    }
  })

  const activeCount = generationJobs.filter(job => (
    job.status === 'RUNNING' && dateTime(job.locked_at) >= now - LOCK_LEASE_MS
  )).length
  const listingEditable = !['publishing', 'published'].includes(input.listingStatus)
  const referenceRunnable = Boolean(referenceJob && jobCanRun(referenceJob, now))
  const contractIncomplete = !referenceJob || generationJobs.length < 6
  const generationRunnable = referenceJob?.status === 'SUCCEEDED'
    && activeCount < 2
    && generationJobs.some(job => jobCanRun(job, now))

  return {
    listing_id: input.listingId,
    target_count: 6,
    ready_count: slots.filter(slot => slot.status === 'SUCCEEDED').length,
    visible_count: slots.filter(slot => Boolean(slot.preview_url)).length,
    active_count: activeCount,
    reference_status: referenceJob?.status || 'QUEUED',
    reference_count: referenceAssets.length,
    reference_origins: [...new Set(referenceAssets.map(asset => asset.origin))],
    runnable: listingEditable && (contractIncomplete || referenceRunnable || generationRunnable),
    slots,
  }
}

function assertRequired(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} ausente.`)
}

function assertPosition(position: number): void {
  if (!Number.isInteger(position) || position < 0 || position > 5) {
    throw new Error('Posição de imagem inválida.')
  }
}

export async function ensureProgressiveImageJobs(input: EnsureProgressiveImageJobsInput): Promise<void> {
  assertRequired(input.listingId, 'Anúncio')
  assertRequired(input.analysisId, 'Análise')
  assertRequired(input.userId, 'Usuário')
  const slots = buildProgressiveImageSlots(input.imagePlan || [], input.facts || [])
  const { error } = await createAdminClient().rpc('assertive_bootstrap_image_jobs', {
    p_listing_id: input.listingId,
    p_user_id: input.userId,
    p_slots: slots,
  })
  if (error) throw new Error(`Falha ao preparar imagens progressivas: ${error.message}`)
}

export async function claimNextImageJob(listingId: string, userId: string): Promise<ImageJob | null> {
  assertRequired(listingId, 'Anúncio')
  assertRequired(userId, 'Usuário')
  const lockToken = randomUUID()
  const { data, error } = await createAdminClient().rpc('assertive_claim_image_job', {
    p_listing_id: listingId,
    p_user_id: userId,
    p_lock_token: lockToken,
  })
  if (error) throw new Error(`Falha ao reservar geração de imagem: ${error.message}`)
  const claimed = (Array.isArray(data) ? data[0] : data) as ImageJob | null | undefined
  if (!claimed) return null
  if (
    claimed.listing_id !== listingId
    || claimed.user_id !== userId
    || claimed.status !== 'RUNNING'
    || claimed.lock_token !== lockToken
  ) {
    throw new Error('A reserva da geração de imagem retornou um estado inválido.')
  }
  return claimed
}

export async function transitionImageJob(
  jobId: string,
  userId: string,
  lockToken: string,
  patch: ImageJobTransitionPatch
): Promise<void> {
  assertRequired(jobId, 'Job')
  assertRequired(userId, 'Usuário')
  assertRequired(lockToken, 'Lock')
  const supabase = createAdminClient()
  const { data: current, error: lookupError } = await supabase
    .from('assertive_image_jobs')
    .select('listing_id')
    .eq('id', jobId)
    .eq('user_id', userId)
    .eq('status', 'RUNNING')
    .eq('lock_token', lockToken)
    .maybeSingle()
  if (lookupError) throw new Error(`Falha ao consultar geração de imagem: ${lookupError.message}`)
  if (!current) throw new Error('A geração de imagem não possui mais um lock válido.')

  const update: Record<string, unknown> = {
    status: patch.status,
    next_attempt_at: patch.next_attempt_at || null,
    lock_token: null,
    locked_at: null,
    error_code: patch.error_code || null,
    error_message: patch.error_message?.slice(0, 1000) || null,
    updated_at: new Date().toISOString(),
  }
  if (patch.reference_asset_ids) update.reference_asset_ids = [...new Set(patch.reference_asset_ids)]
  if (patch.output_asset_id !== undefined) update.output_asset_id = patch.output_asset_id
  if (patch.metadata) update.metadata = patch.metadata

  const { data: updated, error: updateError } = await supabase
    .from('assertive_image_jobs')
    .update(update)
    .eq('id', jobId)
    .eq('listing_id', current.listing_id)
    .eq('user_id', userId)
    .eq('status', 'RUNNING')
    .eq('lock_token', lockToken)
    .select('id')
    .maybeSingle()
  if (updateError) throw new Error(`Falha ao concluir geração de imagem: ${updateError.message}`)
  if (!updated) throw new Error('A geração de imagem perdeu o lock antes de ser concluída.')
}

export async function retryImageJob(listingId: string, userId: string, position: number): Promise<void> {
  assertRequired(listingId, 'Anúncio')
  assertRequired(userId, 'Usuário')
  assertPosition(position)
  const { error } = await createAdminClient().rpc('assertive_reset_image_slot', {
    p_listing_id: listingId,
    p_user_id: userId,
    p_position: position,
    p_status: 'QUEUED',
  })
  if (error) throw new Error(`Falha ao reenfileirar imagem: ${error.message}`)
}

export async function dismissImageJob(listingId: string, userId: string, position: number): Promise<void> {
  assertRequired(listingId, 'Anúncio')
  assertRequired(userId, 'Usuário')
  assertPosition(position)
  const { error } = await createAdminClient().rpc('assertive_reset_image_slot', {
    p_listing_id: listingId,
    p_user_id: userId,
    p_position: position,
    p_status: 'DISMISSED',
  })
  if (error) throw new Error(`Falha ao remover posição de imagem: ${error.message}`)
}

export async function confirmImageJob(
  listingId: string,
  userId: string,
  position: number,
  assetId: string
): Promise<void> {
  assertRequired(listingId, 'Anúncio')
  assertRequired(userId, 'Usuário')
  assertRequired(assetId, 'Asset')
  assertPosition(position)
  const { error } = await createAdminClient().rpc('assertive_confirm_image_slot', {
    p_listing_id: listingId,
    p_user_id: userId,
    p_position: position,
    p_asset_id: assetId,
  })
  if (error) throw new Error(`Falha ao confirmar posição de imagem: ${error.message}`)
}

export async function findImageReviewJob(
  listingId: string,
  userId: string,
  assetId: string
): Promise<{ progressive: boolean; position: number | null }> {
  assertRequired(listingId, 'Anúncio')
  assertRequired(userId, 'Usuário')
  assertRequired(assetId, 'Asset')
  const { data, error } = await createAdminClient()
    .from('assertive_image_jobs')
    .select('position,status,output_asset_id')
    .eq('listing_id', listingId)
    .eq('user_id', userId)
    .eq('kind', 'GENERATE_SLOT')
  if (error) throw new Error(`Falha ao consultar revisão de imagem: ${error.message}`)
  const jobs = (data || []) as Array<Pick<ImageJob, 'position' | 'status' | 'output_asset_id'>>
  const match = jobs.find(job => job.status === 'REVIEW' && job.output_asset_id === assetId)
  return {
    progressive: jobs.length > 0,
    position: match && Number.isInteger(match.position) ? match.position : null,
  }
}

export async function completeReferenceImageJob(
  jobId: string,
  userId: string,
  lockToken: string,
  assetIds: string[]
): Promise<void> {
  assertRequired(jobId, 'Job')
  assertRequired(userId, 'Usuário')
  assertRequired(lockToken, 'Lock')
  const references = [...new Set(assetIds.filter(Boolean))]
  if (!references.length || references.length > 8) throw new Error('Referências visuais inválidas.')
  const { error } = await createAdminClient().rpc('assertive_complete_reference_job', {
    p_job_id: jobId,
    p_user_id: userId,
    p_lock_token: lockToken,
    p_asset_ids: references,
  })
  if (error) throw new Error(`Falha ao concluir busca de referências: ${error.message}`)
}

export async function attachGeneratedImageSlot(
  listingId: string,
  userId: string,
  position: number,
  assetId: string,
  lockToken: string
): Promise<void> {
  assertRequired(listingId, 'Anúncio')
  assertRequired(userId, 'Usuário')
  assertRequired(assetId, 'Asset')
  assertRequired(lockToken, 'Lock')
  assertPosition(position)
  const { error } = await createAdminClient().rpc('assertive_upsert_listing_image_slot', {
    p_listing_id: listingId,
    p_user_id: userId,
    p_position: position,
    p_asset_id: assetId,
    p_lock_token: lockToken,
  })
  if (error) throw new Error(`Falha ao vincular imagem gerada: ${error.message}`)
}

export async function attachManualImageSlot(
  listingId: string,
  userId: string,
  position: number,
  assetId: string
): Promise<void> {
  assertRequired(listingId, 'Anúncio')
  assertRequired(userId, 'Usuário')
  assertRequired(assetId, 'Asset')
  assertPosition(position)
  const { error } = await createAdminClient().rpc('assertive_attach_manual_image_slot', {
    p_listing_id: listingId,
    p_user_id: userId,
    p_position: position,
    p_asset_id: assetId,
  })
  if (error) throw new Error(`Falha ao vincular foto própria: ${error.message}`)
}

export async function getImageJobSnapshot(listingId: string, userId: string): Promise<ImageJobSnapshot> {
  assertRequired(listingId, 'Anúncio')
  assertRequired(userId, 'Usuário')
  const supabase = createAdminClient()
  const { data: listing, error: listingError } = await supabase
    .from('assertive_listings')
    .select('id,status')
    .eq('id', listingId)
    .eq('user_id', userId)
    .maybeSingle()
  if (listingError) throw new Error(`Falha ao consultar anúncio: ${listingError.message}`)
  if (!listing) throw new Error('Anúncio não encontrado.')

  const [{ data: jobRows, error: jobsError }, { data: linkedRows, error: linkedError }] = await Promise.all([
    supabase
      .from('assertive_image_jobs')
      .select('*')
      .eq('listing_id', listingId)
      .eq('user_id', userId),
    supabase
      .from('assertive_listing_images')
      .select('asset_id,position,role')
      .eq('listing_id', listingId),
  ])
  if (jobsError) throw new Error(`Falha ao consultar jobs de imagem: ${jobsError.message}`)
  if (linkedError) throw new Error(`Falha ao consultar galeria: ${linkedError.message}`)

  const jobs = (jobRows || []) as ImageJob[]
  const linkedImages = (linkedRows || []) as SnapshotListingImage[]
  const assetIds = [...new Set([
    ...jobs.flatMap(job => [job.output_asset_id, ...job.reference_asset_ids]),
    ...linkedImages.map(image => image.asset_id),
  ].filter((id): id is string => Boolean(id)))]
  let assets: SnapshotImageAsset[] = []
  if (assetIds.length) {
    const { data: assetRows, error: assetsError } = await supabase
      .from('assertive_image_assets')
      .select('*')
      .eq('user_id', userId)
      .in('id', assetIds)
    if (assetsError) throw new Error(`Falha ao consultar ativos de imagem: ${assetsError.message}`)
    assets = (assetRows || []) as SnapshotImageAsset[]
  }

  return buildImageJobSnapshot({
    listingId,
    listingStatus: listing.status,
    jobs,
    linkedImages,
    assets,
  })
}
