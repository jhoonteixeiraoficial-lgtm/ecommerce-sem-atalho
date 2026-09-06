'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Sparkles, Settings, Plus, ExternalLink, Target, Package,
  CheckCircle2, Loader2, AlertCircle, Plug, ChevronRight, Store,
} from 'lucide-react'

interface Analysis {
  id: string
  product_name: string
  status: string
  error_message: string | null
  photos: string[]
  created_at: string
}

interface Listing {
  id: string
  analysis_id: string
  title: string
  price: number | null
  status: string
  scores?: { total?: number }
  completeness?: { percent?: number }
  ml_item_id: string | null
  ml_permalink: string | null
  photos: string[]
  created_at: string
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  identifying: { label: 'Identificando', className: 'bg-blue-500/15 text-blue-300' },
  researching: { label: 'Aguardando pesquisa', className: 'bg-amber-500/15 text-amber-300' },
  analyzing: { label: 'Analisando', className: 'bg-amber-500/15 text-amber-300' },
  generating: { label: 'Gerando', className: 'bg-amber-500/15 text-amber-300' },
  needs_input: { label: 'Faltam dados', className: 'bg-orange-500/15 text-orange-300' },
  ready: { label: 'Pronto', className: 'bg-emerald-500/15 text-emerald-300' },
  validating: { label: 'Validando', className: 'bg-blue-500/15 text-blue-300' },
  ready_to_publish: { label: 'Pronto p/ publicar', className: 'bg-emerald-500/15 text-emerald-300' },
  publishing: { label: 'Publicando', className: 'bg-blue-500/15 text-blue-300' },
  published: { label: 'Publicado', className: 'bg-emerald-500/20 text-emerald-300' },
  failed: { label: 'Falhou', className: 'bg-red-500/15 text-red-300' },
  draft: { label: 'Rascunho', className: 'bg-gray-500/15 text-gray-300' },
}

function badge(status: string) {
  return STATUS_LABEL[status] || { label: status, className: 'bg-gray-500/15 text-gray-300' }
}

function brl(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function AssertiveDashboard() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [ml, setMl] = useState<{ connected: boolean; nickname?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [dataRes, mlRes] = await Promise.all([
      fetch('/api/assertive/analyses').then(r => r.json()).catch(() => ({ analyses: [], listings: [] })),
      fetch('/api/assertive/ml/status').then(r => r.json()).catch(() => ({ connected: false })),
    ])
    setAnalyses(dataRes.analyses || [])
    setListings(dataRes.listings || [])
    setMl(mlRes)
    setLoading(false)
  }, [])

  // load() é assíncrono: o primeiro setState só ocorre após o await, nunca durante o render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'ml-connected' && e.data.ok) load()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [load])

  async function connectML() {
    const res = await fetch('/api/assertive/ml/connect', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.open(data.url, 'ml-oauth', 'width=520,height=720')
  }

  const published = listings.filter(l => l.status === 'published')
  const inProgress = listings.filter(l => l.status !== 'published')
  const listingByAnalysis = new Map(listings.map(l => [l.analysis_id, l]))

  // análises que ainda não viraram anúncio
  const pending = analyses.filter(a => !listingByAnalysis.has(a.id))

  return (
    <div className="min-h-screen bg-[#0c0c0c] px-4 py-6 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Assertive IA</h1>
              <p className="text-gray-400 text-sm">Do produto ao anúncio publicado</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/membros/assertive-ecommerce-ia/config"
              className="p-2.5 bg-[#1c1c1c] text-gray-400 rounded-lg hover:text-white transition"
              aria-label="Configurações"
            >
              <Settings className="w-5 h-5" />
            </Link>
            <Link
              href="/membros/assertive-ecommerce-ia/novo"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-black px-4 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" /> Nova análise
            </Link>
          </div>
        </div>

        {ml && !ml.connected && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-5 flex flex-wrap items-center gap-3">
            <Plug className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-[200px]">
              <p className="text-amber-200 text-sm font-medium">Conecte sua conta do Mercado Livre</p>
              <p className="text-amber-200/60 text-xs">Necessário para pesquisar concorrência e publicar.</p>
            </div>
            <button
              onClick={connectML}
              className="bg-amber-500 text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-400 transition"
            >
              Conectar
            </button>
          </div>
        )}

        {ml?.connected && (
          <div className="flex items-center gap-2 text-emerald-400/70 text-xs mb-5">
            <CheckCircle2 className="w-4 h-4" />
            Mercado Livre conectado{ml.nickname ? `: ${ml.nickname}` : ''}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { icon: Target, label: 'Análises', value: analyses.length },
            { icon: Package, label: 'Em produção', value: inProgress.length },
            { icon: Store, label: 'Publicados', value: published.length },
          ].map(stat => (
            <div key={stat.label} className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4">
              <stat.icon className="w-4 h-4 text-amber-500 mb-2" />
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-gray-500 text-xs">{stat.label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : analyses.length === 0 ? (
          <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-10 text-center">
            <Sparkles className="w-10 h-10 text-amber-500/40 mx-auto mb-4" />
            <h2 className="text-white font-semibold mb-1">Comece sua primeira análise</h2>
            <p className="text-gray-500 text-sm mb-5 max-w-sm mx-auto">
              Tire uma foto do produto, descreva ou cole um link. O Assertive pesquisa o mercado e cria o anúncio.
            </p>
            <Link
              href="/membros/assertive-ecommerce-ia/novo"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-black px-5 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" /> Nova análise
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {listings.length > 0 && (
              <section>
                <h2 className="text-white font-semibold mb-3">Anúncios</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {listings.map(l => {
                    const b = badge(l.status)
                    return (
                      <Link
                        key={l.id}
                        href={`/membros/assertive-ecommerce-ia/editor/${l.id}`}
                        className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4 hover:border-amber-500/30 transition group"
                      >
                        <div className="flex gap-3">
                          {l.photos?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.photos[0]} alt="" className="w-14 h-14 rounded-lg object-cover bg-[#1c1c1c] shrink-0" />
                          ) : (
                            <div className="w-14 h-14 rounded-lg bg-[#1c1c1c] flex items-center justify-center shrink-0">
                              <Package className="w-5 h-5 text-gray-600" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm line-clamp-2 group-hover:text-amber-400 transition">
                              {l.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${b.className}`}>{b.label}</span>
                              <span className="text-amber-400 text-xs font-medium">{brl(l.price)}</span>
                              {typeof l.scores?.total === 'number' && (
                                <span className="text-gray-500 text-[10px]">Score {l.scores.total}</span>
                              )}
                            </div>
                          </div>
                          {l.ml_permalink ? (
                            <ExternalLink className="w-4 h-4 text-gray-600 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}

            {pending.length > 0 && (
              <section>
                <h2 className="text-white font-semibold mb-3">Análises em aberto</h2>
                <div className="space-y-2">
                  {pending.map(a => {
                    const b = badge(a.status)
                    return (
                      <Link
                        key={a.id}
                        href={`/membros/assertive-ecommerce-ia/analise/${a.id}`}
                        className="flex items-center gap-3 bg-[#141414] border border-[#1f1f1f] rounded-xl p-3.5 hover:border-amber-500/30 transition group"
                      >
                        {a.photos?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.photos[0]} alt="" className="w-11 h-11 rounded-lg object-cover bg-[#1c1c1c] shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded-lg bg-[#1c1c1c] flex items-center justify-center shrink-0">
                            <Target className="w-4 h-4 text-gray-600" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm truncate group-hover:text-amber-400 transition">
                            {a.product_name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${b.className}`}>{b.label}</span>
                            {a.error_message && (
                              <span className="text-red-400/70 text-[10px] truncate flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                {a.error_message}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
