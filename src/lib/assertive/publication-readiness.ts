import type { MLItemPayload, ValidationIssue, SellerCapabilities, SellerShippingPreferences } from './publisher'
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

/**
 * Estados de readiness do anúncio.
 * NEEDS_USER_INPUT = payload tem blockers que só o usuário pode resolver
 * (ex: seller_package, GTIN não encontrado).
 * READY_WITH_WARNINGS = payload correto, mas existem avisos de conta/logística
 * que NÃO impedem a publicação real (ex: me1 não habilitado, frete grátis forçado).
 */
export type ReadinessState = 'BLOCKED' | 'NEEDS_USER_INPUT' | 'READY_WITH_WARNINGS' | 'READY'

/**
 * Categorias de warnings do ML.
 * ACCOUNT warnings = condição da conta do seller (me1, frete)
 * PRODUCT warnings = problema com atributos do produto
 */
export type MLWarningCategory = 'account' | 'product' | 'shipping' | 'unknown'

export interface MLClassifiedWarning {
  code: string
  message: string
  category: MLWarningCategory
  /** true se o seller pode resolver essa ação */
  user_action_required: boolean
  /** mensagem amigável para o usuário */
  friendly_message: string
}

export interface PublicationReadiness {
  ready: boolean
  /** Estado granular: BLOCKED / NEEDS_USER_INPUT / READY_WITH_WARNINGS / READY */
  state: ReadinessState
  validated_at: string | null
  payload_hash: string | null
  checks: PreflightResult[]
  errors: PreflightResult[]
  warnings: PreflightResult[]
  ml_issues: ValidationIssue[]
  blocker_count: number
  warning_count: number
  validated_payload: MLItemPayload | null
  /** Warnings classificados por categoria */
  classified_warnings: MLClassifiedWarning[]
  /** true se o payload está correto (sem erros de produto) */
  product_payload_ready: boolean
  /** true se a conta está pronta (sem erros de conta) */
  account_ready: boolean
  /** true se o shipping está configurado corretamente */
  shipping_ready: boolean
  /** Campos que o usuário precisa preencher (blockers que o Assertive não resolveu) */
  user_input_required: Array<{ attribute_id: string; name: string; reason: string }>
}

export interface EditorReadinessInput {
  status: string
  title?: string | null
  price?: number | null
  category_id?: string | null
  photos?: string[] | null
  validation?: {
    valid?: boolean
    checked_at?: string
    status_code?: number
    issues?: ValidationIssue[]
  } | null
  publication_requirements?: {
    all_clear?: boolean
    blockers?: Array<{ attribute_id: string; name: string }>
    account_warnings?: MLClassifiedWarning[]
  } | null
  validated_payload?: MLItemPayload | null
  validated_payload_hash?: string | null
}

export interface EditorReadinessResult {
  canPublish: boolean
  state: ReadinessState
  blocker: { target: string; message: string } | null
}

function isAcceptedMLValidation(validation: {
  valid?: boolean
  status_code?: number
  issues?: ValidationIssue[]
}): boolean {
  if (validation.valid !== true) return false
  if (validation.status_code === 204) return true
  return validation.status_code === 400
    && Boolean(validation.issues?.length)
    && validation.issues!.every(issue => issue.severity === 'warning')
}

const SELLER_PACKAGE_IDS = new Set([
  'SELLER_PACKAGE_HEIGHT',
  'SELLER_PACKAGE_WIDTH',
  'SELLER_PACKAGE_LENGTH',
  'SELLER_PACKAGE_WEIGHT',
])

/**
 * Códigos de warnings que são da CONTA/LOGÍSTICA do seller,
 * não do payload do produto.
 */
const ACCOUNT_WARNING_CODES = new Set([
  'shipping.lost_me1_by_user',
  'item.shipping.mandatory_free_shipping',
  'shipping.lost_me2_by_user',
  'user.shipping_preferences.modes',
])

/**
 * Classifica um warning do ML em categoria.
 */
export function classifyMLWarning(issue: ValidationIssue): MLClassifiedWarning {
  const code = issue.code
  const msg = issue.message

  // Warnings de conta/logística
  if (ACCOUNT_WARNING_CODES.has(code)) {
    if (code === 'shipping.lost_me1_by_user') {
      return {
        code,
        message: msg,
        category: 'account',
        user_action_required: true,
        friendly_message: 'Mercado Envíos 1 não está habilitado na sua conta.',
      }
    }
    if (code === 'item.shipping.mandatory_free_shipping') {
      return {
        code,
        message: msg,
        category: 'shipping',
        user_action_required: false,
        friendly_message: 'O Mercado Livre determinou frete grátis obrigatório para esta publicação.',
      }
    }
    return {
      code,
      message: msg,
      category: 'account',
      user_action_required: false,
      friendly_message: `Aviso de logística: ${msg}`,
    }
  }

  // Warnings de produto
  if (code.includes('attribute') || code.includes('missing') || code.includes('required')) {
    return {
      code,
      message: msg,
      category: 'product',
      user_action_required: true,
      friendly_message: msg,
    }
  }

  return {
    code,
    message: msg,
    category: 'unknown',
    user_action_required: false,
    friendly_message: msg,
  }
}

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
    shipping: payload.shipping
      ? {
          mode: payload.shipping.mode,
          local_pick_up: payload.shipping.local_pick_up,
          free_shipping: payload.shipping.free_shipping,
        }
      : undefined,
    sale_terms: payload.sale_terms?.map(term => ({ id: term.id, value_name: term.value_name })),
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
 *
 * Regra: HTTP 204 confirma a validação. O ML também retorna HTTP 400 com
 * causas exclusivamente warning para payloads publicáveis em certas contas.
 */
export function computeReadiness(
  preflightChecks: PreflightResult[],
  mlValidation: { valid: boolean; issues: ValidationIssue[]; status_code?: number },
  validatedPayload: MLItemPayload | null,
  validatedAt: string | null,
  shippingPrefs?: SellerShippingPreferences | null
): PublicationReadiness {
  const mlAccepted = isAcceptedMLValidation(mlValidation)
  const protocolError: PreflightResult | null = !mlAccepted && !mlValidation.issues.some(i => i.severity === 'error')
    ? {
        check: 'ml_validation',
        status: 'fail',
        message: `Validação do Mercado Livre não confirmada (HTTP ${mlValidation.status_code ?? 'desconhecido'})`,
      }
    : null
  const checks = protocolError ? [...preflightChecks, protocolError] : preflightChecks
  const errors = checks.filter(c => c.status === 'fail')
  const warnings = preflightChecks.filter(c => c.status === 'warning')
  const mlErrors = mlValidation.issues.filter(i => i.severity === 'error')
  const mlWarnings = mlValidation.issues.filter(i => i.severity === 'warning')

  // Classificar warnings do ML
  const classifiedWarnings = mlWarnings.map(classifyMLWarning)

  // Determinar readiness state
  const preflightPassed = errors.length === 0
  const mlHasErrors = mlErrors.length > 0
  const mlHasOnlyAccountWarnings = mlAccepted && !mlHasErrors && mlWarnings.length > 0
    && classifiedWarnings.every(w => w.category === 'account' || w.category === 'shipping')

  // Identificar blockers que o Assertive NÃO conseguiu resolver
  // (seller_package, GTIN sem fonte, atributos sem suggested_value)
  const UNRESOLVABLE_CODES = new Set([
    'item.attribute.invalid.format.seller.package.dimensions',
  ])
  const hasUnresolvableBlockers = mlErrors.some(e =>
    UNRESOLVABLE_CODES.has(e.code) ||
    (!e.suggested_value && !e.attribute_ids?.length)
  )

  let state: ReadinessState
  if (!preflightPassed || mlHasErrors) {
    // Se existem blockers que o Assertive não resolveu e que dependem do usuário
    state = hasUnresolvableBlockers ? 'NEEDS_USER_INPUT' : 'BLOCKED'
  } else if (mlHasOnlyAccountWarnings) {
    state = 'READY_WITH_WARNINGS'
  } else if (mlAccepted) {
    state = 'READY'
  } else {
    state = 'BLOCKED'
  }

  // Ready = true somente para READY ou READY_WITH_WARNINGS
  const ready = state !== 'BLOCKED' && state !== 'NEEDS_USER_INPUT'

  // Verificar shipping
  const shippingOk = shippingPrefs
    ? (shippingPrefs.has_me1 || shippingPrefs.has_me2)
    : true // Sem info = não bloquear

  // Identificar campos que o usuário precisa preencher
  const userInputRequired: Array<{ attribute_id: string; name: string; reason: string }> = []
  if (state === 'NEEDS_USER_INPUT' || state === 'BLOCKED') {
    for (const issue of mlErrors) {
      // Só pedir se o Assertive não conseguiu resolver
      if (issue.suggested_value) continue // pode auto-aplicar
      if (!issue.attribute_ids?.length) continue // sem id específico
      for (const attrId of issue.attribute_ids) {
        const friendlyNames: Record<string, string> = {
          SELLER_PACKAGE_HEIGHT: 'Altura da embalagem',
          SELLER_PACKAGE_WIDTH: 'Largura da embalagem',
          SELLER_PACKAGE_LENGTH: 'Comprimento da embalagem',
          SELLER_PACKAGE_WEIGHT: 'Peso da embalagem',
          GTIN: 'Código de barras (GTIN)',
        }
        const name = friendlyNames[attrId] || attrId
        const reason = attrId.startsWith('SELLER_PACKAGE')
          ? 'Essa informação depende da embalagem utilizada no envio e não pôde ser confirmada automaticamente.'
          : 'O Mercado Livre exige essa informação e o Assertive não encontrou evidência suficiente.'
        if (!userInputRequired.find(u => u.attribute_id === attrId)) {
          userInputRequired.push({ attribute_id: attrId, name, reason })
        }
      }
    }
  }

  return {
    ready,
    state,
    validated_at: validatedAt,
    payload_hash: mlAccepted && validatedPayload ? payloadHash(validatedPayload) : null,
    checks,
    errors,
    warnings,
    ml_issues: mlValidation.issues,
    blocker_count: errors.length + mlErrors.length,
    warning_count: warnings.length + mlWarnings.length,
    validated_payload: mlAccepted ? validatedPayload : null,
    classified_warnings: classifiedWarnings,
    product_payload_ready: preflightPassed && mlAccepted && !mlHasErrors,
    account_ready: true, // sempre true se chegou até aqui
    shipping_ready: shippingOk,
    user_input_required: userInputRequired,
  }
}

/** Estado único usado pelo editor para não confundir rascunho completo com payload validado. */
export function evaluateEditorReadiness(listing: EditorReadinessInput): EditorReadinessResult {
  if (listing.status === 'published') return { canPublish: false, state: 'READY', blocker: null }
  if (listing.status === 'publishing') {
    return { canPublish: false, state: 'BLOCKED', blocker: { target: 'publication-preflight', message: 'A publicação já está em andamento.' } }
  }
  if (!listing.title?.trim()) {
    return { canPublish: false, state: 'NEEDS_USER_INPUT', blocker: { target: 'listing-title', message: 'Defina um título para continuar.' } }
  }
  if (!listing.price || listing.price <= 0) {
    return { canPublish: false, state: 'NEEDS_USER_INPUT', blocker: { target: 'listing-price', message: 'Defina um preço maior que zero para continuar.' } }
  }
  if (!listing.photos?.length) {
    return { canPublish: false, state: 'NEEDS_USER_INPUT', blocker: { target: 'listing-photos', message: 'Adicione pelo menos uma foto para continuar.' } }
  }
  if (!listing.category_id) {
    return { canPublish: false, state: 'NEEDS_USER_INPUT', blocker: { target: 'listing-category', message: 'Resolva a categoria do produto para continuar.' } }
  }

  const requirementBlocker = listing.publication_requirements?.blockers?.[0]
  if (requirementBlocker || listing.publication_requirements?.all_clear === false) {
    const name = requirementBlocker?.name || 'os atributos obrigatórios'
    return {
      canPublish: false,
      state: 'NEEDS_USER_INPUT',
      blocker: {
        target: requirementBlocker ? `attribute-${requirementBlocker.attribute_id}` : 'publication-requirements',
        message: `Preencha ${name} para continuar.`,
      },
    }
  }

  const persistedValidation = listing.validation
  const validationConfirmed = Boolean(
    persistedValidation
    && isAcceptedMLValidation(persistedValidation)
    && persistedValidation.checked_at
  )
  if (!validationConfirmed || listing.status !== 'ready_to_publish') {
    return {
      canPublish: false,
      state: 'BLOCKED',
      blocker: { target: 'publication-preflight', message: 'Valide o anúncio no Mercado Livre para continuar.' },
    }
  }

  if (!listing.validated_payload || !listing.validated_payload_hash
    || payloadHash(listing.validated_payload) !== listing.validated_payload_hash) {
    return {
      canPublish: false,
      state: 'BLOCKED',
      blocker: { target: 'publication-preflight', message: 'O anúncio mudou. Valide novamente antes de publicar.' },
    }
  }

  const hasWarnings = Boolean(listing.publication_requirements?.account_warnings?.length)
  return { canPublish: true, state: hasWarnings ? 'READY_WITH_WARNINGS' : 'READY', blocker: null }
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
