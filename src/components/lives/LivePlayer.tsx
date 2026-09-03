'use client'

import { useEffect, useState } from 'react'
import { Play, ExternalLink } from 'lucide-react'

interface LivePlayerProps {
  streamUrl?: string
  isLive: boolean
  title: string
  scheduledAt?: string
  replayUrl?: string
}

function calculateTimeLeft(targetDate: string) {
  const difference = new Date(targetDate).getTime() - Date.now()
  if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  }
}

function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const initialTimer = setTimeout(() => setTimeLeft(calculateTimeLeft(targetDate)), 0)
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft(targetDate)), 1000)
    return () => {
      clearTimeout(initialTimer)
      clearInterval(timer)
    }
  }, [targetDate])

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="flex items-center gap-3">
      {timeLeft.days > 0 && (
        <div className="text-center">
          <div className="text-2xl font-bold text-accent">{pad(timeLeft.days)}</div>
          <div className="text-[10px] text-text-muted uppercase">dias</div>
        </div>
      )}
      <div className="text-center">
        <div className="text-2xl font-bold text-accent">{pad(timeLeft.hours)}</div>
        <div className="text-[10px] text-text-muted uppercase">horas</div>
      </div>
      <span className="text-accent text-xl font-bold">:</span>
      <div className="text-center">
        <div className="text-2xl font-bold text-accent">{pad(timeLeft.minutes)}</div>
        <div className="text-[10px] text-text-muted uppercase">min</div>
      </div>
      <span className="text-accent text-xl font-bold">:</span>
      <div className="text-center">
        <div className="text-2xl font-bold text-accent">{pad(timeLeft.seconds)}</div>
        <div className="text-[10px] text-text-muted uppercase">seg</div>
      </div>
    </div>
  )
}

export default function LivePlayer({ streamUrl, isLive, title, scheduledAt, replayUrl }: LivePlayerProps) {
  if (isLive && streamUrl) {
    return (
      <div className="rounded-xl overflow-hidden border border-border-subtle bg-surface">
        <div className="relative">
          <div className="aspect-video bg-black">
            <iframe
              src={streamUrl}
              className="w-full h-full"
              allowFullScreen
              allow="autoplay; fullscreen"
            />
          </div>
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              AO VIVO
            </span>
          </div>
        </div>
        <div className="p-4">
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        </div>
      </div>
    )
  }

  if (isLive && !streamUrl) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-8">
        <div className="text-center space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600/10 text-red-500 text-xs font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            AO VIVO
          </span>
          <h3 className="text-base font-medium text-text-primary">{title}</h3>
          <p className="text-xs text-text-muted">A live está acontecendo, aguarde a conexão...</p>
        </div>
      </div>
    )
  }

  if (!isLive && replayUrl) {
    return (
      <div className="rounded-xl overflow-hidden border border-border-subtle bg-surface">
        <div className="aspect-video bg-black relative group">
          <iframe
            src={replayUrl}
            className="w-full h-full"
            allowFullScreen
          />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-accent/90 flex items-center justify-center">
              <Play className="w-7 h-7 text-bg ml-1" />
            </div>
          </div>
        </div>
        <div className="p-4">
          <h3 className="text-sm font-medium text-text-primary">{title}</h3>
          <p className="text-xs text-text-muted mt-1">Replay disponível</p>
        </div>
      </div>
    )
  }

  if (!isLive && scheduledAt && !replayUrl) {
    const isPast = new Date(scheduledAt) < new Date()
    return (
      <div className="rounded-xl border border-border-subtle bg-surface p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-surface-raised flex items-center justify-center flex-shrink-0">
            <Play className="w-5 h-5 text-text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-text-primary">{title}</h3>
            <p className="text-xs text-text-muted mt-1">
              {isPast ? 'Live encerrada' : `Agendada para ${new Date(scheduledAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
          {!isPast && <CountdownTimer targetDate={scheduledAt} />}
        </div>
      </div>
    )
  }

  return null
}
