import fs from 'node:fs'
const f = 'src/lib/assertive/gemini-image.ts'
let s = fs.readFileSync(f, 'utf8')

const start = s.indexOf('    const controller = new AbortController()\n    const timer = setTimeout(() => controller.abort(), 150_000)\n    try {\n      await runInQueue\n      const res = await fetch(pollinationsUrl, { signal: controller.signal })')
if (start < 0) { console.log('bloco não achado'); process.exit(1) }
// acha o fim do bloco try/catch/finally (clearTimeout(timer)\n    })
const endMarker = '      clearTimeout(timer)\n    }'
const end = s.indexOf(endMarker, start)
if (end < 0) { console.log('fim não achado'); process.exit(1) }

const replacement = `    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 150_000)
      try {
        await runInQueue
        const seed = baseSeed + attempt * 7919
        const url = pollinationsUrl.replace(/seed=\\d+/, 'seed=' + seed)
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) { lastError = \`pollinations HTTP \${res.status}\`; continue }
        const buffer = Buffer.from(await res.arrayBuffer())
        if (buffer.byteLength > 20_000) {
          return {
            buffer,
            mime_type: res.headers.get('content-type')?.startsWith('image/') ? res.headers.get('content-type')! : 'image/jpeg',
            provider: 'pollinations',
            model: 'flux',
            attempts: attempts + attempt + 1,
            latency_ms: Date.now() - startedAt,
            prompt_hash: promptHash,
            truth_brief_hash: truthBriefHash,
            source_sha256: sourceHash,
            reference_sha256s: referenceHashes,
            output_sha256: createHash('sha256').update(buffer).digest('hex'),
          }
        }
        lastError = 'pollinations retornou imagem inválida'
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'pollinations erro'
      } finally {
        clearTimeout(timer)
      }
      await new Promise(r => setTimeout(r, 20_000 * (attempt + 1)))
    }`

s = s.slice(0, start) + replacement + s.slice(end + endMarker.length)
// baseSeed precisa existir: define junto com a URL
s = s.replace('    const seed = Math.floor(Math.random() * 9999)\n    const anchorUrl = anchorUrlEarly', '    const baseSeed = Math.floor(Math.random() * 9999)\n    const anchorUrl = anchorUrlEarly')
s = s.replace('nologo=true&seed=\${seed}`', 'nologo=true&seed=\${baseSeed}`').replace('nologo=true&seed=\${seed}`', 'nologo=true&seed=\${baseSeed}`')
fs.writeFileSync(f, s)
console.log('retry loop aplicado')
