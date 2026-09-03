'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { ChevronDown, ArrowRight, Menu, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'

const faqItems = [
  { q: 'Preciso de experiência pra participar?', a: 'Não. O curso foi pensado do zero. Se você nunca vendeu online, vai aprender passo a passo. Se já vende e quer escalar, tem conteúdo avançado também.' },
  { q: 'Como funciona o acesso?', a: 'O acesso é por assinatura mensal. Enquanto estiver ativo, você tem acesso completo a todo o conteúdo, comunidade, lives e materiais.' },
  { q: 'Tem garantia?', a: 'Sim. 7 dias de garantia incondicional. Se não gostar por qualquer motivo, devolvemos 100% do valor. Sem perguntas, sem burocracia.' },
  { q: 'Preciso de estoque próprio?', a: 'Não necessariamente. Ensinamos modelos sem estoque (Dropshipping e Also Drop) e com estoque próprio. Você escolhe o modelo que melhor se encaixa na sua realidade.' },
  { q: 'As lives ficam gravadas?', a: 'Sim. Todas ficam disponíveis na plataforma pra assistir quando quiser. Nunca perde uma aula.' },
  { q: 'Tem suporte?', a: 'Sim. Chat ao vivo, e-mail, base de conhecimento e comunidade ativa. Você nunca fica sozinho nessa jornada.' },
  { q: 'Como funciona o pagamento?', a: 'Aceitamos cartão de crédito, boleto e PIX. O acesso é imediato após a confirmação do pagamento.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim. Cancele a qualquer momento sem multa nem burocracia.' },
]

const modules = [
  { id: '00', title: 'Comece Aqui', desc: 'Mentalidade e primeiros passos para sua operação.' },
  { id: '01', title: 'Mercado Livre do Zero', desc: 'Tudo sobre a plataforma: conta, regras, funcionamento.' },
  { id: '02', title: 'Pesquisa de Produtos', desc: 'Encontre produtos lucrativos com dados e análise.' },
  { id: '03', title: 'Fornecedores', desc: 'Como encontrar, negociar e fechar bons negócios.' },
  { id: '04', title: 'Criando Anúncios', desc: 'Anúncios que aparecem e convertem em vendas.' },
  { id: '05', title: 'IA para Mercado Livre', desc: 'Inteligência artificial aplicada à operação.' },
  { id: '06', title: 'Fotos e Clips', desc: 'Imagens e vídeos que vendem mais.' },
  { id: '07', title: 'Precificação', desc: 'Margens, custos e lucro real.' },
  { id: '08', title: 'Primeiras Vendas', desc: 'Do zero ao primeiro cliente consistente.' },
  { id: '09', title: 'Logística e Full', desc: 'Entregas, armazenamento e estratégia.' },
  { id: '10', title: 'Mercado Ads', desc: 'Tráfego pago no Mercado Livre.' },
  { id: '11', title: 'Escala e Gestão', desc: 'Cresça de forma sustentável e organizada.' },
  { id: '12', title: 'Lives Exclusivas', desc: 'Conteúdo atualizado toda semana.' },
]

const obstacles = [
  { num: '01', title: 'Produto', desc: 'Encontrar produtos que façam sentido financeiramente.' },
  { num: '02', title: 'Margem', desc: 'Entender taxas, impostos, publicidade e lucro real.' },
  { num: '03', title: 'Anúncio', desc: 'Construir ofertas que apareçam e convertam.' },
  { num: '04', title: 'Logística', desc: 'Escolher a melhor estratégia para armazenar e enviar.' },
  { num: '05', title: 'Publicidade', desc: 'Investir em Mercado Ads sem destruir a margem.' },
  { num: '06', title: 'Escala', desc: 'Crescer sem perder o controle financeiro.' },
]

const solutions = [
  { name: 'E-commerce Sem Atalho', desc: 'Treinamento completo para Mercado Livre. Do básico ao avançado, com método e prática.', cta: 'Conhecer o treinamento' },
  { name: 'Acertive Ecom', desc: 'Tecnologia para auxiliar pesquisa, anúncios e decisões do vendedor.', cta: 'Ver a ferramenta' },
  { name: 'Comunidade E-commerce Sem Atalho', desc: 'Ambiente para troca de experiências, networking e aprendizado contínuo.', cta: 'Entrar na comunidade' },
  { name: 'Lives', desc: 'Conteúdo atualizado e aplicação prática toda semana.', cta: 'Ver agenda' },
  { name: 'Materiais', desc: 'Planilhas, checklists e recursos prontos para aplicar.', cta: 'Ver materiais' },
]

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [openModule, setOpenModule] = useState<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const sectionsRef = useRef<HTMLElement[]>([])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('fade-in')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )

    const sections = document.querySelectorAll('[data-animate]')
    sections.forEach((section) => observer.observe(section))

    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header
        className={`fixed top-0 w-full z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-bg/90 backdrop-blur-xl border-b border-border-subtle'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img src="/logo-horizontal.svg" alt="E-commerce Sem Atalho" className="h-8" />
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#ecossistema" className="text-sm text-text-secondary hover:text-text-primary transition-colors nav-link">Ecossistema</a>
            <a href="#solucoes" className="text-sm text-text-secondary hover:text-text-primary transition-colors nav-link">Soluções</a>
            <a href="#conteudo" className="text-sm text-text-secondary hover:text-text-primary transition-colors nav-link">Conteúdo</a>
            <a href="#acertive" className="text-sm text-text-secondary hover:text-text-primary transition-colors nav-link">Acertive</a>
            <a href="#planos" className="text-sm text-text-secondary hover:text-text-primary transition-colors nav-link">Planos</a>
            <Link href="/login" className="text-sm text-text-secondary hover:text-text-primary transition-colors nav-link">
              Entrar
            </Link>
            <Link href="/cadastro">
              <Button size="sm" className="text-xs font-medium">
                Conhecer o E-commerce Sem Atalho
              </Button>
            </Link>
          </div>
          <button
            className="md:hidden p-2 text-text-secondary hover:text-text-primary"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border-subtle bg-bg/95 backdrop-blur-xl">
            <nav className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-3">
              <a href="#ecossistema" onClick={() => setMobileMenuOpen(false)} className="text-sm text-text-secondary hover:text-text-primary py-2">Ecossistema</a>
              <a href="#solucoes" onClick={() => setMobileMenuOpen(false)} className="text-sm text-text-secondary hover:text-text-primary py-2">Soluções</a>
              <a href="#conteudo" onClick={() => setMobileMenuOpen(false)} className="text-sm text-text-secondary hover:text-text-primary py-2">Conteúdo</a>
              <a href="#acertive" onClick={() => setMobileMenuOpen(false)} className="text-sm text-text-secondary hover:text-text-primary py-2">Acertive</a>
              <a href="#planos" onClick={() => setMobileMenuOpen(false)} className="text-sm text-text-secondary hover:text-text-primary py-2">Planos</a>
              <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-sm text-text-secondary hover:text-text-primary py-2">Entrar</Link>
              <Link href="/cadastro" onClick={() => setMobileMenuOpen(false)}>
                <Button size="sm" className="text-xs font-medium mt-2">Conhecer o E-commerce Sem Atalho</Button>
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 bg-bg overflow-hidden">
        {/* Animated Background Orbs */}
        <div className="absolute inset-0 z-0">
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
          <div className="orb orb-3"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/60 to-bg"></div>
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm font-medium text-accent uppercase tracking-widest mb-6">E-commerce na prática</p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-text-primary leading-[1.1] mb-8 tracking-tight">
                Aprenda a vender no
                <br />
                Mercado Livre com método,
                <br />
                margem e processo.
              </h1>
              <p className="text-lg text-text-secondary leading-relaxed mb-10 max-w-lg">
                Sem fórmula mágica. Sem promessa de dinheiro fácil.
                Da escolha do produto à escala de uma operação real.
              </p>
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <Link href="/cadastro">
                  <Button size="lg" className="text-sm px-8">
                    Conhecer o E-commerce Sem Atalho
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <a href="#ecossistema" className="text-sm text-text-muted hover:text-text-secondary transition-colors flex items-center gap-2 mt-2">
                  Explorar o ecossistema
                  <ChevronDown className="w-4 h-4" />
                </a>
              </div>
            </div>
            <div className="hidden lg:flex justify-end">
              <div className="relative w-full max-w-md aspect-[3/4] rounded-2xl overflow-hidden">
                <Image
                  src="/fotos/J&T-208.jpg"
                  alt="Jonatha Teixeira - Fundador do E-commerce Sem Atalho"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 01 — Nossa Origem */}
      <section className="py-24 px-6 bg-surface" id="ecossistema" data-animate>
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="section-number">01 · Nossa origem</p>
              <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-6 tracking-tight leading-tight">
                Quem faz, ensina.
              </h2>
              <p className="text-text-secondary leading-relaxed mb-4">
                O E-commerce Sem Atalho nasceu para mostrar o que existe por trás de uma operação real no Mercado Livre.
              </p>
              <p className="text-text-secondary leading-relaxed mb-4">
                Produto, fornecedor, preço, anúncio, logística, publicidade, margem e escala.
              </p>
              <p className="text-text-secondary leading-relaxed">
                Sem fórmula secreta. Sem promessa de dinheiro fácil.
                <br />
                Somente processo, execução e consistência.
              </p>
            </div>
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden">
              <Image
                src="/fotos/J&T-211.jpg"
                alt="Jonatha Teixeira - Fundador do E-commerce Sem Atalho"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* O Ecossistema */}
      <section className="py-24 px-6 bg-bg" data-animate>
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-16">
            <p className="section-number">O que é o E-commerce Sem Atalho</p>
            <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-6 tracking-tight leading-tight">
              Muito além de um curso.
            </h2>
            <p className="text-text-secondary leading-relaxed">
              Conteúdo, comunidade, ferramentas e prática conectados para ajudar você a construir uma operação mais profissional no Mercado Livre.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-border rounded-xl overflow-hidden border border-border stagger-grid">
            {['Treinamento', 'Comunidade', 'Lives', 'Acertive Ecom', 'Materiais', 'Operação real'].map((item) => (
              <div key={item} className="p-6 bg-bg text-center card-hover">
                <span className="text-sm font-medium text-text-primary">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 02 — Dores da Operação */}
      <section className="py-24 px-6 bg-surface" data-animate>
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-16">
            <p className="section-number">02 · Obstáculos</p>
            <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary tracking-tight leading-tight">
              Toda operação encontra
              <br />
              obstáculos.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border border-border">
            {obstacles.map((item) => (
              <div key={item.num} className="p-8 bg-bg card-hover">
                <span className="text-xs font-mono text-accent">{item.num}</span>
                <h3 className="text-lg font-semibold text-text-primary mt-3 mb-2">{item.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 03 — Soluções */}
      <section className="py-24 px-6 bg-bg" id="solucoes" data-animate>
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-16">
            <p className="section-number">03 · Soluções</p>
            <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-6 tracking-tight leading-tight">
              Um ecossistema. Diferentes
              <br />
              ferramentas para cada etapa.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-grid">
            {solutions.map((item) => (
              <div key={item.name} className="p-8 rounded-2xl bg-surface border border-border-subtle group hover:border-accent/30 transition-colors card-hover">
                <h3 className="text-lg font-semibold text-text-primary mb-3">{item.name}</h3>
                <p className="text-sm text-text-secondary leading-relaxed mb-6">{item.desc}</p>
                <span className="text-xs font-medium text-accent group-hover:underline cursor-pointer flex items-center gap-1">
                  {item.cta} <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 04 — Comunidade */}
      <section className="py-24 px-6 bg-surface" id="comunidade" data-animate>
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-16">
            <p className="section-number">04 · Comunidade</p>
            <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-6 tracking-tight leading-tight">
              O ambiente também faz
              <br />
              parte do aprendizado.
            </h2>
            <p className="text-text-secondary leading-relaxed">
              Compartilhe experiências, dúvidas, decisões e aprendizados com pessoas que também estão construindo suas operações.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 stagger-grid">
            {[
              { label: 'Operação', img: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=450&fit=crop' },
              { label: 'Conteúdo', img: 'https://images.unsplash.com/photo-1551817958-d9d86fb29431?w=600&h=450&fit=crop' },
              { label: 'Ferramentas', img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=450&fit=crop' },
              { label: 'Bastidores', img: 'https://images.unsplash.com/photo-1556761175-4b46a572b786?w=600&h=450&fit=crop' },
              { label: 'Comunidade', img: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=600&h=450&fit=crop' },
            ].map((item) => (
              <div key={item.label} className="relative aspect-[4/3] bg-bg rounded-xl overflow-hidden border border-border-subtle group">
                <img
                  src={item.img}
                  alt={item.label}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-bg/80 to-transparent">
                  <span className="text-xs font-medium text-text-primary">{item.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 05 — Resultados */}
      <section className="py-24 px-6 bg-bg" id="resultados" data-animate>
        <div className="max-w-6xl mx-auto">
          <div className="max-w-2xl mb-16">
            <p className="section-number">05 · Resultados</p>
            <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary tracking-tight leading-tight">
              Da teoria para a
              <br />
              operação real.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Rafael Mendes',
                store: 'Mendes Acessórios',
                metric: 'R$ 14.200/mês',
                time: 'Há 4 meses',
                text: 'Comecei do zero sem saber nada de Mercado Livre. Hoje faturei mais de R$ 50 mil nos últimos 4 meses. O método não é mágica, mas funciona.',
              },
              {
                name: 'Camila Ferreira',
                store: 'Ferreira Pets',
                metric: 'R$ 8.700/mês',
                time: 'Há 2 meses',
                text: 'Tinha uma loja física e queria expandir pro ML. Em 60 dias já estava faturando mais online do que na loja. O suporte da comunidade é incomparável.',
              },
              {
                name: 'Thiago Oliveira',
                store: 'Casa & Estilo',
                metric: 'R$ 23.500/mês',
                time: 'Há 6 meses',
                text: 'Já tentava vender no ML sozinho e não ia pra frente. Com o método, em 3 meses dobrei meu faturamento. Agora sei exatamente o que fazer.',
              },
            ].map((testimonial) => (
              <div key={testimonial.name} className="bg-surface border border-border rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <img 
                    src={`https://i.pravatar.cc/150?img=${testimonial.name === 'Rafael Mendes' ? '11' : testimonial.name === 'Camila Ferreira' ? '5' : '12'}`}
                    alt={testimonial.name} 
                    className="w-10 h-10 rounded-full object-cover border border-border"
                  />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{testimonial.name}</p>
                    <p className="text-xs text-text-muted">{testimonial.store}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-lg font-semibold text-accent">{testimonial.metric}</span>
                  <span className="text-xs text-text-muted">{testimonial.time}</span>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{testimonial.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 06 — Conteúdo (Accordion) */}
      <section className="py-24 px-6 bg-surface" id="conteudo" data-animate>
        <div className="max-w-3xl mx-auto">
          <div className="mb-16">
            <p className="section-number">06 · Conteúdo</p>
            <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary tracking-tight leading-tight">
              Do zero à operação.
            </h2>
          </div>
          <div className="space-y-px bg-border rounded-xl overflow-hidden border border-border">
            {modules.map((mod, i) => (
              <div key={mod.id} className={`bg-bg accordion-item`} data-open={openModule === i}>
                <button
                  onClick={() => setOpenModule(openModule === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center gap-4 text-left hover:bg-surface transition-colors"
                  aria-expanded={openModule === i}
                >
                  <span className="text-xs font-mono text-text-muted w-6 flex-shrink-0">{mod.id}</span>
                  <span className="text-sm font-medium text-text-primary flex-1">{mod.title}</span>
                  <ChevronDown className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform ${openModule === i ? 'rotate-180' : ''}`} />
                </button>
                <div className="accordion-content" data-open={openModule === i}>
                  <div>
                    <div className="px-6 pb-5 pl-16">
                      <p className="text-sm text-text-secondary leading-relaxed">{mod.desc}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Acertive Ecom */}
      <section className="py-24 px-6 bg-surface" id="acertive" data-animate>
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="section-number">Tecnologia</p>
              <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary mb-6 tracking-tight leading-tight">
                Menos achismo. Mais
                <br />
                informação para decidir.
              </h2>
              <p className="text-text-secondary leading-relaxed mb-8">
                O Acertive Ecom é uma ferramenta de inteligência artificial criada para auxiliar vendedores no Mercado Livre. Pesquisa de produtos, otimização de anúncios e análise de concorrência — tudo em um só lugar.
              </p>
              <Link href="#planos">
                <Button variant="secondary" size="sm" className="text-xs">
                  Conhecer o Acertive
                  <ArrowRight className="w-3 h-3 ml-2" />
                </Button>
              </Link>
            </div>
            <div className="relative aspect-video bg-bg rounded-2xl overflow-hidden border border-border-subtle">
              <img
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=450&fit=crop"
                alt="Dashboard do Acertive Ecom"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 07 — Planos */}
      <section className="py-24 px-6 bg-bg" id="planos" data-animate>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="section-number">07 · Planos</p>
            <h2 className="text-3xl sm:text-4xl font-semibold text-text-primary tracking-tight">
              Escolha o que faz sentido agora.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 stagger-grid">
            {/* E-commerce Sem Atalho */}
            <div className="p-8 rounded-2xl bg-surface border border-border-subtle card-hover">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">E-commerce Sem Atalho</p>
              <div className="mb-8">
                <span className="text-4xl font-semibold text-text-primary">R$ 97</span>
                <span className="text-sm text-text-muted">/mês</span>
              </div>
              <ul className="space-y-3 mb-8">
                {['13 Módulos Completos', 'Comunidade Exclusiva', 'Lives Semanais', 'Materiais para Download', 'Suporte por E-mail'].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-text-secondary">
                    <div className="w-1 h-1 rounded-full bg-accent flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/cadastro">
                <Button variant="secondary" className="w-full text-sm">
                  Começar agora
                </Button>
              </Link>
            </div>

            {/* Acertive */}
            <div className="p-8 rounded-2xl bg-surface border border-border-subtle card-hover">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Acertive Ecom</p>
              <div className="mb-8">
                <span className="text-4xl font-semibold text-text-primary">R$ 29,90</span>
                <span className="text-sm text-text-muted">/mês</span>
              </div>
              <ul className="space-y-3 mb-8">
                {['IA para Títulos e Descrições', 'Otimização de Anúncios', 'Sugestões de Produtos', 'Análise de Concorrentes', 'Suporte Prioritário'].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-text-secondary">
                    <div className="w-1 h-1 rounded-full bg-accent flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/cadastro">
                <Button variant="secondary" className="w-full text-sm">
                  Começar agora
                </Button>
              </Link>
            </div>

            {/* Combo */}
            <div className="relative p-8 rounded-2xl bg-surface border border-accent card-hover">
              <p className="text-xs font-medium text-accent uppercase tracking-wider mb-4">E-commerce Sem Atalho Completo</p>
              <div className="mb-8">
                <span className="text-4xl font-semibold text-accent">R$ 119</span>
                <span className="text-sm text-text-muted">/mês</span>
              </div>
              <ul className="space-y-3 mb-8">
                {['Tudo do Plano E-commerce Sem Atalho', 'Tudo do Acertive Ecom', 'Acesso a Todos os Módulos', 'Lives Exclusivas', 'Suporte Prioritário', 'Materiais Premium'].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-text-secondary">
                    <div className="w-1 h-1 rounded-full bg-accent flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/cadastro">
                <Button className="w-full text-sm">
                  Conhecer o E-commerce Sem Atalho Completo
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>

          <p className="text-center mt-8 text-xs text-text-muted">
            Aceitamos cartão de crédito, boleto e PIX · Acesso imediato · Cancele quando quiser
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6 bg-surface" data-animate>
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-semibold text-text-primary mb-10 tracking-tight text-center">
            Perguntas frequentes
          </h2>
          <div className="space-y-px bg-border rounded-xl overflow-hidden border border-border">
            {faqItems.map((item, i) => (
              <div key={i} className={`bg-bg accordion-item`} data-open={openFaq === i}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-surface transition-colors"
                  aria-expanded={openFaq === i}
                  aria-controls={`faq-${i}`}
                >
                  <span className="text-sm font-medium text-text-primary pr-4">{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-text-muted flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <div className="accordion-content" data-open={openFaq === i}>
                  <div>
                    <div id={`faq-${i}`} className="px-6 pb-5 text-sm text-text-secondary leading-relaxed" role="region">
                      {item.a}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-32 px-6 bg-bg" data-animate>
        <div className="max-w-4xl mx-auto text-center">
          <p className="section-number">Próximo passo</p>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-text-primary mb-8 tracking-tight leading-[1.1]">
            Não existe atalho.
            <br />
            Existe o próximo passo.
          </h2>
          <p className="text-lg text-text-secondary mb-10 max-w-xl mx-auto leading-relaxed">
            Construa uma operação mais profissional no Mercado Livre com método, ferramentas e prática.
          </p>
          <Link href="/cadastro">
            <Button size="lg" className="text-sm px-10">
              Conhecer o E-commerce Sem Atalho
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-16 px-6 bg-surface">
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
            <div className="lg:col-span-2">
              <div className="mb-4">
                <img src="/logo.svg" alt="E-commerce Sem Atalho" className="h-12" />
              </div>
              <p className="text-xs text-text-muted leading-relaxed max-w-xs">
                Educação, ferramentas e conteúdo para quem vende no varejo digital.
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">E-commerce Sem Atalho</p>
              <ul className="space-y-2.5 text-sm text-text-secondary">
                <li><a href="#conteudo" className="hover:text-text-primary transition-colors">Conteúdo</a></li>
                <li><a href="#comunidade" className="hover:text-text-primary transition-colors">Comunidade</a></li>
                <li><a href="#acertive" className="hover:text-text-primary transition-colors">Acertive</a></li>
                <li><a href="#planos" className="hover:text-text-primary transition-colors">Planos</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Conteúdo</p>
              <ul className="space-y-2.5 text-sm text-text-secondary">
                <li><a href="https://www.youtube.com/@Jhoon_teixeira" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors">YouTube</a></li>
                <li><a href="https://www.instagram.com/jhoon_teixeira" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors">Instagram</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">Conta</p>
              <ul className="space-y-2.5 text-sm text-text-secondary">
                <li><Link href="/login" className="hover:text-text-primary transition-colors">Entrar</Link></li>
                <li><Link href="/cadastro" className="hover:text-text-primary transition-colors">Criar conta</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs text-text-muted">© 2026 E-commerce Sem Atalho. Todos os direitos reservados.</span>
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <Link href="/politicas/privacidade" className="hover:text-text-primary transition-colors">Privacidade</Link>
              <Link href="/politicas/termos" className="hover:text-text-primary transition-colors">Termos de uso</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
