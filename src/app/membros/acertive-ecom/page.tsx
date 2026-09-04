'use client'

import { useState } from 'react'
import { Sparkles, ArrowRight, Loader2, Copy, Check, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const templates = [
  { label: 'Título Otimizado', prompt: 'Gere um título otimizado para Mercado Livre' },
  { label: 'Descrição Completa', prompt: 'Gere uma descrição completa e persuasiva' },
  { label: 'Palavras-chave', prompt: 'Sugira palavras-chave relevantes' },
]

export default function AcertiveEcomPage() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenerate = () => {
    if (!prompt.trim()) return
    setLoading(true)
    setTimeout(() => {
      setResult(
        `Título otimizado para "${prompt}":\n\n` +
        `"${prompt} - Qualidade Garantida | Frete Grátis | Entrega Rápida"\n\n` +
        `Descrição:\n` +
        `Apresentamos ${prompt}, produto de alta qualidade com acabamento premium. ` +
        `Ideal para quem busca eficiência e resultado. Compre agora e receba em sua casa com segurança e agilidade.`
      )
      setLoading(false)
    }, 1500)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          Acertive Ecom
        </h1>
        <p className="text-sm text-text-muted mt-1">IA para otimizar seus anúncios no Mercado Livre.</p>
      </div>

      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <p className="text-sm text-amber-300">
          <strong>Demostração:</strong> Esta é uma pré-visualização da funcionalidade. A integração com IA será disponibilizada em breve.
        </p>
      </div>

      {/* Generator */}
      <div className="p-6 rounded-xl bg-surface border border-border-subtle">
        <h2 className="text-sm font-medium text-text-primary mb-4">Gerar conteúdo</h2>
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {templates.map((t, i) => (
              <button
                key={i}
                onClick={() => setPrompt(t.prompt)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-border-subtle text-text-secondary hover:text-accent hover:border-accent/30 transition-colors"
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva seu produto para gerar título, descrição e palavras-chave..."
            className="w-full h-28 bg-bg border border-border rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 resize-none transition-colors"
          />
          <Button onClick={handleGenerate} loading={loading} disabled={!prompt.trim()}>
            <Sparkles className="w-4 h-4 mr-1" />
            Gerar com IA
          </Button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="p-6 rounded-xl bg-surface border border-accent/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-text-primary">Resultado</h2>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-surface-raised transition-colors"
                title="Copiar"
              >
                {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={handleGenerate}
                className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-surface-raised transition-colors"
                title="Gerar novamente"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <pre className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap font-sans">{result}</pre>
        </div>
      )}
    </div>
  )
}
