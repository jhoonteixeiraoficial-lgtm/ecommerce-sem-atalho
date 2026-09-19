import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { getUserCollectToken } from '@/lib/assertive/collect-token'

export const runtime = 'nodejs'

// The extension sandbox keeps the token and transport out of page JavaScript.
// Collection is opt-in per page, not background crawling or an account guarantee.
const SCRIPT = String.raw`// ==UserScript==
// @name         Assertive — Referências públicas
// @namespace    assertive-collector
// @version      1.4.0
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
  // v1.3: AUTO-ENVIO — instalar o coletor é o consentimento. Nada de botão
  // por página: ao abrir uma busca ou anúncio, os trechos públicos seguem
  // sozinhos (sanitizados, deduplicados por sessão e limitados a 1 por URL).
  var spyMode = /[?&]assertive_spy=1/.test(location.search);
  function mount() {
    if (document.getElementById('assertive-collect-panel')) return;
    var type = kind();
    if (!type) return;
    var url = cleanUrl(location.href, false);
    if (!url || sent === url || pending) return;
    var seen = [];
    try { seen = JSON.parse(sessionStorage.getItem('assertive-collect-sent') || '[]'); } catch (_) {}
    if (seen.indexOf(url) !== -1) { sent = url; return; }

    var panel = document.createElement('aside'); panel.id = 'assertive-collect-panel';
    panel.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:270px;padding:12px;border-radius:12px;background:#171717;color:#fff;font:13px/1.5 system-ui;box-shadow:0 3px 16px #0006';
    var status = document.createElement('p'); status.setAttribute('role','status');
    status.textContent = 'Assertive: capturando dados públicos desta página… (sem cookies e sem navegação automática)';
    panel.append(status); document.body.appendChild(panel);

    pending = true;
    function done(message) {
      pending = false;
      try { seen.push(url); sessionStorage.setItem('assertive-collect-sent', JSON.stringify(seen.slice(-40))); } catch (_) {}
      status.textContent = message;
      setTimeout(function () { panel.remove(); }, 6000);
    }
    var html = publicHtml(type);
    if (!html || html.length > 1500000) { done('Página incompleta — nada foi enviado.'); return; }
    GM_xmlhttpRequest({
      method: 'POST', url: APP_URL + '/api/assertive/collect', anonymous: true, timeout: 20000,
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      data: JSON.stringify({ kind: type, url: url, html: html }),
      onload: function (r) {
        var data; try { data = JSON.parse(r.responseText); } catch (_) { data = {}; }
        if (r.status >= 200 && r.status < 300 && data.ok) {
          done(type === 'search' ? '✓ ' + data.entries + ' anúncios capturados para sua análise.' : '✓ Anúncio capturado. As referências entram na próxima análise.');
          if (spyMode) setTimeout(function () { try { window.close(); } catch (_) {} }, 2500);
        } else if (r.status === 409) {
          done('Página de verificação do ML — resolva o desafio e ela será capturada.');
        } else done('Captura não enviada (' + r.status + ').');
      },
      onerror: function () { done('Sem conexão com o Assertive.'); },
      ontimeout: function () { done('Tempo esgotado.'); }
    });
  }
  mount();
  var observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(function () { observer.disconnect(); }, 20000);
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
