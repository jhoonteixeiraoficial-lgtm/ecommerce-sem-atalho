'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2, AlertCircle, CheckCircle2, Sparkles, ArrowRight, ArrowLeft,
  Search, Brain, Wand2, Plug, RefreshCw, HelpCircle,
} from 'lucide-react'

interface TruthField { value: string; confidence: string; source: string; evidence: string }
interface PendingQuestion { field: string; label: string; why: string; suggestion?: string; options?: string[] }
interface ProductTruth {
  name: string
  fields: Record<string, TruthField>
  uncertain: PendingQuestion[]
  evidence: string[]
  confidence: number
  category_hint?: string
}

interface Analysis {
  id: string
  product_name: string
  status: string
  error_message: string | null
  photos: string[]
  product_truth: ProductTruth
  research?: { competitors?: unknown[]; category_name?: string }
}

const FIELD_LABELS: Record<string, string> = {
  brand: 'Marca', model: 'Modelo', gtin: 'Código de barras', sku: 'SKU', color: 'Cor',
  material: 'Material', voltage: 'Voltagem', power: 'Potência', capacity: 'Capacidade',
  length: 'Comprimento', width: 'Largura', height: 'Altura', weight: 'Peso',
  units_per_pack: 'Unidades por embalagem', compatibility: 'Compatibilidade',
  line: 'Linha', part_number: 'Número da peça',
}

const STEPS = [
  { key: 'researching', icon: Search, label: 'Pesquisando o Mercado Livre' },
  { key: 'analyzing', icon: Brain, label: 'Analisando as melhores referências' },
  { key: 'generating', icon: Wand2, label: 'Criando o anúncio Assertive' },
]

export default function AnalisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [needsML, setNeedsML] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [productName, setProductName] = useState('')

  const load = useCallback(async () => {
    const res = await fetch(`/api/assertive/analyses/${id}`)
    if (!res.ok) {
      setError('Análise não encontrada.')
      setLoading(false)
      return
    }
    const data = await res.json()
    setAnalysis(data.analysis)
    setProductName(data.analysis.product_truth?.name || data.analysis.product_name || '')
    if (data.analysis.error_message) setError(data.analysis.error_message)

    // já existe anúncio gerado: vai direto para o preview
    if (data.listings?.length) {
      router.replace(`/membros/assertive-ecommerce-ia/editor/${data.listings[0].id}`)
      return
    }
    setLoading(false)
  }, [id, router])

  // load() é assíncrono: o primeiro setState só ocorre após o await, nunca durante o render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // avanço visual das etapas enquanto o servidor processa
  useEffect(() => {
    if (!running) return
    const t1 = setTimeout(() => setStepIndex(1), 6000)
    const t2 = setTimeout(() => setStepIndex(2), 15000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [running])

  async function connectML() {
    const res = await fetch('/api/assertive/ml/connect', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.open(data.url, 'ml-oauth', 'width=520,height=720')
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'ml-connected' && e.data.ok) {
        setNeedsML(false)
        setError(null)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  async function runPipeline() {
    setStepIndex(0)
    setRunning(true)
    setError(null)
    setNeedsML(false)

    try {
      const res = await fetch(`/api/assertive/analyses/${id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'researching',
          query: productName.trim() || undefined,
          answers: Object.fromEntries(
            Object.entries(answers).filter(([, v]) => v.trim())
          ),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'ML_NOT_CONNECTED') setNeedsML(true)
        setError(data.error || 'Falha ao processar a análise.')
        setRunning(false)
        return
      }

      router.push(`/membros/assertive-ecommerce-ia/editor/${data.listing_id}`)
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
      </div>
    )
  }

  const truth = analysis?.product_truth
  const confirmed = Object.entries(truth?.fields || {})
  const uncertain = truth?.uncertain || []

  return (
    <div className="min-h-screen bg-[#0c0c0c] px-4 py-6 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/membros/assertive-ecommerce-ia"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-5 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        {running ? (
          <div className="bg-[#141414] border border-[#1f1f1f] rounded-2xl p-6 sm:p-8">
            <h2 className="text-white font-bold text-lg mb-1">Trabalhando no seu anúncio</h2>
            <p className="text-gray-500 text-sm mb-6">
              Isso pode levar até dois minutos. Não feche esta página.
            </p>
            <div className="space-y-4">
              {STEPS.map((s, i) => {
                const done = i < stepIndex
                const active = i === stepIndex
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition ${
                        done ? 'bg-emerald-500/15 text-emerald-400'
                          : active ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-[#1c1c1c] text-gray-600'
                      }`}
                    >
                      {done ? <CheckCircle2 className="w-5 h-5" />
                        : active ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <s.icon className="w-5 h-5" />}
                    </div>
                    <span className={`text-sm ${active ? 'text-white' : done ? 'text-gray-400' : 'text-gray-600'}`}>
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Confirme o produto</h1>
                <p className="text-gray-400 text-sm">
                  Revise o que identificamos antes de pesquisarmos o mercado
                </p>
              </div>
            </div>

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

            {analysis?.photos && analysis.photos.length > 0 && (
              <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
                {analysis.photos.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt={`Foto ${i + 1}`}
                    className="w-20 h-20 rounded-lg object-cover bg-[#1c1c1c] shrink-0"
                  />
                ))}
              </div>
            )}

            <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5 mb-4">
              <label className="block text-gray-400 text-xs font-medium mb-2 uppercase tracking-wide">
                Produto identificado
              </label>
              <input
                value={productName}
                onChange={e => setProductName(e.target.value)}
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-base focus:outline-none focus:border-amber-500/50"
              />
              <p className="text-gray-500 text-xs mt-2">
                Corrija se necessário. Este nome guia toda a pesquisa de mercado.
              </p>

              {confirmed.length > 0 && (
                <div className="mt-5 pt-5 border-t border-[#1f1f1f]">
                  <p className="text-gray-400 text-xs font-medium mb-3 uppercase tracking-wide">
                    Dados identificados
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {confirmed.map(([key, field]) => (
                      <div key={key} className="bg-[#1a1a1a] rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-500 text-xs">{FIELD_LABELS[key] || key}</span>
                          {field.confidence === 'confirmed' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <span className="text-amber-500/70 text-[10px]">provável</span>
                          )}
                        </div>
                        <p className="text-white text-sm mt-0.5">{field.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uncertain.length > 0 && (
                <div className="mt-5 pt-5 border-t border-[#1f1f1f]">
                  <div className="flex items-center gap-2 mb-3">
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    <p className="text-amber-200 text-xs font-medium uppercase tracking-wide">
                      Precisamos confirmar ({uncertain.length})
                    </p>
                  </div>
                  <p className="text-gray-500 text-xs mb-3">
                    Preencher agora deixa a ficha técnica mais completa. Você também pode responder depois.
                  </p>
                  <div className="space-y-3">
                    {uncertain.slice(0, 6).map(q => (
                      <div key={q.field}>
                        <label className="block text-gray-300 text-sm mb-1">
                          {FIELD_LABELS[q.field] || q.label}
                        </label>
                        {q.options && q.options.length > 0 ? (
                          <select
                            value={answers[q.field] ?? ''}
                            onChange={e => setAnswers(a => ({ ...a, [q.field]: e.target.value }))}
                            className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                          >
                            <option value="">Não informar agora</option>
                            {q.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            value={answers[q.field] ?? ''}
                            onChange={e => setAnswers(a => ({ ...a, [q.field]: e.target.value }))}
                            placeholder={q.suggestion ? `Sugestão: ${q.suggestion}` : q.why}
                            className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={runPipeline}
              disabled={!productName.trim()}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-black py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-40"
            >
              <Search className="w-5 h-5" />
              Pesquisar mercado e criar anúncio
              <ArrowRight className="w-5 h-5" />
            </button>

            {analysis?.status === 'failed' && (
              <button
                onClick={() => router.push('/membros/assertive-ecommerce-ia/novo')}
                className="w-full mt-3 bg-[#1c1c1c] text-gray-300 py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#242424] transition"
              >
                <RefreshCw className="w-4 h-4" /> Começar uma nova análise
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
