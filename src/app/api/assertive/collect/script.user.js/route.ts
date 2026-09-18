import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { getUserCollectToken } from '@/lib/assertive/collect-token'

export const runtime = 'nodejs'

// The extension sandbox keeps the token and transport out of page JavaScript.
// Collection is opt-in per page, not background crawling or an account guarantee.
const SCRIPT = String.raw`// ==UserScript==
// @name         Assertive — Referências públicas
// @namespace    assertive-collector
// @version      1.2.0
// @description  Envia somente trechos públicos da busca ou anúncio após sua confirmação. Não navega, não publica e não envia cookies.
// @match        https://lista.mercadolivre.com.br/*
// @match        https://www.mercadolivre.com.br/*/p/MLB*
// @match        https://www.mercadolivre.com.br/p/MLB*
// @match        https://produto.mercadolivre.com.br/MLB-*
// @run-at       document-idle
// @noframes
// @grant        GM_xmlhttpRequest
// @connect      __APP_HOST__
// ==/UserScript==
(function () {
  'use strict';
  var APP_URL = __APP_URL__;
  var TOKEN = __TOKEN__;
  var PDP = '.ui-pdp-title,.ui-pdp-subtitle,.ui-pdp-seller-summary,.ui-seller-data,.ui-vpp-denounce__info,.ui-pdp-specs,.ui-pdp-gallery__figure,.ui-pdp-description__content';
  var pending = false;
  var sent = '';

  function kind() {
    if (location.hostname === 'lista.mercadolivre.com.br' && document.querySelector('.ui-search-layout__item')) return 'search';
    if (/^(www|produto)\.mercadolivre\.com\.br$/.test(location.hostname) && /(?:\/p\/MLB\d+|\/up\/MLBU\d+|\/MLB-\d+)/.test(location.pathname) && document.querySelector('.ui-pdp-title')) return 'listing';
    return null;
  }
  function cleanUrl(raw, image) {
    try {
      var u = new URL(raw);
      if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
      if (image) return u.hostname === 'http2.mlstatic.com' ? u.origin + u.pathname : '';
      if (!/^(www|produto|lista|click1)\.mercadolivre\.com\.br$/.test(u.hostname)) return '';
      var keep = new URLSearchParams();
      ['q','as_word','pdp_filters','item_id','searchVariation','wid'].forEach(function (key) {
        if (u.searchParams.has(key)) keep.set(key, u.searchParams.get(key));
      });
      var hash = new URLSearchParams(u.hash.slice(1));
      var safeHash = new URLSearchParams();
      ['wid','is_advertising'].forEach(function (key) { if (hash.has(key)) safeHash.set(key, hash.get(key)); });
      u.search = keep.toString(); u.hash = safeHash.toString();
      return u.href;
    } catch (_) { return ''; }
  }
  function publicHtml(type) {
    return Array.from(document.querySelectorAll(type === 'search' ? '.ui-search-layout__item' : PDP)).slice(0, 100).map(function (node) {
      var clone = node.cloneNode(true);
      clone.querySelectorAll('script,style,input,textarea,select,iframe,noscript,link,meta,svg,[hidden]').forEach(function (el) { el.remove(); });
      // O resumo do vendedor vive dentro do <form> do buybox: unwrap preserva a evidência.
      Array.from(clone.querySelectorAll('form')).forEach(function (form) {
        while (form.firstChild) form.parentNode.insertBefore(form.firstChild, form);
        form.parentNode.removeChild(form);
      });
      [clone].concat(Array.from(clone.querySelectorAll('*'))).forEach(function (el) {
        Array.from(el.attributes).forEach(function (a) {
          if (a.name === 'class') return;
          if (['href','src','data-src','data-zoom'].indexOf(a.name) !== -1) {
            var safe = cleanUrl(a.value, a.name !== 'href');
            if (safe) { el.setAttribute(a.name, safe); return; }
          }
          el.removeAttribute(a.name);
        });
      });
      return clone.outerHTML;
    }).join('\n');
  }
  function mount() {
    if (!kind() || document.getElementById('assertive-collect-panel')) return;
    var panel = document.createElement('aside'); panel.id = 'assertive-collect-panel';
    panel.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:290px;padding:14px;border-radius:12px;background:#171717;color:#fff;font:13px/1.5 system-ui;box-shadow:0 3px 16px #0006';
    var text = document.createElement('p'); text.textContent = 'Assertive: envie só os dados públicos desta página para sua pesquisa. Sem cookies, login ou navegação automática.';
    var button = document.createElement('button'); button.type = 'button'; button.textContent = 'Enviar esta página';
    button.style.cssText = 'padding:9px 12px;margin-top:8px;background:#fbbf24;color:#111;border:0;border-radius:7px;cursor:pointer;font-weight:600';
    var status = document.createElement('p'); status.setAttribute('role','status'); status.style.marginTop = '8px';
    button.onclick = function () {
      var type = kind(); var url = cleanUrl(location.href, false);
      if (!type || !url || pending || sent === url) return;
      var html = publicHtml(type);
      if (!html || html.length > 1500000) { status.textContent = 'Página incompleta ou muito grande. Nada foi enviado.'; return; }
      pending = true; button.disabled = true; status.textContent = 'Enviando trechos públicos…';
      function failed(message) { pending = false; button.disabled = false; status.textContent = message; }
      GM_xmlhttpRequest({
        method: 'POST', url: APP_URL + '/api/assertive/collect', anonymous: true, timeout: 20000,
        headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
        data: JSON.stringify({ kind: type, url: url, html: html }),
        onload: function (r) {
          var data; try { data = JSON.parse(r.responseText); } catch (_) { data = {}; }
          if (r.status >= 200 && r.status < 300 && data.ok) {
            sent = url; pending = false; button.textContent = 'Página enviada';
            status.textContent = type === 'search' ? data.entries + ' anúncios recebidos. Abra um concorrente para enviar também suas fotos e ficha.' : 'Anúncio recebido. Volte ao Assertive e atualize as referências.';
          } else failed(data.error || 'Não foi possível enviar. Tente novamente.');
        },
        onerror: function () { failed('Sem conexão com o Assertive. Tente novamente.'); },
        ontimeout: function () { failed('Tempo esgotado. Tente novamente.'); }
      });
    };
    panel.append(text, button, status); document.body.appendChild(panel);
  }
  mount();
  // Wait only for rendering; this never submits or opens a page automatically.
  var observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(function () { observer.disconnect(); }, 15000);
})();
`

export async function GET(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  try {
    const token = await getUserCollectToken(auth.authorizedUser.id)
    const origin = new URL(req.url).origin
    const script = SCRIPT
      .replace('__APP_HOST__', new URL(origin).hostname)
      .replace('__APP_URL__', JSON.stringify(origin))
      .replace('__TOKEN__', JSON.stringify(token))
    return new Response(script, { headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    } })
  } catch {
    return Response.json({ error: 'Não foi possível gerar o coletor agora.' }, { status: 503 })
  }
}
