import type { CopyBrief } from './copy-brief'

export type CopyGuardReason =
  | 'IDENTITY_TOKEN_MUTATED'
  | 'IDENTITY_TOKEN_MISSING'
  | 'UNSUPPORTED_MEASUREMENT'
  | 'UNSUPPORTED_CLAIM'
  | 'PROMOTIONAL_CLAIM'

export interface CopyGuardResult {
  valid: boolean
  reason_codes: CopyGuardReason[]
}

const STOPWORDS = new Set(['a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'o', 'os', 'para'])
const MEASUREMENT = /\b\d+(?:[.,]\d+)?\s*(?:hz|kg|cm|mm|ml|v|w|a|g|m|l|%|anos?|meses?)\b/gi

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function tokens(value: string): string[] {
  return normalize(value).match(/[a-z0-9]+/g) || []
}

function compactMeasurement(value: string): string {
  return normalize(value).replace(',', '.').replace(/\s+/g, '')
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]
}

function unsupportedMeasurements(value: string, brief: CopyBrief): string[] {
  const allowed = new Set(brief.allowed_measurements.map(compactMeasurement))
  return (value.match(MEASUREMENT) || []).filter(claim => !allowed.has(compactMeasurement(claim)))
}

export function verifyProtectedIdentityText(value: string, brief: CopyBrief): CopyGuardResult {
  const candidateTokens = tokens(value)
  const requiredTokens = [...new Set(
    brief.protected_phrases.flatMap(tokens).filter(token => !STOPWORDS.has(token) && token.length >= 3)
  )]
  const reasons: CopyGuardReason[] = []

  for (const required of requiredTokens) {
    if (candidateTokens.includes(required)) continue
    const mutation = candidateTokens.some(candidate =>
      candidate.length >= 4 && Math.abs(candidate.length - required.length) <= 1 && editDistance(candidate, required) === 1
    )
    reasons.push(mutation ? 'IDENTITY_TOKEN_MUTATED' : 'IDENTITY_TOKEN_MISSING')
  }

  const unique = [...new Set(reasons)]
  return { valid: unique.length === 0, reason_codes: unique }
}

function trimAtWord(value: string, limit: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  if (clean.length <= limit) return clean
  const clipped = clean.slice(0, limit + 1)
  const boundary = clipped.lastIndexOf(' ')
  return (boundary > 0 ? clipped.slice(0, boundary) : clean.slice(0, limit)).trim()
}

function factualTitle(brief: CopyBrief, limit: number): string {
  const parts = [brief.product_name]
  for (const fact of brief.facts) {
    if (fact.id === 'product_type') continue
    const current = normalize(parts.join(' '))
    if (current.includes(normalize(fact.value))) continue
    const candidate = [...parts, fact.value].join(' ')
    if (candidate.length <= limit) parts.push(fact.value)
  }
  return trimAtWord(parts.join(' '), limit)
}

export function guardTitle(
  brief: CopyBrief,
  candidate: string,
  limit = brief.category.title_limit
): { accepted: boolean; value: string; reason_codes: CopyGuardReason[] } {
  const value = trimAtWord(candidate, limit)
  const identity = verifyProtectedIdentityText(value, brief)
  const reasons = [...identity.reason_codes]
  if (unsupportedMeasurements(value, brief).length) reasons.push('UNSUPPORTED_MEASUREMENT')
  if (/\b(?:promo[cç][aã]o|oferta|imperd[ií]vel|frete\s+gr[aá]tis|mais vendido)\b/i.test(value)) {
    reasons.push('PROMOTIONAL_CLAIM')
  }
  const reasonCodes = [...new Set(reasons)]
  return {
    accepted: reasonCodes.length === 0,
    value: reasonCodes.length ? factualTitle(brief, limit) : value,
    reason_codes: reasonCodes,
  }
}

export function verifyDescriptionClaims(value: string, brief: CopyBrief): CopyGuardResult {
  const factText = normalize(brief.facts.map(fact => `${fact.id} ${fact.label} ${fact.value}`).join(' '))
  const reasons: CopyGuardReason[] = []
  if (unsupportedMeasurements(value, brief).length) reasons.push('UNSUPPORTED_MEASUREMENT')

  const guardedClaims: Array<[RegExp, RegExp]> = [
    [/\bgarantia\b/i, /garantia|warranty/],
    [/\b(?:anatel|inmetro|certificad[oa]|homologad[oa])\b/i, /anatel|inmetro|certific|homolog/],
    [/\bcompat[ií]vel\b/i, /compatib|compatível|ve[ií]culo/],
    [/\b(?:acompanha|inclus[oa]s?|conte[uú]do da embalagem)\b/i, /acompanha|inclus|conteudo|embalagem|accessor/],
    [/\b(?:elimina|mata|cura|previne)\b/i, /elimina|mata|cura|previne/],
  ]
  for (const [claim, support] of guardedClaims) {
    if (claim.test(value) && !support.test(factText)) reasons.push('UNSUPPORTED_CLAIM')
  }

  const unique = [...new Set(reasons)]
  return { valid: unique.length === 0, reason_codes: unique }
}

export function factualDescription(brief: CopyBrief, title: string): string {
  return [
    title,
    '',
    'Sobre o produto',
    `${brief.product_name}. Este anúncio organiza somente as informações confirmadas para apresentar o produto com clareza e sem promessas não verificadas.`,
    '',
    'Destaques do produto',
    `- Produto: ${brief.product_name}`,
    ...(brief.facts.length
      ? ['', 'Especificações confirmadas', ...brief.facts.map(fact => `- ${fact.label}: ${fact.value}`)]
      : []),
    '',
    'Antes de comprar',
    'Confira marca, modelo, variação e demais especificações confirmadas para garantir que esta é a opção adequada para sua necessidade.',
  ].join('\n').trim()
}
