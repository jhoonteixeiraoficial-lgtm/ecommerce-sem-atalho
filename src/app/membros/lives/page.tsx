'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LivePlayer from '@/components/lives/LivePlayer'
import Chat from '@/components/community/Chat'
import { Play, Search, ChevronRight } from 'lucide-react'

interface Live {
  id: string
  title: string
  description: string
  scheduled_at: string
  duration_minutes: number
  replay_url: string
  watch_url: string
  is_live: boolean
  viewer_count: number
  type: string
  status: string
  replay_available: boolean
  youtube_url: string
  thumbnail_url: string
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function getYouTubeThumb(url: string): string {
  if (!url) return ''
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
  if (match) return `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`
  return ''
}

export default function LivesPage() {
  const [lives, setLives] = useState<Live[]>([])
  const [loading, setLoading] = useState(true)
  const [supabase] = useState(() => createClient())
  const [selectedReplayId, setSelectedReplayId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchLives = async () => {
    const { data, error } = await supabase
      .from('lives')
      .select('id, title, description, scheduled_at, duration_minutes, replay_url, watch_url, is_live, viewer_count, type, status, replay_available, youtube_url, thumbnail_url')
      .eq('type', 'live')
      .order('scheduled_at', { ascending: false })

    if (!error) {
      setLives(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void fetchLives()
    const interval = setInterval(fetchLives, 30000)
    return () => clearInterval(interval)
  }, [supabase])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchLives()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const now = new Date()

  function effectiveStatus(live: Live): 'agendada' | 'ao_vivo' | 'encerrada' | 'cancelada' | 'replay' {
    if (live.status === 'cancelada') return 'cancelada'
    if (live.status === 'replay') return 'replay'
    if (live.status === 'encerrada') return 'encerrada'
    if (live.status === 'ao_vivo') return 'ao_vivo'
    if (live.status === 'agendada' && new Date(live.scheduled_at) <= now) return 'ao_vivo'
    return 'agendada'
  }

  const activeLives = lives.filter(l => effectiveStatus(l) === 'ao_vivo')
  const upcomingLives = lives.filter(l => effectiveStatus(l) === 'agendada')

  const pastLives = useMemo(() => {
    const filtered = lives.filter(l => effectiveStatus(l) === 'replay')
    const sorted = [...filtered].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    if (!searchQuery.trim()) return sorted
    const q = searchQuery.toLowerCase()
    return sorted.filter(l =>
      l.title.toLowerCase().includes(q) ||
      l.description.toLowerCase().includes(q)
    )
  }, [lives, searchQuery])

  const selectedReplay = pastLives.find(l => l.id === selectedReplayId) || null

  if (loading) {
    return <div className="p-6 text-text-muted">Carregando...</div>
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Lives</h1>
        <p className="text-sm text-text-muted mt-1">Acompanhe as lives e assista às gravações</p>
      </div>

      {/* Ao Vivo Agora */}
      {activeLives.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-lg font-semibold text-text-primary tracking-tight">Ao Vivo Agora</h2>
          </div>
          <div className="space-y-6">
            {activeLives.map(live => (
              <div key={live.id} className="grid lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <LivePlayer
                    isLive={true}
                    title={live.title}
                    streamUrl={live.watch_url || undefined}
                  />
                </div>
                <div className="h-[420px] lg:h-auto rounded-xl border border-border-subtle overflow-hidden">
                  <Chat initialChannelSlug="ao-vivo" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Próximas Lives */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">Próximas Lives</h2>
        {upcomingLives.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma live agendada no momento</p>
        ) : (
          <div className="space-y-3">
            {upcomingLives.map(live => (
              <LivePlayer
                key={live.id}
                isLive={false}
                title={live.title}
                scheduledAt={live.scheduled_at}
              />
            ))}
          </div>
        )}
      </div>

      {/* Replays Section */}
      <div>
        {/* Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#141414] via-[#1a1510] to-[#141414] border border-border-subtle mb-6">
          <div className="absolute inset-0 opacity-[0.07]">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-accent blur-[120px]" />
          </div>
          <div className="relative px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Play className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-semibold text-text-primary tracking-tight">Gravações</h2>
              </div>
            </div>
            <p className="text-sm text-text-muted max-w-md">Reassista às lives e conteúdos anteriores.</p>
          </div>
        </div>

        {/* Search */}
        {pastLives.length > 0 && (
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Buscar gravações..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40 transition-colors"
            />
          </div>
        )}

        {/* Player (when selected) */}
        {selectedReplay && (
          <div className="mb-6">
            <LivePlayer
              isLive={false}
              title={selectedReplay.title}
              scheduledAt={selectedReplay.scheduled_at}
              replayUrl={selectedReplay.replay_url || selectedReplay.youtube_url}
            />
            <button
              onClick={() => setSelectedReplayId(null)}
              className="mt-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              ← Voltar para a lista
            </button>
          </div>
        )}

        {/* Replay List */}
        {pastLives.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-text-muted">Nenhuma gravação disponível ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastLives.map(live => {
              const thumb = live.thumbnail_url || getYouTubeThumb(live.replay_url || live.youtube_url)
              const isSelected = selectedReplayId === live.id

              return (
                <button
                  key={live.id}
                  onClick={() => setSelectedReplayId(isSelected ? null : live.id)}
                  className={`w-full flex items-center gap-4 p-3 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-accent/10 border border-accent/20'
                      : 'bg-surface border border-border-subtle hover:bg-surface-raised hover:border-border'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-[140px] sm:w-[160px] aspect-video rounded-lg overflow-hidden bg-surface-raised relative">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={live.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play className="w-6 h-6 text-text-muted" />
                      </div>
                    )}
                    {live.duration_minutes > 0 && (
                      <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/70 text-white">
                        {formatDuration(live.duration_minutes)}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-text-primary line-clamp-2 leading-snug">
                      {live.title}
                    </h3>
                    <p className="text-xs text-text-secondary mt-1">
                      {formatDate(live.scheduled_at)}
                    </p>
                    {live.description && (
                      <p className="text-xs text-text-muted mt-0.5 line-clamp-1">
                        {live.description}
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-colors ${isSelected ? 'text-accent' : 'text-text-muted'}`} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
