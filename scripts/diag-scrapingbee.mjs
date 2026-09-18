// Diagnóstico focado: cache de busca pública + saldo ScrapingBee (sem imprimir a chave)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SB_KEY = process.env.SCRAPINGBEE_API_KEY

const rest = async (path) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`REST ${res.status}: ${(await res.text()).slice(0, 150)}`)
  return res.json()
}

console.log('=== Snapshots PUBLIC_SEARCH / PUBLIC_LISTING no cache ===')
for (const prefix of ['PUBLIC_SEARCH', 'PUBLIC_LISTING']) {
  try {
    const rows = await rest(`assertive_ml_cache?cache_key=like.${prefix}*&select=cache_key,expires_at&order=created_at.desc&limit=10`)
    console.log(`${prefix}: ${rows.length} entradas recentes`)
    for (const r of rows.slice(0, 5)) console.log('   ', r.cache_key.slice(14, 34) + '…', 'expira:', r.expires_at)
  } catch (e) {
    console.log(`${prefix} erro:`, e.message)
  }
}

console.log('\n=== Saldo ScrapingBee ===')
if (!SB_KEY) {
  console.log('SCRAPINGBEE_API_KEY não está definida neste ambiente!')
} else {
  try {
    const res = await fetch(`https://app.scrapingbee.com/api/v1/balance?api_key=${SB_KEY}`)
    const body = await res.json().catch(() => null)
    console.log('HTTP', res.status, '| resposta:', JSON.stringify(body))
  } catch (e) {
    console.log('erro ao consultar saldo:', e.message)
  }
}
