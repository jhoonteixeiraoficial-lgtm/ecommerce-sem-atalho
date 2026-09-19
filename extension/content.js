// Assertive Espionagem — captura passiva de páginas públicas do ML.
const APP = 'https://ecommerce-sem-atalho.vercel.app';
const KEEP = ['q','as_word','pdp_filters','item_id','searchVariation','wid'];
function kind() {
  if (location.hostname === 'lista.mercadolivre.com.br' && document.querySelector('.ui-search-layout__item')) return 'search';
  if (/^(www|produto)\.mercadolivre\.com\.br$/.test(location.hostname) && /(?:\/p\/MLB\d+|\/up\/MLBU\d+|\/MLB-\d+)/.test(location.pathname) && document.querySelector('.ui-pdp-title')) return 'listing';
  return null;
}
function cleanUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return '';
    const keep = new URLSearchParams();
    KEEP.forEach(k => { if (u.searchParams.has(k)) keep.set(k, u.searchParams.get(k)); });
    const hash = new URLSearchParams(u.hash.slice(1));
    const safeHash = new URLSearchParams();
    ['wid','item_id'].forEach(k => { if (hash.has(k)) safeHash.set(k, hash.get(k)); });
    u.search = keep.toString(); u.hash = safeHash.toString();
    return u.href;
  } catch { return ''; }
}
function publicHtml(type) {
  const PDP = '.ui-pdp-title,.ui-pdp-subtitle,.ui-pdp-seller-summary,.ui-seller-data,.ui-vpp-denounce__info,.ui-pdp-specs,.ui-pdp-gallery__figure,.ui-pdp-description__content';
  return Array.from(document.querySelectorAll(type === 'search' ? '.ui-search-layout__item' : PDP)).slice(0, 100).map(node => {
    const c = node.cloneNode(true);
    c.querySelectorAll('script,style,input,textarea,select,iframe,noscript,link,meta,svg,[hidden]').forEach(el => el.remove());
    Array.from(c.querySelectorAll('form')).forEach(form => {
      while (form.firstChild) form.parentNode.insertBefore(form.firstChild, form);
      form.remove();
    });
    [c, ...c.querySelectorAll('*')].forEach(el => {
      Array.from(el.attributes).forEach(a => {
        if (a.name === 'class') return;
        if (['href','src','data-src','data-zoom'].includes(a.name)) return;
        el.removeAttribute(a.name);
      });
      el.removeAttribute('id');
    });
    return c.outerHTML;
  }).join('\n');
}
async function token() {
  if (window.__ASSERTIVE_TOKEN__) return window.__ASSERTIVE_TOKEN__;
  const r = await fetch(APP + '/api/assertive/collect/token', { credentials: 'include' });
  const d = await r.json();
  return d.token || null;
}
async function send() {
  const type = kind();
  if (!type) return;
  const url = cleanUrl(location.href);
  if (!url) return;
  const seen = JSON.parse(sessionStorage.getItem('assertive-ext-sent') || '[]');
  if (seen.includes(url)) return;
  const html = publicHtml(type);
  if (!html || html.length > 1500000) return;
  const t = await token();
  if (!t) { console.warn('[assertive-ext] sem token — faça login no Assertive'); return; }
  const r = await fetch(APP + '/api/assertive/collect', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: type, url, html }),
  });
  if (r.ok) {
    seen.push(url);
    sessionStorage.setItem('assertive-ext-sent', JSON.stringify(seen.slice(-40)));
    console.log('[assertive-ext] capturado:', type, url.slice(0, 60));
    if (/[?&]assertive_spy=1/.test(location.search)) setTimeout(() => window.close(), 2500);
  }
}
setTimeout(send, 4000);
