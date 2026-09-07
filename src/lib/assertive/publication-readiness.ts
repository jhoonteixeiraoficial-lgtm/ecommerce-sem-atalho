import type { MLItemPayload, ValidationIssue, SellerCapabilities } from './publisher'
import type { ClassifiedAttribute } from './taxonomy'

export type PreflightCheck =
  | 'auth_token_valid'
  | 'seller_can_publish'
  | 'category_resolved'
  | 'condition_valid'
  | 'price_valid'
  | 'stock_valid'
  | 'listing_type_valid'
  | 'required_attributes'
  | 'gtin_resolved'
  | 'seller_package'
  | 'pictures_valid'
  | 'title_valid'
  | 'ml_validation'

export type CheckStatus = 'pass' | 'fail' | 'warning' | 'skip'

export interface PreflightResult {
  check: PreflightCheck
  status: CheckStatus
  message: string
  details?: string
}

export interface PublicationReadiness {
  ready: boolean
  validated_at: string | null
  payload_hash: string | null
  checks: PreflightResult[]
  errors: PreflightResult[]
  warnings: PreflightResult[]
  ml_issues: ValidationIssue[]
  blocker_count: number
  warning_count: number
  validated_payload: MLItemPayload | null
}

const SELLER_PACKAGE_IDS = new Set([
  'SELLER_PACKAGE_HEIGHT',
  'SELLER_PACKAGE_WIDTH',
  'SELLER_PACKAGE_LENGTH',
  'SELLER_PACKAGE_WEIGHT',
])

/**
 * Gera hash do payload para garantir que o mesmo payload validado
 * seja usado na publicação.
 */
export function payloadHash(payload: MLItemPayload): string {
  const canonical = JSON.stringify({
    category_id: payload.category_id,
    price: payload.price,
    currency_id: payload.currency_id,
    available_quantity: payload.available_quantity,
    buying_mode: payload.buying_mode,
    condition: payload.condition,
    listing_type_id: payload.listing_type_id,
    title: payload.title,
    family_name: payload.family_name,
    attributes: (payload.attributes || [])
      .map(a => `${a.id}=${a.value_id || a.value_name || ''}`)
      .sort()
      .join('|'),
    pictures: (payload.pictures || []).map(p => p.source).join('|'),
    shipping: payload.shipping,
    sale_terms: payload.sale_terms,
  })

  let hash = 0
  for (let i = 0; i < canonical.length; i++) {
    const chr = canonical.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return hash.toString(36)
}

/**
 * Executa todos os preflight checks antes da validação ML.
 */
export function runPreflightChecks(
  payload: MLItemPayload,
  capabilities: SellerCapabilities | null,
  categoryAttributes: ClassifiedAttribute[],
  hasAuthToken: boolean
): PreflightResult[] {
  const checks: PreflightResult[] = []

  // 1. AUTH_TOKEN_VALID
  checks.push({
    check: 'auth_token_valid',
    status: hasAuthToken ? 'pass' : 'fail',
    message: hasAuthToken ? 'Token ML válido' : 'Conexão com ML expirada',
  })

  // 2. SELLER_CAN_PUBLISH
  const sellerOk = Boolean(capabilities?.ml_user_id)
  checks.push({
    check: 'seller_can_publish',
    status: sellerOk ? 'pass' : 'fail',
    message: sellerOk ? `Vendedor: ${capabilities!.nickname}` : 'Vendedor não identificado',
  })

  // 3. CATEGORY_RESOLVED
  const categoryOk = Boolean(payload.category_id && payload.category_id.length >= 10)
  checks.push({
    check: 'category_resolved',
    status: categoryOk ? 'pass' : 'fail',
    message: categoryOk ? `Categoria: ${payload.category_id}` : 'Categoria não resolvida',
  })

  // 4. CONDITION_VALID
  const validConditions = ['new', 'used', 'not_specified']
  const conditionOk = validConditions.includes(payload.condition)
  checks.push({
    check: 'condition_valid',
    status: conditionOk ? 'pass' : 'fail',
    message: conditionOk ? `Condição: ${payload.condition}` : `Condição inválida: ${payload.condition}`,
  })

  // 5. PRICE_VALID
  const priceOk = typeof payload.price === 'number' && payload.price > 0 && Number.isFinite(payload.price)
  checks.push({
    check: 'price_valid',
    status: priceOk ? 'pass' : 'fail',
    message: priceOk ? `Preço: R$ ${payload.price.toFixed(2)}` : 'Preço inválido ou ausente',
  })

  // 6. STOCK_VALID
  const stockOk = typeof payload.available_quantity === 'number' && payload.available_quantity >= 1
  checks.push({
    check: 'stock_valid',
    status: stockOk ? 'pass' : 'fail',
    message: stockOk ? `Estoque: ${payload.available_quantity}` : 'Estoque inválido',
  })

  // 7. LISTING_TYPE_VALID
  const listingTypeOk = Boolean(payload.listing_type_id && payload.listing_type_id.length > 0)
  checks.push({
    check: 'listing_type_valid',
    status: listingTypeOk ? 'pass' : 'fail',
    message: listingTypeOk ? `Tipo: ${payload.listing_type_id}` : 'Tipo de anúncio inválido',
  })

  // 8. REQUIRED_ATTRIBUTES
  const requiredAttrs = categoryAttributes.filter(
    a => a.tier === 'required' || a.tier === 'catalog_required'
  )
  const payloadAttrIds = new Set((payload.attributes || []).map(a => a.id))
  const missingRequired = requiredAttrs.filter(a => !payloadAttrIds.has(a.id))
  const requiredStatus = missingRequired.length === 0 ? 'pass' : 'fail'
  checks.push({
    check: 'required_attributes',
    status: requiredStatus,
    message: requiredStatus === 'pass'
      ? 'Todos os atributos obrigatórios preenchidos'
      : `Faltam ${missingRequired.length} atributo(s): ${missingRequired.map(a => a.name).join(', ')}`,
    details: missingRequired.map(a => a.id).join(', '),
  })

  // 9. GTIN_RESOLVED
  const gtinAttr = (payload.attributes || []).find(a => a.id === 'GTIN')
  const hasGtin = gtinAttr?.value_name && !/^(na|n\/a|0+)$/i.test(gtinAttr.value_name)
  const gtinRequired = requiredAttrs.some(a => a.id === 'GTIN')
  const gtinStatus = hasGtin ? 'pass' : gtinRequired ? 'fail' : 'skip'
  checks.push({
    check: 'gtin_resolved',
    status: gtinStatus,
    message: hasGtin
      ? `GTIN: ${gtinAttr!.value_name}`
      : gtinRequired
        ? 'GTIN obrigatório não resolvido'
        : 'GTIN não obrigatório',
  })

  // 10. SELLER_PACKAGE
  const sellerPackageAttrs = categoryAttributes.filter(a => SELLER_PACKAGE_IDS.has(a.id))
  const hasSellerPackage = capabilities?.user_product_model
    ? sellerPackageAttrs.every(a => payloadAttrIds.has(a.id))
    : true
  const packageStatus = hasSellerPackage ? 'pass' : capabilities?.user_product_model ? 'warning' : 'skip'
  checks.push({
    check: 'seller_package',
    status: packageStatus,
    message: hasSellerPackage
      ? 'Medidas de embalagem OK'
      : capabilities?.user_product_model
        ? 'Medidas de embalagem não informadas (recomendado)'
        : 'Não aplicável',
  })

  // 11. PICTURES_VALID
  const picturesOk = Array.isArray(payload.pictures) && payload.pictures.length > 0
  checks.push({
    check: 'pictures_valid',
    status: picturesOk ? 'pass' : 'fail',
    message: picturesOk ? `${payload.pictures.length} foto(s)` : 'Nenhuma foto',
  })

  // 12. TITLE_VALID
  const hasTitle = Boolean(payload.title?.trim() || payload.family_name?.trim())
  checks.push({
    check: 'title_valid',
    status: hasTitle ? 'pass' : 'fail',
    message: hasTitle ? 'Título/family_name definido' : 'Título ausente',
  })

  return checks
}

/**
 * Combina preflight checks com ML validation para determinar readiness.
 * Se ML retornar 204 → ready = true.
 */
export function computeReadiness(
  preflightChecks: PreflightResult[],
  mlValidation: { valid: boolean; issues: ValidationIssue[]; status_code?: number },
  validatedPayload: MLItemPayload | null,
  validatedAt: string | null
): PublicationReadiness {
  const errors = preflightChecks.filter(c => c.status === 'fail')
  const warnings = preflightChecks.filter(c => c.status === 'warning')
  const mlErrors = mlValidation.issues.filter(i => i.severity === 'error')
  const mlWarnings = mlValidation.issues.filter(i => i.severity === 'warning')

  const preflightPassed = errors.length === 0
  const mlPassed = mlValidation.valid && (mlValidation.status_code === 204 || mlValidation.status_code === 200)

  return {
    ready: preflightPassed && mlPassed,
    validated_at: validatedAt,
    payload_hash: validatedPayload ? payloadHash(validatedPayload) : null,
    checks: preflightChecks,
    errors,
    warnings,
    ml_issues: mlValidation.issues,
    blocker_count: errors.length + mlErrors.length,
    warning_count: warnings.length + mlWarnings.length,
    validated_payload: validatedPayload,
  }
}

/**
 * Verifica se o payload foi alterado desde a última validação.
 */
export function wasPayloadChanged(
  currentPayload: MLItemPayload,
  lastHash: string | null
): boolean {
  if (!lastHash) return true
  return payloadHash(currentPayload) !== lastHash
}
