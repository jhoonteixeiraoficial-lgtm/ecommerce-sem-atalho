'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LivePlayer from '@/components/lives/LivePlayer'

interface Live {
  id: string
  title: string
  description: string
  scheduled_at: string
  duration_minutes: number
  replay_url: string
  is_live: boolean
  viewer_count: number
}

export default function LivesPage() {
  const [lives, setLives] = useState<Live[]>([])
  const [loading, setLoading] = useState(true)
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    const fetchLives = async () => {
      const { data, error } = await supabase
        .from('lives')
        .select('id, title, description, scheduled_at, duration_minutes, replay_url, is_live, viewer_count')
        .order('scheduled_at', { ascending: false })

      if (!error) {
        setLives(data || [])
      }
      setLoading(false)
    }

    void fetchLives()
    const interval = setInterval(fetchLives, 30000)
    return () => clearInterval(interval)
  }, [supabase])

  const now = new Date()
  const activeLives = lives.filter(l => l.is_live)
  const upcomingLives = lives.filter(l => new Date(l.scheduled_at) > now && !l.is_live && !l.replay_url)
  const pastLives = lives.filter(l => l.replay_url && !l.is_live)

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
          <div className="space-y-4">
            {activeLives.map(live => (
              <LivePlayer
                key={live.id}
                isLive={true}
                title={live.title}
              />
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

      {/* Replays */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">Replays</h2>
        {pastLives.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum replay disponível ainda</p>
        ) : (
          <div className="space-y-3">
            {pastLives.map(live => (
              <LivePlayer
                key={live.id}
                isLive={false}
                title={live.title}
                replayUrl={live.replay_url}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
