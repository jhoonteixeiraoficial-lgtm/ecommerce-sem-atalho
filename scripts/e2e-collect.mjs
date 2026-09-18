// E2E: abre uma página real do ML em Chromium de verdade (CDP), extrai os
// fragmentos públicos como o userscript v1.1.0 faz e envia para o ingest local.
// Uso: node scripts/e2e-collect.mjs <kind: search|listing> <url> <token>
const [kind, url, token] = process.argv.slice(2)
if (!kind || !url || !token) { console.error('uso: node scripts/e2e-collect.mjs <search|listing> <url> <token>'); process.exit(1) }

const CDP_PORT = 9333
const APP = 'http://localhost:3210'

async function cdpCall(ws, id, method, params, sessionId) {
  return new Promise((resolve, reject) => {
    const onMsg = ev => {
      const m = JSON.parse(ev.data)
      if (m.id === id) { ws.removeEventListener('message', onMsg); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result) }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const ver = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then(r => r.json())
const ws = new WebSocket(ver.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let id = 0
const { targetId } = await cdpCall(ws, ++id, 'Target.createTarget', { url: 'about:blank' })
const { sessionId } = await cdpCall(ws, ++id, 'Target.attachToTarget', { targetId, flatten: true })
await cdpCall(ws, ++id, 'Page.enable', {}, sessionId)
await cdpCall(ws, ++id, 'Runtime.enable', {}, sessionId)
await cdpCall(ws, ++id, 'Page.navigate', { url }, sessionId)
const sel = kind === 'search' ? '.ui-search-layout__item' : '.ui-pdp-container'
let count = 0
for (let i = 0; i < 16; i++) {
  await sleep(1500)
  const probe = await cdpCall(ws, ++id, 'Runtime.evaluate', { expression: `document.querySelectorAll(${JSON.stringify(sel)}).length`, returnByValue: true }, sessionId)
  count = probe.result.value
  if (count > 0) break
}
if (kind === 'listing' && count > 0) {
  for (let i = 0; i < 40; i++) {
    const probe = await cdpCall(ws, ++id, 'Runtime.evaluate', { expression: `document.querySelectorAll('.ui-pdp-seller-summary__link').length >= 1`, returnByValue: true }, sessionId)
    if (probe.result.value === true) { await sleep(2500); break }
    if (i === 5 || i === 15) {
      await cdpCall(ws, ++id, 'Runtime.evaluate', { expression: `window.scrollTo(0, document.body.scrollHeight); setTimeout(()=>window.scrollTo(0,300), 600)`, returnByValue: true }, sessionId)
    }
    await sleep(1500)
  }
}

const expr = `(() => {
  const sels = ${kind === 'search' ? "['.ui-search-layout__item']" : "['.ui-pdp-title','.ui-pdp-subtitle','.ui-pdp-seller-summary','.ui-seller-data','.ui-vpp-denounce__info','.ui-pdp-specs','.ui-pdp-gallery__figure','.ui-pdp-description__content']"}
  const nodes = sels.flatMap(s => [...document.querySelectorAll(s)])
  const clean = n => {
    const c = n.cloneNode(true)
    c.querySelectorAll('script,style,iframe,input,noscript').forEach(x => x.remove()); for (const f of [...c.querySelectorAll('form')]) { while (f.firstChild) f.parentNode.insertBefore(f.firstChild, f); f.remove() }
    for (const el of [c, ...c.querySelectorAll('*')]) {
      for (const a of [...el.attributes]) {
        if (a.name.startsWith('on')) el.removeAttribute(a.name)
        else if (!['href','src','data-src','data-zoom','class','alt','title','content','name'].includes(a.name)) el.removeAttribute(a.name)
      }
      el.removeAttribute('id')
    }
    return c.outerHTML
  }
  return { title: document.title, count: nodes.length, html: nodes.slice(0, 100).map(clean).join('\\n') }
})()`
const ev = await cdpCall(ws, ++id, 'Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)
const { title, html } = ev.result.value
const finalUrl = (await cdpCall(ws, ++id, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true }, sessionId)).result.value
if (process.env.E2E_SAVE) {
  const fs = await import('node:fs')
  fs.writeFileSync(process.env.E2E_SAVE, JSON.stringify({ kind, url: finalUrl, html }))
}
ws.close()
const postUrl = kind === 'listing' ? finalUrl : url
console.error(`[e2e] página: "${title}" — fragmentos: ${count} — html: ${html.length} bytes — url final: ${postUrl.slice(0, 110)}`)
if (/verificação|suspicious|robot|captcha/i.test(title)) { console.error('[e2e] ANTI-BOT detectado'); process.exit(2) }
if (count === 0) {
  const diag = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json()).catch(() => [])
  console.error('[e2e] abas:', JSON.stringify(diag.map(t => ({ t: t.title, u: (t.url || '').slice(0, 120) }))))
  process.exit(3)
}

const res = await fetch(`${APP}/api/assertive/collect`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ kind, url: postUrl, html }),
})
const body = await res.json().catch(() => ({}))
console.log(`[e2e] ingest HTTP ${res.status}:`, JSON.stringify(body))
process.exit(res.ok ? 0 : 4)
