'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, CheckCircle, Clock, Play, MessageCircle, ThumbsUp, ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { getLesson, getModule, updateProgress, LearningApiError } from '@/lib/learning/client'
import { resolvePlayerUrl } from '@/lib/learning/video'
import type { LessonDetailDto } from '@/lib/learning/types'

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '—'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export default function AulaPage() {
  const { moduleId, lessonId } = useParams<{ moduleId: string; lessonId: string }>()
  const router = useRouter()
  const [lesson, setLesson] = useState<LessonDetailDto | null>(null)
  const [moduleTitle, setModuleTitle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setLesson(null)

    try {
      const lessonData = await getLesson(moduleId, lessonId)
      setLesson(lessonData)

      try {
        const moduleData = await getModule(moduleId)
        setModuleTitle(moduleData.title)
      } catch {
        setModuleTitle(null)
      }
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
      setLoadError('Não foi possível carregar a aula. Tente novamente.')
    }

    setLoading(false)
  }, [moduleId, lessonId, router])

  useEffect(() => {
    // Initial client-side load intentionally populates local page state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  const completed = lesson?.progress?.completed ?? false

  async function toggleCompleted() {
    if (!lesson || saving) return

    setSaving(true)
    setSaveError(null)

    const newCompleted = !completed
    const positionSeconds = newCompleted
      ? lesson.durationSeconds
      : lesson.progress?.positionSeconds ?? 0

    try {
      const { progress } = await updateProgress({
        lessonId: lesson.id,
        positionSeconds,
        completed: newCompleted,
      })
      setLesson({ ...lesson, progress })
    } catch {
      setSaveError('Não foi possível salvar seu progresso. Tente novamente.')
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-40 bg-surface rounded animate-pulse" />
        <div className="aspect-video bg-surface rounded-xl animate-pulse" />
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="space-y-2">
              <div className="h-3 w-32 bg-surface rounded animate-pulse" />
              <div className="h-6 w-64 bg-surface rounded animate-pulse" />
              <div className="h-3 w-24 bg-surface rounded animate-pulse" />
            </div>
            <div className="h-28 bg-surface rounded-xl animate-pulse" />
          </div>
          <div className="space-y-3">
            <div className="h-40 bg-surface rounded-xl animate-pulse" />
            <div className="h-24 bg-surface rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (!lesson) {
    return (
      <div className="text-center py-20">
        {loadError ? (
          <div className="inline-flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {loadError}
          </div>
        ) : (
          <p className="text-text-muted">Aula não encontrada.</p>
        )}
        <br />
        <Link href="/membros/aulas" className="text-accent text-sm mt-2 inline-block hover:underline">
          Voltar para aulas
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link href={`/membros/aulas/${moduleId}`} className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Voltar para {moduleTitle || 'módulo'}
      </Link>

      {lesson.videoUrl ? (
        <div className="aspect-video rounded-xl overflow-hidden border border-border-subtle">
          <iframe
            src={resolvePlayerUrl(lesson.videoUrl)}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="aspect-video bg-surface rounded-xl flex items-center justify-center border border-border-subtle">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center mx-auto mb-3">
              <Play className="w-6 h-6 text-bg ml-0.5" />
            </div>
            <p className="text-xs text-text-muted">Vídeo não disponível</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div>
            <div className="text-[10px] text-accent font-medium uppercase tracking-wider mb-1">
              {moduleTitle || 'Módulo'} · Aula {lesson.sortOrder + 1}
            </div>
            <h1 className="text-xl font-semibold text-text-primary tracking-tight">{lesson.title}</h1>
            <div className="flex items-center gap-3 text-xs text-text-muted mt-2">
              <span>Professor: Jonatha Teixeira</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(lesson.durationSeconds)}
              </span>
              {completed && (
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-success" />
                  Concluída
                </span>
              )}
            </div>
          </div>

          <div className="p-5 rounded-xl bg-surface border border-border-subtle">
            <h3 className="text-sm font-medium text-text-primary mb-2">Sobre esta aula</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{lesson.description || 'Sem descrição disponível.'}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="p-5 rounded-xl bg-surface border border-border-subtle">
            <h3 className="text-sm font-medium text-text-primary mb-3">Ações</h3>
            <div className="space-y-2">
              <Button className="w-full" variant="secondary" size="sm" onClick={toggleCompleted} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ThumbsUp className="w-3.5 h-3.5" />
                )}
                {completed ? 'Concluída!' : 'Marcar como concluída'}
              </Button>
              {saveError && (
                <div className="flex items-center gap-1.5 text-[11px] text-error">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  {saveError}
                </div>
              )}
            </div>
          </div>

          <div className="p-5 rounded-xl bg-surface border border-border-subtle">
            <h3 className="text-sm font-medium text-text-primary mb-2">Dúvidas?</h3>
            <p className="text-xs text-text-muted mb-3">Pergunte na comunidade.</p>
            <Link href="/membros/comunidade">
              <Button className="w-full" variant="secondary" size="sm">
                <MessageCircle className="w-3.5 h-3.5" />
                Perguntar na comunidade
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation between lessons */}
      <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
        {lesson.prevLesson ? (
          <button
            onClick={() => router.push(`/membros/aulas/${moduleId}/${lesson.prevLesson!.slug}`)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 transition-colors text-left max-w-[45%]"
          >
            <ChevronLeft className="w-4 h-4 text-accent flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-text-muted">Anterior</div>
              <div className="text-xs font-medium text-text-primary truncate">{lesson.prevLesson.title}</div>
            </div>
          </button>
        ) : <div />}

        {lesson.nextLesson ? (
          <button
            onClick={() => router.push(`/membros/aulas/${moduleId}/${lesson.nextLesson!.slug}`)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 transition-colors text-right max-w-[45%]"
          >
            <div className="min-w-0">
              <div className="text-[10px] text-text-muted">Próxima</div>
              <div className="text-xs font-medium text-text-primary truncate">{lesson.nextLesson.title}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-accent flex-shrink-0" />
          </button>
        ) : <div />}
      </div>
    </div>
  )
}
