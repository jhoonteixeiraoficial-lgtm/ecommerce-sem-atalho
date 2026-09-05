'use client'

import { Sparkles, Package, Search, BarChart3, Brain, FileText, ArrowRight } from 'lucide-react'
import Card from '@/components/ui/Card'

const flow = [
  { icon: Package, label: 'Produto' },
  { icon: Search, label: 'Pesquisa' },
  { icon: BarChart3, label: 'Análise de mercado' },
  { icon: Brain, label: 'Inteligência artificial' },
  { icon: FileText, label: 'Anúncio otimizado' },
]

const capabilities = [
  'Analisar referências de anúncios no Mercado Livre',
  'Identificar padrões de títulos, descrições e imagens',
  'Gerar sugestões de título, descrição e atributos com IA',
  'Auxiliar na otimização de imagens do anúncio',
  'Futuramente, publicar e ajustar anúncios direto no Mercado Livre',
]

export default function AssertiveEcommerceIaPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          Assertive E-commerce IA
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Inteligência artificial para pesquisar, analisar e otimizar anúncios no Mercado Livre.
        </p>
      </div>

      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <p className="text-sm text-amber-300">
          <strong>Em desenvolvimento.</strong> O Assertive E-commerce IA ainda está sendo construído. Aqui você confere a visão do que estamos preparando.
        </p>
      </div>

      <Card className="space-y-5">
        <h2 className="text-sm font-medium text-text-primary">Como vai funcionar</h2>
        <div className="flex flex-wrap items-center gap-2">
          {flow.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface-raised border border-border-subtle min-w-[92px]">
                <step.icon className="w-4 h-4 text-accent" />
                <span className="text-[11px] text-text-secondary text-center leading-tight">{step.label}</span>
              </div>
              {i < flow.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-text-muted shrink-0" />}
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted">
          Você informa um produto, o Assistente pesquisa e analisa referências relevantes no Mercado Livre e usa IA para sugerir um anúncio mais competitivo.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-medium text-text-primary">O que estamos construindo</h2>
        <ul className="space-y-2.5">
          {capabilities.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
