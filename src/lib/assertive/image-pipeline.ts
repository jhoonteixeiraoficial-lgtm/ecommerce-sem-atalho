import 'server-only'
import { createHash } from 'node:crypto'
import {
  beginImageOperation,
  createDerivedAsset,
  createGeneratedAsset,
  createReferenceAsset,
  downloadOwnedImageAsset,
  finishImageOperation,
  getImageOperationByKey,
  getOwnedAssets,
  isPublicationAssetAllowed,
  type ImageAsset,
  type ListingImageInput,
} from './image-assets'
import { preparePublicationImage } from './image-enhancement'
import { editProductImage, generateProductImage } from './gemini-image'
import { verifyGeneratedImage, verifyImageFidelity } from './image-fidelity'
import { createSafeCropVariants, normalizeProductImage } from './image-normalization'
import { fetchImageSafely } from './safe-image-fetch'
import type { ImagePlanStep } from './generator'
import type { PhotoMeta, PhotoRole } from './photos'
import type { AIConfig } from './types'

export interface GalleryImage extends PhotoMeta {
  asset_id: string
  parent_asset_id: string | null
  fidelity_status: 'ACCEPT'
  label: 'Original normalizada' | 'Recorte da foto original' | 'Melhorada por IA' | 'Gerada por IA'
}

export interface ListingGallery {
  images: GalleryImage[]
  urls: string[]
  listingImages: ListingImageInput[]
  outcome: 'enhanced' | 'normalized_fallback' | 'generated_pending_review' | 'generation_failed' | 'identity_required' | 'progressive_pending'
  reviewRequiredAssetIds: string[]
  warning?: string
}

function roleAt(index: number, asset: ImageAsset): PhotoRole {
  const storedRole = asset.metadata?.role
  if (['MAIN', 'DETAIL', 'PACKAGING', 'LIFESTYLE', 'INFORMATIONAL'].includes(String(storedRole))) {
    return storedRole as PhotoRole
  }
  return index === 0 ? 'MAIN' : 'DETAIL'
}

function galleryImage(asset: ImageAsset, index: number, enhanced = false): GalleryImage {
  const safeCrop = asset.metadata?.operation === 'SAFE_CROP'
  return {
    asset_id: asset.id,
    parent_asset_id: asset.parent_asset_id!,
    fidelity_status: 'ACCEPT',
    label: enhanced ? 'Melhorada por IA' : safeCrop ? 'Recorte da foto original' : 'Original normalizada',
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
  let outcome: ListingGallery['outcome'] = 'normalized_fallback'
  const enhancementEnabled = input.enhancementEnabled
    ?? process.env.ASSERTIVE_IMAGE_ENHANCEMENT_ENABLED === 'true'

  const coverParentId = selected[0]?.parent_asset_id
  if (enhancementEnabled && coverParentId) {
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
        outcome = 'enhanced'
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
              outcome = 'enhanced'
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
    outcome,
    reviewRequiredAssetIds: [],
  }
}

function generatedGallery(asset: ImageAsset, role: PhotoRole = 'MAIN', warning?: string): ListingGallery {
  const image: GalleryImage = {
    asset_id: asset.id,
    parent_asset_id: asset.parent_asset_id,
    fidelity_status: 'ACCEPT',
    label: 'Gerada por IA',
    url: asset.public_url!,
    role,
    source: 'AI_GENERATED',
    source_ref: asset.parent_asset_id || undefined,
    score: 220,
    ai_enhanced: true,
    position: 0,
  }
  return {
    images: [image],
    urls: [image.url],
    listingImages: [{ asset_id: asset.id, position: 0, role }],
    outcome: 'generated_pending_review',
    reviewRequiredAssetIds: [asset.id],
    ...(warning ? { warning } : {}),
  }
}

const SAFE_IMAGE_PLAN: ImagePlanStep[] = [
  { order: 1, title: 'Foto principal', description: 'Produto inteiro, centralizado e com fundo branco puro', required: true },
  { order: 2, title: 'Vista complementar', description: 'Outro enquadramento comprovado pelas referências exatas', required: true },
  { order: 3, title: 'Detalhe técnico', description: 'Close somente em controles, conexões ou partes visíveis na referência', required: true },
  { order: 4, title: 'Produto em uso', description: 'Contexto real de utilização sem adicionar itens ao produto', required: false },
  { order: 5, title: 'Acabamento', description: 'Close na textura, no material e nos detalhes visíveis', required: false },
  { order: 6, title: 'Vista aproximada', description: 'Composição aproximada preservando a mesma variante e todos os detalhes', required: false },
  { order: 7, title: 'Contexto complementar', description: 'Produto em ambiente compatível com sua finalidade confirmada', required: false },
]

function normalizedText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function completeImagePlan(
  plan: ImagePlanStep[],
  facts: Array<{ label: string; value: string }>,
  maxPictures?: number
): ImagePlanStep[] {
  const limit = Math.min(Math.max(maxPictures || 6, 1), 7)
  const target = Math.min(limit, Math.max(5, Math.min(plan.length, 7)))
  const evidence = normalizedText(facts.map(fact => `${fact.label} ${fact.value}`).join(' '))
  return [...plan, ...SAFE_IMAGE_PLAN.slice(plan.length)]
    .slice(0, target)
    .map((step, index) => {
      const text = normalizedText(`${step.title} ${step.description}`)
      const needsPackageEvidence = /embalagem|acessorio|conteudo|inclus/.test(text)
      const hasPackageEvidence = /embalagem|acessorio|conteudo|inclui|kit|quantidade/.test(evidence)
      const needsDimensionEvidence = /medida|dimensao|altura|largura|comprimento|peso|escala/.test(text)
      const hasDimensionEvidence = /medida|dimensao|altura|largura|comprimento|peso|\b(mm|cm|m|g|kg)\b/.test(evidence)
      const safeStep = (needsPackageEvidence && !hasPackageEvidence)
        || (needsDimensionEvidence && !hasDimensionEvidence)
        ? SAFE_IMAGE_PLAN[index]
        : step
      return { ...safeStep, order: index + 1 }
    })
}

function roleForShot(shot: ImagePlanStep): PhotoRole {
  if (shot.order === 1) return 'MAIN'
  const text = `${shot.title} ${shot.description}`.toLocaleLowerCase('pt-BR')
  if (/embalagem|conte[uú]do|acess[oó]rio/.test(text)) return 'PACKAGING'
  if (/uso|aplica[cç][aã]o|ambiente|contexto/.test(text)) return 'LIFESTYLE'
  if (/medida|dimens[aã]o|informa[cç][aã]o/.test(text)) return 'INFORMATIONAL'
  return 'DETAIL'
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}

function mergeGeneratedGalleries(
  galleries: ListingGallery[],
  plan: ImagePlanStep[],
  safeFallback?: ListingGallery
): ListingGallery {
  const generatedCoverAvailable = Boolean(galleries[0]?.images.length)
  const fallbackImages = safeFallback?.images || []
  if (!generatedCoverAvailable && !fallbackImages.length) {
    return galleries[0] || failedGeneration('Não foi possível gerar a foto principal.')
  }

  const generatedImages = galleries.flatMap((gallery, index) => gallery.images.map(image => ({
      ...image,
      role: roleForShot(plan[index]),
    })))
  const images = generatedCoverAvailable
    ? [
        ...generatedImages,
        ...fallbackImages.slice(0, plan.length - generatedImages.length).map(image => ({
          ...image,
          role: 'DETAIL' as const,
        })),
      ]
    : [
        { ...fallbackImages[0], role: 'MAIN' as const },
        ...generatedImages,
        ...fallbackImages.slice(1, plan.length - generatedImages.length).map(image => ({
          ...image,
          role: 'DETAIL' as const,
        })),
      ]
  images.forEach((image, index) => {
    image.position = index
    if (index === 0) image.role = 'MAIN'
  })
  const failed = Math.max(plan.length - images.length, 0)
  const warnings = galleries
    .slice(generatedCoverAvailable ? 0 : 1)
    .map(gallery => gallery.warning)
    .filter((warning): warning is string => Boolean(warning))
  if (!generatedCoverAvailable) {
    warnings.push('A edição da capa foi descartada por segurança; a foto própria normalizada foi mantida como principal.')
  } else if (fallbackImages.some(fallback => images.some(image => image.asset_id === fallback.asset_id))) {
    warnings.push('A foto própria normalizada foi incluída para completar a galeria com segurança.')
  }
  if (fallbackImages.length > 1) warnings.push('Enquadramentos locais da foto própria completaram a galeria sem criar elementos novos.')
  if (failed) warnings.push(`${failed} imagem(ns) secundária(s) foram descartadas por segurança.`)
  const includedAssetIds = new Set(images.map(image => image.asset_id))
  const reviewRequiredAssetIds = galleries
    .flatMap(gallery => gallery.reviewRequiredAssetIds)
    .filter(assetId => includedAssetIds.has(assetId))

  return {
    images,
    urls: images.map(image => image.url),
    listingImages: images.map(image => ({ asset_id: image.asset_id, position: image.position, role: image.role })),
    outcome: reviewRequiredAssetIds.length ? 'generated_pending_review' : 'normalized_fallback',
    reviewRequiredAssetIds,
    ...(warnings.length ? { warning: [...new Set(warnings)].join(' ') } : {}),
  }
}

async function buildSafePhotoFallbackGallery(input: {
  userId: string
  analysisId: string
  renditionAssetId: string
  productName: string
  config: AIConfig | null
  maxImages: number
}): Promise<ListingGallery> {
  const base = await buildListingGallery({
    userId: input.userId,
    analysisId: input.analysisId,
    renditionAssetIds: [input.renditionAssetId],
    productName: input.productName,
    config: input.config,
    maxPictures: 1,
    enhancementEnabled: false,
  })
  if (input.maxImages <= 1) return base

  try {
    const [sourceAsset] = await getOwnedAssets(input.userId, [input.renditionAssetId])
    if (!sourceAsset || !isPublicationAssetAllowed(sourceAsset)) return base
    const source = await downloadOwnedImageAsset(input.userId, sourceAsset.id)
    const variants = await createSafeCropVariants(source, input.maxImages - 1)
    const derivedAssets: ImageAsset[] = []

    for (const variant of variants) {
      const operationKey = createHash('sha256').update([
        input.userId,
        sourceAsset.sha256,
        'SAFE_CROP',
        variant.key,
        'sharp-safe-crop-v1',
      ].join(':')).digest('hex')
      const prior = await getImageOperationByKey(input.userId, operationKey)
      if (prior?.status === 'SUCCEEDED' && prior.output_asset_id) {
        const [priorOutput] = await getOwnedAssets(input.userId, [prior.output_asset_id])
        if (priorOutput && isPublicationAssetAllowed(priorOutput)) derivedAssets.push(priorOutput)
        continue
      }
      if (prior) continue

      const operation = await beginImageOperation({
        user_id: input.userId,
        analysis_id: input.analysisId,
        input_asset_id: sourceAsset.id,
        operation: 'NORMALIZE',
        idempotency_key: operationKey,
      })
      try {
        const outputHash = createHash('sha256').update(variant.buffer).digest('hex')
        const output = await createDerivedAsset({
          user_id: input.userId,
          analysis_id: input.analysisId,
          parent_asset_id: sourceAsset.id,
          kind: 'DERIVED',
          bytes: variant.buffer,
          mime_type: variant.mime_type,
          width: variant.width,
          height: variant.height,
          sha256: outputHash,
          storage_key: `${input.userId}/${input.analysisId}/safe-crop-${outputHash.slice(0, 20)}-${variant.key}-${operationKey.slice(0, 8)}.jpg`,
          provider: 'local',
          model: 'sharp-safe-crop-v1',
          fidelity_status: 'ACCEPT',
          metadata: { operation: 'SAFE_CROP', transform: variant.key, role: 'DETAIL', source_sha256: sourceAsset.sha256 },
        })
        await finishImageOperation(operation.id, input.userId, {
          status: 'SUCCEEDED',
          output_asset_id: output.id,
          provider: 'local',
          model: 'sharp-safe-crop-v1',
          attempt_count: 1,
          metadata: { transform: variant.key },
        })
        derivedAssets.push(output)
      } catch (error) {
        await finishImageOperation(operation.id, input.userId, {
          status: 'FAILED',
          provider: 'local',
          model: 'sharp-safe-crop-v1',
          attempt_count: 1,
          error_code: 'SAFE_CROP_FAILED',
          error_message: error instanceof Error ? error.message : 'Falha ao criar enquadramento local.',
        }).catch(() => undefined)
      }
    }

    const images = [
      ...base.images,
      ...derivedAssets.map((asset, index) => ({ ...galleryImage(asset, index + 1), role: 'DETAIL' as const })),
    ].slice(0, input.maxImages)
    return {
      images,
      urls: images.map(image => image.url),
      listingImages: images.map((image, position) => ({ asset_id: image.asset_id, position, role: position === 0 ? 'MAIN' : 'DETAIL' })),
      outcome: 'normalized_fallback',
      reviewRequiredAssetIds: [],
    }
  } catch {
    return base
  }
}

function failedGeneration(warning: string): ListingGallery {
  return {
    images: [],
    urls: [],
    listingImages: [],
    outcome: 'generation_failed',
    reviewRequiredAssetIds: [],
    warning,
  }
}

function identityRequired(): ListingGallery {
  return {
    images: [],
    urls: [],
    listingImages: [],
    outcome: 'identity_required',
    reviewRequiredAssetIds: [],
    warning: 'Confirme a identidade e os atributos principais do produto antes de gerar a imagem.',
  }
}

function visualReferenceRequired(): ListingGallery {
  return {
    images: [],
    urls: [],
    listingImages: [],
    outcome: 'identity_required',
    reviewRequiredAssetIds: [],
    warning: 'Envie uma foto própria ou confirme uma referência visual do produto exato antes de gerar a imagem por IA.',
  }
}

export async function buildAnalysisListingGallery(input: {
  userId: string
  analysisId: string
  inputType: string
  renditionAssetIds: string[]
  referenceUrls: string[]
  productName: string
  facts: Array<{ label: string; value: string }>
  identityReady: boolean
  config: AIConfig | null
  maxPictures?: number
  imagePlan?: ImagePlanStep[]
  imageAIEnabled?: boolean
}): Promise<ListingGallery> {
  const isPhotoInput = ['photo', 'single_image', 'multi_image'].includes(input.inputType)
  if (isPhotoInput && input.identityReady && (input.referenceUrls.some(Boolean) || input.renditionAssetIds.length > 0)) {
    return buildGeneratedListingGallery({
      userId: input.userId,
      analysisId: input.analysisId,
      productName: input.productName,
      facts: input.facts,
      referenceUrls: input.referenceUrls,
      referenceAssetIds: input.renditionAssetIds,
      config: input.config,
      imagePlan: input.imagePlan,
      maxPictures: input.maxPictures,
      generationEnabled: input.imageAIEnabled,
    })
  }
  if (input.renditionAssetIds.length) {
    return buildListingGallery({
      userId: input.userId,
      analysisId: input.analysisId,
      renditionAssetIds: input.renditionAssetIds,
      productName: input.productName,
      config: input.config,
      maxPictures: input.maxPictures,
      enhancementEnabled: input.imageAIEnabled,
    })
  }
  if (isPhotoInput) {
    return failedGeneration('Nenhuma foto válida chegou à análise. Envie a imagem novamente.')
  }
  if (!input.identityReady) return identityRequired()
  if (!input.referenceUrls.some(Boolean)) return visualReferenceRequired()
  return buildGeneratedListingGallery({
    userId: input.userId,
    analysisId: input.analysisId,
    productName: input.productName,
    facts: input.facts,
    referenceUrls: input.referenceUrls,
    config: input.config,
    imagePlan: input.imagePlan,
    maxPictures: input.maxPictures,
    generationEnabled: input.imageAIEnabled,
  })
}

export async function buildGeneratedListingGallery(input: {
  userId: string
  analysisId: string
  productName: string
  facts: Array<{ label: string; value: string }>
  referenceUrls: string[]
  referenceAssetIds?: string[]
  config: AIConfig | null
  generationEnabled?: boolean
  generationNonce?: string
  imagePlan?: ImagePlanStep[]
  maxPictures?: number
  shot?: ImagePlanStep
  referenceAttempt?: number
}): Promise<ListingGallery> {
  const generationEnabled = input.generationEnabled
    ?? process.env.ASSERTIVE_IMAGE_ENHANCEMENT_ENABLED === 'true'
  if (!generationEnabled) {
    return failedGeneration('A geração de imagem por IA está desabilitada neste ambiente.')
  }

  if (input.imagePlan?.length && !input.shot) {
    const plan = completeImagePlan(input.imagePlan, input.facts, input.maxPictures)
    const galleries = await mapWithConcurrency(plan, 2, async (shot, index) => {
      const references = input.referenceUrls.filter(Boolean)
      const referenceAssets = (input.referenceAssetIds || []).filter(Boolean)
      const rotatedReferences = references.length
        ? [...references.slice(index % references.length), ...references.slice(0, index % references.length)]
        : []
      const rotatedReferenceAssets = referenceAssets.length
        ? [...referenceAssets.slice(index % referenceAssets.length), ...referenceAssets.slice(0, index % referenceAssets.length)]
        : []
      return buildGeneratedListingGallery({
        ...input,
        referenceUrls: rotatedReferences,
        referenceAssetIds: rotatedReferenceAssets,
        imagePlan: undefined,
        shot,
      })
    })
    const generatedImageCount = galleries.reduce((count, gallery) => count + gallery.images.length, 0)
    const safeFallback = generatedImageCount < plan.length && input.referenceAssetIds?.length
      ? await buildSafePhotoFallbackGallery({
        userId: input.userId,
        analysisId: input.analysisId,
        renditionAssetId: input.referenceAssetIds[0],
        productName: input.productName,
        config: input.config,
        maxImages: plan.length - generatedImageCount,
      })
      : undefined
    return mergeGeneratedGalleries(galleries, plan, safeFallback)
  }

  const referenceUrl = input.referenceUrls.find(Boolean)
  const referenceAssetId = input.referenceAssetIds?.find(Boolean)
  const operationKey = createHash('sha256').update(JSON.stringify({
    userId: input.userId,
    analysisId: input.analysisId,
    productName: input.productName,
    facts: input.facts,
    referenceUrl: referenceUrl || null,
    referenceAssetId: referenceAssetId || null,
    shot: input.shot || null,
    generationNonce: input.generationNonce || 'initial',
    operation: 'AI_SCENE',
  })).digest('hex')
  const prior = await getImageOperationByKey(input.userId, operationKey)
  if (prior?.status === 'SUCCEEDED' && prior.output_asset_id) {
    const [priorOutput] = await getOwnedAssets(input.userId, [prior.output_asset_id])
    if (priorOutput && isPublicationAssetAllowed(priorOutput)) {
      return generatedGallery(priorOutput, input.shot ? roleForShot(input.shot) : 'MAIN')
    }
  }

  let operation: Awaited<ReturnType<typeof beginImageOperation>> | null = null
  try {
    let referenceAsset: ImageAsset | null = null
    let reference: { buffer: Buffer; mime_type: string } | undefined
    if (referenceUrl) {
      try {
        const fetched = await fetchImageSafely(referenceUrl)
        const referenceHash = createHash('sha256').update(fetched.buffer).digest('hex')
        referenceAsset = await createReferenceAsset({
          user_id: input.userId,
          analysis_id: input.analysisId,
          bytes: fetched.buffer,
          mime_type: fetched.mime_type,
          width: fetched.width,
          height: fetched.height,
          sha256: referenceHash,
          storage_key: `${input.userId}/${input.analysisId}/reference-${referenceHash.slice(0, 20)}${input.shot ? `-${input.shot.order}` : ''}-${operationKey.slice(0, 8)}`,
          source_url: fetched.final_url,
          origin: 'ML_CATALOG',
          rights_status: 'REFERENCE_ONLY',
        })
        reference = { buffer: fetched.buffer, mime_type: fetched.mime_type }
      } catch (error) {
        if (!referenceAssetId) throw error
      }
    }
    if (!reference && referenceAssetId) {
      const [rendition] = await getOwnedAssets(input.userId, [referenceAssetId])
      if (!rendition) throw new Error('A foto própria usada como referência não foi encontrada.')
      const [original] = rendition.parent_asset_id
        ? await getOwnedAssets(input.userId, [rendition.parent_asset_id])
        : [rendition]
      referenceAsset = original || rendition
      if (referenceAsset.rights_status !== 'USER_OWNED') {
        throw new Error('A foto usada como referência não pertence ao vendedor.')
      }
      reference = {
        buffer: await downloadOwnedImageAsset(input.userId, referenceAsset.id),
        mime_type: referenceAsset.mime_type,
      }
    }

    operation = await beginImageOperation({
      user_id: input.userId,
      analysis_id: input.analysisId,
      input_asset_id: referenceAsset?.id,
      operation: 'AI_SCENE',
      idempotency_key: operationKey,
    })
    const apiKey = input.config?.provider === 'gemini' ? input.config.api_key : undefined
    const generated = reference && input.shot
      ? await editProductImage({
        source: reference.buffer,
        mime_type: reference.mime_type,
        mode: input.shot.order === 1 ? 'COVER_CLEANUP' : 'DETAIL_CLEANUP',
        productName: input.productName,
        shot: input.shot,
        apiKey,
      })
      : await generateProductImage({
        productName: input.productName,
        facts: input.facts,
        reference,
        shot: input.shot,
        apiKey,
      })
    const truthBriefHash = 'truth_brief_hash' in generated
      ? generated.truth_brief_hash
      : createHash('sha256').update(JSON.stringify({ productName: input.productName, facts: input.facts })).digest('hex')
    const normalized = await normalizeProductImage(generated.buffer)
    const fidelity = reference
      ? await verifyImageFidelity({
        original: reference.buffer,
        candidate: normalized.buffer,
        original_mime_type: reference.mime_type,
        candidate_mime_type: normalized.mime_type,
        productName: input.productName,
        config: input.config,
        compositionMode: input.shot
          ? ['DETAIL', 'INFORMATIONAL'].includes(roleForShot(input.shot)) ? 'DETAIL_CROP' : roleForShot(input.shot) === 'LIFESTYLE' ? 'LIFESTYLE' : 'STRICT'
          : 'STRICT',
      })
      : await verifyGeneratedImage({
        candidate: normalized.buffer,
        mime_type: normalized.mime_type,
        productName: input.productName,
        facts: input.facts,
        config: input.config,
      })
    const fidelityBlocksGeneration = fidelity.status === 'REJECT'
    if (fidelityBlocksGeneration) {
      await finishImageOperation(operation.id, input.userId, {
        status: 'REJECTED',
        provider: generated.provider,
        model: generated.model,
        attempt_count: generated.attempts + (fidelity.attempts || 0),
        error_code: reference ? 'GENERATED_FIDELITY_REJECTED' : 'GENERATED_BRIEF_REJECTED',
        error_message: fidelity.reason,
        metadata: { fidelity },
      })
      const remainingReferences = input.referenceUrls.filter(Boolean).slice(1)
      if (remainingReferences.length && (input.referenceAttempt || 0) < 2) {
        return buildGeneratedListingGallery({
          ...input,
          referenceUrls: remainingReferences,
          referenceAttempt: (input.referenceAttempt || 0) + 1,
        })
      }
      return failedGeneration(reference
        ? 'A imagem gerada não preservou o produto com fidelidade. Gere outra opção ou envie uma foto própria.'
        : 'A imagem gerada não correspondeu ao briefing confirmado. Gere outra opção ou envie uma foto própria.')
    }
    const outputHash = createHash('sha256').update(normalized.buffer).digest('hex')
    const output = await createGeneratedAsset({
      user_id: input.userId,
      analysis_id: input.analysisId,
      parent_asset_id: referenceAsset?.id,
      bytes: normalized.buffer,
      mime_type: normalized.mime_type,
      width: normalized.width,
      height: normalized.height,
      sha256: outputHash,
      storage_key: `${input.userId}/${input.analysisId}/generated-${outputHash.slice(0, 20)}${input.shot ? `-${input.shot.order}` : ''}-${operationKey.slice(0, 8)}.jpg`,
      provider: generated.provider,
      model: generated.model,
      metadata: {
        truth_brief_hash: truthBriefHash,
        prompt_hash: generated.prompt_hash,
        source_sha256: generated.source_sha256,
        provider_output_sha256: generated.output_sha256,
        review_required: true,
        review_status: 'PENDING',
        role: input.shot ? roleForShot(input.shot) : 'MAIN',
        image_plan_step: input.shot,
        fidelity,
      },
    })
    await finishImageOperation(operation.id, input.userId, {
      status: 'SUCCEEDED',
      output_asset_id: output.id,
      provider: generated.provider,
      model: generated.model,
      attempt_count: generated.attempts + (fidelity.attempts || 0),
      metadata: {
        latency_ms: generated.latency_ms,
        prompt_hash: generated.prompt_hash,
        truth_brief_hash: truthBriefHash,
        fidelity,
      },
    })
    return generatedGallery(
      output,
      input.shot ? roleForShot(input.shot) : 'MAIN',
      fidelity.status === 'REVIEW'
        ? 'A validação automática da imagem ficou inconclusiva. Confira produto, modelo, cor, quantidade e acessórios antes de confirmar.'
        : undefined
    )
  } catch (error) {
    if (operation) {
      await finishImageOperation(operation.id, input.userId, {
        status: 'FAILED',
        error_code: 'AI_GENERATION_FAILED',
        error_message: error instanceof Error ? error.message : 'Falha desconhecida',
      }).catch(() => undefined)
    }
    const remainingReferences = input.referenceUrls.filter(Boolean).slice(1)
    if (remainingReferences.length && (input.referenceAttempt || 0) < 2) {
      return buildGeneratedListingGallery({
        ...input,
        referenceUrls: remainingReferences,
        referenceAttempt: (input.referenceAttempt || 0) + 1,
      })
    }
    return failedGeneration('Não foi possível gerar a imagem por IA. Tente novamente ou envie uma foto própria.')
  }
}
