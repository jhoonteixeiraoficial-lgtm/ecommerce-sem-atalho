import type { AIConfig } from './types'
import type { ResearchResult } from './research'
import type { ProductTruth } from './truth'
import { runTaskJson } from './ai-router'
import { getPhotoRequirements } from './category-photos'

export type PhotoRole = 'MAIN' | 'DETAIL' | 'PACKAGING' | 'LIFESTYLE' | 'INFORMATIONAL'
export type PhotoSource = 'USER' | 'COMPETITOR' | 'AI_ENHANCED' | 'AI_GENERATED'

export interface PhotoMeta {
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
  url: string
  role: PhotoRole
  is_duplicate: boolean
  duplicate_of?: number
  quality: number
}

const ROLE_PROMPT = `Analise cada imagem de produto abaixo e classifique. Para cada URL retorne:
- role: MAIN (fundo branco, produto centralizado, sem texto), DETAIL (close-up, detalhe tecnico, traseira, lateral), PACKAGING (embalagem, caixa, conteudo), LIFESTYLE (produto em uso, ambientado), INFORMATIONAL (texto, dimensoes, comparativo, diagrama)
- is_duplicate: true se for visualmente muito similar a outra imagem ja listada (mesmo angulo, mesma composicao)
- duplicate_of: indice (0-based) da imagem que e duplicata, se is_duplicate=true
- quality: 0-100 (nitidez, resolucao, iluminacao, composicao, fundo limpo)

Classifique por POSICAO na lista (0, 1, 2...). Seja preciso: fundo branco = MAIN, embalagem = PACKAGING, texto/diagrama = INFORMATIONAL.`

function buildClassificationPrompt(urls: string[]): string {
  const list = urls.map((u, i) => `[${i}] ${u}`).join('\n')
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

export interface CollectPhotosInput {
  research: ResearchResult
  truth: ProductTruth | null
  config: AIConfig | null
  userPhotos?: string[]
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
  fidelity_check?: {
    passed: boolean
    reason: string
  }
}

export async function collectAndClassifyPhotos(
  input: CollectPhotosInput
): Promise<CollectPhotosResult> {
  const { research, config, userPhotos = [], domainId } = input

  // Requisitos da categoria para fotos
  const catReqs = getPhotoRequirements(domainId ?? research.domain_id ?? null)

  // 1. Gather URLs ONLY from EXACT_PRODUCT competitors.
  //    COMPARABLE/CATEGORY_REFERENCE may inform strategy but must NOT
  //    provide reference images for the gallery — wrong model photos
  //    would contaminate the listing.
  const byStrength = [...research.competitors].sort(
    (a, b) => b.competitive_reference_strength - a.competitive_reference_strength
  )

  const seen = new Set<string>()
  const candidates: Array<{ url: string; ref: string; matchClass: string }> = []

  // FASE 1: coleta SOMENTE de EXACT_PRODUCT (mesma marca + mesmo modelo).
  // COMPARABLE e CATEGORY_REFERENCE NUNCA entram na galeria final.
  for (const c of byStrength.filter(c => c.match_class === 'EXACT_PRODUCT')) {
    for (const u of c.pictures) {
      if (!seen.has(u)) {
        seen.add(u)
        candidates.push({ url: u, ref: c.title, matchClass: c.match_class })
      }
    }
  }

  const totalFound = candidates.length
  if (totalFound === 0 && userPhotos.length === 0) {
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
    }
  }

  // 2. Classify via AI (if enough images and config available)
  let classifications: ClassificationResult[] = []
  const maxClassify = 24
  const toClassify = candidates.slice(0, maxClassify)

  if (config && toClassify.length >= 2) {
    try {
      const prompt = buildClassificationPrompt(toClassify.map(c => c.url))
      const result = await runTaskJson<ClassificationResult[]>(
        'attribute_enrichment',
        config,
        'Classificador de imagens de produto. Retorne APENAS o JSON array, sem texto adicional.',
        prompt,
        { maxTokens: 3000, temperature: 0.1 }
      )
      if (Array.isArray(result)) {
        classifications = result.slice(0, toClassify.length)
      }
    } catch {
      // AI classification unavailable — use heuristics
    }
  }

  // 3. Build PhotoMeta array
  const photos: PhotoMeta[] = []
  let fromExact = 0
  let dedupCount = 0
  const usedUrls = new Set<string>()

  // User photos first (highest priority)
  for (let i = 0; i < userPhotos.length; i++) {
    const url = userPhotos[i]
    if (usedUrls.has(url)) continue
    usedUrls.add(url)
    photos.push({
      url,
      role: i === 0 ? 'MAIN' : 'DETAIL',
      source: 'USER',
      score: 200 + (i === 0 ? 10 : 0),
      ai_enhanced: false,
      position: photos.length,
    })
  }

  // Competitor photos
  for (let i = 0; i < toClassify.length; i++) {
    const candidate = toClassify[i]
    if (usedUrls.has(candidate.url)) {
      dedupCount++
      continue
    }

    const cls = classifications[i]
    if (cls?.is_duplicate) {
      dedupCount++
      continue
    }

    const role: PhotoRole = cls?.role || heuristicRole(i, toClassify.length)
    const quality = cls?.quality || 60
    const roleScore = scoreByRole(role)
    const sourceBonus = candidate.matchClass === 'EXACT_PRODUCT' ? 10 : 0

    usedUrls.add(candidate.url)
    if (candidate.matchClass === 'EXACT_PRODUCT') fromExact++

    photos.push({
      url: candidate.url,
      role,
      source: 'COMPETITOR',
      source_ref: candidate.ref,
      score: roleScore + sourceBonus + Math.min(quality, 30),
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

  return {
    photos: final,
    stats: {
      total_found: totalFound,
      from_exact_product: fromExact,
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
    fidelity_check: {
      passed: fromExact > 0 || userPhotos.length > 0,
      reason: fromExact > 0
        ? `${fromExact} fotos do produto exato verificadas`
        : userPhotos.length > 0
          ? 'Fotos do usuário são a referência'
          : 'Nenhuma foto do produto exato encontrada',
    },
  }
}
