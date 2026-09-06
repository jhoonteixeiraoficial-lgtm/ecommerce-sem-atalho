'use client'

import { useState, useEffect, useCallback, use, useRef } from 'react'
import Link from 'next/link'
import {
  Loader2, AlertCircle, CheckCircle2, ArrowLeft, ShieldCheck, Upload, X,
  Trophy, Package, Tag, ImageIcon, FileText, ListChecks, Camera,
  ExternalLink, Sparkles, TrendingUp, Truck, Store, ChevronDown, Plug,
} from 'lucide-react'

interface ListingAttribute {
  id: string
  name: string
  value_name: string
  value_id?: string
  tier: string
  source: string
}

interface PendingQuestion {
  field: string
  label: string
  why: string
  suggestion?: string
  options?: string[]
}

interface ScoreDetail { score: number; max: number; label: string; notes: string[] }

interface Listing {
  id: string
  analysis_id: string
  title: string
  description: string
  price: number | null
  category_id: string
  family_name: string
  status: string
  photos: string[]
  available_quantity: number
  ml_item_id: string | null
  ml_permalink: string | null
  attributes: {
    list?: ListingAttribute[]
    alternatives?: string[]
    improvements?: string[]
    price_rationale?: string
    missing?: PendingQuestion[]
  }
  image_plan: Array<{ order: number; title: string; description: string; required: boolean }>
  completeness: {
    percent: number
    filled: number
    applicable: number
    required_total: number
    required_filled: number
    missing_required: string[]
    missing_recommended: string[]
  }
  scores: {
    total: number
    seo: ScoreDetail
    technical_sheet: ScoreDetail
    images: ScoreDetail
    description: ScoreDetail
    attributes: ScoreDetail
  }
  validation: {
    valid?: boolean
    checked_at?: string
    issues?: Array<{ code: string; message: string; severity: string }>
  }
}

interface Competitor {
  title: string
  price: number | null
  strength_score: number
  strength_evidence: string[]
  highlight_position: number | null
  attribute_count: number
  picture_count: number
  seller: { nickname: string; power_seller_status: string | null; transactions_total: number | null } | null
  shipping: { free_shipping: boolean; fulfillment: boolean }
}

interface Research {
  category_name?: string
  competitors?: Competitor[]
  price_stats?: { min: number; max: number; median: number; sample_size: number } | null
  regional?: { status: string; note: string; states: Array<{ state: string; count: number }>; fulfillment_pct: number; free_shipping_pct: number }
  warnings?: string[]
}

function brl(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function scoreColor(n: number) {
  if (n >= 85) return 'text-emerald-400'
  if (n >= 65) return 'text-amber-400'
  return 'text-red-400'
}

function scoreBar(n: number) {
  if (n >= 85) return 'bg-emerald-500'
  if (n >= 65) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [listing, setListing] = useState<Listing | null>(null)
  const [research, setResearch] = useState<Research | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsML, setNeedsML] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showConfirm, setShowConfirm] = useState(false)
  const [openSection, setOpenSection] = useState<string | null>('missing')
  const uploadRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('1')

  const load = useCallback(async () => {
    const res = await fetch(`/api/assertive/listings/${id}`)
    if (!res.ok) { setError('Anúncio não encontrado.'); setLoading(false); return }
    const data: Listing = await res.json()
    setListing(data)
    setTitle(data.title || '')
    setDescription(data.description || '')
    setPrice(data.price != null ? String(data.price) : '')
    setQuantity(String(data.available_quantity || 1))

    const aRes = await fetch(`/api/assertive/analyses/${data.analysis_id}`)
    if (aRes.ok) {
      const aData = await aRes.json()
      setResearch(aData.analysis?.research || null)
    }
    setLoading(false)
  }, [id])

  // load() é assíncrono: o primeiro setState só ocorre após o await, nunca durante o render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'ml-connected' && e.data.ok) { setNeedsML(false); setError(null) }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  async function connectML() {
    const res = await fetch('/api/assertive/ml/connect', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.open(data.url, 'ml-oauth', 'width=520,height=720')
  }

  async function save(patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/assertive/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) setError(data.error || 'Falha ao salvar.')
    await load()
    setSaving(false)
  }

  async function submitAnswers() {
    const filled = Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim()))
    if (!Object.keys(filled).length) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/assertive/listings/${id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: filled }),
    })
    const data = await res.json()
    if (!res.ok) {
      if (data.code === 'ML_NOT_CONNECTED') setNeedsML(true)
      setError(data.error || 'Falha ao aplicar as respostas.')
    } else if (data.rejected?.length) {
      setError(`Alguns valores não foram aceitos: ${data.rejected.join('; ')}`)
    }
    setAnswers({})
    await load()
    setSaving(false)
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length || !listing) return
    setSaving(true)
    const form = new FormData()
    Array.from(files).slice(0, 8).forEach(f => form.append('files', f, f.name))
    const res = await fetch('/api/assertive/upload', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Falha no envio.'); setSaving(false); return }
    await save({ photos: [...(listing.photos || []), ...data.urls].slice(0, 12) })
  }

  async function removePhoto(url: string) {
    if (!listing) return
    await save({ photos: listing.photos.filter(p => p !== url) })
  }

  async function validate() {
    setValidating(true)
    setError(null)
    setNeedsML(false)
    const res = await fetch(`/api/assertive/listings/${id}/validate`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      if (data.code === 'ML_NOT_CONNECTED') setNeedsML(true)
      setError(data.error || 'Falha na validação.')
    }
    await load()
    setValidating(false)
  }

  async function publish() {
    setPublishing(true)
    setShowConfirm(false)
    setError(null)
    const res = await fetch(`/api/assertive/listings/${id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
    const data = await res.json()
    if (!res.ok) {
      if (data.code === 'ML_NOT_CONNECTED') setNeedsML(true)
      setError(data.error || 'Falha ao publicar.')
      if (data.issues?.length) {
        setError(`${data.error} ${data.issues.map((i: { message: string }) => i.message).join(' | ')}`)
      }
    }
    await load()
    setPublishing(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center px-4">
        <p className="text-gray-400">{error || 'Anúncio não encontrado.'}</p>
      </div>
    )
  }

  const attrs = listing.attributes?.list || []
  const missing = listing.attributes?.missing || []
  const scores = listing.scores
  const comp = listing.completeness
  const validation = listing.validation
  const isPublished = listing.status === 'published'
  const readyToPublish = validation?.valid === true && !isPublished
  const competitors = research?.competitors || []
  const blockingCount = comp?.missing_required?.length || 0

  const scoreRows: Array<[string, ScoreDetail | undefined, typeof Tag]> = [
    ['SEO', scores?.seo, TrendingUp],
    ['Ficha técnica', scores?.technical_sheet, ListChecks],
    ['Imagens', scores?.images, ImageIcon],
    ['Descrição', scores?.description, FileText],
    ['Atributos', scores?.attributes, Package],
  ]

  return (
    <div className="min-h-screen bg-[#0c0c0c] px-4 py-6 sm:p-6 pb-28 lg:pb-6">
      <div className="max-w-6xl mx-auto">
        <Link
          href="/membros/assertive-ecommerce-ia"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-5 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Meus anúncios
        </Link>

        {isPublished && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-5 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="flex-1">
              <p className="text-emerald-300 text-sm font-medium">Anúncio publicado no Mercado Livre</p>
              <p className="text-emerald-300/60 text-xs mt-0.5">Código: {listing.ml_item_id}</p>
            </div>
            {listing.ml_permalink && (
              <a
                href={listing.ml_permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-emerald-500 text-black text-sm font-semibold px-3 py-2 rounded-lg hover:bg-emerald-400 transition"
              >
                Ver <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-300 text-sm">{error}</p>
                {needsML && (
                  <button
                    onClick={connectML}
                    className="mt-3 inline-flex items-center gap-2 bg-amber-500 text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-400 transition"
                  >
                    <Plug className="w-4 h-4" /> Conectar Mercado Livre
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_340px] gap-5">
          {/* ============ COLUNA PRINCIPAL ============ */}
          <div className="space-y-5">
            {/* fotos */}
            <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-amber-500" /> Fotos do anúncio
                </h2>
                <span className="text-gray-500 text-xs">{listing.photos.length}/12</span>
              </div>

              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => { uploadPhotos(e.target.files); e.target.value = '' }}
              />

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {listing.photos.map((url, i) => (
                  <div key={url} className="relative aspect-square rounded-lg overflow-hidden bg-[#1c1c1c]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 bg-black/70 text-amber-400 text-[10px] px-1.5 py-0.5 rounded">
                        Principal
                      </span>
                    )}
                    {!isPublished && (
                      <button
                        onClick={() => removePhoto(url)}
                        aria-label="Remover"
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 hover:bg-red-500 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                {!isPublished && listing.photos.length < 12 && (
                  <button
                    onClick={() => uploadRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-[#2a2a2a] rounded-lg flex flex-col items-center justify-center gap-1 text-gray-500 hover:border-amber-500/50 hover:text-white transition"
                  >
                    <Upload className="w-5 h-5" />
                    <span className="text-[10px]">Adicionar</span>
                  </button>
                )}
              </div>

              {listing.image_plan?.length > 0 && (
                <details className="mt-4 group">
                  <summary className="flex items-center gap-2 text-amber-400/80 text-sm cursor-pointer list-none">
                    <Camera className="w-4 h-4" />
                    Plano de fotos recomendado
                    <ChevronDown className="w-4 h-4 group-open:rotate-180 transition" />
                  </summary>
                  <ol className="mt-3 space-y-2">
                    {listing.image_plan.map(step => (
                      <li key={step.order} className="flex gap-3 text-sm">
                        <span className={`w-5 h-5 rounded flex items-center justify-center text-[11px] shrink-0 ${
                          listing.photos.length >= step.order
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-[#1c1c1c] text-gray-500'
                        }`}>
                          {step.order}
                        </span>
                        <div>
                          <p className="text-gray-300">{step.title}{step.required && <span className="text-amber-500 ml-1">*</span>}</p>
                          <p className="text-gray-500 text-xs">{step.description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </section>

            {/* título */}
            <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <Tag className="w-4 h-4 text-amber-500" /> Título
                </h2>
                <span className={`text-xs ${title.length > 60 ? 'text-red-400' : 'text-gray-500'}`}>
                  {title.length}/60
                </span>
              </div>
              <textarea
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={() => title !== listing.title && save({ title })}
                disabled={isPublished}
                rows={2}
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white resize-none focus:outline-none focus:border-amber-500/50 disabled:opacity-60"
              />
              {(listing.attributes?.alternatives?.length ?? 0) > 0 && !isPublished && (
                <div className="mt-3">
                  <p className="text-gray-500 text-xs mb-2">Alternativas geradas:</p>
                  <div className="space-y-2">
                    {listing.attributes.alternatives!.map((alt, i) => (
                      <button
                        key={i}
                        onClick={() => { setTitle(alt); save({ title: alt }) }}
                        className="w-full text-left bg-[#1a1a1a] hover:bg-[#222] border border-[#242424] rounded-lg px-3 py-2 text-sm text-gray-300 transition"
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* preço e estoque */}
            <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
              <h2 className="text-white font-semibold flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-amber-500" /> Preço e estoque
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 text-xs mb-1.5">Preço (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    onBlur={() => {
                      const n = parseFloat(price)
                      if (!Number.isNaN(n) && n !== listing.price) save({ price: n })
                    }}
                    disabled={isPublished}
                    className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1.5">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(quantity, 10)
                      if (n > 0 && n !== listing.available_quantity) save({ available_quantity: n })
                    }}
                    disabled={isPublished}
                    className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-amber-500/50 disabled:opacity-60"
                  />
                </div>
              </div>

              {research?.price_stats && (
                <div className="mt-4 bg-[#1a1a1a] rounded-lg p-3">
                  <p className="text-gray-400 text-xs mb-2">
                    Preços reais de {research.price_stats.sample_size} ofertas analisadas
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <div><span className="text-gray-500 text-xs block">Menor</span><span className="text-white">{brl(research.price_stats.min)}</span></div>
                    <div><span className="text-gray-500 text-xs block">Mediana</span><span className="text-amber-400">{brl(research.price_stats.median)}</span></div>
                    <div><span className="text-gray-500 text-xs block">Maior</span><span className="text-white">{brl(research.price_stats.max)}</span></div>
                  </div>
                </div>
              )}
              {listing.attributes?.price_rationale && (
                <p className="text-gray-500 text-xs mt-3 leading-relaxed">{listing.attributes.price_rationale}</p>
              )}
            </section>

            {/* descrição */}
            <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-500" /> Descrição
                </h2>
                <span className="text-gray-500 text-xs">{description.length} caracteres</span>
              </div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                onBlur={() => description !== listing.description && save({ description })}
                disabled={isPublished}
                rows={14}
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-sm leading-relaxed resize-y focus:outline-none focus:border-amber-500/50 disabled:opacity-60"
              />
            </section>

            {/* ficha técnica */}
            <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-amber-500" /> Ficha técnica
                </h2>
                <span className="text-gray-500 text-xs">{attrs.length} preenchidos</span>
              </div>

              {attrs.length > 0 ? (
                <div className="divide-y divide-[#1f1f1f]">
                  {attrs.map(a => (
                    <div key={a.id} className="flex items-start justify-between gap-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-gray-400 text-sm truncate">{a.name}</span>
                        {(a.tier === 'required' || a.tier === 'catalog_required') && (
                          <span className="text-[10px] text-amber-500/70 shrink-0">obrigatório</span>
                        )}
                      </div>
                      <span className="text-white text-sm text-right shrink-0 max-w-[55%]">{a.value_name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Nenhum atributo preenchido ainda.</p>
              )}
            </section>
          </div>

          {/* ============ COLUNA LATERAL ============ */}
          <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            {/* score */}
            <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h2 className="text-white font-semibold">Score Assertive</h2>
              </div>

              <div className="text-center mb-5">
                <div className={`text-5xl font-bold ${scoreColor(scores?.total ?? 0)}`}>
                  {scores?.total ?? 0}
                </div>
                <p className="text-gray-500 text-xs mt-1">de 100</p>
              </div>

              <div className="space-y-3">
                {scoreRows.map(([label, detail, Icon]) => (
                  <div key={label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 text-gray-400">
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </span>
                      <span className={scoreColor(detail?.score ?? 0)}>{detail?.score ?? 0}</span>
                    </div>
                    <div className="h-1.5 bg-[#1c1c1c] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${scoreBar(detail?.score ?? 0)}`}
                        style={{ width: `${Math.min(detail?.score ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-4 border-t border-[#1f1f1f]">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Completude da ficha</span>
                  <span className={scoreColor(comp?.percent ?? 0)}>{comp?.percent ?? 0}%</span>
                </div>
                <p className="text-gray-500 text-xs mt-1">
                  {comp?.filled ?? 0} de {comp?.applicable ?? 0} atributos aplicáveis
                </p>
              </div>
            </section>

            {/* campos faltantes */}
            {missing.length > 0 && !isPublished && (
              <section className="bg-[#141414] border border-amber-500/20 rounded-xl p-5">
                <button
                  onClick={() => setOpenSection(openSection === 'missing' ? null : 'missing')}
                  className="w-full flex items-center justify-between mb-1"
                >
                  <h2 className="text-white font-semibold text-left flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    Faltam {missing.length} informações
                  </h2>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition ${openSection === 'missing' ? 'rotate-180' : ''}`} />
                </button>

                {blockingCount > 0 && (
                  <p className="text-amber-400/80 text-xs mb-3">
                    {blockingCount} obrigatória(s) para publicar
                  </p>
                )}

                {openSection === 'missing' && (
                  <>
                    <div className="space-y-3 mt-3">
                      {missing.slice(0, 10).map(q => (
                        <div key={q.field}>
                          <label className="block text-gray-300 text-sm mb-1">
                            {q.label}
                            {comp?.missing_required?.includes(q.label) && (
                              <span className="text-amber-500 ml-1">*</span>
                            )}
                          </label>
                          {q.options && q.options.length > 0 ? (
                            <select
                              value={answers[q.field] ?? ''}
                              onChange={e => setAnswers(a => ({ ...a, [q.field]: e.target.value }))}
                              className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                            >
                              <option value="">Selecione</option>
                              {q.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input
                              value={answers[q.field] ?? ''}
                              onChange={e => setAnswers(a => ({ ...a, [q.field]: e.target.value }))}
                              placeholder={q.suggestion || q.why}
                              className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={submitAnswers}
                      disabled={saving || !Object.values(answers).some(v => v.trim())}
                      className="w-full mt-4 bg-amber-500 text-black py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-400 transition disabled:opacity-40"
                    >
                      {saving ? 'Salvando...' : 'Salvar informações'}
                    </button>
                  </>
                )}
              </section>
            )}

            {/* validação e publicação */}
            <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
              <h2 className="text-white font-semibold flex items-center gap-2 mb-4">
                <ShieldCheck className="w-4 h-4 text-amber-500" /> Publicação
              </h2>

              {validation?.checked_at && (
                <div className={`rounded-lg p-3 mb-4 ${
                  validation.valid ? 'bg-emerald-500/10 border border-emerald-500/25' : 'bg-red-500/10 border border-red-500/25'
                }`}>
                  <p className={`text-sm font-medium flex items-center gap-2 ${
                    validation.valid ? 'text-emerald-300' : 'text-red-300'
                  }`}>
                    {validation.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {validation.valid ? 'Validado pelo Mercado Livre' : 'Ajustes necessários'}
                  </p>
                  {!validation.valid && validation.issues && (
                    <ul className="mt-2 space-y-1">
                      {validation.issues.slice(0, 6).map((issue, i) => (
                        <li key={i} className="text-red-300/80 text-xs">• {issue.message}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {!isPublished && (
                <div className="space-y-2">
                  <button
                    onClick={validate}
                    disabled={validating || saving}
                    className="w-full bg-[#1c1c1c] text-white py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#242424] transition disabled:opacity-40"
                  >
                    {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    {validating ? 'Validando...' : 'Validar no Mercado Livre'}
                  </button>

                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={!readyToPublish || publishing}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-black py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                    {publishing ? 'Publicando...' : 'Publicar no Mercado Livre'}
                  </button>

                  {!readyToPublish && (
                    <p className="text-gray-500 text-xs text-center pt-1">
                      Valide o anúncio para liberar a publicação
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* referências */}
            {competitors.length > 0 && (
              <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
                <h2 className="text-white font-semibold flex items-center gap-2 mb-1">
                  <Trophy className="w-4 h-4 text-amber-500" /> Referências analisadas
                </h2>
                <p className="text-gray-500 text-xs mb-4">
                  {competitors.length} anúncios fortes {research?.category_name ? `em ${research.category_name}` : ''}
                </p>

                <div className="space-y-3">
                  {competitors.slice(0, 5).map((c, i) => (
                    <div key={i} className="bg-[#1a1a1a] rounded-lg p-3">
                      <p className="text-gray-200 text-xs leading-snug line-clamp-2">{c.title}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {c.price !== null && (
                          <span className="text-amber-400 text-sm font-medium">{brl(c.price)}</span>
                        )}
                        {c.highlight_position !== null && (
                          <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">
                            #{c.highlight_position} mais vendidos
                          </span>
                        )}
                        {c.shipping?.fulfillment && (
                          <span className="text-[10px] bg-blue-500/15 text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Truck className="w-2.5 h-2.5" /> Full
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-[10px] mt-1.5">
                        {c.attribute_count} atributos · {c.picture_count} fotos
                        {c.seller?.power_seller_status ? ` · ${c.seller.power_seller_status}` : ''}
                      </p>
                    </div>
                  ))}
                </div>

                {research?.regional && research.regional.states.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#1f1f1f]">
                    <p className="text-gray-400 text-xs font-medium mb-2">Radar regional</p>
                    <p className="text-gray-500 text-[11px] leading-relaxed mb-2">
                      {research.regional.fulfillment_pct}% usam Full · {research.regional.free_shipping_pct}% frete grátis
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {research.regional.states.slice(0, 5).map(s => (
                        <span key={s.state} className="text-[10px] bg-[#1c1c1c] text-gray-400 px-2 py-0.5 rounded">
                          {s.state} ({s.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* melhorias */}
            {(listing.attributes?.improvements?.length ?? 0) > 0 && (
              <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
                <h2 className="text-white font-semibold flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-emerald-500" /> Diferenciais deste anúncio
                </h2>
                <ul className="space-y-2">
                  {listing.attributes.improvements!.map((imp, i) => (
                    <li key={i} className="flex gap-2 text-gray-400 text-xs leading-relaxed">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      {imp}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* confirmação de publicação */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#141414] border border-[#2a2a2a] rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-white font-bold text-lg mb-2">Publicar anúncio real?</h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-5">
              O anúncio será criado na sua conta do Mercado Livre e ficará visível para compradores.
            </p>
            <div className="bg-[#1a1a1a] rounded-lg p-3 mb-5">
              <p className="text-white text-sm line-clamp-2">{listing.title}</p>
              <p className="text-amber-400 font-semibold mt-1">{brl(listing.price)}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-[#1c1c1c] text-gray-300 py-2.5 rounded-lg font-medium text-sm hover:bg-[#242424] transition"
              >
                Cancelar
              </button>
              <button
                onClick={publish}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 text-black py-2.5 rounded-lg font-bold text-sm hover:opacity-90 transition"
              >
                Publicar agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
