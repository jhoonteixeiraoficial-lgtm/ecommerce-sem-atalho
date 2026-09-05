'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Clock, CheckCircle, Play, ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { getModule, LearningApiError } from '@/lib/learning/client'
import type { ModuleDetailDto } from '@/lib/learning/types'

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export default function ModuloPage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const router = useRouter()
  const [moduleData, setModuleData] = useState<ModuleDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchModule = useCallback(async () => {
    setLoading(true)
    setError(null)
    setModuleData(null)

    try {
      const data = await getModule(moduleId)
      setModuleData(data)
    } catch (err) {
      if (err instanceof LearningApiError) {
        if (err.kind === 'unauthorized') {
          router.push('/login')
          return
        }
        if (err.kind === 'forbidden') {
          router.push('/membros/assinatura-necessaria')
          return
        }
        if (err.kind === 'not-found') {
          setLoading(false)
          return
        }
      }
      setError('Não foi possível carregar o módulo. Tente novamente.')
    }

    setLoading(false)
  }, [moduleId, router])

  useEffect(() => {
    // Initial client-side load intentionally populates local page state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchModule()
  }, [fetchModule])

  if (loading) {
    return (
      <div className="space-y-6">
        <Link href="/membros/aulas" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar pra Aulas
        </Link>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </div>
      </div>
    )
  }

  if (!moduleData) {
    return (
      <div className="space-y-6">
        <Link href="/membros/aulas" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar pra Aulas
        </Link>
        {error ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-text-muted">Módulo não encontrado.</p>
          </div>
        )}
      </div>
    )
  }

  const lessons = moduleData.lessons
  const totalLessons = lessons.length
  const completedCount = lessons.filter((lesson) => lesson.progress?.completed).length
  const progressPercentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0
  const nextLesson = lessons.find((lesson) => !lesson.progress?.completed)

  return (
    <div className="space-y-6">
      <Link href="/membros/aulas" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Voltar pra Aulas
      </Link>

      <div>
        <div className="text-[10px] text-accent font-medium uppercase tracking-wider mb-1">
          Módulo {(moduleData.sortOrder + 1).toString().padStart(2, '0')}
        </div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">{moduleData.title}</h1>
        <p className="text-sm text-text-muted mt-1">{moduleData.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-surface border border-border-subtle text-center">
          <div className="text-lg font-semibold text-text-primary">{completedCount}/{totalLessons}</div>
          <div className="text-[10px] text-text-muted">Aulas</div>
        </div>
        <div className="p-4 rounded-xl bg-surface border border-border-subtle text-center">
          <div className="text-lg font-semibold text-accent">{progressPercentage}%</div>
          <div className="text-[10px] text-text-muted">Progresso</div>
        </div>
      </div>

      {nextLesson && completedCount > 0 && (
        <Link href={`/membros/aulas/${moduleId}/${nextLesson.slug}`}>
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 flex items-center gap-3 hover:border-accent/40 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
              <Play className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-accent font-medium uppercase tracking-wider">Continuar assistindo</div>
              <div className="text-sm text-text-primary truncate">{nextLesson.title}</div>
            </div>
          </div>
        </Link>
      )}

      <div className="space-y-2">
        {lessons.length === 0 ? (
          <div className="text-center py-10">
            <BookOpen className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">Nenhuma aula neste módulo.</p>
          </div>
        ) : (
          lessons.map((lesson) => {
            const isCompleted = lesson.progress?.completed ?? false
            return (
              <Link key={lesson.id} href={`/membros/aulas/${moduleId}/${lesson.slug}`}>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-surface border border-border-subtle hover:border-border transition-colors cursor-pointer">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${
                    isCompleted ? 'bg-success/15' : 'bg-surface-raised'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4 text-success" />
                    ) : (
                      <Play className="w-4 h-4 text-text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-text-primary">{lesson.title}</h3>
                    <span className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {formatDuration(lesson.durationSeconds)}
                    </span>
                  </div>
                  {!isCompleted && (
                    <Button size="sm" variant="secondary">
                      Assistir
                    </Button>
                  )}
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
