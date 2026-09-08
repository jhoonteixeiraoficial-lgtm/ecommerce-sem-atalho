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
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await supabase.from('assertive_ml_connections').select('access_token').order('expires_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) { console.log('no token'); return }
  const token = decrypt(data.access_token)

  // Buscar produto real no ML
  const res = await fetch('https://api.mercadolibre.com/sites/MLB/search?q=apple+airpods+pro+2&limit=3', {
    headers: { Authorization: 'Bearer ' + token }
  })
  const json = await res.json()

  if (json.results?.length) {
    for (const item of json.results.slice(0, 3)) {
      console.log('---')
      console.log('TITLE:', item.title)
      console.log('CATEGORY:', item.category_id)
      console.log('PRICE:', item.price)
      console.log('THUMBNAIL:', item.thumbnail)
      const pic = item.pictures?.[0]
      if (pic) console.log('PICTURE_FULL:', pic.url || pic.secure_url)
      const gtin = item.attributes?.find((a: any) => a.id === 'GTIN')
      if (gtin) console.log('GTIN:', gtin.value_name)
      const brand = item.attributes?.find((a: any) => a.id === 'BRAND')
      if (brand) console.log('BRAND:', brand.value_name)
      const model = item.attributes?.find((a: any) => a.id === 'MODEL')
      if (model) console.log('MODEL:', model.value_name)
      const color = item.attributes?.find((a: any) => a.id === 'MAIN_COLOR')
      if (color) console.log('COLOR:', color.value_name)
    }
  } else {
    console.log('No results:', JSON.stringify(json).slice(0, 500))
  }
}

main()
