'use client'

import { useEffect, useState } from 'react'
import {
  Calendar,
  Plus,
  Trash2,
  Edit3,
  Radio,
  Square,
  ExternalLink,
  Copy,
  Check,
  X,
  Play,
  FileText,
  BookOpen,
  Download,
  Bell,
  Star,
  Video,
  Clock,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/

function extractYouTubeVideoId(url: string): string {
  if (!url) return ''
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return ''
  }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0]
    return YOUTUBE_ID_RE.test(id) ? id : ''
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v')
      return id && YOUTUBE_ID_RE.test(id) ? id : ''
    }
    const embedMatch = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/)
    if (embedMatch) return embedMatch[1]
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)
    if (shortsMatch) return shortsMatch[1]
  }
  return ''
}

type EventType = 'live' | 'conteudo' | 'aula' | 'material' | 'atualizacao' | 'evento_especial'
type EventStatus = 'agendada' | 'ao_vivo' | 'encerrada' | 'cancelada' | 'replay'

interface AgendaEvent {
  id: string
  title: string
  description: string
  scheduled_at: string
  duration_minutes: number
  replay_url: string
  watch_url: string
  is_live: boolean
  stream_key: string
  rtmp_url: string
  viewer_count: number
  created_at: string
  type: EventType
  status: EventStatus
  youtube_url: string
  youtube_video_id: string
  thumbnail_url: string
  replay_available: boolean
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
  replay: 'Replay',
}

const EVENT_STATUS_COLORS: Record<EventStatus, string> = {
  agendada: 'text-accent',
  ao_vivo: 'text-red-500',
  encerrada: 'text-text-muted',
  cancelada: 'text-error',
  replay: 'text-green-400',
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    full: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  }
}

async function loadEvents() {
  const response = await fetch('/api/admin/lives')
  if (!response.ok) throw new Error('Unable to load events')
  const data = await response.json() as { lives: AgendaEvent[] }
  return data.lives
}

class ApiError extends Error {
  constructor(public status: number) {
    super('API request failed')
  }
}

export default function AdminAgendaPage() {
  const [events, setEvents] = useState<AgendaEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<AgendaEvent | null>(null)
  const [showStreamModal, setShowStreamModal] = useState<AgendaEvent | null>(null)
  const [showReplayModal, setShowReplayModal] = useState<AgendaEvent | null>(null)
  const [replayUrl, setReplayUrl] = useState('')
  const [watchUrl, setWatchUrl] = useState('')
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [filterType, setFilterType] = useState<EventType | 'all'>('all')

  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduled_at: '',
    duration_minutes: 60,
    type: 'live' as EventType,
    status: 'agendada' as EventStatus,
    youtube_url: '',
    thumbnail_url: '',
  })

  useEffect(() => {
    loadEvents()
      .then(setEvents)
      .catch(() => setError('Erro ao carregar eventos'))
      .finally(() => setLoading(false))
  }, [])

  const fetchEvents = async () => {
    try {
      const refreshedEvents = await loadEvents()
      setEvents(refreshedEvents)
      return refreshedEvents
    } catch {
      setError('Erro ao carregar eventos')
      return []
    } finally {
      setLoading(false)
    }
  }

  const openStreamModal = (event: AgendaEvent) => {
    setShowStreamModal(event)
    setWatchUrl(event.watch_url || '')
  }

  const mutateEvent = async (method: 'POST' | 'PUT', body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/lives', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new ApiError(response.status)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.title || !form.scheduled_at) {
      setError('Título e data são obrigatórios')
      return
    }

    try {
      const scheduledAt = new Date(form.scheduled_at).toISOString()
      const payload = {
        title: form.title,
        description: form.description,
        scheduled_at: scheduledAt,
        duration_minutes: form.duration_minutes,
        type: form.type,
        status: form.status,
        youtube_url: form.youtube_url,
        thumbnail_url: form.thumbnail_url,
      }

      if (editingEvent) {
        await mutateEvent('PUT', { id: editingEvent.id, ...payload })
      } else {
        await mutateEvent('POST', payload)
      }
    } catch {
      setError(editingEvent ? 'Erro ao atualizar evento' : 'Erro ao criar evento')
      return
    }

    resetForm()
    await fetchEvents()
  }

  const resetForm = () => {
    setForm({
      title: '',
      description: '',
      scheduled_at: '',
      duration_minutes: 60,
      type: 'live',
      status: 'agendada',
      youtube_url: '',
      thumbnail_url: '',
    })
    setEditingEvent(null)
    setShowForm(false)
  }

  const handleEdit = (event: AgendaEvent) => {
    setEditingEvent(event)
    setForm({
      title: event.title,
      description: event.description,
      scheduled_at: event.scheduled_at ? new Date(event.scheduled_at).toISOString().slice(0, 16) : '',
      duration_minutes: event.duration_minutes,
      type: event.type,
      status: event.status,
      youtube_url: event.youtube_url || '',
      thumbnail_url: event.thumbnail_url || '',
    })
    setShowForm(true)
  }

  const handleStartLive = async (event: AgendaEvent) => {
    if (!event.rtmp_url || !event.stream_key) {
      openStreamModal(event)
      return
    }

    try {
      await mutateEvent('PUT', { id: event.id, status: 'ao_vivo', is_live: true })
      const refreshedEvents = await fetchEvents()
      openStreamModal(refreshedEvents.find(item => item.id === event.id) ?? event)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        openStreamModal({ ...event, rtmp_url: '', stream_key: '' })
        return
      }
      setError('Erro ao iniciar live')
    }
  }

  const handleSaveWatchUrl = async () => {
    if (!showStreamModal) return

    try {
      await mutateEvent('PUT', { id: showStreamModal.id, watch_url: watchUrl })
    } catch {
      setError('Erro ao salvar link para os membros')
      return
    }

    await fetchEvents()
  }

  const handleSaveReplay = async () => {
    if (!showReplayModal) return

    try {
      await mutateEvent('PUT', {
        id: showReplayModal.id,
        replay_url: replayUrl,
        replay_available: true,
        youtube_url: replayUrl,
      })
    } catch {
      setError('Erro ao salvar replay')
      return
    }

    setShowReplayModal(null)
    setReplayUrl('')
    await fetchEvents()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este evento?')) return

    try {
      const response = await fetch(`/api/admin/lives?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Unable to delete event')
    } catch {
      setError('Erro ao excluir evento')
      return
    }

    await fetchEvents()
  }

  const handleCancel = async (event: AgendaEvent) => {
    if (!confirm('Tem certeza que deseja cancelar este evento?')) return

    try {
      await mutateEvent('PUT', { id: event.id, status: 'cancelada' })
    } catch {
      setError('Erro ao cancelar evento')
      return
    }

    await fetchEvents()
  }

  const handleStopLive = async (event: AgendaEvent) => {
    if (!confirm('Encerrar esta live?')) return

    try {
      await mutateEvent('PUT', {
        id: event.id,
        status: 'encerrada',
        is_live: false,
      })
    } catch {
      setError('Erro ao encerrar live')
      return
    }

    await fetchEvents()
  }

  const handleSetReplay = async (event: AgendaEvent) => {
    const defaultUrl = event.youtube_url || ''
    const replayUrl = prompt('URL da gravação (YouTube):', defaultUrl)
    if (replayUrl === null) return

    try {
      await mutateEvent('PUT', {
        id: event.id,
        status: 'replay',
        replay_url: replayUrl,
        youtube_url: replayUrl,
        replay_available: true,
      })
    } catch {
      setError('Erro ao disponibilizar replay')
      return
    }

    await fetchEvents()
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
  }

  const now = new Date()
  const filteredEvents = filterType === 'all' ? events : events.filter(e => e.type === filterType)

  const activeEvents = filteredEvents.filter(e => e.status === 'ao_vivo')
  const upcomingEvents = filteredEvents.filter(e => {
    return e.status === 'agendada'
  })
  const pastEvents = filteredEvents.filter(e => {
    return e.status === 'encerrada' || e.status === 'cancelada' || e.status === 'replay'
  })

  if (loading) {
    return <div className="p-6 text-text-muted">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Agenda e Conteúdos</h1>
        </div>
        <Button onClick={() => {
          if (showForm) {
            resetForm()
          } else {
            setEditingEvent(null)
            setForm({
              title: '',
              description: '',
              scheduled_at: '',
              duration_minutes: 60,
              type: 'live',
              status: 'agendada',
              youtube_url: '',
              thumbnail_url: '',
            })
            setShowForm(true)
          }
        }}>
          <Plus className="w-4 h-4" />
          {showForm ? 'Fechar' : 'Novo Evento'}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">{error}</div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            filterType === 'all' ? 'bg-accent text-bg' : 'bg-surface text-text-muted hover:text-text-secondary'
          }`}
        >
          Todos
        </button>
        {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map(type => {
          const Icon = EVENT_TYPE_ICONS[type]
          return (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filterType === type ? 'bg-accent text-bg' : 'bg-surface text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon className="w-3 h-3" />
              {EVENT_TYPE_LABELS[type]}
            </button>
          )
        })}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-5 rounded-xl bg-surface border border-border-subtle space-y-4">
          <h3 className="text-sm font-medium text-text-primary">
            {editingEvent ? 'Editar Evento' : 'Criar Novo Evento'}
          </h3>

          {/* Type selector */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Tipo de evento</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map(type => {
                const Icon = EVENT_TYPE_ICONS[type]
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm({ ...form, type })}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      form.type === type
                        ? 'bg-accent text-bg'
                        : 'bg-bg border border-border-subtle text-text-muted hover:border-accent/30'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {EVENT_TYPE_LABELS[type]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title and description */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Título"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Como escolher produtos"
              required
            />
            <Input
              label="Descrição"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição do evento..."
            />
          </div>

          {/* Date and duration */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Data e Hora"
              type="datetime-local"
              value={form.scheduled_at}
              onChange={e => setForm({ ...form, scheduled_at: e.target.value })}
              required
            />
            <Input
              label="Duração (minutos)"
              type="number"
              value={form.duration_minutes}
              onChange={e => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 60 })}
              min={1}
            />
          </div>

          {/* Type-specific fields */}
          {form.type === 'live' && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                label="URL do YouTube"
                value={form.youtube_url}
                onChange={e => setForm({ ...form, youtube_url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <Input
                label="Thumbnail URL"
                value={form.thumbnail_url}
                onChange={e => setForm({ ...form, thumbnail_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
          )}

          {form.type !== 'live' && (
            <Input
              label="URL de referência (opcional)"
              value={form.youtube_url}
              onChange={e => setForm({ ...form, youtube_url: e.target.value })}
              placeholder="Link para conteúdo relacionado"
            />
          )}

          {/* Status */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">Status</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(EVENT_STATUS_LABELS) as EventStatus[]).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setForm({ ...form, status })}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    form.status === status
                      ? 'bg-accent text-bg'
                      : 'bg-bg border border-border-subtle text-text-muted hover:border-accent/30'
                  }`}
                >
                  {EVENT_STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button type="submit">
              <Check className="w-4 h-4" />
              {editingEvent ? 'Salvar' : 'Criar Evento'}
            </Button>
            <Button type="button" variant="secondary" onClick={resetForm}>
              <X className="w-4 h-4" />
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* Active Events */}
      {activeEvents.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3 tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            Ao Vivo Agora
          </h2>
          <div className="space-y-2">
            {activeEvents.map(event => (
              <EventRow
                key={event.id}
                event={event}
                onStartLive={handleStartLive}
                onStopLive={handleStopLive}
                onSetReplay={handleSetReplay}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onCancel={handleCancel}
                onOpenStream={openStreamModal}
                copied={copied}
                onCopy={copyToClipboard}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Events */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3 tracking-tight">Próximos Eventos</h2>
        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum evento agendado</p>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map(event => (
              <EventRow
                key={event.id}
                event={event}
                onStartLive={handleStartLive}
                onStopLive={handleStopLive}
                onSetReplay={handleSetReplay}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onCancel={handleCancel}
                onOpenStream={openStreamModal}
                copied={copied}
                onCopy={copyToClipboard}
              />
            ))}
          </div>
        )}
      </div>

      {/* Past Events */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3 tracking-tight">Eventos Anteriores</h2>
        {pastEvents.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum evento anterior</p>
        ) : (
          <div className="space-y-2">
            {pastEvents.map(event => (
              <EventRow
                key={event.id}
                event={event}
                onStartLive={handleStartLive}
                onStopLive={handleStopLive}
                onSetReplay={handleSetReplay}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onCancel={handleCancel}
                onOpenStream={openStreamModal}
                copied={copied}
                onCopy={copyToClipboard}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stream Modal */}
      {showStreamModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowStreamModal(null)}>
          <div className="bg-surface border border-border-subtle rounded-xl p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-text-primary">Detalhes de Transmissão</h3>
              <button onClick={() => setShowStreamModal(null)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              {showStreamModal.rtmp_url && (
                <div>
                  <label className="text-xs text-text-muted">URL de ingestão</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 p-2.5 bg-surface-raised rounded-lg text-xs text-text-primary font-mono break-all">
                      {showStreamModal.rtmp_url}
                    </code>
                    <button
                      onClick={() => copyToClipboard(showStreamModal.rtmp_url, 'rtmp')}
                      className="p-2 rounded-lg bg-surface-raised hover:bg-surface transition-colors"
                    >
                      {copied === 'rtmp' ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-text-muted" />}
                    </button>
                  </div>
                </div>
              )}
              {showStreamModal.stream_key && (
                <div>
                  <label className="text-xs text-text-muted">Stream Key</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 p-2.5 bg-surface-raised rounded-lg text-xs text-text-primary font-mono break-all">
                      {showStreamModal.stream_key}
                    </code>
                    <button
                      onClick={() => copyToClipboard(showStreamModal.stream_key, 'key')}
                      className="p-2 rounded-lg bg-surface-raised hover:bg-surface transition-colors"
                    >
                      {copied === 'key' ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-text-muted" />}
                    </button>
                  </div>
                </div>
              )}
              {showStreamModal.rtmp_url && showStreamModal.stream_key ? (
                <p className="text-[11px] text-text-muted">
                  Cole esses dados no OBS Studio em Configurações, Transmissão e Servidor personalizado.
                </p>
              ) : (
                <p className="text-sm text-text-muted">
                  Configure a transmissão no YouTube Studio e no OBS. Cadastre com segurança a URL de ingestão e a chave fornecidas pelo YouTube antes de iniciar a transmissão.
                </p>
              )}
              <div className="pt-2 border-t border-border-subtle">
                <Input
                  label="Link para os membros assistirem (embed)"
                  value={watchUrl}
                  onChange={e => setWatchUrl(e.target.value)}
                  placeholder="https://www.youtube.com/embed/..."
                />
                <p className="text-[11px] text-text-muted mt-1">
                  Cole aqui o link de embed (ex: YouTube/Vimeo não listado) depois de iniciar a transmissão, para que os membros possam assistir.
                </p>
                <Button size="sm" variant="secondary" onClick={handleSaveWatchUrl} className="mt-2">
                  <Check className="w-3.5 h-3.5" />
                  Salvar link
                </Button>
              </div>
            </div>
            <Button onClick={() => setShowStreamModal(null)} className="w-full">Fechar</Button>
          </div>
        </div>
      )}

      {/* Replay Modal */}
      {showReplayModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowReplayModal(null)}>
          <div className="bg-surface border border-border-subtle rounded-xl p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-text-primary">URL do Replay</h3>
              <button onClick={() => setShowReplayModal(null)} className="text-text-muted hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Input
              label="URL do Vídeo (YouTube, Vimeo, etc)"
              value={replayUrl}
              onChange={e => setReplayUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveReplay} className="flex-1">
                <Check className="w-4 h-4" />
                Salvar
              </Button>
              <Button variant="secondary" onClick={() => setShowReplayModal(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface EventRowProps {
  event: AgendaEvent
  onStartLive: (event: AgendaEvent) => void
  onStopLive: (event: AgendaEvent) => void
  onSetReplay: (event: AgendaEvent) => void
  onEdit: (event: AgendaEvent) => void
  onDelete: (id: string) => void
  onCancel: (event: AgendaEvent) => void
  onOpenStream: (event: AgendaEvent) => void
  copied: string
  onCopy: (text: string, label: string) => void
}

function EventRow({ event, onStartLive, onStopLive, onSetReplay, onEdit, onDelete, onCancel, onOpenStream, copied, onCopy }: EventRowProps) {
  const TypeIcon = EVENT_TYPE_ICONS[event.type]
  const dt = formatDateTime(event.scheduled_at)
  const isActive = event.status === 'ao_vivo' || event.is_live
  const isCancelled = event.status === 'cancelada'

  return (
    <div className={`p-4 rounded-xl bg-surface border flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ${
      isActive ? 'border-red-500/20' : isCancelled ? 'border-error/20 opacity-60' : 'border-border-subtle'
    }`}>
      {/* Icon + Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`p-2.5 rounded-lg flex-shrink-0 ${isActive ? 'bg-red-500/10' : 'bg-accent/10'}`}>
          {isActive ? (
            <Radio className="w-5 h-5 text-red-500" />
          ) : (
            <TypeIcon className="w-5 h-5 text-accent" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-text-primary truncate">{event.title}</h3>
            <span className={`text-[10px] font-medium ${EVENT_STATUS_COLORS[event.status]}`}>
              {EVENT_STATUS_LABELS[event.status]}
            </span>
            <span className="text-[10px] text-text-muted bg-surface-raised px-1.5 py-0.5 rounded">
              {EVENT_TYPE_LABELS[event.type]}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
            <span>{dt.date}</span>
            <span>{dt.time}</span>
            <span>{event.duration_minutes}min</span>
            {event.youtube_video_id && (
              <span className="flex items-center gap-1">
                <Play className="w-3 h-3" />
                YouTube
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isActive ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => onOpenStream(event)}>
              <ExternalLink className="w-3.5 h-3.5" />
              RTMP
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onStopLive(event)}>
              <Square className="w-3.5 h-3.5" />
              Finalizar
            </Button>
          </>
        ) : event.type === 'live' && event.status === 'agendada' ? (
          <Button size="sm" onClick={() => onStartLive(event)}>
            <Radio className="w-3.5 h-3.5" />
            Iniciar Live
          </Button>
        ) : null}

        {event.status === 'encerrada' && (
          <Button size="sm" variant="secondary" onClick={() => onSetReplay(event)}>
            <Play className="w-3.5 h-3.5" />
            Disp. Replay
          </Button>
        )}

        {!isCancelled && !isActive && (
          <Button size="sm" variant="secondary" onClick={() => onEdit(event)}>
            <Edit3 className="w-3.5 h-3.5" />
          </Button>
        )}

        {!isCancelled && event.type === 'live' && !isActive && (
          <Button size="sm" variant="ghost" onClick={() => onCancel(event)}>
            <X className="w-3.5 h-3.5 text-error" />
          </Button>
        )}

        <Button size="sm" variant="ghost" onClick={() => onDelete(event.id)}>
          <Trash2 className="w-3.5 h-3.5 text-error" />
        </Button>
      </div>
    </div>
  )
}
