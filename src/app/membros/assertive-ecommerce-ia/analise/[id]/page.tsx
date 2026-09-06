'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sparkles, Loader2, Star, TrendingUp, ArrowRight, Truck, MessageSquare, ChevronDown, ChevronUp, AlertCircle, Link2 } from 'lucide-react'

interface Competitor {
  item_id: string
  title: string
  price: number
  seller: { nickname: string; reputation: number; level: string }
  pictures: string[]
  attributes: Record<string, string>
  shipping: { free_shipping: boolean }
  reviews_count: number
}

interface Analysis {
  id: string
  product_name: string
  identified_data: { name: string; brand?: string; model?: string; category?: string; specs: Record<string, string> }
  competitors: Competitor[]
  status: string
}

interface Listing {
  id: string
  title: string
  description: string
  price: number
  status: string
}

interface SpySummary {
  avg_price: number
  min_price: number
  max_price: number
  avg_reviews: number
  free_shipping_pct: number
  competition_level: string
  opportunity_score: number
}

export default function AnalisePage() {
  const params = useParams()
  const router = useRouter()
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [spySummary, setSpySummary] = useState<SpySummary | null>(null)
  const [recommendation, setRecommendation] = useState('')
  const [loading, setLoading] = useState(true)
  const [spying, setSpying] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [spyError, setSpyError] = useState<string | null>(null)
  const [needsMLConnect, setNeedsMLConnect] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const supabase = createClient()
  const id = params.id as string

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('assertive_analyses').select('*').eq('id', id).single()
      if (data) {
        setAnalysis(data)
        if (data.competitors?.length > 0) {
          const prices = data.competitors.map((c: Competitor) => c.price)
          setSpySummary({
            avg_price: prices.reduce((a: number, b: number) => a + b, 0) / prices.length,
            min_price: Math.min(...prices),
            max_price: Math.max(...prices),
            avg_reviews: data.competitors.reduce((a: number, c: Competitor) => a + c.reviews_count, 0) / data.competitors.length,
            free_shipping_pct: (data.competitors.filter((c: Competitor) => c.shipping.free_shipping).length / data.competitors.length) * 100,
            competition_level: data.competitors.length > 5 ? 'alta' : data.competitors.length > 2 ? 'media' : 'baixa',
            opportunity_score: 70,
          })
        }
      }
      const { data: lData } = await supabase.from('assertive_listings').select('*').eq('analysis_id', id).order('variation_index')
      setListings(lData || [])
      setLoading(false)
    }
    load()
  }, [id, supabase])

  async function handleConnectML() {
    setConnecting(true)
    try {
      const res = await fetch('/api/assertive/ml/connect', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        const popup = window.open(data.url, 'ml-connect', 'width=500,height=650')
        const timer = setInterval(() => {
          if (popup?.closed) {
            clearInterval(timer)
            setConnecting(false)
            setNeedsMLConnect(false)
            handleSpy()
          }
        }, 800)
      } else {
        setConnecting(false)
      }
    } catch {
      setConnecting(false)
    }
  }

  async function handleSpy() {
    if (!analysis) return
    setSpying(true)
    setSpyError(null)
    setNeedsMLConnect(false)

    try {
      const res = await fetch('/api/assertive/spy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_id: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'ML_NOT_CONNECTED') {
          setNeedsMLConnect(true)
          setSpyError(data.message || 'Conecte sua conta do Mercado Livre para pesquisar concorrentes.')
        } else {
          setSpyError(data.error || 'Erro ao analisar concorrentes')
        }
        return
      }
      if (data.competitors) {
        setAnalysis(prev => prev ? { ...prev, competitors: data.competitors } : null)
        setSpySummary(data.summary)
        setRecommendation(data.recommendation)
      }
    } catch (e) {
      console.error('Spy error:', e)
      setSpyError('Erro de conexão ao espionar concorrentes. Tente novamente.')
    }
    setSpying(false)
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch('/api/assertive/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis_id: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGenerateError(data.error || 'Erro ao gerar anúncios')
        return
      }
      if (Array.isArray(data)) setListings(data)
    } catch {
      setGenerateError('Erro de conexão ao gerar anúncios')
    }
    setGenerating(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <p className="text-gray-400">Análise não encontrada</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">{analysis.product_name}</h1>
          <p className="text-gray-400 text-sm">
            {analysis.identified_data?.brand && `${analysis.identified_data.brand} · `}
            {analysis.identified_data?.model && `${analysis.identified_data.model} · `}
            {analysis.identified_data?.category || 'Categoria não identificada'}
          </p>
        </div>

        {!analysis.competitors?.length && (
          <button
            onClick={handleSpy}
            disabled={spying}
            className="mb-8 bg-gradient-to-r from-amber-500 to-orange-600 text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition disabled:opacity-40"
          >
            {spying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {spying ? 'Espionando...' : 'Espionar Concorrentes'}
          </button>
        )}

        {spyError && (
          <div className="mb-8 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 justify-between flex-wrap">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-red-400 text-sm">{spyError}</p>
            </div>
            {needsMLConnect && (
              <button
                onClick={handleConnectML}
                disabled={connecting}
                className="flex items-center gap-2 bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition disabled:opacity-40"
              >
                <Link2 className="w-4 h-4" />
                {connecting ? 'Conectando...' : 'Conectar Mercado Livre'}
              </button>
            )}
          </div>
        )}

        {spySummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-1">Preço Médio</p>
              <p className="text-xl font-bold text-white">R$ {spySummary.avg_price.toFixed(2)}</p>
            </div>
            <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-1">Faixa de Preço</p>
              <p className="text-xl font-bold text-white">R$ {spySummary.min_price.toFixed(0)} - {spySummary.max_price.toFixed(0)}</p>
            </div>
            <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-1">Reviews Médios</p>
              <p className="text-xl font-bold text-white">{spySummary.avg_reviews.toFixed(0)}</p>
            </div>
            <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4">
              <p className="text-gray-400 text-xs mb-1">Oportunidade</p>
              <p className={`text-xl font-bold ${spySummary.opportunity_score > 70 ? 'text-green-400' : spySummary.opportunity_score > 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                {spySummary.opportunity_score}%
              </p>
            </div>
          </div>
        )}

        {recommendation && (
          <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-6 mb-8">
            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-500" /> Recomendação da IA
            </h3>
            <p className="text-gray-300 text-sm whitespace-pre-line">{recommendation}</p>
          </div>
        )}

        {analysis.competitors?.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Top {analysis.competitors.length} Concorrentes
            </h2>
            <div className="space-y-3">
              {analysis.competitors.map((c, i) => (
                <div key={c.item_id} className="bg-[#141414] border border-[#1c1c1c] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpanded(expanded === c.item_id ? null : c.item_id)}
                    className="w-full flex items-center justify-between p-4 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-sm">
                        {i + 1}
                      </span>
                      <div className="flex items-center gap-3">
                        {c.pictures[0] && (
                          <img src={c.pictures[0]} alt="" className="w-12 h-12 rounded-lg object-cover bg-[#1c1c1c]" />
                        )}
                        <div>
                          <p className="text-white font-medium text-sm truncate max-w-[300px]">{c.title}</p>
                          <p className="text-gray-500 text-xs">
                            {c.seller.nickname} · {c.seller.level} · {c.reviews_count} reviews
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-amber-500 font-bold">R$ {c.price.toFixed(2)}</p>
                        <div className="flex items-center gap-2">
                          {c.shipping.free_shipping && (
                            <span className="text-green-400 text-xs flex items-center gap-1">
                              <Truck className="w-3 h-3" /> Frete grátis
                            </span>
                          )}
                        </div>
                      </div>
                      {expanded === c.item_id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </div>
                  </button>
                  {expanded === c.item_id && (
                    <div className="border-t border-[#1c1c1c] p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {c.pictures.slice(0, 4).map((pic, pi) => (
                          <img key={pi} src={pic} alt="" className="w-full h-32 object-cover rounded-lg bg-[#1c1c1c]" />
                        ))}
                      </div>
                      {Object.keys(c.attributes).length > 0 && (
                        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                          {Object.entries(c.attributes).slice(0, 9).map(([k, v]) => (
                            <div key={k} className="bg-[#1c1c1c] rounded-lg p-2">
                              <p className="text-gray-500 text-xs">{k}</p>
                              <p className="text-white text-sm">{v}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <a
                        href={`https://www.mercadolivre.com.br/item/${c.item_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-2 text-amber-500 text-sm hover:underline"
                      >
                        Ver no ML <ArrowRight className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-4 mb-8">
          <button
            onClick={handleGenerate}
            disabled={generating || !analysis.competitors?.length}
            className="bg-gradient-to-r from-amber-500 to-orange-600 text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:opacity-90 transition disabled:opacity-40"
          >
            {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {generating ? 'Gerando anúncios...' : 'Gerar Anúncios Otimizados'}
          </button>
        </div>

        {generateError && (
          <div className="mb-8 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-red-400 text-sm">{generateError}</p>
          </div>
        )}

        {listings.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-500" />
              Anúncios Gerados ({listings.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {listings.map(l => (
                <div key={l.id} className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4">
                  <p className="text-white font-medium text-sm mb-2">{l.title}</p>
                  <p className="text-amber-500 font-bold mb-3">R$ {l.price?.toFixed(2)}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/membros/assertive-ecommerce-ia/editor/${l.id}`)}
                      className="flex-1 bg-[#1c1c1c] text-white py-2 rounded-lg text-sm hover:bg-[#222] transition"
                    >
                      Editar
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm('Publicar este anúncio no ML?')) return
                        const res = await fetch(`/api/assertive/listings/${l.id}/publish`, { method: 'POST' })
                        const data = await res.json()
                        if (data.ok) {
                          setListings(prev => prev.map(x => x.id === l.id ? { ...x, status: 'published' } : x))
                        } else {
                          alert(data.error || 'Erro ao publicar')
                        }
                      }}
                      className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-500 transition"
                    >
                      Publicar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
