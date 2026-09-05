'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Video, Sparkles, Play, Calendar, Download, Users, Bell, MessageCircle, Heart, Loader2, AlertCircle, FileText, BookOpen, Star } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { getCatalog, getModule, LearningApiError } from '@/lib/learning/client'
import { computeProgressPercentage, selectContinueWatching, type LessonWithProgress } from '@/lib/learning/progress'
import type { ModuleDetailDto } from '@/lib/learning/types'

type EventType = 'live' | 'conteudo' | 'aula' | 'material' | 'atualizacao' | 'evento_especial'

interface ProfileData {
  full_name: string | null
  avatar_url: string | null
}

interface LastLesson {
  title: string
  moduleTitle: string
  moduleSlug: string
  lessonSlug: string
}

interface NextEvent {
  id: string
  title: string
  scheduled_at: string
  type: EventType
  status: string
  effectiveStatus: 'agendada' | 'ao_vivo' | 'encerrada' | 'cancelada'
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

interface FeedPost {
  id: string
  content: string
  category: string
  created_at: string
  profiles: { full_name: string; avatar_url: string }
  community_comments: { count: number }[]
  community_reactions: { count: number }[]
}

function toLessonsWithProgress(moduleData: ModuleDetailDto): LessonWithProgress[] {
  const moduleSummary = {
    id: moduleData.id,
    slug: moduleData.slug,
    title: moduleData.title,
    isPublished: moduleData.isPublished,
    releaseAt: moduleData.releaseAt,
    sortOrder: moduleData.sortOrder,
  }

  return moduleData.lessons.map((lesson) => ({
    ...lesson,
    module: moduleSummary,
    progress: {
      positionSeconds: lesson.progress?.positionSeconds ?? 0,
      completed: lesson.progress?.completed ?? false,
      completedAt: lesson.progress?.completedAt ?? null,
      lastViewedAt: lesson.progress?.lastViewedAt ?? null,
    },
  }))
}

export default function HomePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastLesson, setLastLesson] = useState<LastLesson | null>(null)
  const [progressPercentage, setProgressPercentage] = useState(0)
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [postsLoading, setPostsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (authUser) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', authUser.id)
          .single()

        if (profileData) setProfile(profileData)

        try {
          let catalog
          try {
            catalog = await getCatalog()
          } catch (retryErr) {
            if (retryErr instanceof LearningApiError && retryErr.kind === 'server-error') {
              catalog = await getCatalog()
            } else {
              throw retryErr
            }
          }
          const modules = catalog.flatMap((course) => course.modules)

          const totals = modules.reduce(
            (acc, mod) => ({
              lessons: acc.lessons + mod.lessonCount,
              completed: acc.completed + mod.completedCount,
            }),
            { lessons: 0, completed: 0 }
          )
          setProgressPercentage(computeProgressPercentage(totals.completed, totals.lessons))

          const modulesInProgress = modules.filter(
            (mod) => mod.lessonCount > 0 && mod.completedCount < mod.lessonCount
          )

          const moduleDetails = await Promise.allSettled(
            modulesInProgress.map((mod) => getModule(mod.slug))
          )

          const lessonsWithProgress = moduleDetails
            .filter((result): result is PromiseFulfilledResult<ModuleDetailDto> => result.status === 'fulfilled')
            .flatMap((result) => toLessonsWithProgress(result.value))

          const continueWatching = selectContinueWatching(lessonsWithProgress)

          if (continueWatching) {
            setLastLesson({
              title: continueWatching.title,
              moduleTitle: continueWatching.module.title,
              moduleSlug: continueWatching.module.slug,
              lessonSlug: continueWatching.slug,
            })
          }
        } catch (err) {
          if (err instanceof LearningApiError && (err.kind === 'unauthorized' || err.kind === 'forbidden')) {
            // Layout-level auth guard will redirect; avoid surfacing a home error for this case.
          } else {
            setError('Não foi possível carregar seu progresso. Tente novamente.')
          }
        }

        const now = new Date().toISOString()

        // First: check if there's a live currently AO VIVO (explicit or time-based)
        const { data: liveNowData } = await supabase
          .from('lives')
          .select('id, title, scheduled_at, type, status')
          .eq('type', 'live')
          .not('status', 'in', '(encerrada,cancelada)')
          .order('scheduled_at', { ascending: false })
          .limit(5)

        let liveNow: NextEvent | null = null
        const nowDate = new Date()
        for (const row of liveNowData ?? []) {
          const isExplicitlyLive = row.status === 'ao_vivo'
          const isScheduledAndPast = row.status === 'agendada' && new Date(row.scheduled_at) <= nowDate
          if (isExplicitlyLive || isScheduledAndPast) {
            liveNow = {
              id: row.id,
              title: row.title,
              scheduled_at: row.scheduled_at,
              type: row.type,
              status: row.status,
              effectiveStatus: 'ao_vivo',
            }
            break
          }
        }

        if (liveNow) {
          setNextEvent(liveNow)
        } else {
          // No live currently active — find next upcoming event of any type
          const { data: nextEventData } = await supabase
            .from('lives')
            .select('id, title, scheduled_at, type, status')
            .gt('scheduled_at', now)
            .not('status', 'in', '(encerrada,cancelada)')
            .order('scheduled_at', { ascending: true })
            .limit(1)
            .single()

          if (nextEventData) {
            setNextEvent({
              ...nextEventData,
              effectiveStatus: nextEventData.status as NextEvent['effectiveStatus'],
            })
          }
        }
      }

      setLoading(false)
    }

    fetchData()

    // Light refresh: recalculate effectiveStatus every 60s
    // so a live that reaches its scheduled time shows "AO VIVO" without manual refresh
    const refreshTimer = setInterval(async () => {
      const supabase = createClient()
      const nowDate = new Date()

      // Check for live currently active
      const { data: liveNowData } = await supabase
        .from('lives')
        .select('id, title, scheduled_at, type, status')
        .eq('type', 'live')
        .not('status', 'in', '(encerrada,cancelada)')
        .order('scheduled_at', { ascending: false })
        .limit(5)

      for (const row of liveNowData ?? []) {
        const isExplicitlyLive = row.status === 'ao_vivo'
        const isScheduledAndPast = row.status === 'agendada' && new Date(row.scheduled_at) <= nowDate
        if (isExplicitlyLive || isScheduledAndPast) {
          setNextEvent({
            id: row.id,
            title: row.title,
            scheduled_at: row.scheduled_at,
            type: row.type,
            status: row.status,
            effectiveStatus: 'ao_vivo',
          })
          return
        }
      }

      // No live active — refresh next upcoming event
      const now = nowDate.toISOString()
      const { data: nextEventData } = await supabase
        .from('lives')
        .select('id, title, scheduled_at, type, status')
        .gt('scheduled_at', now)
        .not('status', 'in', '(encerrada,cancelada)')
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .single()

      if (nextEventData) {
        setNextEvent({
          ...nextEventData,
          effectiveStatus: nextEventData.status as NextEvent['effectiveStatus'],
        })
      } else {
        setNextEvent(null)
      }
    }, 60_000)

    return () => clearInterval(refreshTimer)
  }, [])

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const res = await fetch('/api/community/posts?limit=4')
        if (res.ok) {
          const data = await res.json()
          setPosts(data.posts || [])
        }
      } catch {
        // Feed preview is best-effort; the full Comunidade page is the source of truth.
      }
      setPostsLoading(false)
    }

    fetchPosts()
  }, [])

  const displayName = profile?.full_name?.split(' ')[0] || 'Membro'
  const avatarUrl = profile?.avatar_url || '/fotos/J&T-210.jpg'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-text-secondary text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Greeting */}
      <div className="flex items-center gap-4">
        <Image
          src={avatarUrl}
          alt={displayName}
          width={48}
          height={48}
          className="w-12 h-12 rounded-full object-cover border-2 border-accent/30"
        />
        <div>
          <h1 className="text-lg font-semibold text-text-primary tracking-tight">Olá, {displayName}</h1>
          <p className="text-xs text-text-muted">Bem-vindo de volta.</p>
        </div>
      </div>

      {/* Continue watching */}
      <div className="p-5 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 transition-colors">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
            <Play className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-accent font-medium mb-1">CONTINUAR ASSISTINDO</div>
            {lastLesson ? (
              <>
                <h3 className="text-base font-medium text-text-primary mb-1">{lastLesson.title}</h3>
                <p className="text-xs text-text-muted">{lastLesson.moduleTitle}</p>
              </>
            ) : (
              <>
                <h3 className="text-base font-medium text-text-primary mb-1">Comece seus estudos</h3>
                <p className="text-xs text-text-muted">Acesse as aulas para começar</p>
              </>
            )}
            <div className="mt-3 max-w-xs">
              <div className="flex justify-between text-[10px] text-text-muted mb-1">
                <span>Progresso</span>
                <span className="text-accent font-medium">{progressPercentage}%</span>
              </div>
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPercentage}%` }}></div>
              </div>
            </div>
          </div>
          <Link href={lastLesson ? `/membros/aulas/${lastLesson.moduleSlug}/${lastLesson.lessonSlug}` : '/membros/aulas'}>
            <Button size="sm">
              <Play className="w-3.5 h-3.5" />
              {lastLesson ? 'Continuar' : 'Começar'}
            </Button>
          </Link>
        </div>
      </div>

      {/* Próximo Evento / AO VIVO */}
      {nextEvent?.effectiveStatus === 'ao_vivo' ? (
        <div className="p-5 rounded-xl bg-surface border border-red-500/30 hover:border-red-500/50 transition-colors">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <span className="flex items-center gap-1.5 text-red-500 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                AO VIVO
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-red-500 uppercase tracking-wider mb-1">AO VIVO AGORA</div>
              <h3 className="text-sm font-medium text-text-primary">{nextEvent.title}</h3>
              <p className="text-xs text-text-muted mt-1">
                {new Date(nextEvent.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às{' '}
                {new Date(nextEvent.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="mt-3">
                <Link href="/membros/lives">
                  <Button size="sm">
                    <Play className="w-3.5 h-3.5" />
                    Assistir Agora
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 transition-colors">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              {nextEvent ? (
                (() => {
                  const EventIcon = EVENT_TYPE_ICONS[nextEvent.type]
                  return <EventIcon className="w-4 h-4 text-accent" />
                })()
              ) : (
                <Calendar className="w-4 h-4 text-accent" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1">
                {nextEvent ? EVENT_TYPE_LABELS[nextEvent.type] : 'Próximo Evento'}
              </div>
              {nextEvent ? (
                <>
                  <h3 className="text-sm font-medium text-text-primary">{nextEvent.title}</h3>
                  <p className="text-xs text-text-muted mt-1">
                    {new Date(nextEvent.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às{' '}
                    {new Date(nextEvent.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="mt-3">
                    {nextEvent.type === 'live' ? (
                      <Link href="/membros/lives">
                        <Button size="sm" variant="secondary">
                          <Play className="w-3.5 h-3.5" />
                          Ver Detalhes
                        </Button>
                      </Link>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => {
                        const d = new Date(nextEvent.scheduled_at)
                        const pad = (n: number) => String(n).padStart(2, '0')
                        const dtStart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
                        const eventCal = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${dtStart}\nSUMMARY:${nextEvent.title} - E-commerce Sem Atalho\nDESCRIPTION:${EVENT_TYPE_LABELS[nextEvent.type]} do E-commerce Sem Atalho\nEND:VEVENT\nEND:VCALENDAR`
                        const blob = new Blob([eventCal], { type: 'text/calendar' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `${nextEvent.title.replace(/\s+/g, '-').toLowerCase()}.ics`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}>
                        <Calendar className="w-3.5 h-3.5" />
                        Adicionar ao calendário
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-medium text-text-primary">Nenhum evento agendado</h3>
                  <p className="text-xs text-text-muted mt-1">Fique atento às novidades</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Community feed preview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-text-primary">Comunidade</h2>
          <Link href="/membros/comunidade" className="text-xs text-accent hover:text-accent-hover">
            Ver tudo
          </Link>
        </div>
        {postsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="p-6 rounded-xl bg-surface border border-border-subtle text-center">
            <MessageCircle className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="text-sm text-text-muted">Nenhuma publicação ainda</p>
            <Link href="/membros/comunidade" className="text-xs text-accent hover:underline mt-1 inline-block">
              Seja o primeiro a postar
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <Link key={post.id} href="/membros/comunidade" className="block">
                <div className="p-4 rounded-xl bg-surface border border-border-subtle hover:border-border transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-medium text-text-primary">{post.profiles?.full_name || 'Membro'}</span>
                    <span className="text-[10px] text-text-muted">
                      {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary line-clamp-2">{post.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.community_reactions?.[0]?.count || 0}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.community_comments?.[0]?.count || 0}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Download, label: 'Materiais', href: '/membros/materiais', color: 'text-blue-400' },
          { icon: Bell, label: 'Atualizações', href: '/membros/atualizacoes', color: 'text-purple-400' },
          { icon: Sparkles, label: 'Assertive IA', href: '/membros/assertive-ecommerce-ia', color: 'text-pink-400' },
          { icon: Users, label: 'Suporte', href: '/membros/suporte', color: 'text-green-400' },
        ].map((link, i) => (
          <Link key={i} href={link.href}>
            <div className="p-4 rounded-xl bg-surface border border-border-subtle text-center hover:border-accent/30 transition-colors cursor-pointer">
              <link.icon className={`w-5 h-5 ${link.color} mx-auto mb-2`} />
              <span className="text-xs text-text-secondary">{link.label}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
