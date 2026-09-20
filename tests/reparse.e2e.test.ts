import { describe, it } from 'vitest'

for (const k of Object.keys(process.env)) {
  const v = process.env[k]
  if (typeof v === 'string' && v.startsWith('"') && v.endsWith('"')) process.env[k] = v.slice(1, -1)
}

import { createClient } from '@supabase/supabase-js'
import { reparseUserCaptures } from '@/lib/assertive/public-search-cache'

describe.skipIf(!process.env.DRIVE_USER)('reparse capturas', () => {
  it('atualiza capturas antigas com image_url', async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: l } = await supabase.from('assertive_listings').select('user_id').eq('id', process.env.DRIVE_LISTING!).single()
    const n = await reparseUserCaptures(l!.user_id)
    console.log('capturas re-processadas:', n)
  })
})
