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

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const { decrypt } = await import('../encryption')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data } = await supabase
    .from('assertive_ml_connections')
    .select('access_token')
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) { console.log('no token'); return }
  const token = decrypt(data.access_token)

  // Descobrir categoria real
  const res = await fetch('https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=3&q=celular+samsung', {
    headers: { Authorization: 'Bearer ' + token }
  })
  const cats = await res.json()
  console.log('Categorias encontradas:')
  for (const c of cats) {
    console.log(`  ${c.category_id} - ${c.category_name} (${c.domain_name})`)
  }
}
main()
