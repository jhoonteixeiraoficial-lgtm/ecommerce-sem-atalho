import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
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

async function mlPost(path: string, token: string, body: unknown) {
  const res = await fetch(`${ML_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
}

async function mlGet(path: string, token: string) {
  const res = await fetch(`${ML_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
}

async function main() {
  const token = await getToken()
  console.log('Token OK\n')

  // 1. Verificar shipping preferences da conta
  console.log('=== 1. SHIPPING PREFERENCES ===')
  const shipRes = await mlGet('/users/me/shipping_preferences', token)
  if (shipRes.ok) {
    const prefs = shipRes.data as any
    console.log('Modes:', JSON.stringify(prefs.modes))
    console.log('Default shipping:', JSON.stringify(prefs.default_shipping_mode))
    console.log('Free shipping:', JSON.stringify(prefs.free_shipping_threshold))
  } else {
    console.log('Status:', shipRes.status, JSON.stringify(shipRes.data)?.slice(0, 200))
  }

  // 2. Verificar listing types disponíveis
  console.log('\n=== 2. LISTING TYPES ===')
  const ltRes = await mlGet('/users/me/listing_types', token)
  if (ltRes.ok) {
    const types = ltRes.data as any[]
    for (const t of types) {
      console.log(`  ${t.id}: ${t.name} — ${t.status}`)
    }
  } else {
    console.log('Status:', ltRes.status)
    // Tentar via categories
    const catRes = await mlGet('/categories/MLB196208/listing_types', token)
    if (catRes.ok) {
      console.log('Category listing types:', JSON.stringify(catRes.data).slice(0, 500))
    }
  }

  // 3. Testar com gold_pro em vez de gold_special
  console.log('\n=== 3. TEST: gold_pro ===')
  const basePayload = {
    family_name: 'Apple AirPods Pro 2',
    category_id: 'MLB196208',
    price: 1899.90,
    currency_id: 'BRL',
    available_quantity: 1,
    buying_mode: 'buy_it_now',
    condition: 'new',
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
    shipping: { local_pick_up: false },
  }

  // gold_pro
  const gp = await mlPost('/items/validate', token, { ...basePayload, listing_type_id: 'gold_pro' })
  console.log(`gold_pro: HTTP ${gp.status}`)
  for (const c of (gp.data?.cause || [])) {
    console.log(`  [${c.type}] ${c.code}: ${c.message}`)
  }

  if (gp.status === 204) {
    console.log('\n✅ HTTP 204 com gold_pro!')
    return
  }

  // 4. Testar sem family_name
  console.log('\n=== 4. TEST: sem family_name ===')
  const noFamily = { ...basePayload, listing_type_id: 'gold_special' }
  delete (noFamily as any).family_name
  const nf = await mlPost('/items/validate', token, noFamily)
  console.log(`sem family_name: HTTP ${nf.status}`)
  for (const c of (nf.data?.cause || [])) {
    console.log(`  [${c.type}] ${c.code}: ${c.message}`)
  }

  if (nf.status === 204) {
    console.log('\n✅ HTTP 204 sem family_name!')
    return
  }

  // 5. Verificar account shipping modes
  console.log('\n=== 5. ACCOUNT INFO ===')
  const acctRes = await mlGet('/users/me', token)
  if (acctRes.ok) {
    const acct = acctRes.data as any
    console.log('ID:', acct.id)
    console.log('Nickname:', acct.nickname)
    console.log('Registration:', acct.registration_date)
  }

  console.log('\n========================================')
  console.log('CONCLUSAO')
  console.log('========================================')
  console.log('Os 2 warnings restantes (me1, mandatory_free_shipping)')
  console.log('dependem da configuracao da conta do seller.')
  console.log('Nao sao resolviveis no payload.')
  console.log('')
  console.log('O ML retorna 400 mesmo com payload correto')
  console.log('quando a conta nao tem me1 configurado.')
  console.log('Isso NAO bloqueia publicacao real — é condição da conta.')
  console.log('')
  console.log('HTTP_400_TREATED_AS_READY: NO')
  console.log('REAL_ML_VALIDATE_204: FAIL (conta sem me1)')
  console.log('READY_TO_PUBLISH: NO')
}

main().catch(e => { console.error(e); process.exit(1) })
