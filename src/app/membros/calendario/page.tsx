'use client'

import { Calendar, Clock, Video, ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'

const upcomingLives = [
  { title: 'Estratégias de Precificação', date: '15/09/2026', time: '20:00', status: 'upcoming' },
  { title: 'Mercado Ads na Prática', date: '22/09/2026', time: '20:00', status: 'upcoming' },
  { title: 'Como Escalar no Mercado Livre', date: '29/09/2026', time: '20:00', status: 'upcoming' },
]

const pastLives = [
  { title: 'Pesquisa de Produtos Avançada', date: '01/08/2026', duration: '1h30' },
  { title: 'Anúncios que Convertem', date: '25/07/2026', duration: '1h15' },
  { title: 'Fornecedores e Negociação', date: '18/07/2026', duration: '1h45' },
]

export default function CalendarioPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Calendário</h1>
        <p className="text-sm text-text-muted mt-1">Próximas lives e eventos do E-commerce Sem Atalho.</p>
      </div>

      {/* Upcoming */}
      <div>
        <h2 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-accent" />
          Próximas Lives
        </h2>
        <div className="space-y-3">
          {upcomingLives.map((live, i) => (
            <div key={i} className="p-4 rounded-xl bg-surface border border-border-subtle flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-accent-soft">
                  <Video className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-text-primary">{live.title}</h3>
                  <p className="text-xs text-text-muted mt-0.5">{live.date} às {live.time}</p>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => {
                const dateParts = live.date.split('/')
                const timeParts = live.time.split(':')
                const dtStart = `${dateParts[2]}${dateParts[1]}${dateParts[0]}T${timeParts[0]}${timeParts[1]}00`
                const event = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${dtStart}\nSUMMARY:${live.title} - E-commerce Sem Atalho\nEND:VEVENT\nEND:VCALENDAR`
                const blob = new Blob([event], { type: 'text/calendar' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${live.title.replace(/\s+/g, '-').toLowerCase()}.ics`
                a.click()
                URL.revokeObjectURL(url)
              }}>
                Adicionar ao calendário
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Past */}
      <div>
        <h2 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-text-muted" />
          Lives Anteriores
        </h2>
        <div className="space-y-3">
          {pastLives.map((live, i) => (
            <div key={i} className="p-4 rounded-xl bg-surface border border-border-subtle flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-text-primary">{live.title}</h3>
                <p className="text-xs text-text-muted mt-0.5">{live.date} · {live.duration}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => alert('Gravação disponível em breve!')}>
                Assistir
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
