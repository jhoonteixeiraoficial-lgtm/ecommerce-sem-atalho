export interface CanonicalProductIdentity {
  name: string
  product_type: string | null
  function: string | null
  brand: string | null
  model: string | null
  family_or_line: string | null
  variant: string | null
  voltage: string | null
  kit_pack: string | null
  dimensions: string | null
  condition: string | null
  gtin: string | null
  seller_sku: string | null
  confidence: number
  evidence: string[]
  unknowns: string[]
  conflicts: Array<{ field: string; values: string[] }>
}

export interface IdentityCandidate {
  name: string
  product_type?: string
  function?: string
  brand?: string
  model?: string
  gtin?: string
  confidence: number
  evidence: string[]
  conflicts?: string[]
}

export interface RankedIdentityCandidate extends IdentityCandidate {
  identity_score: number
}

interface IdentityField {
  value: string
  conflict?: Array<{ value: string }>
}

interface CanonicalIdentityInput {
  name: string
  fields: Record<string, IdentityField | undefined>
  categoryHint?: string
  evidence: string[]
  confidence?: number
  sourceAttributes?: Array<{ id: string; value_name?: string }>
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

export function sameIdentityToken(left: string, right: string): boolean {
  return normalizeToken(left) === normalizeToken(right)
}

export function isPlausibleSellerSku(value: string | null | undefined): boolean {
  const sku = value?.trim() || ''
  if (sku.length < 2 || sku.length > 64) return false
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(sku)
}

export function isValidGtin(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(digits.length)) return false
  const body = digits.slice(0, -1).split('').reverse()
  const sum = body.reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1))
}

function semanticParts(sourceAttributes: Array<{ id: string; value_name?: string }>): {
  productType: string | null
  productFunction: string | null
} {
  const descriptive = sourceAttributes
    .filter(attribute => attribute.id === 'MODEL')
    .map(attribute => attribute.value_name?.trim() || '')
    .find(value => value.split(/\s+/).length >= 6)

  if (!descriptive) return { productType: null, productFunction: null }

  const productType = descriptive
    .split(/\b(?:teste|testador|para|com|b=)\b/i)[0]
    .trim()
    .replace(/[,:;-]+$/, '')
  const functionMatch = descriptive.match(/\bteste(?:\s+de)?\s+(.+?)(?=\s+com\b|\s+b=|[,;]|$)/i)
  const productFunction = functionMatch?.[1]?.trim()

  return {
    productType: productType.split(/\s+/).length >= 2 && productType.length <= 80 ? productType : null,
    productFunction: productFunction ? `Teste de ${productFunction.replace(/^de\s+/i, '')}` : null,
  }
}

function fieldValue(fields: CanonicalIdentityInput['fields'], key: string): string | null {
  return fields[key]?.value?.trim() || null
}

export function buildCanonicalIdentity(input: CanonicalIdentityInput): CanonicalProductIdentity {
  const semantic = semanticParts(input.sourceAttributes || [])
  const productType = fieldValue(input.fields, 'product_type') || semantic.productType
  const productFunction = fieldValue(input.fields, 'function') || semantic.productFunction
  const dimensions = fieldValue(input.fields, 'dimensions') || [
    fieldValue(input.fields, 'length'),
    fieldValue(input.fields, 'width'),
    fieldValue(input.fields, 'height'),
  ].filter(Boolean).join(' x ') || null
  const sku = fieldValue(input.fields, 'sku')

  const conflicts = Object.entries(input.fields).flatMap(([field, value]) => {
    const alternatives = value?.conflict?.map(item => item.value).filter(Boolean) || []
    return alternatives.length ? [{ field, values: [value!.value, ...alternatives] }] : []
  })

  const identity: CanonicalProductIdentity = {
    name: input.name.trim(),
    product_type: productType,
    function: productFunction,
    brand: fieldValue(input.fields, 'brand'),
    model: fieldValue(input.fields, 'model'),
    family_or_line: fieldValue(input.fields, 'family_or_line') || fieldValue(input.fields, 'line'),
    variant: fieldValue(input.fields, 'variant') || fieldValue(input.fields, 'color'),
    voltage: fieldValue(input.fields, 'voltage'),
    kit_pack: fieldValue(input.fields, 'kit_pack') || fieldValue(input.fields, 'units_per_pack'),
    dimensions,
    condition: fieldValue(input.fields, 'condition'),
    gtin: fieldValue(input.fields, 'gtin'),
    seller_sku: isPlausibleSellerSku(sku) ? sku : null,
    confidence: Math.min(Math.max(input.confidence ?? 0.5, 0), 1),
    evidence: [...new Set(input.evidence.filter(Boolean))],
    unknowns: [],
    conflicts,
  }

  identity.unknowns = (['product_type', 'function', 'brand', 'model'] as const)
    .filter(field => !identity[field])
  return identity
}

export function rankIdentityCandidates(candidates: IdentityCandidate[]): RankedIdentityCandidate[] {
  return candidates
    .map((candidate, index) => {
      const identityScore = candidate.confidence * 40
        + (candidate.gtin ? 35 : 0)
        + (candidate.model ? 15 : 0)
        + (candidate.brand ? 10 : 0)
        + (candidate.product_type ? 8 : 0)
        + Math.min(candidate.evidence.length, 4)
        - (candidate.conflicts?.length || 0) * 15
      return { ...candidate, identity_score: Math.round(identityScore * 100) / 100, _index: index }
    })
    .sort((left, right) => right.identity_score - left.identity_score || left._index - right._index)
    .map(({ _index: _ignored, ...candidate }) => candidate)
}
