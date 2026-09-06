import { mlGet, SITE_ID } from './ml-api'

const DAY = 86400
const WEEK = 604800

export interface DomainSuggestion {
  domain_id: string
  domain_name: string
  category_id: string
  category_name: string
  attributes?: Array<{ id: string; value_id?: string; value_name?: string }>
}

export interface MLAttributeValue {
  id: string
  name: string
}

export interface MLAttribute {
  id: string
  name: string
  value_type: 'string' | 'number' | 'number_unit' | 'boolean' | 'list' | string
  value_max_length?: number
  values?: MLAttributeValue[]
  allowed_units?: Array<{ id: string; name: string }>
  default_unit?: string
  hint?: string
  hierarchy?: string
  relevance?: number
  attribute_group_id?: string
  attribute_group_name?: string
  tags?: Record<string, boolean>
}

export interface CategoryInfo {
  id: string
  name: string
  path_from_root: Array<{ id: string; name: string }>
  settings?: {
    listing_allowed?: boolean
    status?: string
    max_title_length?: number
    max_description_length?: number
    immediate_payment?: string
    catalog_domain?: string
    buying_modes?: string[]
    item_conditions?: string[]
  }
}

/** Descobre domínio + categoria a partir de texto livre. Fonte oficial. */
export async function discoverDomain(token: string, query: string): Promise<DomainSuggestion[]> {
  const q = query.trim().slice(0, 200)
  if (!q) return []
  return mlGet<DomainSuggestion[]>(
    `/sites/${SITE_ID}/domain_discovery/search?limit=5&q=${encodeURIComponent(q)}`,
    token,
    { ttl: DAY, persist: true }
  )
}

export async function getCategory(token: string, categoryId: string): Promise<CategoryInfo> {
  return mlGet<CategoryInfo>(`/categories/${categoryId}`, token, { ttl: WEEK, persist: true })
}

export async function getCategoryAttributes(token: string, categoryId: string): Promise<MLAttribute[]> {
  return mlGet<MLAttribute[]>(`/categories/${categoryId}/attributes`, token, {
    ttl: WEEK,
    persist: true,
  })
}

/** Palavras-chave reais mais buscadas na categoria. Fonte oficial de SEO. */
export async function getCategoryTrends(
  token: string,
  categoryId: string
): Promise<Array<{ keyword: string }>> {
  try {
    return await mlGet<Array<{ keyword: string }>>(`/trends/${SITE_ID}/${categoryId}`, token, {
      ttl: DAY,
      persist: true,
    })
  } catch {
    return []
  }
}

export async function getListingTypes(
  token: string
): Promise<Array<{ id: string; name: string }>> {
  try {
    return await mlGet<Array<{ id: string; name: string }>>(
      `/sites/${SITE_ID}/listing_types`,
      token,
      { ttl: WEEK, persist: true }
    )
  } catch {
    return []
  }
}

export type AttributeTier = 'required' | 'catalog_required' | 'recommended' | 'optional'

export interface ClassifiedAttribute extends MLAttribute {
  tier: AttributeTier
  /** true quando o ML não aceita o valor escrito à mão (precisa de value_id da lista). */
  fixedValues: boolean
  isVariationOnly: boolean
  readOnly: boolean
}

/**
 * Classifica todos os atributos aplicáveis da categoria.
 * O objetivo é maximizar a completude da ficha técnica sem inventar valores.
 */
export interface ClassifyOptions {
  /**
   * Contas no modelo novo (user_product_seller) só publicam com as medidas
   * da embalagem preenchidas — o Mercado Livre recusa o item sem elas.
   */
  requireSellerPackage?: boolean
}

const SELLER_PACKAGE_IDS = new Set([
  'SELLER_PACKAGE_HEIGHT',
  'SELLER_PACKAGE_WIDTH',
  'SELLER_PACKAGE_LENGTH',
  'SELLER_PACKAGE_WEIGHT',
])

export function classifyAttributes(
  attrs: MLAttribute[],
  options: ClassifyOptions = {}
): ClassifiedAttribute[] {
  return attrs
    .map(a => {
      const tags = a.tags || {}
      const readOnly = Boolean(tags.read_only || tags.fixed)
      const tier: AttributeTier =
        tags.required
          ? 'required'
          : options.requireSellerPackage && SELLER_PACKAGE_IDS.has(a.id)
            ? 'required'
            : tags.catalog_required
              ? 'catalog_required'
              : tags.conditional_required || (a.relevance ?? 9) <= 2
                ? 'recommended'
                : 'optional'
      return {
        ...a,
        tier,
        fixedValues: Boolean(a.values?.length) && !tags.allow_custom_value,
        isVariationOnly: Boolean(tags.allow_variations && a.hierarchy === 'CHILD_PK'),
        readOnly,
      }
    })
    .filter(a => !a.readOnly)
    // atributos de controle interno do ML: não fazem parte da qualidade do anúncio
    .filter(a => !SYSTEM_ATTRIBUTE_IDS.has(a.id))
}

const SYSTEM_ATTRIBUTE_IDS = new Set([
  'GTIN_UNAVAILABLE_REASON',
  'AGID',
  'PRODUCT_SOURCE',
  'EMPTY_GTIN_REASON',
])

/** Atributos que devem ser preenchidos, em ordem de prioridade. */
export function prioritizeAttributes(attrs: ClassifiedAttribute[]): ClassifiedAttribute[] {
  const order: Record<AttributeTier, number> = {
    required: 0,
    catalog_required: 1,
    recommended: 2,
    optional: 3,
  }
  return [...attrs].sort((a, b) => {
    const t = order[a.tier] - order[b.tier]
    if (t !== 0) return t
    return (a.relevance ?? 99) - (b.relevance ?? 99)
  })
}

export function maxTitleLength(cat: CategoryInfo | null): number {
  return cat?.settings?.max_title_length && cat.settings.max_title_length > 0
    ? cat.settings.max_title_length
    : 60
}
