'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, CheckCircle, Clock, Play, MessageCircle, Download, ThumbsUp, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Lesson {
  id: string
  title: string
  slug: string
  description: string
  video_url: string
  duration: string
  order_index: number
  module_id: string
}

interface Module {
  id: string
  title: string
  slug: string
  order_index: number
}

interface PrevNextLesson {
  slug: string
  title: string
}

export default function AulaPage() {
  const { moduleId, lessonId } = useParams()
  const router = useRouter()
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [moduleData, setModuleData] = useState<Module | null>(null)
  const [completed, setCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [prevLesson, setPrevLesson] = useState<PrevNextLesson | null>(null)
  const [nextLesson, setNextLesson] = useState<PrevNextLesson | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const { data: lessonData } = await supabase
        .from('lessons')
        .select('*')
        .eq('slug', lessonId)
        .single()

      const { data: moduleDataResult } = await supabase
        .from('modules')
        .select('*')
        .eq('slug', moduleId)
        .single()

      if (lessonData && moduleDataResult) {
        setLesson(lessonData)
        setModuleData(moduleDataResult)

        const { data: allLessons } = await supabase
          .from('lessons')
          .select('id, slug, title, order_index')
          .eq('module_id', moduleDataResult.id)
          .order('order_index', { ascending: true })

        if (allLessons) {
          const currentIndex = allLessons.findIndex((l: { id: string }) => l.id === lessonData.id)
          if (currentIndex > 0) {
            setPrevLesson({ slug: allLessons[currentIndex - 1].slug, title: allLessons[currentIndex - 1].title })
          } else {
            setPrevLesson(null)
          }
          if (currentIndex < allLessons.length - 1) {
            setNextLesson({ slug: allLessons[currentIndex + 1].slug, title: allLessons[currentIndex + 1].title })
          } else {
            setNextLesson(null)
          }
        }

        if (user) {
          const { data: progress } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', user.id)
            .eq('lesson_id', lessonData.id)
            .single()

          if (progress) {
            setCompleted(progress.completed)
          }
        }
      }

      setLoading(false)
    }

    fetchData()
  }, [moduleId, lessonId])

  async function toggleCompleted() {
    if (!userId || !lesson || saving) return

    setSaving(true)
    const newCompleted = !completed

    if (completed) {
      const { error } = await supabase
        .from('user_progress')
        .delete()
        .eq('user_id', userId)
        .eq('lesson_id', lesson.id)

      if (!error) {
        setCompleted(false)
      }
    } else {
      const { error } = await supabase
        .from('user_progress')
        .insert({
          user_id: userId,
          lesson_id: lesson.id,
          module_id: lesson.module_id,
          completed: true,
          completed_at: new Date().toISOString(),
        })

      if (!error) {
        setCompleted(true)
      }
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
        <p className="text-text-muted">Aula não encontrada.</p>
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
        Voltar para {moduleData?.title || 'módulo'}
      </Link>

      {lesson.video_url ? (
        <div className="aspect-video rounded-xl overflow-hidden border border-border-subtle">
          <iframe
            src={lesson.video_url}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
              {moduleData?.title || 'Módulo'} · Aula {lesson.order_index}
            </div>
            <h1 className="text-xl font-semibold text-text-primary tracking-tight">{lesson.title}</h1>
            <div className="flex items-center gap-3 text-xs text-text-muted mt-2">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lesson.duration || '—'}
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
        {prevLesson ? (
          <button
            onClick={() => router.push(`/membros/aulas/${moduleId}/${prevLesson.slug}`)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 transition-colors text-left max-w-[45%]"
          >
            <ChevronLeft className="w-4 h-4 text-accent flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] text-text-muted">Anterior</div>
              <div className="text-xs font-medium text-text-primary truncate">{prevLesson.title}</div>
            </div>
          </button>
        ) : <div />}

        {nextLesson ? (
          <button
            onClick={() => router.push(`/membros/aulas/${moduleId}/${nextLesson.slug}`)}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 transition-colors text-right max-w-[45%]"
          >
            <div className="min-w-0">
              <div className="text-[10px] text-text-muted">Próxima</div>
              <div className="text-xs font-medium text-text-primary truncate">{nextLesson.title}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-accent flex-shrink-0" />
          </button>
        ) : <div />}
      </div>
    </div>
  )
}
