import 'server-only'
import { createHash } from 'node:crypto'
import {
  beginImageOperation,
  createDerivedAsset,
  downloadOwnedImageAsset,
  finishImageOperation,
  getImageOperationByKey,
  getOwnedAssets,
  isPublicationAssetAllowed,
  type ImageAsset,
  type ListingImageInput,
} from './image-assets'
import { preparePublicationImage } from './image-enhancement'
import type { PhotoMeta, PhotoRole } from './photos'
import type { AIConfig } from './types'

export interface GalleryImage extends PhotoMeta {
  asset_id: string
  parent_asset_id: string
  fidelity_status: 'ACCEPT'
  label: 'Original normalizada' | 'Melhorada por IA'
}

export interface ListingGallery {
  images: GalleryImage[]
  urls: string[]
  listingImages: ListingImageInput[]
}

function roleAt(index: number, asset: ImageAsset): PhotoRole {
  const storedRole = asset.metadata?.role
  if (['MAIN', 'DETAIL', 'PACKAGING', 'LIFESTYLE', 'INFORMATIONAL'].includes(String(storedRole))) {
    return storedRole as PhotoRole
  }
  return index === 0 ? 'MAIN' : 'DETAIL'
}

function galleryImage(asset: ImageAsset, index: number, enhanced = false): GalleryImage {
  return {
    asset_id: asset.id,
    parent_asset_id: asset.parent_asset_id!,
    fidelity_status: 'ACCEPT',
    label: enhanced ? 'Melhorada por IA' : 'Original normalizada',
    url: asset.public_url!,
    role: roleAt(index, asset),
    source: enhanced ? 'AI_ENHANCED' : 'USER',
    source_ref: asset.parent_asset_id!,
    score: enhanced ? 220 : 210 - index,
    ai_enhanced: enhanced,
    position: index,
  }
}

export async function buildListingGallery(input: {
  userId: string
  analysisId: string
  renditionAssetIds: string[]
  productName?: string
  config: AIConfig | null
  maxPictures?: number
  enhancementEnabled?: boolean
}): Promise<ListingGallery> {
  const ids = [...new Set(input.renditionAssetIds)]
  const owned = await getOwnedAssets(input.userId, ids)
  const byId = new Map(owned.map(asset => [asset.id, asset]))
  const limit = Math.min(Math.max(input.maxPictures || 12, 1), 12)
  const assets = ids.slice(0, limit).map(id => byId.get(id))
  if (assets.some(asset => !asset || !isPublicationAssetAllowed(asset))) {
    throw new Error('Uma imagem solicitada não está aprovada para publicação.')
  }

  const selected = assets as ImageAsset[]
  let images = selected.map((asset, index) => galleryImage(asset, index))
  const enhancementEnabled = input.enhancementEnabled
    ?? process.env.ASSERTIVE_IMAGE_ENHANCEMENT_ENABLED === 'true'

  const coverParentId = selected[0]?.parent_asset_id
  if (enhancementEnabled && coverParentId) {
    const fallback = selected[0]
    const [original] = await getOwnedAssets(input.userId, [coverParentId])
    if (original?.kind === 'ORIGINAL_EVIDENCE' && original.rights_status === 'USER_OWNED') {
      const operationKey = createHash('sha256').update([
        input.userId,
        original.sha256,
        'AI_ENHANCE',
        'cover-cleanup-v1',
        process.env.GEMINI_IMAGE_MODEL || 'registry-default',
      ].join(':')).digest('hex')
      const prior = await getImageOperationByKey(input.userId, operationKey)
      const priorOutput = prior?.status === 'SUCCEEDED' && prior.output_asset_id
        ? (await getOwnedAssets(input.userId, [prior.output_asset_id]))[0]
        : null

      if (priorOutput && isPublicationAssetAllowed(priorOutput)) {
        images[0] = galleryImage(priorOutput, 0, true)
      } else if (!prior) {
        const operation = await beginImageOperation({
          user_id: input.userId,
          analysis_id: input.analysisId,
          input_asset_id: original.id,
          operation: 'AI_ENHANCE',
          idempotency_key: operationKey,
        })
        if (operation.status === 'RUNNING') {
          try {
            const bytes = await downloadOwnedImageAsset(input.userId, original.id)
            const prepared = await preparePublicationImage({
              source: bytes,
              source_mime_type: original.mime_type,
              mode: 'COVER_CLEANUP',
              productName: input.productName,
              config: input.config,
              enabled: true,
            })
            if (prepared.ai_enhanced) {
              const outputHash = createHash('sha256').update(prepared.image.buffer).digest('hex')
              const output = await createDerivedAsset({
                user_id: input.userId,
                analysis_id: input.analysisId,
                parent_asset_id: original.id,
                kind: 'PUBLICATION_RENDITION',
                bytes: prepared.image.buffer,
                mime_type: prepared.image.mime_type,
                width: prepared.image.width,
                height: prepared.image.height,
                sha256: outputHash,
                storage_key: `${input.userId}/${input.analysisId}/enhanced-${outputHash.slice(0, 20)}.jpg`,
                provider: prepared.provider || undefined,
                model: prepared.model || undefined,
                fidelity_status: 'ACCEPT',
                metadata: {
                  operation: 'AI_ENHANCE',
                  source_sha256: original.sha256,
                  prompt_hash: prepared.provenance?.prompt_hash,
                  provider_output_sha256: prepared.provenance?.output_sha256,
                  fidelity_score: prepared.fidelity?.score,
                  fidelity_reason: prepared.fidelity?.reason,
                  fidelity_reason_codes: prepared.fidelity?.reason_codes,
                },
              })
              await finishImageOperation(operation.id, input.userId, {
                status: 'SUCCEEDED',
                output_asset_id: output.id,
                provider: prepared.provider,
                model: prepared.model,
                attempt_count: prepared.attempts,
                metadata: {
                  latency_ms: prepared.latency_ms,
                  prompt_hash: prepared.provenance?.prompt_hash,
                  output_sha256: outputHash,
                  fidelity_score: prepared.fidelity?.score,
                  fidelity_reason_codes: prepared.fidelity?.reason_codes,
                },
              })
              images[0] = galleryImage(output, 0, true)
            } else {
              const rejected = prepared.fallback_reason?.startsWith('FIDELITY_')
              await finishImageOperation(operation.id, input.userId, {
                status: rejected ? 'REJECTED' : 'FAILED',
                attempt_count: prepared.attempts,
                error_code: prepared.fallback_reason || 'AI_ERROR',
                metadata: {
                  latency_ms: prepared.latency_ms,
                  fidelity_status: prepared.fidelity?.status,
                  fidelity_score: prepared.fidelity?.score,
                },
              })
            }
          } catch (error) {
            await finishImageOperation(operation.id, input.userId, {
              status: 'FAILED',
              error_code: 'IMAGE_PIPELINE_ERROR',
              error_message: error instanceof Error ? error.message : 'Falha desconhecida',
            }).catch(() => undefined)
          }
        }
      }
    }
  }

  images = images.slice(0, limit)
  images.forEach((image, index) => {
    image.position = index
    if (index === 0) image.role = 'MAIN'
  })
  return {
    images,
    urls: images.map(image => image.url),
    listingImages: images.map(image => ({
      asset_id: image.asset_id,
      position: image.position,
      role: image.role,
    })),
  }
}
