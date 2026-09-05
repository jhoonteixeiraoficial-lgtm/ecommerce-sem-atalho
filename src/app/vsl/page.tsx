'use client'

import { ArrowRight, Play, Shield, Check, Clock, Lock, Award } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'

export default function VSLPage() {
  return (
    <div className="min-h-screen bg-bg">
      {/* Urgency Banner */}
      <div className="bg-accent text-bg py-2 px-4 text-center text-sm font-medium">
        🔥 Últimas vagas com preço atual — Garanta a sua agora
      </div>

      {/* Header */}
      <header className="py-4 px-4 border-b border-border-subtle">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-accent">E-commerce Sem Atalho</h1>
          <Link href="/cadastro">
            <Button size="sm">
              Quero Começar Agora
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </header>

      {/* VSL Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* VSL Placeholder */}
          <div className="aspect-video bg-surface rounded-2xl flex items-center justify-center mb-12 border border-border-subtle relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-bg/50 to-transparent"></div>
            <div className="text-center relative z-10">
              <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center mx-auto mb-4 cursor-pointer hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20" onClick={() => alert('Vídeo será disponibilizado em breve!')}>
                <Play className="w-10 h-10 text-bg ml-1" />
              </div>
              <p className="text-text-secondary font-medium">Assista ao vídeo antes de continuar</p>
              <p className="text-xs text-text-muted mt-1">12 minutos que podem mudar seu negócio</p>
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-text-primary mb-6 leading-tight">
            Descubra como pessoas comuns estão construindo um negócio lucrativo no Mercado Livre
          </h1>

          <p className="text-xl text-text-secondary mb-8 max-w-2xl mx-auto">
            Um método prático e testado que já ajudou mais de 2.000 pessoas a começarem do zero e faturarem de verdade.
          </p>

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary mb-10">
            <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-accent" /> 7 dias de garantia</span>
            <span className="flex items-center gap-2"><Lock className="w-4 h-4 text-accent" /> Pagamento seguro</span>
            <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Assinatura mensal</span>
            <span className="flex items-center gap-2"><Award className="w-4 h-4 text-accent" /> +2.000 alunos</span>
          </div>

          <Link href="/cadastro">
            <Button size="lg" className="text-lg px-8">
              Quero Começar Agora
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>

          <p className="text-xs text-text-muted mt-4">
            Assinatura mensal · 7 dias de garantia · Cancele quando quiser
          </p>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 px-4 bg-surface">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-text-primary text-center mb-12">
            Você já passou por alguma dessas situações?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              'Anúncios que não convertem e dinheiro jogado fora',
              'Dúvidas que ninguém responde e sem comunidade',
              'Informações desencontradas na internet',
              'Medo de investir e não ter retorno',
              'Margem que some e lucro que não aparece',
              'Sem saber por onde começar do zero',
            ].map((problem, i) => (
              <div key={i} className="flex items-center gap-3 p-4 bg-bg rounded-xl border border-border-subtle">
                <span className="text-xl">😤</span>
                <span className="text-text-secondary">{problem}</span>
              </div>
            ))}
          </div>

          <p className="text-accent font-medium text-center mt-8 text-lg">
            A boa notícia: tudo isso tem solução. E é exatamente o que você vai aprender no E-commerce Sem Atalho.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-text-primary text-center mb-4">
            O que você vai aprender
          </h2>
          <p className="text-text-secondary text-center mb-12">
            Um método completo que já transformou mais de 2.000 vendedores.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              'Como encontrar produtos lucrativos no Mercado Livre',
              'Como criar anúncios que convertem de verdade',
              'Como usar inteligência artificial nos seus anúncios',
              'Como negociar com fornecedores e ter melhor preço',
              'Como precificar para ter lucro real, não só faturamento',
              'Como escalar seu negócio de forma sustentável',
            ].map((benefit, i) => (
              <div key={i} className="flex items-center gap-3 p-4 bg-surface rounded-xl">
                <Check className="w-5 h-5 text-accent flex-shrink-0" />
                <span className="text-text-secondary">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-20 px-4 bg-surface">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-text-primary mb-12">
            Veja o que nossos alunos dizem
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { name: 'Carlos M.', text: 'Em 3 meses já estava faturando R$ 45k/mês. O método funciona.', metric: 'R$ 45k/mês' },
              { name: 'Ana B.', text: 'Concilo com a maternidade e tenho meses muito bons. Recomendo.', metric: 'R$ 25k/mês' },
              { name: 'Pedro O.', text: 'O Assertive E-commerce IA mudou meus anúncios. Conversão subiu 180%.', metric: '+180%' },
            ].map((t, i) => (
              <div key={i} className="p-6 rounded-xl bg-bg border border-border-subtle text-left">
                <div className="flex items-center gap-0.5 mb-3">
                  {[...Array(5)].map((_, j) => (
                    <span key={j} className="text-accent">★</span>
                  ))}
                </div>
                <p className="text-sm text-text-secondary mb-4">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">{t.name}</span>
                  <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-1 rounded-full">{t.metric}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guarantee */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <Shield className="w-12 h-12 text-accent mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-text-primary mb-4">
            Garantia de 7 dias — Risco zero
          </h2>
          <p className="text-text-secondary text-lg mb-6">
            Se não gostar por qualquer motivo em até 7 dias, devolvemos 100% do valor. Sem perguntas, sem burocracia. O risco é todo nosso — não o seu.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-text-muted">
            <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-accent" /> 7 dias de garantia</span>
            <span className="flex items-center gap-2"><Lock className="w-4 h-4 text-accent" /> Pagamento seguro</span>
            <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Assinatura mensal</span>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 px-4 bg-surface border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-6">
            Chega de enrolação. Hora de faturar de verdade.
          </h2>
          <p className="text-text-secondary text-lg mb-8">
            Junte-se a mais de 2.000 pessoas que já começaram. Cada dia que passa sem o método certo é dinheiro que fica na mesa.
          </p>
          <Link href="/cadastro">
            <Button size="lg" className="text-lg px-8">
              Quero Começar Agora
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          <p className="text-xs text-text-muted mt-4">
            Assinatura mensal · 7 dias de garantia · Cancele quando quiser
          </p>
        </div>
      </section>
    </div>
  )
}
