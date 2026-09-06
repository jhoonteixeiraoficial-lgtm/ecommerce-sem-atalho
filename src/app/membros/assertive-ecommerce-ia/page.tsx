'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Sparkles, Search, BarChart3, Settings, Plus, ExternalLink, TrendingUp, Zap, Target } from 'lucide-react'

interface Analysis {
  id: string
  product_name: string
  status: string
  created_at: string
}

interface Listing {
  id: string
  title: string
  status: string
  price: number
  ml_item_id?: string
  created_at: string
}

interface AIConfig {
  provider: string
  api_key?: string
}

export default function AssertiveDashboard() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [config, setConfig] = useState<AIConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [analysesRes, listingsRes, configRes] = await Promise.all([
        supabase.from('assertive_analyses').select('id, product_name, status, created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('assertive_listings').select('id, title, status, price, ml_item_id, created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('assertive_ai_config').select('provider, api_key').single(),
      ])
      setAnalyses(analysesRes.data || [])
      setListings(listingsRes.data || [])
      setConfig(configRes.data)
      setLoading(false)
    }
    load()
  }, [supabase])

  const published = listings.filter(l => l.status === 'published').length
  const drafts = listings.filter(l => l.status === 'draft').length

  return (
    <div className="min-h-screen bg-[#0c0c0c] p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Assertive IA</h1>
            <p className="text-gray-400 text-sm">Anúncios otimizados com inteligência artificial</p>
          </div>
        </div>

        {config && config.provider !== 'groq' && config.provider !== 'gemini' && !config.api_key && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Settings className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-amber-500 font-medium">Configure sua IA</p>
              <p className="text-gray-400 text-sm">Para usar o Assertive, configure uma provedor de IA nas configurações.</p>
            </div>
            <Link href="/membros/assertive-ecommerce-ia/config" className="ml-auto bg-amber-500 text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-400 transition">
              Configurar
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Análises', value: analyses.length, icon: Search, color: 'text-blue-500' },
            { label: 'Rascunhos', value: drafts, icon: BarChart3, color: 'text-yellow-500' },
            { label: 'Publicados', value: published, icon: TrendingUp, color: 'text-green-500' },
            { label: 'Oportunidade', value: analyses.length > 0 ? '85%' : '—', icon: Target, color: 'text-purple-500' },
          ].map((stat, i) => (
            <div key={i} className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-gray-400 text-sm">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-4 mb-8">
          <Link
            href="/membros/assertive-ecommerce-ia/novo"
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-black px-6 py-3 rounded-xl font-bold hover:opacity-90 transition"
          >
            <Plus className="w-5 h-5" />
            Nova Análise
          </Link>
          <Link
            href="/membros/assertive-ecommerce-ia/publicados"
            className="flex items-center gap-2 bg-[#1c1c1c] border border-[#2a2a2a] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#222] transition"
          >
            <ExternalLink className="w-5 h-5" />
            Publicados
          </Link>
          <Link
            href="/membros/assertive-ecommerce-ia/config"
            className="flex items-center gap-2 bg-[#1c1c1c] border border-[#2a2a2a] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#222] transition"
          >
            <Settings className="w-5 h-5" />
            Configurações
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Últimas Análises
            </h2>
            {loading ? (
              <div className="text-gray-500 text-center py-8">Carregando...</div>
            ) : analyses.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma análise ainda</p>
                <Link href="/membros/assertive-ecommerce-ia/novo" className="text-amber-500 text-sm mt-2 inline-block">
                  Criar primeira análise →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {analyses.map(a => (
                  <Link
                    key={a.id}
                    href={`/membros/assertive-ecommerce-ia/analise/${a.id}`}
                    className="flex items-center justify-between p-3 bg-[#1c1c1c] rounded-lg hover:bg-[#222] transition"
                  >
                    <div>
                      <p className="text-white font-medium">{a.product_name}</p>
                      <p className="text-gray-500 text-xs">{new Date(a.created_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      a.status === 'ready' ? 'bg-green-500/20 text-green-400' :
                      a.status === 'analyzing' ? 'bg-yellow-500/20 text-yellow-400' :
                      a.status === 'error' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {a.status === 'ready' ? 'Pronta' : a.status === 'analyzing' ? 'Analisando' : a.status === 'error' ? 'Erro' : 'Pendente'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-500" />
              Últimos Anúncios
            </h2>
            {loading ? (
              <div className="text-gray-500 text-center py-8">Carregando...</div>
            ) : listings.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Nenhum anúncio criado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {listings.map(l => (
                  <div key={l.id} className="flex items-center justify-between p-3 bg-[#1c1c1c] rounded-lg">
                    <div>
                      <p className="text-white font-medium text-sm truncate max-w-[200px]">{l.title}</p>
                      <p className="text-gray-500 text-xs">R$ {l.price?.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        l.status === 'published' ? 'bg-green-500/20 text-green-400' :
                        l.status === 'draft' ? 'bg-gray-500/20 text-gray-400' :
                        l.status === 'publishing' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {l.status === 'published' ? 'Publicado' : l.status === 'draft' ? 'Rascunho' : l.status === 'publishing' ? 'Publicando' : 'Erro'}
                      </span>
                      {l.ml_item_id && (
                        <a href={`https://www.mercadolivre.com.br/item/${l.ml_item_id}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4 text-gray-400 hover:text-amber-500" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
