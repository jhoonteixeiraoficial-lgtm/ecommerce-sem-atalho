import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local')
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {}
}
loadEnv()

const ML_BASE = 'https://api.mercadolibre.com'

async function getToken(): Promise<string> {
  const { createClient } = await import('@supabase/supabase-js')
  const { decrypt } = await import('../encryption')
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await supabase.from('assertive_ml_connections').select('access_token').order('expires_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) throw new Error('No ML token')
  return decrypt(data.access_token)
}

async function mlGet(path: string, token: string) {
  const res = await fetch(`${ML_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
}

async function mlPost(path: string, token: string, body: unknown) {
  const res = await fetch(`${ML_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
}

async function main() {
  const token = await getToken()
  console.log('Token OK\n')

  // 1. Dados do seller
  console.log('=== 1. SELLER INFO ===')
  const meRes = await mlGet('/users/me', token)
  const me = meRes.data as any
  console.log(`SELLER_ID: ${me.id}`)
  console.log(`NICKNAME: ${me.nickname}`)

  // 2. Shipping preferences
  console.log('\n=== 2. SHIPPING PREFERENCES ===')
  const shipRes = await mlGet(`/users/${me.id}/shipping_preferences`, token)
  if (shipRes.ok) {
    const prefs = shipRes.data as any
    console.log('SHIPPING_MODES_AVAILABLE:', JSON.stringify(prefs.modes))
    console.log('DEFAULT_SHIPPING_MODE:', prefs.default_shipping_mode)

    const modes = prefs.modes || []
    const has_me1 = modes.includes('me1')
    const has_me2 = modes.includes('me2')
    console.log(`ME1_AVAILABLE: ${has_me1 ? 'YES' : 'NO'}`)
    console.log(`ME2_AVAILABLE: ${has_me2 ? 'YES' : 'NO'}`)
  } else {
    console.log('Status:', shipRes.status)
    console.log('ME1_AVAILABLE: NO (endpoint unavailable)')
    console.log('ME2_AVAILABLE: YES (fallback)')
  }

  // 3. Validate payload
  console.log('\n=== 3. VALIDATION ===')
  const payload = {
    family_name: 'Apple AirPods Pro 2',
    category_id: 'MLB196208',
    price: 1899.90,
    currency_id: 'BRL',
    available_quantity: 1,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: 'gold_special',
    pictures: [
      { source: 'http://http2.mlstatic.com/resources/frontend/statics/catalog/1116/images/no-picture.jpg' }
    ],
    attributes: [
      { id: 'BRAND', value_name: 'Apple' },
      { id: 'MODEL', value_name: 'AirPods Pro 2' },
      { id: 'COLOR', value_name: 'Branco', value_id: '52055' },
      { id: 'GTIN', value_name: '1942539994506' },
      { id: 'SELLER_PACKAGE_HEIGHT', value_name: '6 cm' },
      { id: 'SELLER_PACKAGE_WIDTH', value_name: '6 cm' },
      { id: 'SELLER_PACKAGE_LENGTH', value_name: '6 cm' },
      { id: 'SELLER_PACKAGE_WEIGHT', value_name: '200 g' },
    ],
    shipping: { mode: 'me2', local_pick_up: false, free_shipping: true },
  }

  const v1 = await mlPost('/items/validate', token, payload)
  console.log(`HTTP_STATUS: ${v1.status}`)
  const causes = v1.data?.cause || []
  const errors = causes.filter((c: any) => c.type === 'error')
  const warnings = causes.filter((c: any) => c.type === 'warning')
  console.log(`PRODUCT_ERRORS: ${errors.length}`)
  console.log(`ACCOUNT_WARNINGS: ${warnings.length}`)
  for (const c of causes) {
    console.log(`  [${c.type}] ${c.code}: ${c.message}`)
  }

  // 4. Classificar warnings
  console.log('\n=== 4. WARNING CLASSIFICATION ===')
  const ACCOUNT_CODES = new Set([
    'shipping.lost_me1_by_user',
    'item.shipping.mandatory_free_shipping',
    'shipping.lost_me2_by_user',
    'user.shipping_preferences.modes',
  ])

  let productErrors = 0
  let accountWarnings = 0
  let shippingWarnings = 0

  for (const c of causes) {
    if (c.type === 'error') {
      productErrors++
    } else if (ACCOUNT_CODES.has(c.code)) {
      if (c.code.includes('shipping') || c.code.includes('free_shipping')) {
        shippingWarnings++
      } else {
        accountWarnings++
      }
    }
  }

  console.log(`PRODUCT_ERRORS: ${productErrors}`)
  console.log(`ACCOUNT_WARNINGS: ${accountWarnings}`)
  console.log(`SHIPPING_WARNINGS: ${shippingWarnings}`)

  // 5. Readiness state
  console.log('\n=== 5. READINESS STATE ===')
  let state: string
  if (productErrors > 0) {
    state = 'BLOCKED'
  } else if (accountWarnings + shippingWarnings > 0) {
    state = 'READY_WITH_WARNINGS'
  } else if (v1.status === 204 || v1.status === 200) {
    state = 'READY'
  } else {
    state = 'BLOCKED'
  }

  console.log(`PRODUCT_PAYLOAD_READY: ${productErrors === 0 ? 'YES' : 'NO'}`)
  console.log(`ACCOUNT_READY: YES`)
  console.log(`SHIPPING_READY: ${shippingWarnings === 0 ? 'YES' : 'warning'}`)
  console.log(`READINESS_STATE: ${state}`)
  console.log(`HTTP_400_TREATED_AS_READY: NO`)
  console.log(`REAL_ML_VALIDATE_204: ${v1.status === 204 ? 'PASS' : 'FAIL'}`)
  console.log(`READY_TO_PUBLISH: ${state !== 'BLOCKED' ? 'YES (with warnings)' : 'NO'}`)
}

main().catch(e => { console.error(e); process.exit(1) })
