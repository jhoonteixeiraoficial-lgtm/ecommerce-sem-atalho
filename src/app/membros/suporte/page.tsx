'use client'

import { MessageCircle, Book, Video, Mail, ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'

export default function SuportePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Suporte</h1>
        <p className="text-sm text-text-muted mt-1">Precisa de ajuda? Estamos aqui.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { icon: MessageCircle, title: 'Chat ao Vivo', desc: 'Fale com nossa equipe.', schedule: 'Seg-Sex: 9h às 18h', cta: '', color: 'text-accent', href: '', comingSoon: true },
          { icon: Mail, title: 'E-mail', desc: 'Envie sua dúvida por e-mail.', schedule: 'suporte@ecommercesematalho.com.br', cta: 'Enviar E-mail', color: 'text-blue-400', href: 'mailto:suporte@ecommercesematalho.com.br', comingSoon: false },
          { icon: Book, title: 'Base de Conhecimento', desc: 'Artigos e tutoriais.', schedule: '', cta: '', color: 'text-green-400', href: '', comingSoon: true },
          { icon: Video, title: 'Videoaulas de Ajuda', desc: 'Aprenda a usar a plataforma.', schedule: '', cta: 'Acessar', color: 'text-purple-400', href: '/membros/aulas', comingSoon: false },
        ].map((item, i) => (
          <div key={i} className="p-5 rounded-xl bg-surface border border-border-subtle">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg bg-surface-raised flex-shrink-0 ${item.comingSoon ? 'opacity-50' : ''}`}>
                <item.icon className={`w-4 h-4 ${item.color}`} />
              </div>
              <div>
                <h3 className="text-sm font-medium text-text-primary">{item.title}</h3>
                <p className="text-xs text-text-muted mt-1">{item.desc}</p>
                {item.schedule && <p className="text-[10px] text-text-muted mt-1">{item.schedule}</p>}
                {item.comingSoon ? (
                  <p className="text-xs text-text-muted mt-3">Em breve</p>
                ) : (
                  <Link href={item.href}>
                    <Button size="sm" variant="secondary" className="mt-3">
                      <ExternalLink className="w-3.5 h-3.5" />
                      {item.cta}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-5 rounded-xl bg-surface border border-border-subtle">
        <h3 className="text-sm font-medium text-text-primary mb-4">Perguntas Frequentes</h3>
        <div className="space-y-2">
          {[
            { q: 'Como acesso as aulas?', a: 'Acesse o menu "Aulas" e selecione o módulo desejado.' },
            { q: 'Como cancelo minha assinatura?', a: 'Acesse seu perfil em "Assinatura" e clique em "Cancelar".' },
            { q: 'As lives ficam gravadas?', a: 'Sim, todas ficam disponíveis na seção "Lives".' },
          ].map((faq, i) => (
            <div key={i} className="p-3 rounded-lg bg-bg border border-border-subtle">
              <p className="text-xs font-medium text-text-primary">{faq.q}</p>
              <p className="text-xs text-text-muted mt-1">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
