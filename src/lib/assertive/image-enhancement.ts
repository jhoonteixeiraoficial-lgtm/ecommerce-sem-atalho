import { editProductImage, type ProductImageEditMode } from './gemini-image'
import { verifyImageFidelity, type ImageFidelityResult } from './image-fidelity'
import { normalizeProductImage, type NormalizedImage } from './image-normalization'
import type { AIConfig } from './types'

export interface PreparedPublicationImage {
  image: NormalizedImage
  ai_enhanced: boolean
  fidelity_status: 'ACCEPT'
  provider: string | null
  model: string | null
  attempts: number
  latency_ms: number
  fallback_reason?: 'FEATURE_DISABLED' | 'AI_ERROR' | 'FIDELITY_REVIEW' | 'FIDELITY_REJECT'
  fidelity?: ImageFidelityResult
  provenance?: {
    prompt_hash: string
    source_sha256: string
    output_sha256: string
  }
}

export async function preparePublicationImage(input: {
  source: Buffer
  source_mime_type: string
  mode?: ProductImageEditMode
  productName?: string
  config?: AIConfig | null
  apiKey?: string
  models?: string[]
  enabled?: boolean
}): Promise<PreparedPublicationImage> {
  const original = await normalizeProductImage(input.source)
  const enabled = input.enabled ?? process.env.ASSERTIVE_IMAGE_ENHANCEMENT_ENABLED === 'true'
  if (!enabled) return fallback(original, 'FEATURE_DISABLED')

  try {
    const edit = await editProductImage({
      source: original.buffer,
      mime_type: original.mime_type,
      mode: input.mode || 'COVER_CLEANUP',
      productName: input.productName,
      apiKey: input.apiKey || (input.config?.provider === 'gemini' ? input.config.api_key : undefined),
      models: input.models,
    })
    const candidate = await normalizeProductImage(edit.buffer)
    const fidelity = await verifyImageFidelity({
      original: original.buffer,
      candidate: candidate.buffer,
      original_mime_type: original.mime_type,
      candidate_mime_type: candidate.mime_type,
      productName: input.productName,
      config: input.config || null,
    })
    if (fidelity.status !== 'ACCEPT') {
      return fallback(original, `FIDELITY_${fidelity.status}`, fidelity)
    }

    return {
      image: candidate,
      ai_enhanced: true,
      fidelity_status: 'ACCEPT',
      provider: edit.provider,
      model: edit.model,
      attempts: edit.attempts + (fidelity.attempts || 0),
      latency_ms: edit.latency_ms + (fidelity.latency_ms || 0),
      fidelity,
      provenance: {
        prompt_hash: edit.prompt_hash,
        source_sha256: edit.source_sha256,
        output_sha256: edit.output_sha256,
      },
    }
  } catch {
    return fallback(original, 'AI_ERROR')
  }
}

function fallback(
  image: NormalizedImage,
  fallback_reason: NonNullable<PreparedPublicationImage['fallback_reason']>,
  fidelity?: ImageFidelityResult
): PreparedPublicationImage {
  return {
    image,
    ai_enhanced: false,
    fidelity_status: 'ACCEPT',
    provider: null,
    model: null,
    attempts: fidelity?.attempts || 0,
    latency_ms: fidelity?.latency_ms || 0,
    fallback_reason,
    fidelity,
  }
}
