'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Video, Play, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

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
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

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

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Live[]>()
    for (const live of lives) {
      const key = dateKey(new Date(live.scheduled_at))
      const list = map.get(key) ?? []
      list.push(live)
      map.set(key, list)
    }
    return map
  }, [lives])

  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const leading = firstDay.getDay()
    const cells: Array<{ date: Date; isCurrentMonth: boolean }> = []
    for (let i = 0; i < leading; i++) {
      cells.push({ date: new Date(year, month, i - leading + 1), isCurrentMonth: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), isCurrentMonth: true })
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), isCurrentMonth: false })
    }
    return cells
  }, [viewMonth])

  const today = new Date()
  const monthLabel = viewMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  if (loading) {
    return <div className="p-6 text-text-muted">Carregando...</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Calendário</h1>
        <p className="text-sm text-text-muted mt-1">Próximas lives e eventos do E-commerce Sem Atalho.</p>
      </div>

      {/* Month grid */}
      <div className="p-4 rounded-xl bg-surface border border-border-subtle">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-text-primary capitalize">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-raised transition-colors"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-raised transition-colors"
              aria-label="Próximo mês"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={i} className="text-[10px] text-text-muted font-medium py-1">{label}</div>
          ))}
          {calendarDays.map(({ date, isCurrentMonth }, i) => {
            const key = dateKey(date)
            const dayEvents = eventsByDay.get(key) ?? []
            const isToday = dateKey(date) === dateKey(today)
            return (
              <div
                key={i}
                className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs ${
                  !isCurrentMonth ? 'text-text-muted/40' : isToday ? 'bg-accent/15 text-accent font-medium' : 'text-text-secondary'
                }`}
              >
                <span>{date.getDate()}</span>
                {dayEvents.length > 0 && isCurrentMonth && (
                  <span className="w-1 h-1 rounded-full bg-accent mt-0.5" />
                )}
              </div>
            )
          })}
        </div>
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
                {live.replay_url ? (
                  <Link href="/membros/lives">
                    <Button size="sm" variant="ghost">
                      Assistir
                      <Play className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                ) : (
                  <Button size="sm" variant="ghost" disabled>
                    Assistir
                    <Play className="w-3 h-3 ml-1" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
