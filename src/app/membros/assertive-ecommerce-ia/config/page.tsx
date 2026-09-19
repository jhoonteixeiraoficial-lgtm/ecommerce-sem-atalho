'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Save, Loader2, Check, X, Key, ArrowLeft, Eye, Plug, Trash2, Info,
} from 'lucide-react'

interface ProviderInfo {
  id: string
  models: string[]
  vision: boolean
}

interface ConfigState {
  provider: string
  api_key_masked: string | null
  has_api_key: boolean
  base_url: string
  model: string
  default_tone: string
  default_margin: number
  providers: ProviderInfo[]
  system_vision_available: boolean
}

const PROVIDER_LABELS: Record<string, { label: string; desc: string }> = {
  gemini: { label: 'Google Gemini', desc: 'Analisa fotos e texto. Recomendado.' },
  groq: { label: 'Groq', desc: 'Muito rápido para texto. Não analisa imagens.' },
  openai: { label: 'OpenAI', desc: 'GPT-4o. Analisa fotos e texto.' },
  claude: { label: 'Anthropic Claude', desc: 'Alta qualidade de texto.' },
  custom: { label: 'Personalizado', desc: 'Qualquer API compatível com OpenAI.' },
}

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigState | null>(null)
  const [provider, setProvider] = useState('gemini')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [tone, setTone] = useState('profissional')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [saved, setSaved] = useState(false)

  const [ml, setMl] = useState<{ connected: boolean; nickname?: string; account_model?: string } | null>(null)
  const [collector, setCollector] = useState<{ token: string } | null>(null)
  const [rotating, setRotating] = useState(false)

  const load = useCallback(async () => {
    const [cfg, mlStatus, collectToken] = await Promise.all([
      fetch('/api/assertive/ai/config').then(r => r.json()),
      fetch('/api/assertive/ml/status').then(r => r.json()).catch(() => ({ connected: false })),
      fetch('/api/assertive/collect/token').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ])
    setConfig(cfg)
    setProvider(cfg.provider || 'gemini')
    setBaseUrl(cfg.base_url || '')
    setModel(cfg.model || '')
    setTone(cfg.default_tone || 'profissional')
    setMl(mlStatus)
    setCollector(collectToken)
    setLoading(false)
  }, [])

  // load() é assíncrono: o primeiro setState só ocorre após o await, nunca durante o render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'ml-connected') load()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [load])

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/assertive/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        // chave em branco mantém a que já está salva
        api_key: apiKey.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
        default_tone: tone,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setConfig(data)
      setApiKey('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    }
    setSaving(false)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    const res = await fetch('/api/assertive/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        api_key: apiKey.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
      }),
    })
    setTestResult(await res.json())
    setTesting(false)
  }

  async function connectML() {
    const res = await fetch('/api/assertive/ml/connect', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.open(data.url, 'ml-oauth', 'width=520,height=720')
  }

  async function disconnectML() {
    await fetch('/api/assertive/ml/status', { method: 'DELETE' })
    load()
  }

  async function rotateCollector() {
    setRotating(true)
    const res = await fetch('/api/assertive/collect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rotate' }),
    })
    if (res.ok) setCollector(await res.json())
    setRotating(false)
  }

  if (loading || !config) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
      </div>
    )
  }

  const selectedProvider = config.providers?.find(p => p.id === provider)
  const providerHasVision = selectedProvider?.vision ?? false

  return (
    <div className="min-h-screen bg-[#0c0c0c] px-4 py-6 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/membros/assertive-ecommerce-ia"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-5 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Assertive IA
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold text-white mb-6">Configurações</h1>

        {/* Mercado Livre */}
        <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5 mb-5">
          <h2 className="text-white font-semibold flex items-center gap-2 mb-4">
            <Plug className="w-4 h-4 text-amber-500" /> Conta do Mercado Livre
          </h2>

          {ml?.connected ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-emerald-400 text-sm font-medium flex items-center gap-2">
                  <Check className="w-4 h-4" /> {ml.nickname || 'Conectado'}
                </p>
                {ml.account_model && (
                  <p className="text-gray-500 text-xs mt-1">
                    Modelo da conta: {ml.account_model === 'user_product' ? 'novo (user products)' : 'clássico'}
                  </p>
                )}
              </div>
              <button
                onClick={disconnectML}
                className="inline-flex items-center gap-1.5 text-gray-400 hover:text-red-400 text-sm transition"
              >
                <Trash2 className="w-4 h-4" /> Desconectar
              </button>
            </div>
          ) : (
            <div>
              <p className="text-gray-400 text-sm mb-3">
                Necessário para pesquisar a concorrência e publicar anúncios na sua conta.
              </p>
              <button
                onClick={connectML}
                className="bg-amber-500 text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-400 transition"
              >
                Conectar Mercado Livre
              </button>
            </div>
          )}
        </section>

        {/* Coletor do navegador — Espionagem ao Vivo */}
        <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5 mb-5">
          <h2 className="text-white font-semibold flex items-center gap-2 mb-1">
            🕵️ Espionagem ao Vivo (coletor do navegador)
          </h2>
          <p className="text-gray-500 text-xs mb-4 leading-relaxed">
            Envia ao Assertive as páginas públicas do Mercado Livre que você
            já visita — busca e anúncios de concorrentes — para a espionagem
            usar posição real, selo MAIS VENDIDO e vendas observadas.
            Os trechos enviados ficam disponíveis só para sua pesquisa por até 6 horas.
          </p>

          <ol className="text-gray-400 text-xs space-y-1.5 mb-4 list-decimal list-inside">
            <li>
              Instale a extensão gratuita{' '}
              <a
                href="https://www.tampermonkey.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:underline"
              >
                Tampermonkey
              </a>{' '}
              (ou Violentmonkey)
            </li>
            <li>Clique em <strong className="text-gray-300">Instalar coletor</strong> — o token já vai embutido, nada para configurar</li>
            <li>Abra uma busca ou anúncio e clique em “Enviar esta página” no painel do Assertive. Nada é enviado sem esse clique.</li>
            <li>Volte ao editor e clique em “Atualizar referências”. Seus textos, preços e fotos não são alterados.</li>
          </ol>

          <div className="flex flex-wrap gap-2">
            <a
              href="/api/assertive/collect/script.user.js"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-amber-500 text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-400 transition"
            >
              Instalar coletor
            </a>
            <button
              onClick={rotateCollector}
              disabled={rotating || !collector}
              className="inline-flex items-center gap-1.5 bg-[#1c1c1c] text-gray-300 text-sm px-4 py-2 rounded-lg hover:bg-[#242424] transition disabled:opacity-40"
            >
              {rotating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Trocar token
            </button>
          </div>

          {collector && (
            <p className="text-gray-600 text-[11px] mt-3 break-all">
              Token atual: {collector.token.slice(0, 12)}••••••••
            </p>
          )}

          <div className="flex gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 mt-4">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-emerald-200/70 text-xs leading-relaxed">
              Opcional e sem tarifa de coleta: envia apenas trechos públicos escolhidos,
              sem cookies ou dados de login. Não navega nem publica no Mercado Livre.
              Não há garantia contra bloqueios; respeite os termos da plataforma. As demais etapas de IA podem ter custos.
            </p>
          </div>
        </section>


        {/* preferências */}
        <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5 mb-5">
          <h2 className="text-white font-semibold mb-4">Preferências de escrita</h2>
          <label className="block text-gray-400 text-xs mb-1.5">Tom do anúncio</label>
          <select
            value={tone}
            onChange={e => setTone(e.target.value)}
            className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50"
          >
            <option value="profissional">Profissional</option>
            <option value="técnico">Técnico</option>
            <option value="direto">Direto</option>
            <option value="acolhedor">Acolhedor</option>
          </select>
        </section>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-black py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
          {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar configurações'}
        </button>
      </div>
    </div>
  )
}
