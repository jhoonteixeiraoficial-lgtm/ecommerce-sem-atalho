import type { ProductTruth } from './truth'
import type { ListingAttribute } from './generator'

/**
 * Estimativa de embalagem a partir das medidas CONFIRMADAS do produto:
 * uma caixa de papelão um pouco maior que o produto (folga por lado + peso
 * da embalagem). Nada é inventado — só quando o produto tem medidas
 * confirmadas. Dimensões de embalagem são logística, não claim de venda.
 */

interface Dim { value: number; unit: 'cm' | 'g' }

function parseMeasure(raw: string | undefined): Dim | null {
  if (!raw) return null
  const m = raw.replace(',', '.').match(/([\d.]+)\s*(cm|mm|m|g|kg|gr)\b/i)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = m[2].toLowerCase()
  if (unit === 'mm') return { value: n / 10, unit: 'cm' }
  if (unit === 'm') return { value: n * 100, unit: 'cm' }
  if (unit === 'kg' || unit === 'gr') return { value: n * (unit === 'kg' ? 1000 : 1), unit: 'g' }
  return { value: n, unit: unit === 'g' ? 'g' : 'cm' }
}

function attrValue(attributes: ListingAttribute[], id: string): string | undefined {
  return attributes.find(a => a.id === id && a.value_name?.trim())?.value_name
}

/** Dimensões e peso do produto conforme truth/atributos confirmados. */
export function confirmedProductMeasures(attributes: ListingAttribute[], truth: ProductTruth): {
  length: Dim | null; width: Dim | null; height: Dim | null; weight: Dim | null
} {
  const identity = truth.identity?.dimensions?.match(/([\d.,]+\s*(?:cm|mm|m))\s*(?:x|×)\s*([\d.,]+\s*(?:cm|mm|m))\s*(?:x|×)\s*([\d.,]+\s*(?:cm|mm|m))/i)
  const pick = (attr: string, fallback: string | undefined): Dim | null =>
    parseMeasure(attrValue(attributes, attr)) ?? parseMeasure(fallback)
  return {
    length: pick('LENGTH', identity?.[1]),
    width: pick('WIDTH', identity?.[2]),
    height: pick('HEIGHT', identity?.[3]),
    weight: parseMeasure(attrValue(attributes, 'WEIGHT')),
  }
}

const CM_CLEARANCE = 4
const WEIGHT_FACTOR = 1.12
const MIN_WEIGHT_DELTA = 50

/**
 * Preenche SELLER_PACKAGE_LENGTH/WIDTH/HEIGHT/WEIGHT quando o produto tem
 * medidas confirmadas. Retorna apenas os atributos que faltavam.
 */
export function estimateSellerPackage<T extends ListingAttribute>(
  attributes: T[],
  truth: ProductTruth
): { attributes: T[]; estimated: string[] } {
  const measures = confirmedProductMeasures(attributes, truth)
  const targets: Array<{ id: string; dim: Dim | null; kind: 'cm' | 'g'; slack: number }> = [
    { id: 'SELLER_PACKAGE_LENGTH', dim: measures.length, kind: 'cm', slack: CM_CLEARANCE },
    { id: 'SELLER_PACKAGE_WIDTH', dim: measures.width, kind: 'cm', slack: CM_CLEARANCE },
    { id: 'SELLER_PACKAGE_HEIGHT', dim: measures.height, kind: 'cm', slack: CM_CLEARANCE },
    {
      id: 'SELLER_PACKAGE_WEIGHT',
      dim: measures.weight,
      kind: 'g',
      slack: 0,
    },
  ]

  const estimated: string[] = []
  const next = [...attributes]
  const evidence = 'Embalagem estimada: caixa com folga sobre as medidas confirmadas do produto.'
  for (const target of targets) {
    if (!target.dim) continue
    const exists = next.find(a => a.id === target.id && a.value_name?.trim())
    if (exists) continue
    const value = target.kind === 'cm'
      ? `${Math.ceil(target.dim.value + target.slack)} cm`
      : `${Math.max(Math.round(target.dim.value * WEIGHT_FACTOR), Math.round(target.dim.value) + MIN_WEIGHT_DELTA)} g`
    next.push({
      id: target.id,
      name: target.id === 'SELLER_PACKAGE_WEIGHT' ? 'Peso da embalagem' : `${target.id.split('_')[2] === 'LENGTH' ? 'Comprimento' : target.id.split('_')[2] === 'WIDTH' ? 'Largura' : 'Altura'} da embalagem`,
      value_name: value,
      tier: 'required',
      source: 'truth',
      status: 'AUTO_FILLED',
      evidence,
    } as unknown as T)
    estimated.push(target.id)
  }
  return { attributes: next, estimated }
}
