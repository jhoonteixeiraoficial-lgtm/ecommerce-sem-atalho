// E2E attach: captura de uma aba JÁ aberta (página completamente hidratada)
// e envia para o ingest. Uso: node scripts/e2e-collect-attach.mjs <match-url> <kind> <token>
const [match, kind, token] = process.argv.slice(2)
const CDP_PORT = 9333
const APP = 'http://localhost:3210'

const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json())
const tab = list.find(t => t.type === 'page' && (t.url || '').includes(match))
if (!tab) { console.error('aba não encontrada para', match); process.exit(1) }

const ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0
const call = (method, params) => new Promise((resolve, reject) => {
  const i = ++id
  ws.addEventListener('message', function h(e) {
    const m = JSON.parse(e.data)
    if (m.id === i) { ws.removeEventListener('message', h); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result) }
  })
  ws.send(JSON.stringify({ id: i, method, params }))
})

const sels = kind === 'search' ? ['.ui-search-layout__item'] : ['.ui-pdp-title', '.ui-pdp-subtitle', '.ui-pdp-seller-summary', '.ui-seller-data', '.ui-vpp-denounce__info', '.ui-pdp-specs', '.ui-pdp-gallery__figure', '.ui-pdp-description__content']
const expr = `(() => {
  const nodes = ${JSON.stringify(sels)}.flatMap(s => [...document.querySelectorAll(s)])
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
  return { title: document.title, count: nodes.length, html: nodes.slice(0, 100).map(clean).join('\\n'), href: location.href }
})()`
const ev = await call('Runtime.evaluate', { expression: expr, returnByValue: true })
const { title, count, html, href } = ev.result.value
ws.close()
console.error(`[e2e] aba: "${title}" — fragmentos: ${count} — html: ${html.length} bytes`)
if (count === 0) { console.error('sem fragmentos'); process.exit(3) }

const res = await fetch(`${APP}/api/assertive/collect`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ kind, url: href, html }),
})
const body = await res.json().catch(() => ({}))
console.log(`[e2e] ingest HTTP ${res.status}:`, JSON.stringify(body))
process.exit(res.ok ? 0 : 4)
