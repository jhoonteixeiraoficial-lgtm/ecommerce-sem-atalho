// Dump dos fragmentos de uma aba aberta para arquivo. Uso: node scripts/e2e-dump-tab.mjs <match-url> <saida.json>
const [match, out] = process.argv.slice(2)
const CDP_PORT = 9333
const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(r => r.json())
const tab = list.find(t => t.type === 'page' && (t.url || '').includes(match))
if (!tab) { console.error('aba não encontrada'); process.exit(1) }
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
const expr = `(() => {
  const sels = ['.ui-pdp-title','.ui-pdp-subtitle','.ui-pdp-seller-summary','.ui-seller-data','.ui-vpp-denounce__info','.ui-pdp-specs','.ui-pdp-gallery__figure','.ui-pdp-description__content']
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
  return { href: location.href, html: sels.flatMap(s => [...document.querySelectorAll(s)]).slice(0, 100).map(clean).join('\\n') }
})()`
const ev = await call('Runtime.evaluate', { expression: expr, returnByValue: true })
if (!ev?.result?.value) { console.error('evaluate falhou:', JSON.stringify(ev).slice(0, 300)); process.exit(2) }
const fs = await import('node:fs')
fs.writeFileSync(out, JSON.stringify({ url: ev.result.value.href, html: ev.result.value.html }))
console.log('salvo:', out, Math.round(ev.result.value.html.length / 1024) + 'KB')
ws.close()
process.exit(0)
