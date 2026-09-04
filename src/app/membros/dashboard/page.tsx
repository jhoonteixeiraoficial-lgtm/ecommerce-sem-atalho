'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { BookOpen, Video, Sparkles, ArrowRight, Play, Calendar, Download, Users, Bell, Clock, Star, Target, Award, Zap, Loader2, AlertCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCatalog, getModule, LearningApiError } from '@/lib/learning/client'
import { computeProgressPercentage, selectContinueWatching, type LessonWithProgress } from '@/lib/learning/progress'
import type { ModuleDetailDto } from '@/lib/learning/types'

interface UserData {
  name: string
  avatarUrl: string
}

interface ProfileData {
  full_name: string | null
  avatar_url: string | null
}

interface ModuleProgress {
  name: string
  totalLessons: number
  completedLessons: number
}

interface LastLesson {
  title: string
  moduleTitle: string
  moduleSlug: string
  lessonSlug: string
}

interface NextLive {
  id: string
  title: string
  scheduled_at: string
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

export default function DashboardPage() {
  const [user, setUser] = useState<UserData | null>(null)
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [totalModules, setTotalModules] = useState(0)
  const [totalLessons, setTotalLessons] = useState(0)
  const [completedLessons, setCompletedLessons] = useState(0)
  const [moduleProgress, setModuleProgress] = useState<ModuleProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastLesson, setLastLesson] = useState<LastLesson | null>(null)
  const [nextLive, setNextLive] = useState<NextLive | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (authUser) {
        const firstName = authUser.user_metadata?.full_name?.split(' ')[0] || authUser.email?.split('@')[0] || 'Membro'
        setUser({
          name: firstName,
          avatarUrl: authUser.user_metadata?.avatar_url || '/fotos/J&T-210.jpg'
        })

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

          setTotalModules(modules.length)
          setTotalLessons(totals.lessons)
          setCompletedLessons(totals.completed)
          setModuleProgress(
            modules.map((mod) => ({
              name: mod.title,
              totalLessons: mod.lessonCount,
              completedLessons: mod.completedCount,
            }))
          )

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
            // Layout-level auth guard will redirect; avoid surfacing a dashboard error for this case.
          } else {
            setError('Não foi possível carregar seu progresso. Tente novamente.')
          }
        }

        const now = new Date().toISOString()
        const { data: nextLiveData } = await supabase
          .from('lives')
          .select('id, title, scheduled_at')
          .gt('scheduled_at', now)
          .eq('is_live', false)
          .is('replay_url', null)
          .order('scheduled_at', { ascending: true })
          .limit(1)
          .single()

        if (nextLiveData) {
          setNextLive(nextLiveData)
        }
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  const progressPercentage = computeProgressPercentage(completedLessons, totalLessons)
  const displayName = profile?.full_name?.split(' ')[0] || user?.name || 'Membro'
  const planName = 'Plano Ativo'
  const avatarUrl = profile?.avatar_url || user?.avatarUrl || '/fotos/J&T-210.jpg'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-text-secondary text-sm">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Welcome Banner */}
      <div className="relative p-6 rounded-2xl bg-gradient-to-r from-accent/15 via-accent/10 to-transparent border border-accent/20 overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 left-1/2 w-24 h-24 bg-accent/5 rounded-full blur-xl"></div>
        
        <div className="flex items-center gap-6 relative z-10">
          <div className="relative flex-shrink-0">
            <div className="absolute -inset-1 bg-gradient-to-br from-accent/40 to-accent/20 rounded-full blur-sm"></div>
            <Image
              src={avatarUrl}
              alt={displayName}
              width={80}
              height={80}
              className="relative w-16 h-16 md:w-20 md:h-20 rounded-full object-cover border-2 border-accent/30"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold text-text-primary tracking-tight">
              Olá, {displayName} <span className="inline-block animate-bounce">👋</span>
            </h1>
            <p className="text-sm text-text-secondary mt-1">Bem-vindo de volta. Continue de onde você parou.</p>
            <div className="flex items-center gap-3 mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">
                <Award className="w-3 h-3" />
                {planName}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-medium">
                <Zap className="w-3 h-3" />
                {progressPercentage}% concluído
              </span>
            </div>
          </div>
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
                <div className="h-full bg-gradient-to-r from-accent to-amber-400 rounded-full transition-all" style={{ width: `${progressPercentage}%` }}></div>
              </div>
            </div>
          </div>
          <Link href={lastLesson ? `/membros/aulas/${lastLesson.moduleSlug}/${lastLesson.lessonSlug}` : '/membros/aulas'}>
            <Button size="sm" className="bg-gradient-to-r from-accent to-amber-500 hover:from-accent hover:to-amber-400">
              <Play className="w-3.5 h-3.5" />
              {lastLesson ? 'Continuar' : 'Começar'}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { icon: Target, value: `${progressPercentage}%`, label: 'Concluído', color: 'text-accent', bg: 'bg-accent/10' },
          { icon: BookOpen, value: String(totalModules), label: 'Módulos', color: 'text-text-primary', bg: 'bg-surface-raised' },
          { icon: Clock, value: String(totalLessons), label: 'Aulas', color: 'text-text-primary', bg: 'bg-surface-raised' },
          { icon: Star, value: '4.9', label: 'Avaliação', color: 'text-accent', bg: 'bg-accent/10' },
        ].map((stat, i) => (
          <div key={i} className="p-4 rounded-xl bg-surface border border-border-subtle text-center hover:border-accent/30 transition-colors">
            <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center mx-auto mb-2`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div className={`text-xl font-semibold ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 transition-colors">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Video className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1">Próxima Live</div>
              {nextLive ? (
                <>
                  <h3 className="text-sm font-medium text-text-primary">{nextLive.title}</h3>
                  <p className="text-xs text-text-muted mt-1">
                    {new Date(nextLive.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às{' '}
                    {new Date(nextLive.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="mt-3">
                    <Button size="sm" variant="secondary" onClick={() => {
                      const d = new Date(nextLive.scheduled_at)
                      const pad = (n: number) => String(n).padStart(2, '0')
                      const dtStart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
                      const event = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${dtStart}\nSUMMARY:${nextLive.title} - E-commerce Sem Atalho\nDESCRIPTION:Live exclusiva do E-commerce Sem Atalho\nEND:VEVENT\nEND:VCALENDAR`
                      const blob = new Blob([event], { type: 'text/calendar' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${nextLive.title.replace(/\s+/g, '-').toLowerCase()}.ics`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}>
                      <Calendar className="w-3.5 h-3.5" />
                      Adicionar ao calendário
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-medium text-text-primary">Nenhuma live agendada</h3>
                  <p className="text-xs text-text-muted mt-1">Fique atento às novidades</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 transition-colors">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Users className="w-4 h-4 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1">Comunidade</div>
              <h3 className="text-sm font-medium text-text-primary">Participe da comunidade</h3>
              <p className="text-xs text-text-muted mt-1">Conecte-se com outros membros</p>
              <div className="mt-3">
                <Link href="/membros/comunidade">
                  <Button size="sm" variant="secondary">
                    <Users className="w-3.5 h-3.5" />
                    Ver comunidade
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Module progress */}
      <div className="p-5 rounded-xl bg-surface border border-border-subtle">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-text-primary">Seu progresso</h3>
          <Link href="/membros/aulas" className="text-xs text-accent hover:text-accent-hover flex items-center gap-1">
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-3">
          {moduleProgress.length > 0 ? (
            moduleProgress.map((mod, i) => {
              const pct = computeProgressPercentage(mod.completedLessons, mod.totalLessons)
              return (
                <div key={i} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    pct === 100 ? 'bg-success/10' : 'bg-accent/10'
                  }`}>
                    {pct === 100 ? (
                      <Sparkles className="w-4 h-4 text-success" />
                    ) : (
                      <BookOpen className="w-4 h-4 text-accent" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-text-primary truncate">{mod.name}</span>
                      <span className="text-xs text-text-muted ml-2">{mod.completedLessons}/{mod.totalLessons} aulas</span>
                    </div>
                    <div className="h-1 bg-border rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          pct === 100 ? 'bg-success' : 'bg-gradient-to-r from-accent to-amber-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-text-muted text-center py-4">Nenhum módulo encontrado</p>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Download, label: 'Materiais', href: '/membros/materiais', color: 'text-blue-400' },
          { icon: Bell, label: 'Atualizações', href: '/membros/atualizacoes', color: 'text-purple-400' },
          { icon: Sparkles, label: 'Acertive IA', href: '/membros/acertive-ecom', color: 'text-pink-400' },
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
