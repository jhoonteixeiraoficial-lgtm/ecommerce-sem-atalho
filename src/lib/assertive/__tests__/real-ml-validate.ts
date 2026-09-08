/**
 * TESTE REAL DE PRE-PUBLISH
 *
 * Este script valida um payload real contra a API do Mercado Livre
 * usando POST /items/validate. NÃO executa POST /items.
 *
 * Uso: npx tsx src/lib/assertive/__tests__/real-ml-validate.ts
 *
 * IMPORTANTE: Este teste requer:
 * 1. Token ML válido no banco (assertive_ml_connections)
 * 2. Variáveis de ambiente configuradas (.env.local)
 * 3. Conexão com Supabase
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// carregar .env.local manualmente
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

interface MLItemPayload {
  title?: string
  category_id: string
  price: number
  currency_id: string
  available_quantity: number
  buying_mode: string
  condition: string
  listing_type_id: string
  pictures: Array<{ source: string }>
  attributes: Array<{ id: string; value_id?: string; value_name?: string }>
  shipping?: { mode: string; local_pick_up: boolean; free_shipping: boolean }
  family_name?: string
}

interface ValidationResult {
  valid: boolean
  status_code: number
  issues: Array<{ code: string; message: string; severity: string }>
  raw: unknown
}

async function getValidToken(): Promise<string | null> {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data } = await supabase
      .from('assertive_ml_connections')
      .select('access_token, expires_at')
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) return null

    const expiresAt = new Date(data.expires_at).getTime()
    if (expiresAt < Date.now()) {
      console.log('⚠️  Token expirado. Renove a conexão ML.')
      return null
    }

    // usar a mesma função de decrypt da aplicação
    const { decrypt } = await import('../encryption')
    const decrypted = decrypt(data.access_token)
    return decrypted
  } catch (e) {
    console.error('Erro ao buscar token:', e)
    return null
  }
}

async function validatePayload(
  token: string,
  payload: MLItemPayload
): Promise<ValidationResult> {
  const res = await fetch(`${ML_BASE}/items/validate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = res.ok ? null : await res.json().catch(() => null)

  return {
    valid: res.ok,
    status_code: res.status,
    issues: data?.cause?.map((c: any) => ({
      code: c.code || 'unknown',
      message: c.message || '',
      severity: c.type === 'warning' ? 'warning' : 'error',
    })) || [],
    raw: data,
  }
}

function buildTestPayload(): MLItemPayload {
  return {
    family_name: 'Samsung Galaxy S24',
    category_id: 'MLB1055', // Celulares e Smartphones — categoria real confirmada
    price: 1999.90,
    currency_id: 'BRL',
    available_quantity: 1,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: 'gold_special',
    pictures: [
      { source: 'https://http2.mlstatic.com/D_NQ_NP_655721-MLA74524823343_022024-O.webp' },
    ],
    attributes: [
      { id: 'BRAND', value_name: 'Samsung' },
      { id: 'MODEL', value_name: 'Galaxy S24' },
      { id: 'MAIN_COLOR', value_name: 'Preto' },
    ],
    shipping: {
      mode: 'me2',
      local_pick_up: false,
      free_shipping: true,
    },
  }
}

async function main() {
  console.log('========================================')
  console.log('TESTE REAL DE PRE-PUBLISH')
  console.log('========================================\n')

  // 1. Obter token
  console.log('1. Buscando token ML válido...')
  const token = await getValidToken()
  if (!token) {
    console.log('❌ Nenhum token ML válido encontrado.')
    console.log('   Conecte sua conta ML no Assertive primeiro.')
    console.log('\n   RESULTADO: REAL_API = N/A (sem token)')
    process.exit(1)
  }
  console.log('✅ Token ML obtido com sucesso.\n')

  // 2. Montar payload de teste
  console.log('2. Montando payload de teste...')
  const payload = buildTestPayload()
  console.log(`   Categoria: ${payload.category_id}`)
  console.log(`   Preço: R$ ${payload.price}`)
  console.log(`   Fotos: ${payload.pictures.length}`)
  console.log(`   Atributos: ${payload.attributes.length}\n`)

  // 3. Validar no ML (POST /items/validate)
  console.log('3. Validando no ML (POST /items/validate)...')
  const result = await validatePayload(token, payload)
  console.log(`   HTTP Status: ${result.status_code}`)
  console.log(`   Válido: ${result.valid}`)
  console.log(`   Raw response:`, JSON.stringify(result.raw, null, 2).slice(0, 1500))

  if (result.issues.length) {
    console.log(`   Issues:`)
    result.issues.forEach(i => {
      console.log(`     - [${i.severity}] ${i.code}: ${i.message}`)
    })
  }
  console.log('')

  // 4. NÃO executar POST /items
  console.log('4. POST /items NÃO executado (teste de validação apenas).')
  console.log('')

  // 5. Resultado
  console.log('========================================')
  console.log('RESULTADO')
  console.log('========================================')
  console.log(`REAL_API:                    ${token ? 'SIM' : 'NÃO'}`)
  console.log(`ML_VALIDATE_HTTP_STATUS:     ${result.status_code}`)
  console.log(`READY_TO_PUBLISH:            ${result.valid ? 'SIM' : 'NÃO'}`)

  if (result.valid) {
    console.log('\n✅ Payload validado com sucesso (204/200).')
    console.log('   O mesmo payload seria usado no POST /items.')
  } else {
    console.log('\n❌ Payload rejeitado pelo ML.')
    console.log('   Corrija os issues antes de publicar.')
  }

  console.log('\n========================================')
  console.log('NOTA: Nenhum item foi publicado neste teste.')
  console.log('========================================')
}

main().catch(e => {
  console.error('Erro no teste:', e)
  process.exit(1)
})
