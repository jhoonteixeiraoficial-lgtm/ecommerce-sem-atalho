import type { ListingAttribute } from './generator'
import type { PublicationRequirements } from './publication-requirements'
import type { ClassifiedAttribute } from './taxonomy'
import { isPublishableAttribute } from './attribute-evidence'

export interface BlockingQuestion {
  field: string
  label: string
  why: string
  suggestion?: string
  options?: string[]
  blocking: true
}

const ALIASES: Record<string, string> = {
  EAN: 'GTIN',
  UPC: 'GTIN',
  MAIN_COLOR: 'COLOR',
}

export function buildBlockingQuestions(
  requirements: PublicationRequirements,
  schema: ClassifiedAttribute[],
  attributes: ListingAttribute[]
): BlockingQuestion[] {
  const byId = new Map(schema.map(attribute => [attribute.id, attribute]))
  const filled = new Set(attributes.filter(isPublishableAttribute).map(attribute => attribute.id))
  const seen = new Set<string>()

  return requirements.blockers
    .map((requirement, index) => ({ requirement, spec: byId.get(requirement.attribute_id), index }))
    .filter(({ requirement }) => !filled.has(requirement.attribute_id))
    .sort((a, b) => {
      const sourceA = a.requirement.source === 'category_schema' ? 1 : 0
      const sourceB = b.requirement.source === 'category_schema' ? 1 : 0
      if (sourceA !== sourceB) return sourceA - sourceB
      const closedA = a.spec?.values?.length ? 0 : 1
      const closedB = b.spec?.values?.length ? 0 : 1
      return closedA - closedB || a.index - b.index
    })
    .filter(({ requirement }) => {
      const canonical = ALIASES[requirement.attribute_id] || requirement.attribute_id
      if (seen.has(canonical)) return false
      seen.add(canonical)
      return true
    })
    .slice(0, 3)
    .map(({ requirement, spec }) => ({
      field: requirement.attribute_id,
      label: spec?.name || requirement.name || requirement.attribute_id,
      why: requirement.ml_message
        || (requirement.requires_confirmation
          ? 'Confirme este dado antes da publicação.'
          : 'Informação obrigatória para publicar nesta categoria.'),
      suggestion: requirement.suggested_value?.value_name,
      options: spec?.values?.slice(0, 15).map(value => value.name),
      blocking: true as const,
    }))
}
