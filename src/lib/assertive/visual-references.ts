import 'server-only'

import { createHash } from 'node:crypto'
import { createReferenceAsset, getOwnedAssets, type ImageAsset, type ImageOrigin } from './image-assets'
import { mapLimitSettled } from './ml-api'
import { searchMarketplaceVisualReferences } from './research'
import { fetchImageSafely } from './safe-image-fetch'
import type { ProductTruth } from './truth'
import { discoverWebImageCandidates } from './web-image-discovery'
import { searchWeb } from './websearch'

export type VisualReferenceSource = 'ML_COMPETITOR' | 'ML_SOURCE' | 'ML_CATALOG' | 'WEB'

export interface VisualReferenceCandidate {
  source: VisualReferenceSource
  image_url: string
  source_page_url: string | null
  source_item_id: string | null
  source_catalog_product_id: string | null
  title: string | null
  attributes: Record<string, string>
}

export type VisualReferenceReasonCode =
  | 'SOURCE_ITEM_EXACT'
  | 'SOURCE_CATALOG_EXACT'
  | 'GTIN_EXACT'
  | 'MPN_BRAND_EXACT'
  | 'BRAND_MODEL_EXACT'
  | 'MODEL_IN_TITLE'
  | 'VARIANT_CONFLICT'
  | 'INSUFFICIENT_IDENTITY'

export interface VisualReferenceEvaluation {
  accepted: boolean
  confidence: number
  reason_codes: VisualReferenceReasonCode[]
  conflicts: string[]
}

export interface AcquireVisualReferencesInput {
  userId: string
  analysisId: string
  token: string
  truth: ProductTruth
  ownAssetIds?: string[]
  maxAssets?: number
}

function normalized(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function exactIdentifier(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalized(left)
  return Boolean(normalizedLeft && normalizedLeft === normalized(right))
}

function titleContainsExactIdentifier(title: string | null, identifier: string | null | undefined): boolean {
  const normalizedIdentifier = normalized(identifier)
  if (!title || normalizedIdentifier.length < 2) return false
  const deaccentedTitle = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const flexibleIdentifier = [...normalizedIdentifier].join('[^a-z0-9]*')
  return new RegExp(`(?:^|[^a-z0-9])${flexibleIdentifier}(?![a-z0-9])`).test(deaccentedTitle)
}

function firstAttribute(attributes: Record<string, string>, keys: string[]): string | undefined {
  return keys.map(key => attributes[key]).find(Boolean)
}

function confirmedVariantConflicts(truth: ProductTruth, attributes: Record<string, string>): string[] {
  const checks: Array<[string, string[], string]> = [
    ['color', ['COLOR', 'MAIN_COLOR'], 'Cor'],
    ['material', ['MATERIAL', 'BODY_MATERIAL'], 'Material'],
    ['voltage', ['VOLTAGE'], 'Voltagem'],
    ['power', ['POWER'], 'Potência'],
    ['capacity', ['CAPACITY'], 'Capacidade'],
    ['units_per_pack', ['UNITS_PER_PACK'], 'Quantidade'],
    ['line', ['LINE'], 'Linha'],
    ['variant', ['VARIANT'], 'Variante'],
  ]
  return checks.flatMap(([truthKey, candidateKeys, label]) => {
    const truthField = truth.fields[truthKey]
    const confirmed = truthField?.confidence === 'confirmed'
      || ['CONFIRMED', 'AUTO_FILLED', 'USER_OVERRIDE'].includes(truthField?.status || '')
    const candidateValue = firstAttribute(attributes, candidateKeys)
    return confirmed && candidateValue && normalized(truthField.value) !== normalized(candidateValue)
      ? [label]
      : []
  })
}

export function evaluateVisualReference(
  truth: ProductTruth,
  candidate: VisualReferenceCandidate
): VisualReferenceEvaluation {
  const reasons: VisualReferenceReasonCode[] = []
  const attributes = candidate.attributes || {}
  const conflicts = confirmedVariantConflicts(truth, attributes)
  let confidence = 0

  if (truth.source_item_id && candidate.source_item_id
    && normalized(truth.source_item_id) === normalized(candidate.source_item_id)) {
    reasons.push('SOURCE_ITEM_EXACT')
    confidence = 1
  }
  if (truth.source_catalog_product_id && candidate.source_catalog_product_id
    && normalized(truth.source_catalog_product_id) === normalized(candidate.source_catalog_product_id)) {
    reasons.push('SOURCE_CATALOG_EXACT')
    confidence = 1
  }

  const truthGtin = truth.fields.gtin?.value
  const candidateGtin = firstAttribute(attributes, ['GTIN', 'EAN', 'UPC'])
  if (truthGtin && candidateGtin && normalized(truthGtin) === normalized(candidateGtin)) {
    reasons.push('GTIN_EXACT')
    confidence = Math.max(confidence, 0.98)
  }

  const truthBrand = truth.fields.brand?.value
  const truthModel = truth.fields.model?.value
  const truthMpn = truth.fields.part_number?.value
  const candidateBrand = attributes.BRAND
  const candidateModel = attributes.MODEL
  const candidateMpn = firstAttribute(attributes, ['MPN', 'PART_NUMBER'])
  const brandMatches = exactIdentifier(truthBrand, candidateBrand)
  const modelMatches = exactIdentifier(truthModel, candidateModel)
  if (truthMpn && candidateMpn && exactIdentifier(truthMpn, candidateMpn) && brandMatches) {
    reasons.push('MPN_BRAND_EXACT')
    confidence = Math.max(confidence, 0.93)
  }
  if (brandMatches && modelMatches) {
    reasons.push('BRAND_MODEL_EXACT')
    confidence = Math.max(confidence, 0.9)
  }

  const normalizedModel = normalized(truthModel)
  const titleHasModel = normalizedModel.length >= 4 && titleContainsExactIdentifier(candidate.title, truthModel)
  const titleHasBrand = !truthBrand || titleContainsExactIdentifier(candidate.title, truthBrand)
  if (titleHasModel && titleHasBrand) {
    reasons.push('MODEL_IN_TITLE')
    confidence = Math.max(confidence, 0.82)
  }

  if (conflicts.length) reasons.push('VARIANT_CONFLICT')
  if (!confidence) reasons.push('INSUFFICIENT_IDENTITY')
  return {
    accepted: confidence >= 0.75 && conflicts.length === 0,
    confidence,
    reason_codes: [...new Set(reasons)],
    conflicts,
  }
}

const SOURCE_PRIORITY: Record<VisualReferenceSource, number> = {
  ML_COMPETITOR: 0,
  ML_SOURCE: 1,
  ML_CATALOG: 2,
  WEB: 3,
}

function imageOrigin(source: VisualReferenceSource): Extract<
  ImageOrigin,
  'ML_OWN_ITEM' | 'ML_CATALOG' | 'COMPETITOR' | 'WEB_REFERENCE'
> {
  if (source === 'ML_COMPETITOR') return 'COMPETITOR'
  if (source === 'ML_SOURCE') return 'ML_OWN_ITEM'
  if (source === 'ML_CATALOG') return 'ML_CATALOG'
  return 'WEB_REFERENCE'
}

function candidateGroup(candidate: VisualReferenceCandidate): string {
  if (candidate.source_item_id) return `${candidate.source}:${candidate.source_item_id}`
  if (candidate.source_catalog_product_id) return `${candidate.source}:${candidate.source_catalog_product_id}`
  if (candidate.source_page_url) return `${candidate.source}:${candidate.source_page_url}`
  try {
    return `${candidate.source}:${new URL(candidate.image_url).hostname}`
  } catch {
    return `${candidate.source}:${candidate.image_url}`
  }
}

function selectDiverseCandidates(candidates: VisualReferenceCandidate[], limit: number): VisualReferenceCandidate[] {
  const seenUrls = new Set<string>()
  const groupCounts = new Map<string, number>()
  const selected: VisualReferenceCandidate[] = []
  for (const candidate of [...candidates].sort((left, right) => SOURCE_PRIORITY[left.source] - SOURCE_PRIORITY[right.source])) {
    if (!candidate.image_url || seenUrls.has(candidate.image_url)) continue
    const group = candidateGroup(candidate)
    if ((groupCounts.get(group) || 0) >= 3) continue
    seenUrls.add(candidate.image_url)
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1)
    selected.push(candidate)
    if (selected.length >= limit) break
  }
  return selected
}

function validOwnedReference(asset: ImageAsset, userId: string): boolean {
  return asset.user_id === userId
    && ['ORIGINAL_EVIDENCE', 'DERIVED', 'PUBLICATION_RENDITION'].includes(asset.kind)
    && ['USER_OWNED', 'SELLER_OWNED_CONFIRMED', 'LICENSED'].includes(asset.rights_status)
}

function webReferenceQuery(truth: ProductTruth): string {
  const identity = [truth.fields.brand?.value, truth.fields.model?.value].filter(Boolean).join(' ')
  return `Fotos oficiais do produto ${identity || truth.name} (${truth.name}) fabricante varejista marketplace`
}

async function discoverWebReferences(truth: ProductTruth): Promise<VisualReferenceCandidate[]> {
  const result = await searchWeb(webReferenceQuery(truth), 6)
  if (!result.available || !result.sources.length) return []
  const discovered = await mapLimitSettled(result.sources.slice(0, 6), 2, async source => {
    const images = await discoverWebImageCandidates(source.url)
    return images.map(imageUrl => ({
      source: 'WEB' as const,
      image_url: imageUrl,
      source_page_url: source.url,
      source_item_id: null,
      source_catalog_product_id: null,
      title: [source.title, source.snippet].filter(Boolean).join(' ') || null,
      attributes: {},
    }))
  })
  return discovered.flat()
}

export async function acquireVisualReferences(input: AcquireVisualReferencesInput): Promise<ImageAsset[]> {
  const maxAssets = Math.max(1, Math.min(8, Math.floor(input.maxAssets || 8)))
  const [marketplaceCandidates, ownedAssets] = await Promise.all([
    searchMarketplaceVisualReferences(input.token, input.truth, 24).catch(() => []),
    input.ownAssetIds?.length
      ? getOwnedAssets(input.userId, [...new Set(input.ownAssetIds)]).catch(() => [])
      : Promise.resolve([]),
  ])
  const acceptedMarketplace = marketplaceCandidates.filter(candidate => (
    evaluateVisualReference(input.truth, candidate).accepted
  ))
  const webCandidates = acceptedMarketplace.length < 3
    ? await discoverWebReferences(input.truth).catch(() => [])
    : []
  const acceptedExternal = [...acceptedMarketplace, ...webCandidates].filter(candidate => (
    evaluateVisualReference(input.truth, candidate).accepted
  ))
  const selected = selectDiverseCandidates(acceptedExternal, maxAssets * 2)
  const fetchedAssets = await mapLimitSettled(selected, 2, async candidate => {
    const fetched = await fetchImageSafely(candidate.image_url)
    if (fetched.width < 320 || fetched.height < 320) throw new Error('Referência visual muito pequena.')
    const sha256 = createHash('sha256').update(fetched.buffer).digest('hex')
    const evaluation = evaluateVisualReference(input.truth, candidate)
    return {
      candidate,
      fetched,
      sha256,
      evaluation,
    }
  })

  const uniqueFetched = []
  const seenHashes = new Set<string>()
  for (const result of fetchedAssets) {
    if (seenHashes.has(result.sha256)) continue
    seenHashes.add(result.sha256)
    uniqueFetched.push(result)
    if (uniqueFetched.length >= maxAssets) break
  }

  const externalAssets = await mapLimitSettled(uniqueFetched, 2, async ({ candidate, fetched, sha256, evaluation }) => (
    createReferenceAsset({
      user_id: input.userId,
      analysis_id: input.analysisId,
      bytes: fetched.buffer,
      mime_type: fetched.mime_type,
      width: fetched.width,
      height: fetched.height,
      sha256,
      storage_key: `${input.userId}/${input.analysisId}/visual-reference-${sha256.slice(0, 32)}`,
      source_url: fetched.final_url,
      origin: imageOrigin(candidate.source),
      rights_status: 'REFERENCE_ONLY',
      metadata: {
        source_page_url: candidate.source_page_url,
        source_item_id: candidate.source_item_id,
        source_catalog_product_id: candidate.source_catalog_product_id,
        source_title: candidate.title,
        identity_confidence: evaluation.confidence,
        identity_reason_codes: evaluation.reason_codes,
      },
    })
  ))
  const owned = ownedAssets.filter(asset => validOwnedReference(asset, input.userId))
  const leadExternalCount = externalAssets.length ? 1 : 0
  const prioritizedAssets = [
    ...externalAssets.slice(0, leadExternalCount),
    ...owned,
    ...externalAssets.slice(leadExternalCount),
  ]
  const output: ImageAsset[] = []
  const outputHashes = new Set<string>()
  for (const asset of prioritizedAssets) {
    if (outputHashes.has(asset.sha256)) continue
    outputHashes.add(asset.sha256)
    output.push(asset)
    if (output.length >= maxAssets) break
  }
  return output
}
