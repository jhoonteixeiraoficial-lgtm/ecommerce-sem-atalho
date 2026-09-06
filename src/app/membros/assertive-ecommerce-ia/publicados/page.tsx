'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ExternalLink, Loader2 } from 'lucide-react'

interface Listing {
  id: string
  title: string
  price: number
  status: string
  ml_item_id?: string
  published_at?: string
  created_at: string
}

export default function PublicadosPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('assertive_listings')
        .select('id, title, price, status, ml_item_id, published_at, created_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
      setListings(data || [])
      setLoading(false)
    }
    load()
  }, [supabase])

  return (
    <div className="min-h-screen bg-[#0c0c0c] p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-8">Anúncios Publicados</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>Nenhum anúncio publicado ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map(l => (
              <div key={l.id} className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{l.title}</p>
                  <p className="text-gray-500 text-sm">
                    R$ {l.price?.toFixed(2)} · Publicado em {l.published_at ? new Date(l.published_at).toLocaleDateString('pt-BR') : '—'}
                  </p>
                </div>
                {l.ml_item_id && (
                  <a
                    href={`https://www.mercadolivre.com.br/item/${l.ml_item_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-amber-500 hover:text-amber-400 transition"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
