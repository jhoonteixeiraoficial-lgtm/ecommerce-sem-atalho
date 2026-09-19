import fs from 'node:fs'

const f = 'src/lib/assertive/progressive-images.ts'
let s = fs.readFileSync(f, 'utf8')

const old = `    if (!assets.length) {
      throw new ProgressiveImageError(
        'REFERENCE_NOT_FOUND',
        'Nenhuma referência visual exata foi encontrada.',
        30_000
      )
    }`

const replacement = `    let accepted = assets
    if (!accepted.length) {
      // FALLBACK: fotos oficiais do doador (catálogo/espionagem) viram
      // referências — o img2img gratuito ancora nelas e o slot gera.
      const donorUrls = (context.listing.attributes as { photo_recipe?: { donor_urls?: string[] } } | null)?.photo_recipe?.donor_urls || []
      const sharp = (await import('sharp')).default
      const { createReferenceAsset } = await import('./image-assets')
      const created: ImageAsset[] = []
      for (const url of donorUrls) {
        try {
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
          if (!res.ok) continue
          const bytes = Buffer.from(await res.arrayBuffer())
          if (bytes.byteLength < 10_000) continue
          const meta = await sharp(bytes).metadata()
          const sha256 = createHash('sha256').update(bytes).digest('hex')
          const storageKey = \`\${job.user_id}/\${job.analysis_id}/ref-\${sha256}.jpg\`
          const admin = (await import('@/lib/supabase/admin')).createAdminClient()
          await admin.storage.from('assertive-originals').upload(storageKey, bytes, { contentType: 'image/jpeg', upsert: true })
          const asset = await createReferenceAsset({
            user_id: job.user_id,
            analysis_id: job.analysis_id,
            bytes,
            mime_type: 'image/jpeg',
            width: meta.width ?? 1024,
            height: meta.height ?? 1024,
            sha256,
            storage_key: storageKey,
            source_url: url,
            origin: 'COMPETITOR',
            rights_status: 'REFERENCE_ONLY',
            metadata: { donor_fallback: true },
          })
          created.push(asset)
          if (created.length >= 3) break
        } catch { // foto do doador falhou: tenta a próxima
        }
      }
      if (!created.length) {
        throw new ProgressiveImageError(
          'REFERENCE_NOT_FOUND',
          'Nenhuma referência visual exata foi encontrada.',
          30_000
        )
      }
      accepted = created
    }
    await dependencies.completeReference(job.id, job.user_id, job.lock_token, accepted.map(asset => asset.id))`

if (!s.includes(old)) {
  console.log('BLOCO NÃO ENCONTRADO')
  process.exit(1)
}
s = s.replace(old, replacement)
// accepted no lugar de assets no restante do fluxo
s = s.replace(`      metadata: {
        image_job_id: job.id,
        accepted_reference_count: assets.length,
        origins: [...new Set(assets.map(asset => asset.origin))],
      },`, `      metadata: {
        image_job_id: job.id,
        accepted_reference_count: accepted.length,
        origins: [...new Set(accepted.map(asset => asset.origin))],
      },`)
// imports: createHash (sharp/createReferenceAsset são importados dinamicamente)
if (!s.includes("import { createHash } from 'node:crypto'")) {
  s = "import { createHash } from 'node:crypto'\n" + s
}
fs.writeFileSync(f, s)
console.log('fallback de referência aplicado')
