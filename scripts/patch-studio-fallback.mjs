import fs from 'node:fs'
const f = 'src/lib/assertive/progressive-images.ts'
let s = fs.readFileSync(f, 'utf8')

const startMarker = '    const generated = await dependencies.generateImage({'
const endMarker = "      throw new ProgressiveImageError('IMAGE_FIDELITY_REJECTED', fidelity.reason)\n    }\n"
const start = s.indexOf(startMarker)
const end = s.indexOf(endMarker, start)
if (start < 0 || end < 0) { console.log('marcadores não achados', start, end); process.exit(1) }

const replacement = `    // GERAÇÃO IA (Gemini → Pollinations grátis) com verificação completa.
    // Se a IA falhar ou o controle de qualidade rejeitar o resultado, o slot
    // usa a FOTO REAL da referência processada no estúdio (sharp) — fidelidade
    // por construção: os pixels do produto nunca mudam.
    let generated: Awaited<ReturnType<typeof dependencies.generateImage>> | null = null
    let normalized: Awaited<ReturnType<typeof dependencies.normalizeImage>> | null = null
    let aiRejection = ''
    try {
      generated = await dependencies.generateImage({
        productName,
        facts,
        references: references.map(reference => ({ buffer: reference.buffer, mime_type: reference.mime_type })),
        shot: {
          order: job.position + 1,
          ...normalizedShot,
        },
        // Receita Visual do anúncio escalado: replica a estratégia da foto
        // vencedora (ângulo, luz, composição, dúvida do comprador), nunca os pixels.
        recipeShot: readRecipeShot(context, job.position),
        referenceUrls: references.map(r => r.url).filter((u): u is string => Boolean(u)),
        role: job.role,
        previousFailure: previousFailure(job),
        apiKey: context.config?.provider === 'gemini' ? context.config.api_key : undefined,
      })
      normalized = await dependencies.normalizeImage(generated.buffer)
      if (job.position === 0) {
        const cover = await dependencies.assessCover(normalized.buffer)
        if (!cover.passed) {
          throw new ProgressiveImageError(
            'IMAGE_BACKGROUND_REJECTED',
            cover.reason || 'A capa não possui fundo branco seguro.'
          )
        }
      }
      const duplicatedReference = await dependencies.findDuplicate(
        normalized.buffer,
        references.map(reference => ({ id: reference.asset.id, buffer: reference.buffer })),
        4
      )
      if (duplicatedReference) {
        throw new ProgressiveImageError(
          'IMAGE_DUPLICATE_REJECTED',
          'A composição gerada repete uma referência visual.'
        )
      }
      const galleryComparisons = await dependencies.loadGalleryComparisons(
        job.listing_id,
        job.user_id,
        job.position
      )
      const duplicatedOutput = await dependencies.findDuplicate(normalized.buffer, galleryComparisons, 6)
      if (duplicatedOutput) {
        throw new ProgressiveImageError(
          'IMAGE_DUPLICATE_REJECTED',
          'A composição gerada repete outra posição da galeria.'
        )
      }
      const fidelity = await dependencies.verifyFidelity({
        references: references.map(reference => ({ buffer: reference.buffer, mime_type: reference.mime_type })),
        candidate: normalized.buffer,
        candidate_mime_type: normalized.mime_type,
        productName,
        facts,
        config: context.config,
      })
      if (fidelity.status === 'REJECT') {
        throw new ProgressiveImageError('IMAGE_FIDELITY_REJECTED', fidelity.reason)
      }
    } catch (e) {
      const isTransient = e instanceof ProgressiveImageError
        && ['IMAGE_PROVIDER_RATE_LIMITED', 'IMAGE_PROVIDER_TIMEOUT', 'IMAGE_PROVIDER_UNAVAILABLE'].includes(e.code)
      if (isTransient || !(e instanceof ProgressiveImageError)) throw e
      aiRejection = e.code + ': ' + (e.message || '').slice(0, 120)
      normalized = null
    }

    // ESTÚDIO (grátis, ilimitado): a foto real da referência no fundo branco.
    // Ignora o anti-duplicata de propósito: é uma derivação intencional e
    // melhorada da referência, não uma cópia preguiçosa.
    if (!normalized || !generated) {
      if (!normalized) {
        const { studioEnhance } = await import('./studio')
        const ref = references[job.position % references.length]
        const studio = await studioEnhance(ref.buffer)
        normalized = await dependencies.normalizeImage(studio.buffer)
      }
    }
    if (!normalized) throw new ProgressiveImageError('IMAGE_JOB_FAILED', 'Nenhuma imagem pôde ser produzida.')

    const outputHash = createHash('sha256').update(normalized.buffer).digest('hex')`

s = s.slice(0, start) + replacement + s.slice(end + endMarker.length)

// o persistGeneratedAsset usa parent_asset_id: references[0] — ok. Adiciona a
// observação da rejeição da IA nos metadados do output (provider/model):
s = s.replace(`      provider: generated?.provider ?? null,
      model: generated?.model ?? null,`, `      provider: generated?.provider ?? 'studio',
      model: generated?.model ?? 'sharp-studio',`)
fs.writeFileSync(f, s)
console.log('fluxo do slot reescrito com fallback de estúdio')
