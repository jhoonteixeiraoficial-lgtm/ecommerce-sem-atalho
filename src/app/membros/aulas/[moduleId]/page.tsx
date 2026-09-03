'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Clock, CheckCircle, Play, ArrowLeft, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Lesson {
  id: string
  title: string
  slug: string
  duration: string | null
  order_index: number
}

interface ModuleData {
  id: string
  title: string
  description: string
  order_index: number
}

export default function ModuloPage() {
  const { moduleId } = useParams()
  const [moduleData, setModuleData] = useState<ModuleData | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()

      const { data: mod } = await supabase
        .from('modules')
        .select('*')
        .eq('slug', moduleId)
        .single()

      if (mod) {
        setModuleData(mod)

        const { data: lessonsData } = await supabase
          .from('lessons')
          .select('*')
          .eq('module_id', mod.id)
          .order('order_index', { ascending: true })

        if (lessonsData) {
          setLessons(lessonsData)
        }

        if (user) {
          const { data: progress } = await supabase
            .from('user_progress')
            .select('lesson_id')
            .eq('user_id', user.id)
            .eq('module_id', mod.id)
            .eq('completed', true)

          if (progress) {
            setCompletedLessons(new Set(progress.map((p: { lesson_id: string }) => p.lesson_id)))
          }
        }
      }

      setLoading(false)
    }

    fetchData()
  }, [moduleId, supabase])

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
        <div className="text-center py-20">
          <p className="text-text-muted">Módulo não encontrado.</p>
        </div>
      </div>
    )
  }

  const totalLessons = lessons.length
  const completedCount = completedLessons.size
  const progressPercentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

  return (
    <div className="space-y-6">
      <Link href="/membros/aulas" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" />
        Voltar pra Aulas
      </Link>

      <div>
        <div className="text-[10px] text-accent font-medium uppercase tracking-wider mb-1">
          Módulo {(moduleData.order_index + 1).toString().padStart(2, '0')}
        </div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">{moduleData.title}</h1>
        <p className="text-sm text-text-muted mt-1">{moduleData.description}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-surface border border-border-subtle text-center">
          <div className="text-lg font-semibold text-text-primary">{completedCount}/{totalLessons}</div>
          <div className="text-[10px] text-text-muted">Aulas</div>
        </div>
        <div className="p-4 rounded-xl bg-surface border border-border-subtle text-center">
          <div className="text-lg font-semibold text-accent">{progressPercentage}%</div>
          <div className="text-[10px] text-text-muted">Progresso</div>
        </div>
      </div>

      <div className="space-y-2">
        {lessons.length === 0 ? (
          <div className="text-center py-10">
            <BookOpen className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">Nenhuma aula neste módulo.</p>
          </div>
        ) : (
          lessons.map((lesson) => {
            const isCompleted = completedLessons.has(lesson.id)
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
                      {lesson.duration || '—'}
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
