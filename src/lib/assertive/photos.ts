import type { AIConfig } from './types'
import type { ResearchResult } from './research'
import type { ProductTruth } from './truth'
import { runTaskJson, runVisionBatches } from './ai-router'
import { getPhotoRequirements } from './category-photos'
import { z } from 'zod'

export type PhotoRole = 'MAIN' | 'DETAIL' | 'PACKAGING' | 'LIFESTYLE' | 'INFORMATIONAL'
export type PhotoSource = 'USER' | 'COMPETITOR' | 'SOURCE_URL' | 'AI_ENHANCED' | 'AI_GENERATED'

export interface PhotoMeta {
  asset_id?: string
  parent_asset_id?: string
  fidelity_status?: 'ACCEPT' | 'REVIEW' | 'REJECT'
  label?: string
  url: string
  role: PhotoRole
  source: PhotoSource
  source_ref?: string
  source_url?: string
  score: number
  ai_enhanced: boolean
  position: number
}

interface ClassificationResult {
  url?: string
  role: PhotoRole
  is_duplicate: boolean
  duplicate_of?: number
  quality: number
}

const classificationSchema = z.array(z.object({
  url: z.string().optional(),
  role: z.enum(['MAIN', 'DETAIL', 'PACKAGING', 'LIFESTYLE', 'INFORMATIONAL']),
  is_duplicate: z.boolean(),
  duplicate_of: z.number().int().nonnegative().optional(),
  quality: z.number().min(0).max(100),
}))

const ROLE_PROMPT = `Analise cada imagem de produto anexada abaixo e classifique. Para cada posição retorne:
- role: MAIN (fundo branco, produto centralizado, sem texto), DETAIL (close-up, detalhe tecnico, traseira, lateral), PACKAGING (embalagem, caixa, conteudo), LIFESTYLE (produto em uso, ambientado), INFORMATIONAL (texto, dimensoes, comparativo, diagrama)
- is_duplicate: true se for visualmente muito similar a outra imagem ja listada (mesmo angulo, mesma composicao)
- duplicate_of: indice (0-based) da imagem que e duplicata, se is_duplicate=true
- quality: 0-100 (nitidez, resolucao, iluminacao, composicao, fundo limpo)

Classifique por POSICAO na lista (0, 1, 2...). Seja preciso: fundo branco = MAIN, embalagem = PACKAGING, texto/diagrama = INFORMATIONAL.`

function buildClassificationPrompt(count: number): string {
  const list = Array.from({ length: count }, (_, i) => `[${i}] anexo ${i + 1}`).join('\n')
  return `${ROLE_PROMPT}\n\nImagens:\n${list}`
}

function heuristicRole(index: number, total: number): PhotoRole {
  if (index === 0) return 'MAIN'
  if (index === 1) return 'DETAIL'
  if (index === 2) return 'DETAIL'
  if (index === 3) return 'PACKAGING'
  if (total > 4 && index === 4) return 'LIFESTYLE'
  return 'INFORMATIONAL'
}

function scoreByRole(role: PhotoRole): number {
  const map: Record<PhotoRole, number> = {
    MAIN: 100,
    DETAIL: 75,
    PACKAGING: 60,
    LIFESTYLE: 65,
    INFORMATIONAL: 50,
  }
  return map[role]
}

function roleForShotType(shotId: string): PhotoRole {
  if (shotId === 'front') return 'MAIN'
  if (shotId === 'packaging' || shotId === 'accessories') return 'PACKAGING'
  if (shotId === 'in_use' || shotId === 'context' || shotId === 'model') return 'LIFESTYLE'
  if (['nutrition', 'ingredients', 'dimensions', 'compatibility'].includes(shotId)) return 'INFORMATIONAL'
  return 'DETAIL'
}

export interface CollectPhotosInput {
  research: ResearchResult
  truth: ProductTruth | null
  config: AIConfig | null
  userPhotos?: string[]
  /** P0.7: fotos do próprio item da URL de entrada */
  sourcePhotos?: string[]
  domainId?: string | null
}

export interface CollectPhotosResult {
  photos: PhotoMeta[]
  stats: {
    total_found: number
    from_exact_product: number
    from_competitor: number
    classified: number
    deduplicated: number
  }
  category_requirements: {
    background: string
    min_photos: number
    recommended_photos: number
    shot_types: string[]
  }
  photo_gap: {
    reference_candidates: number
    missing_count: number
    missing_roles: string[]
    recommendations: string[]
  }
  fidelity_check?: {
    passed: boolean
    reason: string
  }
}

export async function collectAndClassifyPhotos(
  input: CollectPhotosInput
): Promise<CollectPhotosResult> {
  const { research, config, userPhotos = [], sourcePhotos = [], domainId } = input
  const truth = input.truth

  // Requisitos da categoria para fotos
  const catReqs = getPhotoRequirements(domainId ?? research.domain_id ?? null)

  // P0.7: Validar identidade da source URL antes de usar fotos
  // Só usar como INPUT_SOURCE_EXACT se a identidade for compatível
  let sourceUrlIdentityMatch: 'HIGH' | 'CONFLICT' | 'NONE' = 'NONE'
  let sourceUrlPhotos: string[] = []

  if (sourcePhotos.length > 0 && truth) {
    const truthBrand = truth.fields.brand?.value
    const truthModel = truth.fields.model?.value

    // Verificar se a fonte da URL é o mesmo produto
    // Se temos source_item_id, a identidade veio da própria API do ML
    // e é confiável (não é competidor, é a fonte)
    if (truth.source_item_id || truth.source_catalog_product_id) {
      // Fonte direta do ML = identidade validada pela API
      sourceUrlIdentityMatch = 'HIGH'
      sourceUrlPhotos = sourcePhotos
    } else if (truthBrand && truthModel) {
      // Sem source_item_id mas temos brand/model para validar
      sourceUrlIdentityMatch = 'HIGH'
      sourceUrlPhotos = sourcePhotos
    }
  }

  // Concorrentes informam a estratégia visual, mas nunca entram
  // automaticamente na galeria publicável.
  const byStrength = [...research.competitors].sort(
    (a, b) => b.competitive_reference_strength - a.competitive_reference_strength
  )
  const competitorReferenceCandidates = byStrength
    .filter(candidate => candidate.match_class === 'EXACT_PRODUCT')
    .reduce((total, candidate) => total + candidate.pictures.length, 0)

  const referenceCandidates = competitorReferenceCandidates
    + (sourceUrlIdentityMatch === 'HIGH' ? new Set(sourceUrlPhotos).size : 0)
  const uniqueUserPhotos = [...new Set(userPhotos.filter(Boolean))].slice(0, 12)
  const totalFound = uniqueUserPhotos.length
  if (totalFound === 0) {
    return {
      photos: [],
      stats: {
        total_found: 0,
        from_exact_product: 0,
        from_competitor: 0,
        classified: 0,
        deduplicated: 0,
      },
      category_requirements: {
        background: catReqs.background,
        min_photos: catReqs.min_photos,
        recommended_photos: catReqs.recommended_photos,
        shot_types: catReqs.shot_types.map(s => s.label),
      },
      photo_gap: {
        reference_candidates: referenceCandidates,
        missing_count: catReqs.recommended_photos,
        missing_roles: catReqs.shot_types.filter(shot => shot.required).map(shot => shot.label),
        recommendations: ['Envie fotos reais do produto para compor a galeria.'],
      },
    }
  }

  // Classifica somente imagens publicáveis do vendedor. Referências externas
  // informam a estratégia, mas direitos de uso nunca são presumidos.
  let classifications: ClassificationResult[] = []
  if (uniqueUserPhotos.length >= 2) {
    try {
      const batches = await runVisionBatches({
        images: uniqueUserPhotos,
        batchSize: 4,
        execute: async batch => {
          const result = await runTaskJson<ClassificationResult[]>(
            'image_classification',
            config,
            'Classificador de imagens de produto. Retorne APENAS o JSON array, sem texto adicional.',
            buildClassificationPrompt(batch.length),
            { images: batch, maxTokens: 1200, temperature: 0.1 }
          )
          const parsed = classificationSchema.safeParse(result)
          return parsed.success ? parsed.data.slice(0, batch.length) : []
        },
      })
      classifications = batches.flat()
    } catch {
      // AI classification unavailable — use heuristics
    }
  }

  // 3. Build PhotoMeta array
  const photos: PhotoMeta[] = []
  let dedupCount = 0
  const usedUrls = new Set<string>()

  // User photos first (highest priority)
  for (let i = 0; i < uniqueUserPhotos.length; i++) {
    const url = uniqueUserPhotos[i]
    if (usedUrls.has(url)) continue
    const cls = classifications[i]
    if (cls?.is_duplicate) {
      dedupCount++
      continue
    }
    usedUrls.add(url)
    photos.push({
      url,
      role: cls?.role || heuristicRole(i, uniqueUserPhotos.length),
      source: 'USER',
      score: 200 + (i === 0 ? 10 : 0) + Math.round((cls?.quality || 60) / 10),
      ai_enhanced: false,
      position: photos.length,
    })
  }

  // 4. Sort by score (user photos first on tie)
  photos.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.source === 'USER' && b.source !== 'USER') return -1
    if (a.source !== 'USER' && b.source === 'USER') return 1
    return 0
  })

  // 5. Reassign positions and ensure first is MAIN
  photos.forEach((p, i) => (p.position = i))
  if (photos.length > 0 && photos[0].role !== 'MAIN') {
    const mainIdx = photos.findIndex(p => p.role === 'MAIN')
    if (mainIdx > 0) {
      const [main] = photos.splice(mainIdx, 1)
      main.position = 0
      photos.unshift(main)
      photos.forEach((p, i) => (p.position = i))
    }
  }

  // 6. Cap at 12 (ML limit)
  const final = photos.slice(0, 12)
  final.forEach((p, i) => (p.position = i))

  const fromCompetitor = final.filter(p => p.source === 'COMPETITOR').length
  const finalRoles = new Set(final.map(photo => photo.role))
  const missingRoles = catReqs.shot_types
    .filter(shot => shot.required && !finalRoles.has(roleForShotType(shot.id)))
    .map(shot => shot.label)

  return {
    photos: final,
    stats: {
      total_found: totalFound,
      from_exact_product: 0,
      from_competitor: fromCompetitor,
      classified: classifications.length,
      deduplicated: dedupCount,
    },
    category_requirements: {
      background: catReqs.background,
      min_photos: catReqs.min_photos,
      recommended_photos: catReqs.recommended_photos,
      shot_types: catReqs.shot_types.map(s => s.label),
    },
    photo_gap: {
      reference_candidates: referenceCandidates,
      missing_count: Math.max(0, catReqs.recommended_photos - final.length),
      missing_roles: missingRoles,
      recommendations: final.length < catReqs.recommended_photos
        ? [`Adicione ${catReqs.recommended_photos - final.length} foto(s) real(is) do produto.`]
        : [],
    },
    fidelity_check: {
      passed: uniqueUserPhotos.length > 0,
      reason: uniqueUserPhotos.length > 0
        ? 'Fotos do usuário são a referência'
        : 'Nenhuma foto autorizada do produto encontrada',
    },
  }
}
