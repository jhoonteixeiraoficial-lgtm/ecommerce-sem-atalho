'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Save, Loader2, ArrowLeft, ExternalLink } from 'lucide-react'

interface Listing {
  id: string
  title: string
  description: string
  price: number
  attributes: Record<string, string>
  photos: string[]
  status: string
  ml_item_id?: string
}

export default function EditorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [listing, setListing] = useState<Listing | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState(0)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'title' | 'description' | 'price' | 'attributes'>('title')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('assertive_listings').select('*').eq('id', id).single()
      if (data) {
        setListing(data)
        setTitle(data.title)
        setDescription(data.description)
        setPrice(data.price)
      }
    }
    load()
  }, [id, supabase])

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/assertive/listings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, price }),
    })
    setSaving(false)
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] p-6">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-bold text-white">Editar Anúncio</h1>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-amber-500 text-black px-4 py-2 rounded-lg font-medium hover:bg-amber-400 transition disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            {listing.ml_item_id && (
              <a
                href={`https://www.mercadolivre.com.br/item/${listing.ml_item_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-[#1c1c1c] text-white px-4 py-2 rounded-lg hover:bg-[#222] transition"
              >
                <ExternalLink className="w-4 h-4" /> Ver no ML
              </a>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {(['title', 'description', 'price', 'attributes'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t ? 'bg-amber-500 text-black' : 'bg-[#1c1c1c] text-gray-400 hover:text-white'
              }`}
            >
              {t === 'title' ? 'Título' : t === 'description' ? 'Descrição' : t === 'price' ? 'Preço' : 'Atributos'}
            </button>
          ))}
        </div>

        <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-6">
          {tab === 'title' && (
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Título ({title.length}/60 caracteres)</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value.slice(0, 60))}
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-4 text-white text-lg focus:outline-none focus:border-amber-500/50"
              />
              <div className="mt-2 h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 transition-all" style={{ width: `${(title.length / 60) * 100}%` }} />
              </div>
            </div>
          )}

          {tab === 'description' && (
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Descrição (HTML)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full h-96 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-4 text-white font-mono text-sm resize-none focus:outline-none focus:border-amber-500/50"
              />
              <div className="mt-4 p-4 bg-[#1c1c1c] rounded-lg">
                <p className="text-gray-400 text-xs mb-2">Preview:</p>
                <div className="text-white text-sm prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: description }} />
              </div>
            </div>
          )}

          {tab === 'price' && (
            <div>
              <label className="text-gray-400 text-sm mb-2 block">Preço (R$)</label>
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
                className="w-48 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-4 text-white text-2xl font-bold focus:outline-none focus:border-amber-500/50"
              />
            </div>
          )}

          {tab === 'attributes' && (
            <div className="space-y-3">
              {Object.entries(listing.attributes || {}).map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-gray-400 text-sm w-40 truncate">{k}</span>
                  <span className="text-white text-sm">{String(v)}</span>
                </div>
              ))}
              {Object.keys(listing.attributes || {}).length === 0 && (
                <p className="text-gray-500">Nenhum atributo salvo</p>
              )}
            </div>
          )}
        </div>

        {listing.photos?.length > 0 && (
          <div className="mt-6 bg-[#141414] border border-[#1c1c1c] rounded-xl p-6">
            <h3 className="text-white font-bold mb-4">Fotos ({listing.photos.length})</h3>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {listing.photos.map((p, i) => (
                <img key={i} src={p} alt="" className="w-full h-24 object-cover rounded-lg bg-[#1c1c1c]" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
