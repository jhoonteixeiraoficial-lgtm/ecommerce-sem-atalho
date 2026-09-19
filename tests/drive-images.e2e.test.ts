import { describe, it } from 'vitest'

// o `vercel env pull` grava valores com aspas: limpa ANTES de qualquer lib ler
for (const k of Object.keys(process.env)) {
  const v = process.env[k]
  if (typeof v === 'string' && v.startsWith('"') && v.endsWith('"')) process.env[k] = v.slice(1, -1)
}

import { createClient } from '@supabase/supabase-js'
import { buildCopyBrief } from '@/lib/assertive/copy-brief'
import { ensureProgressiveImageJobs } from '@/lib/assertive/image-jobs'
import { runNextProgressiveImageJob } from '@/lib/assertive/progressive-images'
import type { ImagePlanStep } from '@/lib/assertive/generator'
import type { ProductTruth } from '@/lib/assertive/truth'

const clean = (v: unknown) => String(v ?? '').replace(/^"|"$/g, '')

/**
 * Driver autônomo de imagens: roda TODOS os jobs de um listing até esgotar
 * (IA com verificação + garantia Estúdio). Sem sessão, direto no banco.
 * Uso: DRIVE_LISTING=<listingId> DRIVE_USER=<userId> npx vitest run tests/drive-images.e2e.test.ts
 */
describe.skipIf(!process.env.DRIVE_LISTING)('drive listing images (E2E noturno)', () => {
  it('processa todos os jobs do anúncio', async () => {
    const supabase = createClient(
      clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    )
    const listingId = process.env.DRIVE_LISTING!
    const { data: listing, error: lErr } = await supabase
      .from('assertive_listings')
      .select('id, user_id, analysis_id, status, image_plan')
      .eq('id', listingId)
      .maybeSingle()
    if (lErr || !listing) throw new Error('listing não achado: ' + (lErr?.message || ''))

    const { data: analysis } = await supabase
      .from('assertive_analyses')
      .select('id, user_id, product_truth')
      .eq('id', listing.analysis_id)
      .maybeSingle()
    const truth = analysis?.product_truth as ProductTruth | null
    if (!truth?.name) throw new Error('sem truth')

    const facts = buildCopyBrief({ truth, category: null }).facts
      .map(f => ({ label: f.label, value: f.value }))

    await ensureProgressiveImageJobs({
      listingId: listing.id,
      analysisId: analysis!.id,
      userId: listing.user_id,
      imagePlan: Array.isArray(listing.image_plan) ? listing.image_plan as ImagePlanStep[] : [],
      facts,
    })

    // reset: limpa falhas/backoffs antigos para reprocessar do zero
    await supabase
      .from('assertive_image_jobs')
      .update({ status: 'QUEUED', attempt_count: 0, next_attempt_at: null, lock_token: null, error_code: null, error_message: null })
      .eq('listing_id', listing.id)
      .in('status', ['QUEUED', 'FAILED', 'RETRYABLE'])

    // processa até 40 jobs; espera quando nada estiver reclamável (backoff externo)
    for (let i = 0; i < 40; i++) {
      const result = await runNextProgressiveImageJob({ listingId: listing.id, userId: listing.user_id })
      const processed = Boolean(result.processed_kind)
      const statuses = result.snapshot.slots.map(s => s.status).join(',')
      console.log(`[drive ${i}] processed=${processed} slots=[${statuses}]`)
      const pendente = result.snapshot.slots.some(s => ['QUEUED', 'RETRYABLE'].includes(s.status as string))
        || result.snapshot.reference_status === 'RETRYABLE'
      if (!processed) {
        if (!pendente) break
        await new Promise(r => setTimeout(r, 15_000))
      }
    }
    const { data: jobs } = await supabase
      .from('assertive_image_jobs')
      .select('position,status,error_message')
      .eq('listing_id', listing.id)
      .order('updated_at', { ascending: false })
      .limit(7)
    for (const j of jobs || []) {
      console.log(`slot${j.position}: ${j.status} ${(j.error_message || '').slice(0, 150)}`)
    }
  }, 900_000)
})
