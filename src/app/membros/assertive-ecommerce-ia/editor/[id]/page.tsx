'use client'

import { useState, useEffect, useCallback, use, useRef } from 'react'
import Link from 'next/link'
import { evaluateEditorReadiness } from '@/lib/assertive/publication-readiness'
import { resolveMarketplacePublication } from '@/lib/assertive/marketplace-publication'
import type { MLItemPayload } from '@/lib/assertive/publisher'
import {
  Loader2, AlertCircle, CheckCircle2, ArrowLeft, ShieldCheck, Upload, X,
  Trophy, Package, Tag, ImageIcon, FileText, ListChecks, Camera, Search,
  ExternalLink, Sparkles, TrendingUp, Truck, Store, ChevronDown, Plug,
  ArrowUp, ArrowDown, Star, Info, AlertTriangle,
} from 'lucide-react'

interface ListingAttribute {
  id: string
  name: string
  value_name: string
  value_id?: string
  tier: string
  source: string
  status?: string
  evidence?: string
  source_url?: string
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  CONFIRMED: { label: 'confirmado', className: 'text-emerald-400/80' },
  USER_OVERRIDE: { label: 'você informou', className: 'text-blue-300/80' },
  AUTO_FILLED: { label: 'pesquisado', className: 'text-amber-400/70' },
  NEEDS_CONFIRMATION: { label: 'confira', className: 'text-orange-400/80' },
  CONFLICT: { label: 'fontes divergem', className: 'text-red-400/80' },
}

interface PendingQuestion {
  field: string
  label: string
  why: string
  suggestion?: string
  options?: string[]
  blocking?: boolean
}

interface ScoreDetail { score: number; max: number; label: string; notes: string[] }

interface PublicationRequirementsView {
  requirements: Array<{
    attribute_id: string
    name: string
    level: 'blocking_required' | 'recommended' | 'optional' | 'not_applicable'
    source: string
    ml_message?: string
    suggested_value?: { value_id?: string; value_name?: string }
    is_blocker: boolean
    current_value?: string
  }>
  blockers: Array<{
    attribute_id: string
    name: string
    level: string
    ml_message?: string
    suggested_value?: { value_id?: string; value_name?: string }
  }>
  recommended_missing: Array<{ attribute_id: string; name: string }>
  all_clear: boolean
  total_attributes: number
  filled_count: number
  blocker_count: number
  account_warnings: Array<{
    code: string
    message: string
    category: 'account' | 'product' | 'shipping' | 'unknown'
    user_action_required: boolean
    friendly_message: string
  }>
  product_payload_ready: boolean
}

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
  publication_status?: string | null
  ml_response?: {
    reconciliation?: { status?: 'confirmed' | 'pending'; checked_at?: string; error?: string } | null
    marketplace_item?: {
      title?: string | null
      price?: number | null
      status?: string | null
      permalink?: string | null
      shipping?: { mode?: string | null; free_shipping?: boolean | null; logistic_type?: string | null } | null
    } | null
  } | null
  attributes: {
    list?: ListingAttribute[]
    alternatives?: string[]
    improvements?: string[]
    price_rationale?: string
    missing?: PendingQuestion[]
    blocking_questions?: PendingQuestion[]
    autofill?: {
      applicable: number
      already_filled: number
      from_exact_product: number
      from_derivation: number
      from_web: number
      inferred_needs_confirmation: number
      not_applicable: number
      unknown: number
      user_input_required: number
      auto_fill_percent: number
    }
    research_sources?: Array<{ title: string; url: string }>
    web_research?: { used: boolean; reason?: string }
    reasoning_provider?: string
    photo_metadata?: Array<{
      asset_id?: string
      parent_asset_id?: string
      url: string
      role: 'MAIN' | 'DETAIL' | 'PACKAGING' | 'LIFESTYLE' | 'INFORMATIONAL'
      source: 'USER' | 'COMPETITOR' | 'SOURCE_URL' | 'AI_ENHANCED' | 'AI_GENERATED'
      source_ref?: string
      source_url?: string
      score: number
      ai_enhanced: boolean
      fidelity_status?: 'ACCEPT' | 'REVIEW' | 'REJECT'
      label?: string
      position: number
    }>
    photo_stats?: {
      total_found: number
      from_exact_product: number
      from_competitor: number
      classified: number
      deduplicated: number
    }
    // title control
    title_control_mode?: 'seller' | 'user_product'
    predicted_title?: string
    ml_final_title?: string
    auto_appended_attributes?: string[]
    publication_requirements?: PublicationRequirementsView | null
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
    ml_valid?: boolean
    status_code?: number
    checked_at?: string
    issues?: Array<{ code: string; message: string; severity: 'error' | 'warning' }>
  }
  publication_requirements?: PublicationRequirementsView
  validated_payload?: MLItemPayload | null
  validated_payload_hash?: string | null
}

interface Competitor {
  title: string
  price: number | null
  competitive_reference_strength: number
  product_match_confidence: number
  match_class: 'EXACT_PRODUCT' | 'COMPARABLE_PRODUCT' | 'CATEGORY_REFERENCE'
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
  exact_product_count?: number
  price_basis?: 'EXACT_PRODUCT' | 'COMPARABLE_PRODUCT' | 'NONE'
  price_stats?: { min: number; max: number; median: number; sample_size: number } | null
  regional?: { status: string; note: string; states: Array<{ state: string; count: number }>; fulfillment_pct: number; free_shipping_pct: number }
  warnings?: string[]
}

function brl(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const FIELD_LABELS: Record<string, string> = {
  SELLER_PACKAGE_HEIGHT: 'Altura da embalagem',
  SELLER_PACKAGE_WIDTH: 'Largura da embalagem',
  SELLER_PACKAGE_LENGTH: 'Comprimento da embalagem',
  SELLER_PACKAGE_WEIGHT: 'Peso da embalagem',
  GTIN: 'Código universal de produto (GTIN/EAN)',
  COLOR: 'Cor do produto',
  BRAND: 'Marca do produto',
  MODEL: 'Modelo',
}

const FIELD_REASONS: Record<string, string> = {
  SELLER_PACKAGE_HEIGHT: 'Essa informação depende da embalagem utilizada no envio e não pôde ser confirmada automaticamente.',
  SELLER_PACKAGE_WIDTH: 'Essa informação depende da embalagem utilizada no envio e não pôde ser confirmada automaticamente.',
  SELLER_PACKAGE_LENGTH: 'Essa informação depende da embalagem utilizada no envio e não pôde ser confirmada automaticamente.',
  SELLER_PACKAGE_WEIGHT: 'Essa informação depende da embalagem utilizada no envio e não pôde ser confirmada automaticamente.',
  GTIN: 'O código de barras é necessário para publicar este produto. O Assertive não encontrou um GTIN válido automaticamente.',
  COLOR: 'A cor do produto é obrigatória para publicar.',
  BRAND: 'A marca do produto é obrigatória para publicar.',
  MODEL: 'O modelo do produto é obrigatório para publicar.',
}

function formatFieldName(blocker: { attribute_id: string; name: string }): string {
  return FIELD_LABELS[blocker.attribute_id] || blocker.name
}

function getFieldReason(attributeId: string): string {
  return FIELD_REASONS[attributeId] || 'O Mercado Livre exige essa informação para publicar.'
}

function formatBlockerMessage(issue: { code: string; message: string }): string {
  // Traduzir mensagens comuns do ML para português amigável
  const translations: Array<{ test: RegExp; msg: string }> = [
    { test: /seller_package.*dimensions/i, msg: 'Medidas da embalagem em formato inválido. Use: 10 cm, 200 g.' },
    { test: /product_identifier.*invalid_format/i, msg: 'GTIN com formato inválido.' },
    { test: /attributes.*required/i, msg: 'Atributo obrigatório faltando.' },
    { test: /picture_not_found/i, msg: 'Imagem não encontrada no ML.' },
    { test: /listing_type.*unavailable/i, msg: 'Tipo de anúncio não disponível.' },
    { test: /requiresPictures/i, msg: 'Fotos são obrigatórias para este tipo de anúncio.' },
  ]
  for (const t of translations) {
    if (t.test.test(issue.code) || t.test.test(issue.message)) return t.msg
  }
  return issue.message
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

  // Gallery states
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 })
  const [dragState, setDragState] = useState<{ dragging: number | null; over: number | null }>({ dragging: null, over: null })

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

  useEffect(() => {
    if (!lightbox.open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox({ open: false, index: 0 })
      else if (e.key === 'ArrowLeft') moveLightbox('prev')
      else if (e.key === 'ArrowRight') moveLightbox('next')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightbox.open])

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

  function orderedPhotoMetadata(urls: string[], metadata = listing?.attributes.photo_metadata || []) {
    return urls.map((url, position) => {
      const current = metadata.find(item => item.url === url)
      return {
        ...current,
        url,
        role: position === 0 ? 'MAIN' as const : current?.role === 'MAIN' ? 'DETAIL' as const : current?.role || 'DETAIL' as const,
        source: current?.source || 'USER' as const,
        score: current?.score || 200 - position,
        ai_enhanced: current?.ai_enhanced || false,
        position,
      }
    })
  }

  async function saveGallery(urls: string[], metadata = listing?.attributes.photo_metadata || []) {
    const ordered = orderedPhotoMetadata(urls, metadata)
    const wasAssetized = Boolean(listing?.attributes.photo_metadata?.length)
      && listing!.attributes.photo_metadata!.every(item => item.asset_id)
    const isAssetized = ordered.length ? ordered.every(item => item.asset_id) : wasAssetized
    if (isAssetized) {
      await save({
        listing_images: ordered.map(item => ({
          asset_id: item.asset_id,
          position: item.position,
          role: item.role,
        })),
      })
      return
    }
    await save({ photos: urls, photo_metadata: ordered })
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
    } else {
      if (data.rejected?.length) {
        setError(`Alguns valores não foram aceitos: ${data.rejected.join('; ')}`)
      }
      const validationResponse = await fetch(`/api/assertive/listings/${id}/validate`, { method: 'POST' })
      if (!validationResponse.ok) {
        const validationData = await validationResponse.json()
        if (validationData.code === 'ML_NOT_CONNECTED') setNeedsML(true)
        setError(validationData.error || 'As respostas foram salvas, mas a validação automática falhou.')
      }
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
    const uploadedMetadata = (data.urls as string[]).map((url, index) => {
      const asset = Array.isArray(data.assets) ? data.assets[index] : null
      return {
        asset_id: asset?.rendition_asset_id as string | undefined,
        parent_asset_id: asset?.original_asset_id as string | undefined,
        url,
        role: 'DETAIL' as const,
        source: 'USER' as const,
        source_ref: asset?.original_asset_id as string | undefined,
        score: 200,
        ai_enhanced: false,
        fidelity_status: asset ? 'ACCEPT' as const : undefined,
        label: asset ? 'Original normalizada' : undefined,
        position: 0,
      }
    })
    const urls = [...(listing.photos || []), ...(data.urls as string[])].slice(0, 12)
    await saveGallery(urls, [...(listing.attributes.photo_metadata || []), ...uploadedMetadata])
  }

  async function removePhoto(url: string) {
    if (!listing) return
    const newPhotos = listing.photos.filter(p => p !== url)
    const meta = listing.attributes.photo_metadata?.filter(m => m.url !== url) || []
    await saveGallery(newPhotos, meta)
  }

  async function setPrincipalPhoto(url: string) {
    if (!listing) return
    const newPhotos = [url, ...listing.photos.filter(p => p !== url)]
    await saveGallery(newPhotos)
  }

  async function movePhoto(url: string, direction: 'up' | 'down') {
    if (!listing) return
    const idx = listing.photos.indexOf(url)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= listing.photos.length) return
    const newPhotos = [...listing.photos]
    ;[newPhotos[idx], newPhotos[newIdx]] = [newPhotos[newIdx], newPhotos[idx]]
    await saveGallery(newPhotos)
  }

  function handleDragStart(e: React.PointerEvent, index: number) {
    e.preventDefault()
    setDragState({ dragging: index, over: null })
  }

  function handleDragOver(e: React.PointerEvent, index: number) {
    e.preventDefault()
    setDragState(prev => ({ ...prev, over: index }))
  }

  async function handleDragEnd() {
    if (!listing || dragState.dragging === null || dragState.over === null || dragState.dragging === dragState.over) {
      setDragState({ dragging: null, over: null })
      return
    }
    const newPhotos = [...listing.photos]
    const [moved] = newPhotos.splice(dragState.dragging, 1)
    newPhotos.splice(dragState.over, 0, moved)
    setDragState({ dragging: null, over: null })
    await saveGallery(newPhotos)
  }

  async function downloadImage(url: string, index: number) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg'
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `assertive-${(listing?.family_name || 'produto').toLowerCase().replace(/\s+/g, '-')}-${String(index + 1).padStart(2, '0')}.${ext}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    } catch {
      window.open(url, '_blank')
    }
  }

  function moveLightbox(direction: 'prev' | 'next') {
    if (!listing) return
    const total = listing.photos.length
    if (total <= 1) return
    setLightbox(prev => ({
      open: true,
      index: direction === 'prev'
        ? (prev.index - 1 + total) % total
        : (prev.index + 1) % total,
    }))
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
  const missingRaw = listing.attributes?.missing || []
  const pubReqs = listing.attributes?.publication_requirements || listing.publication_requirements
  const allBlockers = pubReqs?.blockers || []
  const blockingQuestions = listing.attributes?.blocking_questions?.length
    ? listing.attributes.blocking_questions.slice(0, 3)
    : allBlockers.slice(0, 3).map(blocker => ({
        field: blocker.attribute_id,
        label: formatFieldName(blocker),
        why: blocker.ml_message || getFieldReason(blocker.attribute_id),
        suggestion: blocker.suggested_value?.value_name,
        options: undefined,
        blocking: true,
      }))
  const accountWarnings = pubReqs?.account_warnings || []
  const scores = listing.scores
  const comp = listing.completeness
  const validation = listing.validation
  const isPublished = listing.status === 'published'
  const isPublishing = listing.status === 'publishing'
  const marketplacePublication = resolveMarketplacePublication(listing)
  const publishedNeedsAttention = marketplacePublication.reconciliation === 'pending'
    || (marketplacePublication.status !== null && marketplacePublication.status !== 'active')
  const editorReadiness = evaluateEditorReadiness({
    ...listing,
    publication_requirements: pubReqs,
  })
  const canPublish = editorReadiness.canPublish
  const competitors = research?.competitors || []

  // Ordenar missing: obrigatórios primeiro, depois recommended, depois optional
  const REQUIRED_FIELDS = new Set([
    'SELLER_PACKAGE_HEIGHT', 'SELLER_PACKAGE_WIDTH', 'SELLER_PACKAGE_LENGTH', 'SELLER_PACKAGE_WEIGHT',
    'GTIN', 'COLOR', 'BRAND', 'MODEL',
  ])
  const missing = [...missingRaw].sort((a, b) => {
    const aRequired = REQUIRED_FIELDS.has(a.field) || comp?.missing_required?.includes(a.label)
    const bRequired = REQUIRED_FIELDS.has(b.field) || comp?.missing_required?.includes(b.label)
    if (aRequired && !bRequired) return -1
    if (!aRequired && bRequired) return 1
    return 0
  })

  const scoreRows: Array<[string, ScoreDetail | undefined, typeof Tag]> = [
    ['SEO', scores?.seo, TrendingUp],
    ['Ficha técnica', scores?.technical_sheet, ListChecks],
    ['Imagens', scores?.images, ImageIcon],
    ['Descrição', scores?.description, FileText],
    ['Atributos', scores?.attributes, Package],
  ]

  // ============================================================
  // PREVIEW GATE: Se existem blockers que o Assertive não resolveu,
  // mostrar etapa simplificada "Preciso de você" em vez do editor completo.
  // ============================================================
  const hasUnresolvedBlockers = allBlockers.length > 0 && !isPublished
  const filledCount = pubReqs?.filled_count || 0
  const totalCount = pubReqs?.total_attributes || 0

  function goToBlocker() {
    if (!editorReadiness.blocker) return
    const target = document.getElementById(editorReadiness.blocker.target)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const focusable = target?.matches('input, textarea, select, button')
      ? target
      : target?.querySelector('input, textarea, select, button')
    if (focusable instanceof HTMLElement) window.setTimeout(() => focusable.focus(), 300)
  }

  if (hasUnresolvedBlockers) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] px-4 py-6 sm:p-6">
        <div className="max-w-lg mx-auto">
          <Link
            href="/membros/assertive-ecommerce-ia"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-5 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Meus anúncios
          </Link>

          <div className="bg-[#141414] border border-amber-500/20 rounded-xl p-6 mb-5">
            <h1 className="text-white text-lg font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Estamos quase prontos
            </h1>
            <p className="text-gray-400 text-sm mb-4">
              O Assertive já resolveu {filledCount} de {totalCount} informações automaticamente.
            </p>
            <p className="text-gray-300 text-sm mb-4">
              Nesta rodada, precisamos de você somente para {blockingQuestions.length}:
            </p>

            <div className="space-y-4">
              {blockingQuestions.map(q => (
                <div key={q.field} id={`attribute-${q.field}`}>
                  <label className="block text-gray-300 text-sm mb-1 font-medium">
                    {q.label}
                  </label>
                  <p className="text-gray-500 text-xs mb-2">
                    {q.why}
                  </p>
                  {q.suggestion && (
                    <p className="text-amber-400/70 text-xs mb-1">
                      Valor sugerido pelo ML: {q.suggestion}
                    </p>
                  )}
                  {q.options?.length ? (
                    <select
                      value={answers[q.field] ?? ''}
                      onChange={e => setAnswers(a => ({ ...a, [q.field]: e.target.value }))}
                      className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50"
                    >
                      <option value="">Selecione o valor correto</option>
                      {q.options.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input
                      value={answers[q.field] ?? ''}
                      onChange={e => setAnswers(a => ({ ...a, [q.field]: e.target.value }))}
                      placeholder={q.suggestion || `Informe ${q.label}`}
                      className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={submitAnswers}
              disabled={saving || !Object.values(answers).some(v => v.trim())}
              className="w-full mt-5 bg-amber-500 text-black py-3 rounded-lg font-semibold text-sm hover:bg-amber-400 transition disabled:opacity-40"
            >
              {saving ? 'Salvando e revalidando...' : 'Resolver e revalidar'}
            </button>
          </div>

          {/* Aviso de conta (se houver) */}
          {accountWarnings.length > 0 && (
            <div className="bg-[#141414] border border-blue-500/20 rounded-xl p-5">
              <h2 className="text-white font-semibold flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-blue-400" />
                Avisos de conta
              </h2>
              <p className="text-gray-400 text-xs mb-3">
                O Mercado Livre retornou {accountWarnings.length} aviso(s) de logística.
              </p>
              <ul className="space-y-2">
                {accountWarnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span className="text-gray-300">{w.friendly_message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ============================================================
  // EDITOR COMPLETO — só chega aqui quando não há blockers
  // ============================================================
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
          <div className={`${publishedNeedsAttention ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30'} border rounded-xl p-4 mb-5 flex items-center gap-3`}>
            {publishedNeedsAttention
              ? <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              : <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            <div className="flex-1">
              <p className={`${publishedNeedsAttention ? 'text-amber-300' : 'text-emerald-300'} text-sm font-medium`}>
                {marketplacePublication.statusLabel}
              </p>
              <p className={`${publishedNeedsAttention ? 'text-amber-300/60' : 'text-emerald-300/60'} text-xs mt-0.5`}>
                Código: {listing.ml_item_id}
                {marketplacePublication.shipping?.mode && ` · Envio ${marketplacePublication.shipping.mode.toUpperCase()}`}
                {marketplacePublication.shipping?.freeShipping === true && ' · Frete grátis'}
              </p>
            </div>
            {marketplacePublication.permalink && (
              <a
                href={marketplacePublication.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-emerald-500 text-black text-sm font-semibold px-3 py-2 rounded-lg hover:bg-emerald-400 transition"
              >
                Ver <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {isPublishing && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4 mb-5 flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-amber-400 shrink-0 animate-spin" />
            <div className="flex-1">
              <p className="text-amber-300 text-sm font-medium">Publicando no Mercado Livre...</p>
              <p className="text-amber-300/60 text-xs mt-0.5">Aguarde, não feche esta página.</p>
            </div>
          </div>
        )}

        {/* Status de publicação — Preview Gate passou */}
        {!isPublished && !isPublishing && canPublish && (
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 mb-5 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="flex-1">
              <p className="text-emerald-300 text-sm font-medium">Pronto para publicar</p>
              <p className="text-emerald-300/60 text-xs mt-0.5">
                Todos os campos obrigatórios foram preenchidos e validados.
                {accountWarnings.length > 0 && ` ${accountWarnings.length} aviso(s) de conta.`}
              </p>
            </div>
          </div>
        )}

        {!isPublished && !isPublishing && !canPublish && editorReadiness.blocker && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4 mb-5 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1">
              <p className="text-amber-300 text-sm font-medium">Ajustes necessários</p>
              <p className="text-amber-300/60 text-xs mt-0.5">{editorReadiness.blocker.message}</p>
            </div>
            <button onClick={goToBlocker} className="text-amber-300 text-xs font-semibold hover:text-amber-200">
              Corrigir agora
            </button>
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
            <section id="listing-photos" className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-amber-500" /> Fotos do anúncio
                </h2>
                <span className="text-gray-500 text-xs">{listing.photos.length}/12</span>
              </div>

              {/* photo stats summary */}
              {listing.attributes.photo_stats && listing.attributes.photo_stats.total_found > 0 && (
                <div className="mb-4 bg-[#1a1a1a] rounded-lg p-3 text-xs space-y-1">
                  <p className="text-gray-400 font-medium">Coleta automática</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-gray-500">
                    <span>{listing.attributes.photo_stats.total_found} fotos encontradas</span>
                    {listing.attributes.photo_stats.from_exact_product > 0 && (
                      <span className="text-emerald-400/70">{listing.attributes.photo_stats.from_exact_product} do produto exato</span>
                    )}
                    {listing.attributes.photo_stats.from_competitor > 0 && (
                      <span>{listing.attributes.photo_stats.from_competitor} de concorrentes</span>
                    )}
                    {listing.attributes.photo_stats.deduplicated > 0 && (
                      <span>{listing.attributes.photo_stats.deduplicated} duplicatas removidas</span>
                    )}
                  </div>
                </div>
              )}

              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => { uploadPhotos(e.target.files); e.target.value = '' }}
              />

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {listing.photos.map((url, i) => {
                  const meta = listing.attributes.photo_metadata?.find(m => m.url === url)
                  const isMain = meta?.role === 'MAIN' || i === 0
                  const isDragging = dragState.dragging === i
                  const isOver = dragState.over === i
                  return (
                    <div
                      key={url}
                      className={`relative aspect-square rounded-lg overflow-hidden bg-[#1c1c1c] group touch-none select-none transition-transform ${
                        isDragging ? 'opacity-50 scale-95' : ''
                      } ${isOver && dragState.dragging !== null ? 'ring-2 ring-amber-500 scale-105' : ''}`}
                      onPointerDown={e => handleDragStart(e, i)}
                      onPointerOver={e => handleDragOver(e, i)}
                      onPointerUp={handleDragEnd}
                      onPointerLeave={() => setDragState(prev => prev.dragging !== null ? { ...prev, over: null } : prev)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Foto ${i + 1}`}
                        className="w-full h-full object-cover pointer-events-none"
                        draggable={false}
                      />

                      {/* role badge */}
                      {meta && (
                        <span className={`absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded ${
                          isMain ? 'bg-amber-500/90 text-black font-bold' :
                          meta.role === 'DETAIL' ? 'bg-blue-500/80 text-white' :
                          meta.role === 'PACKAGING' ? 'bg-purple-500/80 text-white' :
                          meta.role === 'LIFESTYLE' ? 'bg-emerald-500/80 text-white' :
                          'bg-gray-500/80 text-white'
                        }`}>
                          {isMain ? 'Principal' : meta.role === 'DETAIL' ? 'Detalhe' : meta.role === 'PACKAGING' ? 'Embalagem' : meta.role === 'LIFESTYLE' ? 'Uso' : 'Info'}
                        </span>
                      )}

                      {/* source badge */}
                      {meta && meta.source !== 'USER' && (
                        <span className="absolute top-1 right-1 text-[9px] px-1 py-0.5 rounded bg-black/60 text-gray-300">
                          {meta.source === 'COMPETITOR' ? 'Ref.' : meta.source === 'AI_ENHANCED' ? 'IA' : 'Gen.IA'}
                        </span>
                      )}

                      {meta?.label && (
                        <span
                          title={meta.label}
                          className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate text-[9px] px-1.5 py-0.5 rounded bg-black/70 text-white"
                        >
                          {meta.label}
                        </span>
                      )}

                      {/* actions overlay */}
                      {!isPublished && (
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition flex items-end justify-between">
                          <div className="flex gap-0.5">
                            {i > 0 && (
                              <button onClick={e => { e.stopPropagation(); movePhoto(url, 'up') }} className="p-1 rounded bg-black/50 text-white hover:bg-white/20 transition" title="Mover para cima">
                                <ArrowUp className="w-3 h-3" />
                              </button>
                            )}
                            {i < listing.photos.length - 1 && (
                              <button onClick={e => { e.stopPropagation(); movePhoto(url, 'down') }} className="p-1 rounded bg-black/50 text-white hover:bg-white/20 transition" title="Mover para baixo">
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            )}
                            {!isMain && (
                              <button onClick={e => { e.stopPropagation(); setPrincipalPhoto(url) }} className="p-1 rounded bg-black/50 text-amber-400 hover:bg-amber-500/20 transition" title="Tornar principal">
                                <Star className="w-3 h-3" />
                              </button>
                            )}
                            <button onClick={e => { e.stopPropagation(); downloadImage(url, i) }} className="p-1 rounded bg-black/50 text-white hover:bg-white/20 transition" title="Baixar imagem">
                              <ArrowDown className="w-3 h-3 rotate-180" />
                            </button>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); removePhoto(url) }}
                            aria-label="Remover"
                            className="p-1 rounded bg-black/50 text-white hover:bg-red-500 transition"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {/* static remove button for mobile (always visible) */}
                      {!isPublished && (
                        <button
                          onClick={() => removePhoto(url)}
                          aria-label="Remover"
                          className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 hover:bg-red-500 transition sm:hidden"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}

                      {/* click to open lightbox */}
                      <button
                        onClick={() => setLightbox({ open: true, index: i })}
                        className="absolute inset-0 z-10"
                        tabIndex={-1}
                        aria-label={`Ampliar foto ${i + 1}`}
                      />
                    </div>
                  )
                })}
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

              {/* lightbox */}
              {lightbox.open && listing.photos[lightbox.index] && (
                <div
                  className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
                  onClick={() => setLightbox({ open: false, index: 0 })}
                >
                  <button
                    onClick={() => setLightbox({ open: false, index: 0 })}
                    className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
                  >
                    <X className="w-6 h-6" />
                  </button>

                  {listing.photos.length > 1 && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); moveLightbox('prev') }}
                        className="absolute left-4 text-white/70 hover:text-white z-10 p-2"
                      >
                        <ArrowUp className="w-6 h-6 rotate-[-90deg]" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); moveLightbox('next') }}
                        className="absolute right-4 text-white/70 hover:text-white z-10 p-2"
                      >
                        <ArrowDown className="w-6 h-6 rotate-[-90deg]" />
                      </button>
                    </>
                  )}

                  <div className="max-w-[90vw] max-h-[85vh]" onClick={e => e.stopPropagation()}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={listing.photos[lightbox.index]}
                      alt={`Foto ${lightbox.index + 1}`}
                      className="max-w-full max-h-[85vh] object-contain rounded-lg"
                    />
                  </div>

                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 text-white/70 text-sm">
                    <span>{lightbox.index + 1} de {listing.photos.length}</span>
                    <button
                      onClick={e => { e.stopPropagation(); downloadImage(listing.photos[lightbox.index], lightbox.index) }}
                      className="flex items-center gap-1 hover:text-white transition"
                    >
                      <ArrowDown className="w-4 h-4 rotate-180" /> Baixar
                    </button>
                  </div>
                </div>
              )}

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
                id="listing-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={() => title !== listing.title && save({ title })}
                disabled={isPublished}
                rows={2}
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white resize-none focus:outline-none focus:border-amber-500/50 disabled:opacity-60"
              />

              {/* Title control mode: User Products */}
              {listing.attributes?.title_control_mode === 'user_product' && (
                <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-amber-300 text-xs font-medium flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    Neste modelo, o Mercado Livre gera o título final automaticamente
                  </p>
                  {!isPublished && (
                    <div className="mt-2 space-y-1">
                      <p className="text-gray-400 text-xs">
                        Título estratégico: <span className="text-white">{title}</span>
                      </p>
                      {listing.attributes?.predicted_title && (
                        <p className="text-gray-400 text-xs">
                          Título provável no ML: <span className="text-amber-300">{listing.attributes.predicted_title}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {isPublished && listing.attributes?.ml_final_title && (
                    <p className="text-emerald-300 text-xs mt-2">
                      Título publicado: <span className="text-white font-medium">{listing.attributes.ml_final_title}</span>
                    </p>
                  )}
                  {listing.attributes?.auto_appended_attributes && listing.attributes.auto_appended_attributes.length > 0 && (
                    <p className="text-gray-500 text-[11px] mt-2">
                      ML acrescenta ao título: {listing.attributes.auto_appended_attributes.join(', ')}
                    </p>
                  )}
                  <p className="text-gray-500 text-[11px] mt-1">
                    Family name: {listing.family_name || title}
                  </p>
                </div>
              )}

              {/* Title control mode: Seller */}
              {listing.attributes?.title_control_mode === 'seller' && (
                <p className="text-gray-500 text-xs mt-2">
                  Você controla o título exato exibido no anúncio.
                </p>
              )}
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
                    id="listing-price"
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
                    {research.price_basis === 'EXACT_PRODUCT'
                      ? `Preços de ${research.price_stats.sample_size} ofertas do produto exato`
                      : `Faixa baseada em ${research.price_stats.sample_size} produtos comparáveis`}
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
                  {attrs.map(a => {
                    const badge = a.status ? STATUS_BADGE[a.status] : undefined
                    return (
                      <div key={a.id} className="flex items-start justify-between gap-4 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-sm truncate">{a.name}</span>
                            {(a.tier === 'required' || a.tier === 'catalog_required') && (
                              <span className="text-[10px] text-amber-500/70 shrink-0">obrigatório</span>
                            )}
                          </div>
                          {a.evidence && (
                            <p className="text-gray-600 text-[11px] mt-0.5 line-clamp-1">{a.evidence}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 max-w-[55%]">
                          <span className="text-white text-sm">{a.value_name}</span>
                          {badge && (
                            <span className={`block text-[10px] ${badge.className}`}>{badge.label}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
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

            {/* o que o Assertive descobriu */}
            {listing.attributes?.autofill && (
              <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
                <h2 className="text-white font-semibold flex items-center gap-2 mb-1">
                  <Search className="w-4 h-4 text-amber-500" /> O que o Assertive preencheu
                </h2>
                <p className="text-gray-500 text-xs mb-4">
                  {listing.attributes.autofill.auto_fill_percent}% da ficha resolvido automaticamente
                </p>

                <div className="space-y-2 text-xs">
                  {[
                    ['Do produto no catálogo', listing.attributes.autofill.from_exact_product, 'text-emerald-400'],
                    ['Da pesquisa na web', listing.attributes.autofill.from_web, 'text-emerald-400'],
                    ['Deduzido de dados confirmados', listing.attributes.autofill.from_derivation, 'text-emerald-400'],
                    ['Sugerido — confira', listing.attributes.autofill.inferred_needs_confirmation, 'text-orange-400'],
                    ['Não se aplica a este produto', listing.attributes.autofill.not_applicable, 'text-gray-500'],
                    ['Precisa de você', listing.attributes.autofill.user_input_required, 'text-amber-400'],
                  ]
                    .filter(([, n]) => (n as number) > 0)
                    .map(([label, n, color]) => (
                      <div key={label as string} className="flex items-center justify-between">
                        <span className="text-gray-400">{label as string}</span>
                        <span className={color as string}>{n as number}</span>
                      </div>
                    ))}
                </div>

                {listing.attributes.web_research && !listing.attributes.web_research.used && (
                  <p className="text-gray-600 text-[11px] mt-4 leading-relaxed border-t border-[#1f1f1f] pt-3">
                    Pesquisa na web indisponível: {listing.attributes.web_research.reason}
                  </p>
                )}

                {(listing.attributes.research_sources?.length ?? 0) > 0 && (
                  <div className="mt-4 pt-3 border-t border-[#1f1f1f]">
                    <p className="text-gray-400 text-xs font-medium mb-2">Fontes consultadas</p>
                    <ul className="space-y-1">
                      {listing.attributes.research_sources!.slice(0, 5).map((s, i) => (
                        <li key={i}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-400/70 hover:text-amber-400 text-[11px] line-clamp-1 transition"
                          >
                            {s.title || s.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* melhorias opcionais — aparece quando não há blockers e há missing */}
            {(missing.length > 0 && allBlockers.length === 0) && !isPublished && (
              <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5 flex flex-col" style={{ maxHeight: 'min(70vh, 600px)' }}>
                <button
                  onClick={() => setOpenSection(openSection === 'missing' ? null : 'missing')}
                  className="w-full flex items-center justify-between mb-1 shrink-0"
                >
                  <h2 className="text-white font-semibold text-left flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-gray-500" />
                    {missing.length} melhorias opcionais
                  </h2>
                  <ChevronDown className={`w-4 h-4 text-gray-500 transition ${openSection === 'missing' ? 'rotate-180' : ''}`} />
                </button>

                {openSection === 'missing' && (
                  <>
                    <div className="space-y-3 mt-3 overflow-y-auto flex-1 min-h-0" style={{ scrollPaddingBottom: '80px' }}>
                      {missing.map(q => (
                        <div key={q.field} className="pb-2">
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
                      <div className="h-16" />
                    </div>
                    <button
                      onClick={submitAnswers}
                      disabled={saving || !Object.values(answers).some(v => v.trim())}
                      className="w-full mt-4 bg-amber-500 text-black py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-400 transition disabled:opacity-40 shrink-0"
                    >
                      {saving ? 'Salvando...' : 'Salvar informações'}
                    </button>
                  </>
                )}
              </section>
            )}

            {/* avisos de conta/logística — NÃO são campos do produto */}
            {accountWarnings.length > 0 && !isPublished && (
              <section className="bg-[#141414] border border-blue-500/20 rounded-xl p-5">
                <h2 className="text-white font-semibold flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-blue-400" />
                  Avisos de conta
                </h2>
                <p className="text-gray-400 text-xs mb-3">
                  Seu anúncio está preenchido. O Mercado Livre retornou {accountWarnings.length} aviso(s) de logística da conta.
                </p>
                <ul className="space-y-2">
                  {accountWarnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {w.user_action_required ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      )}
                      <span className="text-gray-300">{w.friendly_message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* validação e publicação */}
            <section id="publication-preflight" tabIndex={-1} className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5">
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
                        <li key={i} className="text-red-300/80 text-xs">• {formatBlockerMessage(issue)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Resumo da pré-publicação */}
              {!isPublished && canPublish && (
                <div className="bg-[#1c1c1c] rounded-lg p-4 mb-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Produto</span>
                    <span className="text-white font-medium truncate ml-4 max-w-[200px]">{listing.title || listing.family_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Categoria</span>
                    <span id="listing-category" tabIndex={-1} className="text-white font-medium">{listing.category_id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Preço</span>
                    <span className="text-white font-medium">{brl(listing.price)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Estoque</span>
                    <span className="text-white font-medium">{listing.available_quantity || 1}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Fotos</span>
                    <span className="text-white font-medium">{listing.photos?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Atributos obrigatórios</span>
                    <span className="text-emerald-400 font-medium">✓ completos</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Embalagem</span>
                    <span className="text-emerald-400 font-medium">✓ completa</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Pré-validação</span>
                    <span className="text-emerald-400 font-medium">✓ concluída</span>
                  </div>
                  {accountWarnings.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Conta</span>
                      <span className="text-amber-400 font-medium">⚠ {accountWarnings.length} aviso(s)</span>
                    </div>
                  )}
                </div>
              )}

              {!isPublished && !isPublishing && (
                <div className="space-y-2">
                  {!canPublish && (
                    <button
                      onClick={validate}
                      disabled={validating || saving}
                      className="w-full bg-[#1c1c1c] text-white py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#242424] transition disabled:opacity-40"
                    >
                      {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      {validating ? 'Validando...' : 'Validar no Mercado Livre'}
                    </button>
                  )}

                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={!canPublish || publishing}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-black py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
                    {publishing ? 'Publicando...' : 'Publicar no Mercado Livre'}
                  </button>

                  {!canPublish && !isPublished && (
                    <p className="text-gray-500 text-xs text-center pt-1">
                      {editorReadiness.blocker?.message || 'Este anúncio não pode ser publicado agora.'}
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
                <p className="text-gray-500 text-xs mb-1">
                  {competitors.length} referências {research?.category_name ? `em ${research.category_name}` : ''}
                  {research?.exact_product_count ? ` · ${research.exact_product_count} do produto exato` : ''}
                </p>
                <p className="text-gray-600 text-[10px] mb-4 leading-relaxed">
                  Ranking oficial de mais vendidos da categoria. A API do Mercado Livre não informa
                  se a exposição é paga, por isso não classificamos orgânico ou patrocinado.
                </p>

                <div className="space-y-3">
                  {competitors.slice(0, 5).map((c, i) => (
                    <div key={i} className="bg-[#1a1a1a] rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                            c.match_class === 'EXACT_PRODUCT'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : c.match_class === 'COMPARABLE_PRODUCT'
                                ? 'bg-blue-500/15 text-blue-300'
                                : 'bg-gray-500/15 text-gray-400'
                          }`}
                        >
                          {c.match_class === 'EXACT_PRODUCT'
                            ? 'produto exato'
                            : c.match_class === 'COMPARABLE_PRODUCT'
                              ? 'comparável'
                              : 'referência'}
                        </span>
                        {c.highlight_position !== null && (
                          <span className="text-[10px] text-emerald-400/80 shrink-0">
                            #{c.highlight_position} mais vendidos
                          </span>
                        )}
                      </div>

                      <p className="text-gray-200 text-xs leading-snug line-clamp-2">{c.title}</p>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {c.price !== null && (
                          <span className="text-amber-400 text-sm font-medium">{brl(c.price)}</span>
                        )}
                        {c.shipping?.fulfillment && (
                          <span className="text-[10px] bg-blue-500/15 text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Truck className="w-2.5 h-2.5" /> Full
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-[#242424]">
                        <div>
                          <p className="text-gray-600 text-[9px] uppercase tracking-wide">Mesmo produto</p>
                          <p className="text-gray-300 text-[11px]">{c.product_match_confidence}/100</p>
                        </div>
                        <div>
                          <p className="text-gray-600 text-[9px] uppercase tracking-wide">Força competitiva</p>
                          <p className="text-gray-300 text-[11px]">{c.competitive_reference_strength}</p>
                        </div>
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
