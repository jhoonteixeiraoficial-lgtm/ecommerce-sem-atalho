'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Clock, CheckCircle, Play, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Lesson {
  id: string
  title: string
  duration?: string
}

interface Module {
  id: string
  title: string
  description?: string
  order_index: number
  slug: string
  lessons: Lesson[]
}

interface ModuleProgress {
  total: number
  completed: number
}

export default function AulasPage() {
  const [modules, setModules] = useState<Module[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, ModuleProgress>>({})
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchModules = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from('modules')
        .select('*, lessons(*)')
        .eq('is_published', true)
        .order('order_index')

      if (!error && data) {
        setModules(data)

        if (user) {
          const progress: Record<string, ModuleProgress> = {}
          for (const mod of data) {
            const { count: total } = await supabase
              .from('lessons')
              .select('*', { count: 'exact', head: true })
              .eq('module_id', mod.id)

            const { count: completed } = await supabase
              .from('user_progress')
              .select('*', { count: 'exact', head: true })
              .eq('module_id', mod.id)
              .eq('user_id', user.id)
              .eq('completed', true)

            progress[mod.id] = { total: total || 0, completed: completed || 0 }
          }
          setProgressMap(progress)
        }
      }
      setLoading(false)
    }
    fetchModules()
  }, [supabase])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Aulas</h1>
          <p className="text-sm text-text-muted mt-1">Acesse todos os módulos do curso</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Aulas</h1>
        <p className="text-sm text-text-muted mt-1">Acesse todos os módulos do curso</p>
      </div>

      {modules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="w-10 h-10 text-text-muted mb-3" />
          <p className="text-sm text-text-muted">Nenhum módulo disponível no momento.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((module, index) => {
            const progress = progressMap[module.id]
            const completedCount = progress?.completed || 0
            const totalCount = progress?.total || module.lessons.length
            const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
            const isCompleted = percentage === 100 && totalCount > 0
            const isInProgress = completedCount > 0 && !isCompleted

            return (
              <Link key={module.id} href={`/membros/aulas/${module.slug}`}>
                <div className="p-5 rounded-xl bg-surface border border-border-subtle hover:border-border transition-colors cursor-pointer h-full">
                  <div className="text-[10px] text-accent font-medium uppercase tracking-wider mb-2">
                    Módulo {(index + 1).toString().padStart(2, '0')}
                  </div>
                  <h3 className="text-sm font-medium text-text-primary mb-3">{module.title}</h3>
                  {module.description && (
                    <p className="text-xs text-text-muted mb-3 line-clamp-2">{module.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-[11px] text-text-muted mb-3">
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {totalCount} aulas
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCompleted ? (
                      <div className="flex items-center gap-1 text-[11px] text-success">
                        <CheckCircle className="w-3 h-3" />
                        Concluído
                      </div>
                    ) : isInProgress ? (
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
                          <span>{completedCount}/{totalCount} aulas</span>
                          <span className="text-accent font-medium">{percentage}%</span>
                        </div>
                        <div className="h-1 bg-border rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-accent to-amber-400 rounded-full" style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[11px] text-text-muted">
                        <Play className="w-3 h-3" />
                        Não iniciado
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
