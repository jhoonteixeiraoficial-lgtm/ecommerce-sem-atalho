import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PhotoRole } from './photos'
import { createHash } from 'node:crypto'

export type ImageAssetKind = 'ORIGINAL_EVIDENCE' | 'SOURCE_REFERENCE' | 'DERIVED' | 'GENERATED_SCENE' | 'PUBLICATION_RENDITION'
export type ImageOrigin = 'USER_UPLOAD' | 'ML_OWN_ITEM' | 'ML_CATALOG' | 'COMPETITOR'
export type ImageRightsStatus = 'USER_OWNED' | 'SELLER_OWNED_CONFIRMED' | 'LICENSED' | 'REFERENCE_ONLY' | 'UNKNOWN'
export type FidelityStatus = 'ACCEPT' | 'REVIEW' | 'REJECT'

export interface ImageAsset {
  id: string
  user_id: string
  analysis_id: string | null
  kind: ImageAssetKind
  origin: ImageOrigin
  rights_status: ImageRightsStatus
  storage_bucket: string
  storage_key: string
  public_url: string | null
  sha256: string
  mime_type: string
  width: number
  height: number
  byte_size: number
  parent_asset_id: string | null
  provider: string | null
  model: string | null
  fidelity_status: FidelityStatus | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface ListingImageInput {
  asset_id: string
  position: number
  role: PhotoRole
  shot_type?: string
}

export type ImageOperationStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED'

export interface ImageOperation {
  id: string
  user_id: string
  analysis_id: string | null
  input_asset_id: string
  output_asset_id: string | null
  operation: 'NORMALIZE' | 'AI_ENHANCE' | 'AI_SCENE' | 'FIDELITY_CHECK'
  status: ImageOperationStatus
  idempotency_key: string
  provider: string | null
  model: string | null
  attempt_count: number
  cost_usd: number | null
  error_code: string | null
  error_message: string | null
  metadata: Record<string, unknown>
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface CreateOriginalAssetInput {
  user_id: string
  analysis_id?: string
  bytes: Buffer
  mime_type: string
  width: number
  height: number
  sha256: string
  storage_key: string
}

export interface CreateDerivedAssetInput extends Omit<CreateOriginalAssetInput, 'storage_key'> {
  parent_asset_id: string
  kind: 'DERIVED' | 'GENERATED_SCENE' | 'PUBLICATION_RENDITION'
  storage_key: string
  public_url?: string
  provider?: string
  model?: string
  fidelity_status?: FidelityStatus
  metadata?: Record<string, unknown>
}

const PUBLICATION_RIGHTS = new Set<ImageRightsStatus>(['USER_OWNED', 'SELLER_OWNED_CONFIRMED', 'LICENSED'])

export function isPublicationAssetAllowed(asset: ImageAsset): boolean {
  return asset.origin !== 'COMPETITOR'
    && PUBLICATION_RIGHTS.has(asset.rights_status)
    && asset.kind !== 'ORIGINAL_EVIDENCE'
    && Boolean(asset.parent_asset_id)
    && Boolean(asset.public_url)
    && asset.fidelity_status === 'ACCEPT'
}

async function persistAsset(
  input: CreateOriginalAssetInput | CreateDerivedAssetInput,
  row: Omit<ImageAsset, 'id' | 'created_at'>
): Promise<ImageAsset> {
  const supabase = createAdminClient()
  const { error: uploadError } = await supabase.storage
    .from(row.storage_bucket)
    .upload(row.storage_key, input.bytes, { contentType: row.mime_type, upsert: false })
  if (uploadError) throw new Error(`Falha ao armazenar imagem: ${uploadError.message}`)

  const { data, error } = await supabase.from('assertive_image_assets').insert(row).select('*').single()
  if (error || !data) {
    await supabase.storage.from(row.storage_bucket).remove([row.storage_key])
    throw new Error(`Falha ao registrar imagem: ${error?.message || 'registro ausente'}`)
  }
  return data as ImageAsset
}

export async function createOriginalAsset(input: CreateOriginalAssetInput): Promise<ImageAsset> {
  return persistAsset(input, {
    user_id: input.user_id,
    analysis_id: input.analysis_id || null,
    kind: 'ORIGINAL_EVIDENCE',
    origin: 'USER_UPLOAD',
    rights_status: 'USER_OWNED',
    storage_bucket: 'assertive-originals',
    storage_key: input.storage_key,
    public_url: null,
    sha256: input.sha256,
    mime_type: input.mime_type,
    width: input.width,
    height: input.height,
    byte_size: input.bytes.byteLength,
    parent_asset_id: null,
    provider: null,
    model: null,
    fidelity_status: null,
    metadata: {},
  })
}

export async function createDerivedAsset(input: CreateDerivedAssetInput): Promise<ImageAsset> {
  if (!input.parent_asset_id) throw new Error('Imagem derivada precisa de um ativo original.')
  const supabase = createAdminClient()
  const publicUrl = input.public_url
    || supabase.storage.from('assertive').getPublicUrl(input.storage_key).data.publicUrl
  return persistAsset(input, {
    user_id: input.user_id,
    analysis_id: input.analysis_id || null,
    kind: input.kind,
    origin: 'USER_UPLOAD',
    rights_status: 'USER_OWNED',
    storage_bucket: 'assertive',
    storage_key: input.storage_key,
    public_url: publicUrl,
    sha256: input.sha256,
    mime_type: input.mime_type,
    width: input.width,
    height: input.height,
    byte_size: input.bytes.byteLength,
    parent_asset_id: input.parent_asset_id,
    provider: input.provider || null,
    model: input.model || null,
    fidelity_status: input.fidelity_status || null,
    metadata: input.metadata || {},
  })
}

export async function getOwnedAssets(userId: string, assetIds: string[]): Promise<ImageAsset[]> {
  if (!assetIds.length) return []
  const { data, error } = await createAdminClient()
    .from('assertive_image_assets')
    .select('*')
    .eq('user_id', userId)
    .in('id', [...new Set(assetIds)])
  if (error) throw new Error(`Falha ao consultar imagens: ${error.message}`)
  return (data || []) as ImageAsset[]
}

export async function downloadOwnedImageAsset(userId: string, assetId: string): Promise<Buffer> {
  const [asset] = await getOwnedAssets(userId, [assetId])
  if (!asset) throw new Error('Imagem não encontrada.')
  const { data, error } = await createAdminClient().storage.from(asset.storage_bucket).download(asset.storage_key)
  if (error || !data) throw new Error(`Falha ao ler imagem: ${error?.message || 'arquivo ausente'}`)
  const bytes = Buffer.from(await data.arrayBuffer())
  if (bytes.byteLength !== asset.byte_size || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw new Error('A integridade da imagem armazenada não confere.')
  }
  return bytes
}

export async function getImageOperationByKey(userId: string, idempotencyKey: string): Promise<ImageOperation | null> {
  const { data, error } = await createAdminClient()
    .from('assertive_image_operations')
    .select('*')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()
  if (error) throw new Error(`Falha ao consultar operação de imagem: ${error.message}`)
  return (data as ImageOperation | null) || null
}

export async function beginImageOperation(input: {
  user_id: string
  analysis_id?: string
  input_asset_id: string
  operation: ImageOperation['operation']
  idempotency_key: string
}): Promise<ImageOperation> {
  const existing = await getImageOperationByKey(input.user_id, input.idempotency_key)
  if (existing) return existing
  const { data, error } = await createAdminClient().from('assertive_image_operations').insert({
    user_id: input.user_id,
    analysis_id: input.analysis_id || null,
    input_asset_id: input.input_asset_id,
    operation: input.operation,
    status: 'RUNNING',
    idempotency_key: input.idempotency_key,
    attempt_count: 0,
    started_at: new Date().toISOString(),
  }).select('*').single()
  if (error || !data) {
    if ((error as { code?: string } | null)?.code === '23505') {
      const raced = await getImageOperationByKey(input.user_id, input.idempotency_key)
      if (raced) return raced
    }
    throw new Error(`Falha ao iniciar operação de imagem: ${error?.message || 'registro ausente'}`)
  }
  return data as ImageOperation
}

export async function finishImageOperation(
  operationId: string,
  userId: string,
  patch: {
    status: Extract<ImageOperationStatus, 'SUCCEEDED' | 'FAILED' | 'REJECTED'>
    output_asset_id?: string | null
    provider?: string | null
    model?: string | null
    attempt_count?: number
    cost_usd?: number | null
    error_code?: string | null
    error_message?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await createAdminClient().from('assertive_image_operations').update({
    ...patch,
    error_message: patch.error_message?.slice(0, 1000) || null,
    finished_at: new Date().toISOString(),
  }).eq('id', operationId).eq('user_id', userId)
  if (error) throw new Error(`Falha ao concluir operação de imagem: ${error.message}`)
}

export async function attachListingImages(
  listingId: string,
  userId: string,
  images: ListingImageInput[]
): Promise<void> {
  const supabase = createAdminClient()
  const { data: listing } = await supabase.from('assertive_listings')
    .select('id').eq('id', listingId).eq('user_id', userId).maybeSingle()
  if (!listing) throw new Error('Anúncio não encontrado.')

  const assets = await getOwnedAssets(userId, images.map(image => image.asset_id))
  const byId = new Map(assets.map(asset => [asset.id, asset]))
  if (images.some(image => !byId.has(image.asset_id) || !isPublicationAssetAllowed(byId.get(image.asset_id)!))) {
    throw new Error('Uma ou mais imagens não possuem origem, direito ou fidelidade aprovados.')
  }

  const positions = new Set(images.map(image => image.position))
  if (positions.size !== images.length) throw new Error('As posições das imagens precisam ser únicas.')
  if (images.some((image, index) => image.position !== index)) {
    throw new Error('As posições das imagens precisam ser contínuas e começar em zero.')
  }
  if (images.length && (images[0].role !== 'MAIN' || images.slice(1).some(image => image.role === 'MAIN'))) {
    throw new Error('A galeria precisa ter exatamente uma imagem principal na primeira posição.')
  }

  const { error } = await supabase.rpc('assertive_replace_listing_images', {
    p_listing_id: listingId,
    p_user_id: userId,
    p_images: images,
  })
  if (error) throw new Error(`Falha ao atualizar galeria: ${error.message}`)
}
