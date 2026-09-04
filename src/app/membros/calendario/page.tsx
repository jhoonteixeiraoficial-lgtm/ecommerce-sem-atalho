'use client'

import { useEffect, useState } from 'react'
import { Calendar, Clock, Video, ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

interface Live {
  id: string
  title: string
  description: string
  scheduled_at: string
  duration_minutes: number
  replay_url: string
  is_live: boolean
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

function downloadIcs(title: string, scheduledAt: string) {
  const d = new Date(scheduledAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const dtStart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const event = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${dtStart}\nSUMMARY:${title} - E-commerce Sem Atalho\nEND:VEVENT\nEND:VCALENDAR`
  const blob = new Blob([event], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/\s+/g, '-').toLowerCase()}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

export default function CalendarioPage() {
  const [lives, setLives] = useState<Live[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const fetchLives = async () => {
      const { data, error } = await supabase
        .from('lives')
        .select('id, title, description, scheduled_at, duration_minutes, replay_url, is_live')
        .order('scheduled_at', { ascending: false })

      if (!error) {
        setLives(data || [])
      }
      setLoading(false)
    }

    void fetchLives()
  }, [])

  const now = new Date()
  const upcomingLives = lives.filter(l => new Date(l.scheduled_at) > now && !l.is_live && !l.replay_url)
  const pastLives = lives.filter(l => l.replay_url && !l.is_live)

  if (loading) {
    return <div className="p-6 text-text-muted">Carregando...</div>
  }

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
        {upcomingLives.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma live agendada</p>
        ) : (
          <div className="space-y-3">
            {upcomingLives.map((live) => (
              <div key={live.id} className="p-4 rounded-xl bg-surface border border-border-subtle flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-accent-soft">
                    <Video className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-text-primary">{live.title}</h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {new Date(live.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {new Date(live.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => downloadIcs(live.title, live.scheduled_at)}>
                  Adicionar ao calendário
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past */}
      <div>
        <h2 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-text-muted" />
          Lives Anteriores
        </h2>
        {pastLives.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum replay disponível</p>
        ) : (
          <div className="space-y-3">
            {pastLives.map((live) => (
              <div key={live.id} className="p-4 rounded-xl bg-surface border border-border-subtle flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-text-primary">{live.title}</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    {new Date(live.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · {formatDuration(live.duration_minutes)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!live.replay_url}
                  onClick={() => live.replay_url && window.open(live.replay_url, '_blank')}
                >
                  Assistir
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
