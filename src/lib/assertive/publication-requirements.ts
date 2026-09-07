import type { ClassifiedAttribute } from './taxonomy'
import type { ValidationIssue } from './publisher'
import type { EnrichedAttribute } from './enrichment'

export type RequirementLevel = 'blocking_required' | 'recommended' | 'optional' | 'not_applicable'

export interface EffectiveRequirement {
  attribute_id: string
  name: string
  level: RequirementLevel
  source: 'ml_validation' | 'category_schema' | 'both'
  ml_message?: string
  suggested_value?: { value_id?: string; value_name?: string }
  /** true se o ML retornou como required E não há valor preenchido */
  is_blocker: boolean
  /** valor atual preenchido, se houver */
  current_value?: string
}

export interface PublicationRequirements {
  requirements: EffectiveRequirement[]
  blockers: EffectiveRequirement[]
  recommended_missing: EffectiveRequirement[]
  all_clear: boolean
  total_attributes: number
  filled_count: number
  blocker_count: number
}

/**
 * Combina category schema + ML validation result para determinar
 * os requisitos EFETIVOS de publicação.
 *
 * Regra: se o ML diz REQUIRED mas o schema diz RECOMMENDED,
 * o estado efetivo vira BLOCKING_REQUIRED.
 */
export function computeEffectiveRequirements(
  categoryAttributes: ClassifiedAttribute[],
  mlValidationIssues: ValidationIssue[],
  filledAttributes: EnrichedAttribute[]
): PublicationRequirements {
  const filledMap = new Map(filledAttributes.map(a => [a.id, a]))
  const mlRequiredIds = new Set<string>()
  const mlIssuesMap = new Map<string, ValidationIssue>()

  for (const issue of mlValidationIssues) {
    if (issue.severity !== 'error') continue
    for (const attrId of issue.attribute_ids || []) {
      mlRequiredIds.add(attrId)
      if (!mlIssuesMap.has(attrId)) {
        mlIssuesMap.set(attrId, issue)
      }
    }
  }

  const requirements: EffectiveRequirement[] = []

  for (const attr of categoryAttributes) {
    if (attr.readOnly || attr.isVariationOnly) continue

    const filled = filledMap.get(attr.id)
    const mlRequired = mlRequiredIds.has(attr.id)
    const mlIssue = mlIssuesMap.get(attr.id)

    let level: RequirementLevel
    let source: 'ml_validation' | 'category_schema' | 'both'

    if (mlRequired && (attr.tier === 'required' || attr.tier === 'catalog_required')) {
      level = 'blocking_required'
      source = 'both'
    } else if (mlRequired) {
      level = 'blocking_required'
      source = 'ml_validation'
    } else if (attr.tier === 'required' || attr.tier === 'catalog_required') {
      level = 'blocking_required'
      source = 'category_schema'
    } else if (attr.tier === 'recommended') {
      level = 'recommended'
      source = 'category_schema'
    } else {
      level = 'optional'
      source = 'category_schema'
    }

    const hasValue = Boolean(filled?.value_name?.trim())
    const isBlocker = level === 'blocking_required' && !hasValue

    requirements.push({
      attribute_id: attr.id,
      name: attr.name,
      level,
      source,
      ml_message: mlIssue?.message,
      suggested_value: mlIssue?.suggested_value,
      is_blocker: isBlocker,
      current_value: filled?.value_name,
    })
  }

  const blockers = requirements.filter(r => r.is_blocker)
  const recommended_missing = requirements.filter(
    r => r.level === 'recommended' && !r.current_value?.trim()
  )

  return {
    requirements,
    blockers,
    recommended_missing,
    all_clear: blockers.length === 0,
    total_attributes: requirements.length,
    filled_count: requirements.filter(r => Boolean(r.current_value?.trim())).length,
    blocker_count: blockers.length,
  }
}

/**
 * Formata mensagens amigáveis para blockers do ML.
 * NUNCA mostra erro bruto em inglês.
 */
export function formatBlockerMessage(req: EffectiveRequirement): string {
  const attrName = req.name || req.attribute_id

  const FRIENDLY: Record<string, string> = {
    GTIN: 'O código de barras (GTIN) é necessário para publicar.',
    SELLER_PACKAGE_HEIGHT: 'Precisamos da altura da embalagem utilizada no envio.',
    SELLER_PACKAGE_WIDTH: 'Precisamos da largura da embalagem utilizada no envio.',
    SELLER_PACKAGE_LENGTH: 'Precisamos do comprimento da embalagem utilizada no envio.',
    SELLER_PACKAGE_WEIGHT: 'Precisamos do peso da embalagem utilizada no envio.',
    COLOR: 'A cor do produto é necessária para publicar.',
    BRAND: 'A marca do produto é necessária para publicar.',
    MODEL: 'O modelo do produto é necessário para publicar.',
  }

  if (FRIENDLY[req.attribute_id]) return FRIENDLY[req.attribute_id]

  if (req.ml_message) {
    const parsed = req.ml_message
      .replace(/The attributes?\s+\[([^\]]+)\]\s+are\s+required/i, '$1 é obrigatório')
      .replace(/attribute/i, 'atributo')
      .replace(/required/i, 'obrigatório')
      .replace(/missing/i, 'faltando')
    if (parsed !== req.ml_message) return parsed
  }

  return `${attrName} é necessário para publicar.`
}
