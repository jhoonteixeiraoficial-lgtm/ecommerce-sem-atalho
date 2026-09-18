import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { getUserCollectToken } from '@/lib/assertive/collect-token'

export const runtime = 'nodejs'

/**
 * Serve o userscript do coletor já personalizado com o token do usuário.
 * A URL termina em .user.js para que gerenciadores (Tampermonkey/Violentmonkey)
 * reconheçam e ofereçam instalação com um clique.
 *
 * O script é PASSIVO: lê apenas as páginas públicas do Mercado Livre que o
 * próprio usuário abre e envia ao app. Não usa cookies do ML, não clica,
 * não publica — impossível configurar bloqueio de conta por ele.
 */

const SCRIPT = String.raw`
// ==UserScript==
// @name         Espiao Assertive — Coletor Comunitario
// @namespace    assertive-espiao
// @version      1.0.0
// @description  Envia ao Assertive as paginas publicas do Mercado Livre que voce abre (busca e anuncios). Passivo: nao usa sua conta, nao clica, nao publica.
// @match        https://lista.mercadolivre.com.br/*
// @match        https://www.mercadolivre.com.br/*
// @match        https://produto.mercadolivre.com.br/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict'

  var APP_URL = __APP_URL__
  var TOKEN = __TOKEN__

  function tipoDePagina() {
    var h = location.hostname
    if (h === 'lista.mercadolivre.com.br' && document.querySelector('.ui-search-layout__item')) return 'search'
    if ((h === 'www.mercadolivre.com.br' || h === 'produto.mercadolivre.com.br') && document.querySelector('.ui-pdp-title')) return 'listing'
    return null
  }

  function jaEnviada(chave) {
    try {
      var agora = Date.now()
      var marcados = JSON.parse(sessionStorage.getItem('espiao-marcas') || '{}')
      Object.keys(marcados).forEach(function (k) { if (agora - marcados[k] > 30 * 60 * 1000) delete marcados[k] })
      if (marcados[chave]) return true
      marcados[chave] = agora
      sessionStorage.setItem('espiao-marcas', JSON.stringify(marcados))
      return false
    } catch (e) { return false }
  }

  function aviso(texto, ok) {
    var el = document.createElement('div')
    el.textContent = texto
    el.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;' +
      'font:600 12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:8px 12px;border-radius:10px;' +
      'background:' + (ok ? '#0f5132' : '#842029') + ';color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35);' +
      'opacity:0;transition:opacity .3s;pointer-events:none'
    document.body.appendChild(el)
    requestAnimationFrame(function () { el.style.opacity = '1' })
    setTimeout(function () {
      el.style.opacity = '0'
      setTimeout(function () { el.remove() }, 400)
    }, 3500)
  }

  function coletar() {
    var tipo = tipoDePagina()
    if (!tipo) return
    var chave = tipo + ':' + location.pathname
    if (jaEnviada(chave)) return
    fetch(APP_URL + '/api/assertive/collect', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: tipo,
        url: location.href,
        html: document.documentElement.outerHTML
      })
    }).then(function (r) {
      if (r.ok) aviso('\uD83D\uDD75\uFE0F Dossie atualizado com esta pagina', true)
      else aviso('\uD83D\uDD75\uFE0F Pagina ignorada pelo app', false)
    }).catch(function () {
      aviso('\uD83D\uDD75\uFE0F App offline — coleta nao enviada', false)
    })
  }

  // aguarda conteudo preguiçoso (lazy load do ML) antes de ler a pagina
  setTimeout(coletar, 2500)
})()
`

export async function GET(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response

  let token: string
  try {
    token = await getUserCollectToken(auth.authorizedUser.id)
  } catch {
    return Response.json({ error: 'Não foi possível gerar o token agora.' }, { status: 500 })
  }

  const origem = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  const corpo = SCRIPT
    .replace('__APP_URL__', JSON.stringify(origem.replace(/\/+$/, '')))
    .replace('__TOKEN__', JSON.stringify(token))

  return new Response(corpo, {
    status: 200,
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
