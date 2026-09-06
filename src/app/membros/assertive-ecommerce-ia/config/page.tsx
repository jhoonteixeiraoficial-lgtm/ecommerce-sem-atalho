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

  const load = useCallback(async () => {
    const [cfg, mlStatus] = await Promise.all([
      fetch('/api/assertive/ai/config').then(r => r.json()),
      fetch('/api/assertive/ml/status').then(r => r.json()).catch(() => ({ connected: false })),
    ])
    setConfig(cfg)
    setProvider(cfg.provider || 'gemini')
    setBaseUrl(cfg.base_url || '')
    setModel(cfg.model || '')
    setTone(cfg.default_tone || 'profissional')
    setMl(mlStatus)
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

        {/* IA */}
        <section className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-5 mb-5">
          <h2 className="text-white font-semibold flex items-center gap-2 mb-4">
            <Key className="w-4 h-4 text-amber-500" /> Inteligência artificial
          </h2>

          <label className="block text-gray-400 text-xs mb-2">Provedor</label>
          <div className="space-y-2 mb-5">
            {(config.providers || []).map(p => {
              const info = PROVIDER_LABELS[p.id]
              if (!info) return null
              return (
                <button
                  key={p.id}
                  onClick={() => { setProvider(p.id); setTestResult(null) }}
                  className={`w-full text-left rounded-lg px-3 py-2.5 border transition ${
                    provider === p.id
                      ? 'bg-amber-500/10 border-amber-500/40'
                      : 'bg-[#1a1a1a] border-[#242424] hover:border-[#333]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${provider === p.id ? 'text-amber-300' : 'text-gray-200'}`}>
                      {info.label}
                    </span>
                    {p.vision && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/80">
                        <Eye className="w-3 h-3" /> analisa fotos
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">{info.desc}</p>
                </button>
              )
            })}
          </div>

          {!providerHasVision && config.system_vision_available && (
            <div className="flex gap-2 bg-blue-500/10 border border-blue-500/25 rounded-lg p-3 mb-4">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-blue-200/80 text-xs leading-relaxed">
                Este provedor não analisa imagens. O Assertive usa automaticamente o Gemini para a
                identificação por foto e mantém sua escolha para os textos.
              </p>
            </div>
          )}

          <label className="block text-gray-400 text-xs mb-1.5">
            Chave de API {config.has_api_key && <span className="text-emerald-500/70">(salva: {config.api_key_masked})</span>}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => { setApiKey(e.target.value); setTestResult(null) }}
            placeholder={config.has_api_key ? 'Deixe em branco para manter a atual' : 'Cole sua chave de API'}
            autoComplete="off"
            className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
          />
          <p className="text-gray-600 text-[11px] mt-1.5">
            A chave é criptografada no servidor e nunca volta para o navegador.
          </p>

          {provider === 'custom' && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-gray-400 text-xs mb-1.5">URL base</label>
                <input
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://api.exemplo.com/v1"
                  className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-xs mb-1.5">Modelo</label>
                <input
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="nome-do-modelo"
                  className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          )}

          {provider !== 'custom' && (selectedProvider?.models.length ?? 0) > 0 && (
            <div className="mt-4">
              <label className="block text-gray-400 text-xs mb-1.5">Modelo (opcional)</label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50"
              >
                <option value="">Automático (recomendado)</option>
                {selectedProvider!.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          <button
            onClick={handleTest}
            disabled={testing || (!apiKey.trim() && !config.has_api_key)}
            className="w-full mt-4 bg-[#1c1c1c] text-white py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 hover:bg-[#242424] transition disabled:opacity-40"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {testing ? 'Testando...' : 'Testar conexão'}
          </button>

          {testResult && (
            <div className={`mt-3 rounded-lg p-3 flex items-start gap-2 ${
              testResult.ok ? 'bg-emerald-500/10 border border-emerald-500/25' : 'bg-red-500/10 border border-red-500/25'
            }`}>
              {testResult.ok
                ? <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                : <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
              <p className={`text-xs ${testResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                {testResult.ok ? 'Conexão funcionando.' : testResult.error}
              </p>
            </div>
          )}
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
