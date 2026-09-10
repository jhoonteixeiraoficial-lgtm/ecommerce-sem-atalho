import type { ValidationIssue } from './publisher'

export type SpecializedRequirementKind =
  | 'SIZE_CHART'
  | 'VEHICLE_COMPATIBILITY'
  | 'REGULATED_IDENTIFIER'
  | 'CATALOG'
  | 'SALE_TERM'
  | 'GENERAL'

export interface SpecializedRequirement {
  kind: SpecializedRequirementKind
  code: string
  message: string
  attribute_ids: string[]
  is_blocker: boolean
  seller_resolvable: boolean
}

function issueKind(issue: ValidationIssue): SpecializedRequirementKind {
  const text = `${issue.code} ${issue.message}`.toLowerCase()
  if (/size[_ -]?chart|guia de tamanho/.test(text)) return 'SIZE_CHART'
  if (/vehicle|compatibilid|fitment/.test(text)) return 'VEHICLE_COMPATIBILITY'
  if (/gtin|ean|upc|anatel|inmetro|regulated|identifier/.test(text)) return 'REGULATED_IDENTIFIER'
  if (/catalog/.test(text)) return 'CATALOG'
  if (/sale[_ -]?term|warranty|garantia/.test(text)) return 'SALE_TERM'
  return 'GENERAL'
}

export function normalizeSpecializedIssues(issues: ValidationIssue[]): SpecializedRequirement[] {
  return issues.map(issue => {
    const attributeIds = issue.attribute_ids?.length
      ? issue.attribute_ids
      : issue.attribute_id
        ? [issue.attribute_id]
        : []
    const kind = issueKind(issue)
    return {
      kind,
      code: issue.code,
      message: issue.message,
      attribute_ids: attributeIds,
      is_blocker: issue.severity === 'error',
      seller_resolvable: attributeIds.length > 0 || kind === 'VEHICLE_COMPATIBILITY',
    }
  })
}
