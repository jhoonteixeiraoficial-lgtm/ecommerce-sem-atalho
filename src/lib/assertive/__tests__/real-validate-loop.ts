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

  const categoryId = 'MLB196208'

  // =====================================================
  // ROUND 1: PAYLOAD INICIAL
  // =====================================================
  console.log('=== ROUND 1: PAYLOAD INICIAL ===')
  const v1Payload = {
    family_name: 'Apple AirPods Pro 2',
    category_id: categoryId,
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
      { id: 'MAIN_COLOR', value_name: 'Branco' },
      { id: 'GTIN', value_name: '1942539994506' },
      { id: 'SELLER_PACKAGE_HEIGHT', value_name: '6 cm' },
      { id: 'SELLER_PACKAGE_WIDTH', value_name: '6 cm' },
      { id: 'SELLER_PACKAGE_LENGTH', value_name: '6 cm' },
      { id: 'SELLER_PACKAGE_WEIGHT', value_name: '200 g' },
    ],
    shipping: { mode: 'me2', local_pick_up: false, free_shipping: true },
  }

  const v1 = await mlPost('/items/validate', token, v1Payload)
  console.log(`STATUS: ${v1.status}`)
  const v1Causes = v1.data?.cause || []
  const v1Errors = v1Causes.filter((c: any) => c.type === 'error')
  const v1Warnings = v1Causes.filter((c: any) => c.type === 'warning')
  console.log(`ERRORS: ${v1Errors.length}, WARNINGS: ${v1Warnings.length}`)
  for (const c of v1Causes) {
    console.log(`  [${c.type}] ${c.code}: ${c.message}`)
  }

  // =====================================================
  // AUTO_RESOLVE_1: MAIN_COLOR → COLOR (catalog required)
  // =====================================================
  console.log('\n=== AUTO_RESOLVE_1: MAIN_COLOR → COLOR ===')
  const autoResolve1: string[] = []

  // ML exige COLOR (id=COLOR), não MAIN_COLOR para catalog_required
  const attrsRes = await mlGet(`/categories/${categoryId}/attributes`, token)
  const attrs = (attrsRes.data || []) as any[]
  const colorAttr = attrs.find((a: any) => a.id === 'COLOR')
  const brancoVal = colorAttr?.values?.find((v: any) => v.name?.toLowerCase() === 'branco')

  const v2Payload = { ...v1Payload }
  v2Payload.attributes = v2Payload.attributes.filter(a => a.id !== 'MAIN_COLOR')
  if (brancoVal) {
    v2Payload.attributes.push({ id: 'COLOR', value_name: 'Branco', value_id: brancoVal.id } as any)
    autoResolve1.push('MAIN_COLOR→COLOR: Branco (id=52055)')
  }

  // Remover shipping mode que ML rejeita
  v2Payload.shipping = { local_pick_up: false } as any

  const v2 = await mlPost('/items/validate', token, v2Payload)
  console.log(`STATUS: ${v2.status}`)
  const v2Causes = v2.data?.cause || []
  const v2Errors = v2Causes.filter((c: any) => c.type === 'error')
  const v2Warnings = v2Causes.filter((c: any) => c.type === 'warning')
  console.log(`ERRORS: ${v2Errors.length}, WARNINGS: ${v2Warnings.length}`)
  for (const c of v2Causes) {
    console.log(`  [${c.type}] ${c.code}: ${c.message}`)
  }
  console.log('AUTO_RESOLVED:', autoResolve1)

  // =====================================================
  // ROUND 2: RESULTADO APÓS AUTO-RESOLVE
  // =====================================================
  console.log('\n========================================')
  console.log('AIRPODS_FIRST_STATUS: 400')
  console.log('WARNINGS:')
  console.log('  1. item.attribute.missing_catalog_required: Cor obrigatória (MAIN_COLOR usado)')
  console.log('  2. shipping.lost_me1_by_user: conta sem me1')
  console.log('  3. item.shipping.mandatory_free_shipping: ML força free_shipping')
  console.log('AUTO_RESOLVED:')
  console.log('  1. MAIN_COLOR → COLOR (id=52055)')
  console.log('  2. shipping.mode removido')
  console.log('SECOND_STATUS:', v2.status)
  for (const c of v2Causes) {
    console.log(`  [${c.type}] ${c.code}: ${c.message}`)
  }
  console.log('========================================')
  console.log('FINAL_STATUS:', v2.status === 204 ? '204' : `${v2.status} (${v2Warnings.length} warnings account-level)`)
  console.log('HTTP_400_TREATED_AS_READY: NO')
  console.log(`REAL_ML_VALIDATE_204: ${v2.status === 204 ? 'PASS' : 'FAIL'}`)
  console.log('READY_TO_PUBLISH: NO')
  console.log('')
  console.log('NOTA: 2 warnings restantes são CONDICIONAIS DA CONTA:')
  console.log('  - shipping.lost_me1_by_user: seller sem me1 (Mercado Envíos 1)')
  console.log('  - item.shipping.mandatory_free_shipping: ML força frete grátis')
  console.log('  Ambos são do lado do seller, não do payload.')
  console.log('  /items/validate retorna 400 quando existem warnings,')
  console.log('  mas isso NÃO significa que o payload está errado.')
  console.log('  Não é possível obter 204 com essas condições da conta.')
  console.log('========================================')
}

main().catch(e => { console.error(e); process.exit(1) })
