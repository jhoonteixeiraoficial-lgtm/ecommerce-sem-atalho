import { describe, it } from 'vitest'

for (const k of Object.keys(process.env)) {
  const v = process.env[k]
  if (typeof v === 'string' && v.startsWith('"') && v.endsWith('"')) process.env[k] = v.slice(1, -1)
}

import { createClient } from '@supabase/supabase-js'
import { buildCopyBrief } from '@/lib/assertive/copy-brief'
import { ensureProgressiveImageJobs } from '@/lib/assertive/image-jobs'
import { runNextProgressiveImageJob } from '@/lib/assertive/progressive-images'
import { researchMarket } from '@/lib/assertive/research'
import { requireMLToken } from '@/lib/assertive/publisher'
import type { ImagePlanStep } from '@/lib/assertive/generator'
import type { ProductTruth } from '@/lib/assertive/truth'

describe.skipIf(!process.env.DRIVE_LISTING)('drive completo (pesquisa cruzada + imagens)', () => {
  it('executa pesquisa e gera todas as imagens', async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const listingId = process.env.DRIVE_LISTING!
    const { data: listing } = await supabase
      .from('assertive_listings')
      .select('id, user_id, analysis_id, status, image_plan')
      .eq('id', listingId)
      .maybeSingle()
    if (!listing) throw new Error('listing não achado')
    const { data: analysis } = await supabase
      .from('assertive_analyses')
      .select('id, user_id, product_truth, research')
      .eq('id', listing.analysis_id)
      .maybeSingle()
    const truth = analysis?.product_truth as ProductTruth | null
    if (!truth?.name) throw new Error('sem truth')

    // 1) pesquisa cruzada (fuzzy capture + catálogo + web)
    try {
      const token = await requireMLToken(listing.user_id)
      const query = (analysis?.research as { query?: string } | null)?.query ?? truth.name
      const result = await researchMarket(token, query, {
        truth,
        collectorUserId: listing.user_id,
        allowPublicCollection: false,
        deepLimit: 8,
      })
      await supabase.from('assertive_analyses').update({
        research: { ...(analysis?.research as object ?? {}), ...result },
        updated_at: new Date().toISOString(),
      }).eq('id', analysis!.id)
      console.log('[drive] pesquisa: disponível=' + result.public_search?.available + ' entradas=' + (result.public_search?.entries?.length ?? 0) + ' com_img=' + (result.public_search?.entries?.filter(e => e.image_url).length ?? 0) + ' query_salva=' + (result.public_search?.query ?? ''))
    } catch (e) {
      console.log('[drive] pesquisa falhou (segue): ' + (e instanceof Error ? e.message.slice(0, 120) : e))
    }

    // 2) imagens: ensure + reset + loop
    const facts = buildCopyBrief({ truth, category: null }).facts.map(f => ({ label: f.label, value: f.value }))
    await ensureProgressiveImageJobs({
      listingId: listing.id,
      analysisId: analysis!.id,
      userId: listing.user_id,
      imagePlan: Array.isArray(listing.image_plan) ? listing.image_plan as ImagePlanStep[] : [],
      facts,
    })
    await supabase
      .from('assertive_image_jobs')
      .update({ status: 'QUEUED', attempt_count: 0, next_attempt_at: null, lock_token: null, error_code: null, error_message: null })
      .eq('listing_id', listing.id)
      .in('status', ['QUEUED', 'FAILED', 'RETRYABLE'])

    for (let i = 0; i < 40; i++) {
      const result = await runNextProgressiveImageJob({ listingId: listing.id, userId: listing.user_id })
      const processed = Boolean(result.processed_kind)
      const statuses = result.snapshot.slots.map(s => s.status).join(',')
      console.log(`[drive ${i}] processed=${processed} slots=[${statuses}]`)
      const pendente = result.snapshot.slots.some(s => ['QUEUED', 'RETRYABLE'].includes(s.status as string))
      if (!processed) { if (!pendente) break; await new Promise(r => setTimeout(r, 15_000)) }
    }
    const { data: jobs } = await supabase
      .from('assertive_image_jobs')
      .select('position,status,error_message')
      .eq('listing_id', listing.id)
      .order('position', { ascending: true })
    for (const j of jobs || []) console.log(`slot${j.position}: ${j.status} ${(j.error_message || '').slice(0, 130)}`)
  }, 900_000)
})
