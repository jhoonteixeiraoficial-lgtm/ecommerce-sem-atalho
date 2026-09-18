// Diagnóstico read-only do pipeline Assertive.
// Uso: node scripts/diag-assertive.mjs [analysis_id] [listing_id]
// Não imprime segredos. Usa a service role key apenas para SELECT.

const analysisId = process.argv[2] || '2b3b8401-5a9e-4b9f-ae05-2dbe398341e9'
const listingId = process.argv[3] || '872613d8-5ec1-40e0-ae5e-5ad3e5e2cfbb'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERRO: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (rode com node --env-file=.env.local)')
  process.exit(1)
}

const rest = async (path) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`REST ${res.status} em ${path.split('?')[0]}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

const j = (v) => JSON.stringify(v)

async function main() {
  console.log('=== 1. Tabelas/RPCs existentes ===')
  try {
    const spec = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }).then((r) => r.json())
    const defs = Object.keys(spec.definitions || {})
    const rpcs = Object.keys(spec.paths || {}).filter((p) => p.startsWith('/rpc/'))
    console.log('assertive_ml_cache:', defs.includes('assertive_ml_cache'))
    console.log('assertive_search_budget:', defs.includes('assertive_search_budget'))
    console.log('assertive_search_reservations:', defs.includes('assertive_search_reservations'))
    console.log('RPC reserve_assertive_search_credits:', rpcs.includes('/rpc/reserve_assertive_search_credits'))
    console.log('assertive_analyses:', defs.includes('assertive_analyses'))
    console.log('assertive_listings:', defs.includes('assertive_listings'))
  } catch (e) {
    console.log('Falha ao ler spec OpenAPI:', e.message)
  }

  console.log('\n=== 2. Orçamento de busca (créditos reservados hoje) ===')
  try {
    const budget = await rest('assertive_search_budget?select=*')
    console.log('linhas:', j(budget))
  } catch (e) {
    console.log('tabela inacessível/ausente:', e.message)
  }
  try {
    const reservations = await rest('assertive_search_reservations?select=cache_key,reserved_at&order=reserved_at.desc&limit=5')
    console.log('reservas recentes:', reservations.length)
    for (const r of reservations) console.log('  ', r.cache_key.slice(0, 40) + '…', r.reserved_at)
  } catch (e) {
    console.log('reservas inacessíveis:', e.message)
  }

  console.log('\n=== 3. Cache de páginas públicas (assertive_ml_cache) ===')
  try {
    const cache = await rest('assertive_ml_cache?select=cache_key,expires_at&order=created_at.desc&limit=8')
    console.log('entradas recentes:', cache.length)
    for (const c of cache) console.log('  ', c.cache_key.slice(0, 40) + '…', 'expira:', c.expires_at)
  } catch (e) {
    console.log('cache inacessível:', e.message)
  }

  console.log('\n=== 4. Análise', analysisId, '===')
  try {
    const rows = await rest(`assertive_analyses?id=eq.${analysisId}&select=status,product_name,input_type,error_message,research,dna,product_truth`)
    if (!rows.length) {
      console.log('análise não encontrada')
    } else {
      const a = rows[0]
      console.log('status:', a.status, '| produto:', a.product_name, '| entrada:', a.input_type, '| erro:', a.error_message)
      const r = a.research || {}
      console.log('--- research:')
      console.log('  query:', r.query)
      console.log('  categoria:', r.category_id, r.category_name, '| fonte:', r.category_source)
      console.log('  public_search.available:', r.public_search?.available)
      console.log('  public_search.unavailable_reason:', r.public_search?.unavailable_reason || null)
      console.log('  public_search.entries:', r.public_search?.entries?.length ?? 0)
      console.log('  competitors:', r.competitors?.length ?? 0)
      for (const c of (r.competitors || []).slice(0, 5)) {
        console.log(`    - ${c.title?.slice(0, 60)} | força:${c.competitive_reference_strength} | fotos:${c.picture_count} | atributos:${c.attribute_count} | desc:${c.short_description ? 'sim' : 'não'} | match:${c.match_class} | fonte:${c.source_url ? 'página pública' : 'catálogo'}`)
      }
      console.log('  warnings:', j(r.warnings || []))
      console.log('  price_stats:', j(r.price_stats))
      console.log('--- dna:')
      console.log('  referências analisadas:', a.dna?.references_analyzed, '| fraquezas comuns:', (a.dna?.common_weaknesses || []).length)
      console.log('--- truth:')
      console.log('  nome:', a.product_truth?.name, '| confiança:', a.product_truth?.confidence)
    }
  } catch (e) {
    console.log('análise inacessível:', e.message)
  }

  console.log('\n=== 5. Listing', listingId, '===')
  try {
    const rows = await rest(`assertive_listings?id=eq.${listingId}&select=title,price,status,photos,completeness,scores,attributes`)
    if (!rows.length) {
      console.log('listing não encontrado')
    } else {
      const l = rows[0]
      console.log('status:', l.status, '| título:', (l.title || '').slice(0, 60))
      console.log('preço:', l.price, '| fotos:', (l.photos || []).length, '| completude:', l.completeness)
      const attrs = l.attributes || {}
      console.log('atributos na lista:', (attrs.list || []).length, '| faltando:', (attrs.missing || []).length)
      console.log('publication_requirements.blockers:', attrs.publication_requirements?.blocker_count, '| title_control:', attrs.title_control_mode)
    }
  } catch (e) {
    console.log('listing inacessível:', e.message)
  }
}

main().catch((e) => {
  console.error('Falha no diagnóstico:', e.message)
  process.exit(1)
})
