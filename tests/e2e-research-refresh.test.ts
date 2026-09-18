import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { researchMarket } from '@/lib/assertive/research'

// E2E one-off: re-pesquisa da análise Soprano usando as evidências coletadas
// pelo navegador (cache BROWSER:<userId>:...). Não roda em CI (skip por env).
describe.skipIf(!process.env.E2E_RESEARCH)('e2e research refresh', () => {
  it('enriches competitors with public evidence', async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const analysisId = '2b3b8401-5a9e-4b9f-ae05-2dbe398341e9'
    const userId = 'd8c3528e-471e-4835-85a6-c9effb38fdf2'
    const { data: analysis, error: analysisError } = await sb.from('assertive_analyses').select('product_truth, research').eq('id', analysisId).single()
    if (analysisError) throw analysisError
    const truth = analysis!.product_truth
    const query = analysis!.research?.query ?? truth?.name
    console.log('QUERY:', query)

    // Token ML pode não estar válido aqui; a pesquisa pública é independente.
    let token = ''
    const { data: cred } = await sb.from('ml_credentials').select('*').eq('user_id', userId).maybeSingle()
    console.log('cred exists:', !!cred)
    const result = await researchMarket(token, query, {
      truth,
      collectorUserId: userId,
      allowPublicCollection: false,
      deepLimit: 8,
    })
    console.log('available:', result.public_search?.available)
    console.log('search_url:', result.public_search?.search_url)
    console.log('competitors:', result.competitors?.length)
    for (const c of result.competitors ?? []) {
      console.log('-', c.item_id, '| organic ev:', c.public_seller_evidence ? 'YES' : 'no', '| source:', (c.source_url ?? '').slice(0, 60), '| strength:', c.competitive_reference_strength, '| title:', (c.title ?? '').slice(0, 45))
    }
    console.log('warnings:', JSON.stringify(result.warnings ?? []))
    expect(result.public_search?.available).toBe(true)
    expect((result.competitors ?? []).some(c => c.public_seller_evidence || c.source_url)).toBe(true)
  })
})
