'use client'

import { useEffect, useState } from 'react'
import { Video, Calendar, Plus, Trash2, Edit3, Radio, Square, ExternalLink, Copy, Check, X, Play } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

interface Live {
  id: string
  title: string
  description: string
  scheduled_at: string
  duration_minutes: number
  replay_url: string
  is_live: boolean
  stream_key: string
  rtmp_url: string
  viewer_count: number
  created_at: string
}

async function loadAdminLives() {
  const response = await fetch('/api/admin/lives')
  if (!response.ok) throw new Error('Unable to load lives')
  const data = await response.json() as { lives: Live[] }
  return data.lives
}

class LiveApiError extends Error {
  constructor(public status: number) {
    super('Live API request failed')
  }
}

export default function AdminLivesPage() {
  const [lives, setLives] = useState<Live[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingLive, setEditingLive] = useState<Live | null>(null)
  const [showStreamModal, setShowStreamModal] = useState<Live | null>(null)
  const [showReplayModal, setShowReplayModal] = useState<Live | null>(null)
  const [replayUrl, setReplayUrl] = useState('')
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    title: '',
    description: '',
    scheduled_at: '',
    duration_minutes: 60,
  })

  useEffect(() => {
    loadAdminLives()
      .then(setLives)
      .catch(() => setError('Erro ao carregar lives'))
      .finally(() => setLoading(false))
  }, [])

  const fetchLives = async () => {
    try {
      const refreshedLives = await loadAdminLives()
      setLives(refreshedLives)
      return refreshedLives
    } catch {
      setError('Erro ao carregar lives')
      return []
    } finally {
      setLoading(false)
    }
  }

  const mutateLive = async (method: 'POST' | 'PUT', body: Record<string, unknown>) => {
    const response = await fetch('/api/admin/lives', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new LiveApiError(response.status)
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
      if (editingLive) {
        await mutateLive('PUT', {
          id: editingLive.id,
          title: form.title,
          description: form.description,
          scheduled_at: scheduledAt,
          duration_minutes: form.duration_minutes,
        })
      } else {
        await mutateLive('POST', {
          title: form.title,
          description: form.description,
          scheduled_at: scheduledAt,
          duration_minutes: form.duration_minutes,
        })
      }
    } catch {
      setError(editingLive ? 'Erro ao atualizar live' : 'Erro ao criar live')
      return
    }

    setForm({ title: '', description: '', scheduled_at: '', duration_minutes: 60 })
    setEditingLive(null)
    setShowForm(false)
    await fetchLives()
  }

  const handleEdit = (live: Live) => {
    setEditingLive(live)
    setForm({
      title: live.title,
      description: live.description,
      scheduled_at: live.scheduled_at ? new Date(live.scheduled_at).toISOString().slice(0, 16) : '',
      duration_minutes: live.duration_minutes,
    })
    setShowForm(true)
  }

  const handleStartLive = async (live: Live) => {
    if (!live.rtmp_url || !live.stream_key) {
      setShowStreamModal(live)
      return
    }

    try {
      await mutateLive('PUT', { id: live.id, is_live: true })
      const refreshedLives = await fetchLives()
      setShowStreamModal(refreshedLives.find(item => item.id === live.id) ?? live)
    } catch (requestError) {
      if (requestError instanceof LiveApiError && requestError.status === 409) {
        setShowStreamModal({ ...live, rtmp_url: '', stream_key: '' })
        return
      }
      setError('Erro ao iniciar live')
    }
  }

  const handleStopLive = async (live: Live) => {
    try {
      await mutateLive('PUT', { id: live.id, is_live: false })
    } catch {
      setError('Erro ao finalizar live')
      return
    }

    setShowReplayModal(live)
    setReplayUrl(live.replay_url || '')
    await fetchLives()
  }

  const handleSaveReplay = async () => {
    if (!showReplayModal) return

    try {
      await mutateLive('PUT', { id: showReplayModal.id, replay_url: replayUrl })
    } catch {
      setError('Erro ao salvar replay')
      return
    }

    setShowReplayModal(null)
    setReplayUrl('')
    await fetchLives()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta live?')) return

    try {
      const response = await fetch(`/api/admin/lives?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Unable to delete live')
    } catch {
      setError('Erro ao excluir live')
      return
    }

    await fetchLives()
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 2000)
  }

  const now = new Date()
  const upcomingLives = lives.filter(l => new Date(l.scheduled_at) > now && !l.is_live && !l.replay_url)
  const activeLives = lives.filter(l => l.is_live)
  const pastLives = lives.filter(l => (new Date(l.scheduled_at) <= now && !l.is_live) || l.replay_url)

  if (loading) {
    return <div className="p-6 text-text-muted">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Gerenciar Lives</h1>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setEditingLive(null); setForm({ title: '', description: '', scheduled_at: '', duration_minutes: 60 }) }}>
          <Plus className="w-4 h-4" />
          Nova Live
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">{error}</div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-5 rounded-xl bg-surface border border-border-subtle space-y-4">
          <h3 className="text-sm font-medium text-text-primary">
            {editingLive ? 'Editar Live' : 'Agendar Nova Live'}
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Título"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Estratégias de Precificação"
              required
            />
            <Input
              label="Data e Hora"
              type="datetime-local"
              value={form.scheduled_at}
              onChange={e => setForm({ ...form, scheduled_at: e.target.value })}
              required
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Descrição"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição da live..."
            />
            <Input
              label="Duração (minutos)"
              type="number"
              value={form.duration_minutes}
              onChange={e => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 60 })}
              min={1}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit">
              <Check className="w-4 h-4" />
              {editingLive ? 'Salvar' : 'Agendar'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setEditingLive(null) }}>
              <X className="w-4 h-4" />
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {/* Active Lives */}
      {activeLives.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3 tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            Ao Vivo Agora
          </h2>
          <div className="space-y-2">
            {activeLives.map(live => (
              <div key={live.id} className="p-4 rounded-xl bg-surface border border-red-500/20 flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-red-500/10 flex-shrink-0">
                  <Radio className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-text-primary">{live.title}</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    {live.viewer_count} espectadores
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setShowStreamModal(live)}>
                    <ExternalLink className="w-3.5 h-3.5" />
                    RTMP
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleStopLive(live)}>
                    <Square className="w-3.5 h-3.5" />
                    Finalizar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Lives */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3 tracking-tight">Próximas Lives</h2>
        {upcomingLives.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma live agendada</p>
        ) : (
          <div className="space-y-2">
            {upcomingLives.map(live => (
              <div key={live.id} className="p-4 rounded-xl bg-surface border border-border-subtle flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-accent/10 flex-shrink-0">
                  <Calendar className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-text-primary">{live.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
                    <span>{new Date(live.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                    <span>{new Date(live.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{live.duration_minutes}min</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleStartLive(live)}>
                    <Radio className="w-3.5 h-3.5" />
                    Iniciar Live
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleEdit(live)}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(live.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-error" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Lives */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-3 tracking-tight">Lives Anteriores</h2>
        {pastLives.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma live anterior</p>
        ) : (
          <div className="space-y-2">
            {pastLives.map(live => (
              <div key={live.id} className="p-4 rounded-xl bg-surface border border-border-subtle flex items-center gap-4">
                <div className="w-16 h-10 bg-surface-raised rounded-lg flex items-center justify-center flex-shrink-0">
                  <Play className="w-5 h-5 text-text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-text-primary">{live.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
                    <span>{new Date(live.scheduled_at).toLocaleDateString('pt-BR')}</span>
                    {live.replay_url && (
                      <span className="text-success">Replay disponível</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setShowReplayModal(live); setReplayUrl(live.replay_url || '') }}>
                    <Edit3 className="w-3.5 h-3.5" />
                    Replay
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(live.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-error" />
                  </Button>
                </div>
              </div>
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
