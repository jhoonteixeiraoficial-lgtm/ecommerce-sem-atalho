'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Video, Play, ChevronLeft, ChevronRight, FileText, BookOpen, Download, Bell, Star, X } from 'lucide-react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

type EventType = 'live' | 'conteudo' | 'aula' | 'material' | 'atualizacao' | 'evento_especial'
type EventStatus = 'agendada' | 'ao_vivo' | 'encerrada' | 'cancelada'

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

interface AgendaEvent {
  id: string
  title: string
  description: string
  scheduled_at: string
  duration_minutes: number
  replay_url: string
  is_live: boolean
  type: EventType
  status: EventStatus
  youtube_url: string
  youtube_video_id: string
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  live: 'Live',
  conteudo: 'Conteúdo',
  aula: 'Aula',
  material: 'Material',
  atualizacao: 'Atualização',
  evento_especial: 'Evento Especial',
}

const EVENT_TYPE_ICONS: Record<EventType, typeof Video> = {
  live: Video,
  conteudo: FileText,
  aula: BookOpen,
  material: Download,
  atualizacao: Bell,
  evento_especial: Star,
}

const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  agendada: 'Agendada',
  ao_vivo: 'Ao Vivo',
  encerrada: 'Encerrada',
  cancelada: 'Cancelada',
}

const EVENT_STATUS_COLORS: Record<EventStatus, string> = {
  agendada: 'text-accent',
  ao_vivo: 'text-red-500',
  encerrada: 'text-text-muted',
  cancelada: 'text-error',
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
  const [events, setEvents] = useState<AgendaEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [showDayEvents, setShowDayEvents] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const fetchEvents = async () => {
      const { data, error } = await supabase
        .from('lives')
        .select('id, title, description, scheduled_at, duration_minutes, replay_url, is_live, type, status, youtube_url, youtube_video_id')
        .order('scheduled_at', { ascending: false })

      if (!error) {
        setEvents(data || [])
      }
      setLoading(false)
    }

    void fetchEvents()
  }, [])

  const now = new Date()
  const upcomingEvents = events.filter(e => {
    const d = new Date(e.scheduled_at)
    return d > now && e.status !== 'ao_vivo' && e.status !== 'encerrada' && e.status !== 'cancelada' && !e.replay_url
  })
  const pastEvents = events.filter(e => e.replay_url && e.status !== 'ao_vivo')

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>()
    for (const event of events) {
      const key = dateKey(new Date(event.scheduled_at))
      const list = map.get(key) ?? []
      list.push(event)
      map.set(key, list)
    }
    return map
  }, [events])

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
            const isSelected = selectedDay && dateKey(date) === dateKey(selectedDay)
            const hasEvents = dayEvents.length > 0 && isCurrentMonth
            return (
              <button
                key={i}
                onClick={() => {
                  if (hasEvents) {
                    setSelectedDay(date)
                    setShowDayEvents(true)
                  }
                }}
                className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-colors ${
                  !isCurrentMonth
                    ? 'text-text-muted/40'
                    : isSelected
                      ? 'bg-accent/20 text-accent font-medium ring-1 ring-accent/40'
                      : isToday
                        ? 'bg-accent/15 text-accent font-medium'
                        : hasEvents
                          ? 'text-text-secondary hover:bg-surface-raised cursor-pointer'
                          : 'text-text-secondary'
                }`}
              >
                <span>{date.getDate()}</span>
                {hasEvents && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayEvents.slice(0, 3).map((event, j) => (
                      <span
                        key={j}
                        className={`w-1 h-1 rounded-full ${
                          event.type === 'live' ? 'bg-red-500' : 'bg-accent'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Day Events Modal */}
      {showDayEvents && selectedDay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowDayEvents(false)}>
          <div className="bg-surface border border-border-subtle rounded-xl p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-text-primary">
                {selectedDay.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </h3>
              <button onClick={() => setShowDayEvents(false)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              {(eventsByDay.get(dateKey(selectedDay)) ?? []).map(event => {
                const EventIcon = EVENT_TYPE_ICONS[event.type]
                return (
                  <div key={event.id} className="p-3 rounded-lg bg-bg border border-border-subtle">
                    <div className="flex items-center gap-2 mb-1">
                      <EventIcon className="w-4 h-4 text-accent" />
                      <span className="text-xs font-medium text-accent">{EVENT_TYPE_LABELS[event.type]}</span>
                      <span className={`text-[10px] font-medium ${EVENT_STATUS_COLORS[event.status]}`}>
                        {EVENT_STATUS_LABELS[event.status]}
                      </span>
                    </div>
                    <h4 className="text-sm font-medium text-text-primary">{event.title}</h4>
                    <p className="text-xs text-text-muted mt-0.5">
                      {new Date(event.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      {formatDuration(event.duration_minutes)}
                    </p>
                    {event.description && (
                      <p className="text-xs text-text-secondary mt-1 line-clamp-2">{event.description}</p>
                    )}
                    {event.type === 'live' && event.replay_url && (
                      <Link href="/membros/lives" className="mt-2 inline-block">
                        <Button size="sm" variant="ghost">
                          <Play className="w-3 h-3" />
                          Assistir replay
                        </Button>
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
            <Button onClick={() => setShowDayEvents(false)} className="w-full">Fechar</Button>
          </div>
        </div>
      )}

      {/* Upcoming Events */}
      <div>
        <h2 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-accent" />
          Próximos Eventos
        </h2>
        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum evento agendado</p>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((event) => {
              const EventIcon = EVENT_TYPE_ICONS[event.type]
              return (
                <div key={event.id} className="p-4 rounded-xl bg-surface border border-border-subtle flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-accent-soft">
                      <EventIcon className="w-4 h-4 text-accent" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-text-primary">{event.title}</h3>
                        <span className="text-[10px] text-text-muted bg-surface-raised px-1.5 py-0.5 rounded">
                          {EVENT_TYPE_LABELS[event.type]}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        {new Date(event.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {new Date(event.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => downloadIcs(event.title, event.scheduled_at)}>
                    Adicionar ao calendário
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Past Events */}
      <div>
        <h2 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-text-muted" />
          Eventos Anteriores
        </h2>
        {pastEvents.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum evento anterior</p>
        ) : (
          <div className="space-y-3">
            {pastEvents.map((event) => {
              const EventIcon = EVENT_TYPE_ICONS[event.type]
              return (
                <div key={event.id} className="p-4 rounded-xl bg-surface border border-border-subtle flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-surface-raised">
                      <EventIcon className="w-4 h-4 text-text-muted" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-text-primary">{event.title}</h3>
                      <p className="text-xs text-text-muted mt-0.5">
                        {new Date(event.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · {formatDuration(event.duration_minutes)}
                      </p>
                    </div>
                  </div>
                  {event.type === 'live' && event.replay_url ? (
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
