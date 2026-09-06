'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2, ArrowLeft, Store, Package } from 'lucide-react'

interface Listing {
  id: string
  title: string
  price: number | null
  status: string
  ml_item_id: string | null
  ml_permalink: string | null
  photos: string[]
  scores?: { total?: number }
  published_at?: string
  created_at: string
}

function brl(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PublicadosPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/assertive/listings?status=published')
      .then(r => r.json())
      .then(data => setListings(Array.isArray(data) ? data : []))
      .catch(() => setListings([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-[#0c0c0c] px-4 py-6 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/membros/assertive-ecommerce-ia"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-5 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Assertive IA
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold text-white mb-6">Anúncios publicados</h1>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : listings.length === 0 ? (
          <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-10 text-center">
            <Store className="w-9 h-9 text-amber-500/40 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Nenhum anúncio publicado ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map(l => (
              <div
                key={l.id}
                className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4 flex items-center gap-3"
              >
                {l.photos?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.photos[0]} alt="" className="w-14 h-14 rounded-lg object-cover bg-[#1c1c1c] shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-[#1c1c1c] flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-gray-600" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/membros/assertive-ecommerce-ia/editor/${l.id}`}
                    className="text-white text-sm font-medium line-clamp-2 hover:text-amber-400 transition"
                  >
                    {l.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-amber-400 text-sm">{brl(l.price)}</span>
                    <span className="text-gray-600 text-xs">
                      {l.published_at ? new Date(l.published_at).toLocaleDateString('pt-BR') : ''}
                    </span>
                    {typeof l.scores?.total === 'number' && (
                      <span className="text-gray-500 text-[10px]">Score {l.scores.total}</span>
                    )}
                  </div>
                </div>

                {(l.ml_permalink || l.ml_item_id) && (
                  <a
                    href={l.ml_permalink || `https://www.mercadolivre.com.br/item/${l.ml_item_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-amber-500 hover:text-amber-400 transition shrink-0"
                    aria-label="Abrir no Mercado Livre"
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
