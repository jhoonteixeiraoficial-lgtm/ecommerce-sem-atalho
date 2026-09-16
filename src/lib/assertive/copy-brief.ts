import type { CategoryInfo } from './taxonomy'
import type { ProductTruth, TruthField } from './truth'
import { maxTitleLength } from './taxonomy'

export interface CopyFact {
  id: string
  label: string
  value: string
  protected: boolean
}

export interface CopyBrief {
  product_name: string
  facts: CopyFact[]
  protected_phrases: string[]
  allowed_measurements: string[]
  keywords: string[]
  category: { id: string; name: string; title_limit: number }
  benchmark_patterns: { title_shapes: string[]; description_shapes: string[] }
}

const LABELS: Record<string, string> = {
  product_type: 'Produto',
  brand: 'Marca',
  model: 'Modelo',
  family_or_line: 'Linha',
  line: 'Linha',
  variant: 'Variante',
  voltage: 'Voltagem',
  power: 'Potência',
  capacity: 'Capacidade',
  dimensions: 'Dimensões',
  weight: 'Peso',
  material: 'Material',
  color: 'Cor',
  gtin: 'GTIN',
}

const PROTECTED_IDS = new Set(['product_type', 'brand', 'model'])
const MEASUREMENT = /\b\d+(?:[.,]\d+)?\s*(?:hz|kg|cm|mm|ml|v|w|a|g|m|l|%|anos?|meses?)\b/gi

/** Preserve quantity while recognizing written volume units from seller input. */
export function extractCopyMeasurements(value: string): string[] {
  const normalized = value.replace(/\b(mili)?litros?\b/gi, (_match, milli) => milli ? 'ml' : 'L')
  return normalized.match(MEASUREMENT) || []
}

function isQualified(field: TruthField): boolean {
  const status = field.status ?? (field.confidence === 'confirmed' ? 'CONFIRMED' : 'NEEDS_CONFIRMATION')
  if (status === 'USER_OVERRIDE' || status === 'CONFIRMED') return true
  return status === 'AUTO_FILLED' && Boolean(field.evidence?.trim())
}

export interface BuildCopyBriefInput {
  truth: ProductTruth
  category: CategoryInfo | null
  keywords?: string[]
  titleShapes?: string[]
  descriptionShapes?: string[]
}

export function buildCopyBrief(input: BuildCopyBriefInput): CopyBrief {
  const facts = Object.entries(input.truth.fields)
    .filter(([, field]) => Boolean(field.value?.trim()) && isQualified(field))
    .map(([id, field]) => ({
      id,
      label: LABELS[id] || id,
      value: field.value.trim(),
      protected: PROTECTED_IDS.has(id),
    }))
  const productType = input.truth.identity?.product_type
    || input.truth.fields.product_type?.value
    || input.truth.name
  const protectedPhrases = [
    input.truth.identity?.name || input.truth.name,
    productType,
    input.truth.identity?.brand || input.truth.fields.brand?.value,
    input.truth.identity?.model || input.truth.fields.model?.value,
  ].filter((value): value is string => Boolean(value?.trim()))
  const measurementSources = facts.map(fact => fact.value)

  return {
    product_name: productType.trim(),
    facts,
    protected_phrases: [...new Set(protectedPhrases)],
    allowed_measurements: [...new Set(measurementSources.flatMap(extractCopyMeasurements))],
    keywords: [...new Set((input.keywords || []).map(keyword => keyword.trim()).filter(Boolean))].slice(0, 20),
    category: {
          id: input.category?.id || '',
          name: input.category?.name || '',
          title_limit: Math.min(maxTitleLength(input.category), 60),
        },
    benchmark_patterns: {
      title_shapes: (input.titleShapes || []).slice(0, 8),
      description_shapes: (input.descriptionShapes || []).slice(0, 10),
    },
  }
}
