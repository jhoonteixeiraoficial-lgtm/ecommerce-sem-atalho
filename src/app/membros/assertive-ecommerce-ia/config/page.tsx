'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settings, Save, Loader2, Check, X, Zap, Key } from 'lucide-react'

interface Config {
  provider: string
  api_key: string
  base_url: string
  model: string
  default_variations: number
  default_tone: string
  default_margin: number
  auto_publish: boolean
}

export default function ConfigPage() {
  const [config, setConfig] = useState<Config>({
    provider: 'groq', api_key: '', base_url: '', model: '',
    default_variations: 3, default_tone: 'profissional',
    default_margin: 30, auto_publish: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('assertive_ai_config').select('*').single()
      if (data) setConfig(data)
      setLoading(false)
    }
    load()
  }, [supabase])

  async function handleSave() {
    setSaving(true)
    await fetch('/api/assertive/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleTest() {
    if (!config.api_key) return
    setTesting(true)
    setTestResult(null)
    const res = await fetch('/api/assertive/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    const data = await res.json()
    setTestResult(data)
    setTesting(false)
  }

  const providers = [
    { value: 'groq', label: 'Groq (Grátis)', desc: 'Llama 3.1 — rápido e gratuito' },
    { value: 'gemini', label: 'Gemini (Grátis)', desc: 'Google Gemini Flash — gratuito' },
    { value: 'claude', label: 'Claude', desc: 'Anthropic Claude — API key necessária' },
    { value: 'openai', label: 'OpenAI', desc: 'GPT-4o — API key necessária' },
    { value: 'custom', label: 'Personalizado', desc: 'Qualquer API compatível com OpenAI' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Configurações de IA</h1>
            <p className="text-gray-400 text-sm">Configure o provedor de IA para gerar anúncios</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-6">
            <h2 className="text-white font-bold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Provedor de IA
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {providers.map(p => (
                <button
                  key={p.value}
                  onClick={() => setConfig({ ...config, provider: p.value })}
                  className={`p-4 rounded-xl text-left transition border ${
                    config.provider === p.value
                      ? 'bg-amber-500/10 border-amber-500/50 text-white'
                      : 'bg-[#1c1c1c] border-[#2a2a2a] text-gray-400 hover:text-white'
                  }`}
                >
                  <p className="font-medium">{p.label}</p>
                  <p className="text-sm opacity-60">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {config.provider !== 'groq' && config.provider !== 'gemini' && (
            <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-6">
              <h2 className="text-white font-bold mb-4 flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-500" />
                Credenciais
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm mb-1 block">API Key</label>
                  <input
                    type="password"
                    value={config.api_key}
                    onChange={e => setConfig({ ...config, api_key: e.target.value })}
                    placeholder="sk-..."
                    className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                {config.provider === 'custom' && (
                  <>
                    <div>
                      <label className="text-gray-400 text-sm mb-1 block">Base URL</label>
                      <input
                        type="url"
                        value={config.base_url}
                        onChange={e => setConfig({ ...config, base_url: e.target.value })}
                        placeholder="https://api.example.com/v1"
                        className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 text-sm mb-1 block">Modelo</label>
                      <input
                        type="text"
                        value={config.model}
                        onChange={e => setConfig({ ...config, model: e.target.value })}
                        placeholder="gpt-4o"
                        className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                      />
                    </div>
                  </>
                )}
                <button
                  onClick={handleTest}
                  disabled={!config.api_key || testing}
                  className="flex items-center gap-2 bg-[#1c1c1c] border border-[#2a2a2a] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#222] transition disabled:opacity-40"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Testar Conexão
                </button>
                {testResult && (
                  <div className={`p-3 rounded-lg flex items-center gap-2 ${testResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {testResult.ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    {testResult.ok ? 'Conexão OK!' : testResult.error}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-6">
            <h2 className="text-white font-bold mb-4">Preferências Padrão</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Variações por anúncio</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={config.default_variations}
                  onChange={e => setConfig({ ...config, default_variations: Number(e.target.value) })}
                  className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-3 text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Margem (%)</label>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={config.default_margin}
                  onChange={e => setConfig({ ...config, default_margin: Number(e.target.value) })}
                  className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-3 text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-black py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : saved ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar Configurações'}
          </button>
        </div>
      </div>
    </div>
  )
}
