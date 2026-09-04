'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, CheckCircle, Play, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getCatalog, LearningApiError } from '@/lib/learning/client'
import type { ModuleCatalogDto } from '@/lib/learning/types'

export default function AulasPage() {
  const router = useRouter()
  const [modules, setModules] = useState<ModuleCatalogDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCatalog = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const catalog = await getCatalog()
      setModules(catalog.flatMap((course) => course.modules))
    } catch (err) {
      if (err instanceof LearningApiError && err.kind === 'unauthorized') {
        router.push('/login')
        return
      }
      if (err instanceof LearningApiError && err.kind === 'forbidden') {
        router.push('/membros/assinatura-necessaria')
        return
      }
      setError('Não foi possível carregar as aulas. Tente novamente.')
    }

    setLoading(false)
  }, [router])

  useEffect(() => {
    // Initial client-side load intentionally populates local page state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCatalog()
  }, [fetchCatalog])

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

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {modules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="w-10 h-10 text-text-muted mb-3" />
          <p className="text-sm text-text-muted">Nenhum módulo disponível no momento.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((module, index) => {
            const totalCount = module.lessonCount
            const completedCount = module.completedCount
            const percentage = module.progressPercentage
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
