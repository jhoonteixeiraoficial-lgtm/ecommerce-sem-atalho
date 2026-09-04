'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Video, Loader2, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getCatalog, getModule, LearningApiError } from '@/lib/learning/client'
import type { ModuleDetailDto } from '@/lib/learning/types'

interface Live {
  id: string
  title: string
  scheduled_at: string
  is_live: boolean
  replay_url: string
}

interface FeedItem {
  id: string
  type: 'aula' | 'live'
  title: string
  description: string
  date: string | null
  href: string
}

const TYPE_STYLES = {
  aula: { icon: BookOpen, iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400' },
  live: { icon: Video, iconBg: 'bg-purple-500/15', iconColor: 'text-purple-400' },
} as const

function sortByDateDesc(a: FeedItem, b: FeedItem) {
  if (a.date && b.date) return new Date(b.date).getTime() - new Date(a.date).getTime()
  if (a.date) return -1
  if (b.date) return 1
  return 0
}

export default function AtualizacoesPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const fetchFeed = async () => {
      const feedItems: FeedItem[] = []

      try {
        const catalog = await getCatalog()
        const modules = catalog.flatMap((course) => course.modules)
        const moduleDetails = await Promise.allSettled(modules.map((mod) => getModule(mod.slug)))

        const lessonItems: FeedItem[] = moduleDetails
          .filter((result): result is PromiseFulfilledResult<ModuleDetailDto> => result.status === 'fulfilled')
          .flatMap((result) =>
            result.value.lessons.map((lesson) => ({
              id: lesson.id,
              type: 'aula' as const,
              title: lesson.title,
              description: lesson.description || result.value.title,
              date: lesson.releaseAt,
              href: `/membros/aulas/${result.value.slug}/${lesson.slug}`,
            }))
          )
          .sort(sortByDateDesc)
          .slice(0, 5)

        feedItems.push(...lessonItems)
      } catch (err) {
        if (!(err instanceof LearningApiError && (err.kind === 'unauthorized' || err.kind === 'forbidden'))) {
          // Best-effort feed; lesson data is optional if the learning API fails.
        }
      }

      const { data: livesData, error: livesError } = await supabase
        .from('lives')
        .select('id, title, scheduled_at, is_live, replay_url')
        .order('scheduled_at', { ascending: true })

      if (!livesError && livesData) {
        const now = new Date()
        const upcomingLiveItems: FeedItem[] = (livesData as Live[])
          .filter((live) => !live.is_live && !live.replay_url && new Date(live.scheduled_at) > now)
          .map((live) => ({
            id: live.id,
            type: 'live' as const,
            title: live.title,
            description: 'Live agendada',
            date: live.scheduled_at,
            href: '/membros/lives',
          }))

        feedItems.push(...upcomingLiveItems)
      }

      feedItems.sort(sortByDateDesc)
      setItems(feedItems)
      setLoading(false)
    }

    void fetchFeed()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Atualizações</h1>
        <p className="text-sm text-text-muted mt-1">Novidades da plataforma</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-10">Nenhuma novidade por aqui ainda</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const style = TYPE_STYLES[item.type]
            return (
              <Link key={item.id} href={item.href}>
                <div className="flex items-start gap-3 p-4 rounded-xl bg-surface border border-border-subtle hover:border-border transition-colors cursor-pointer">
                  <div className={`p-2 rounded-lg ${style.iconBg} flex-shrink-0`}>
                    <style.icon className={`w-4 h-4 ${style.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      {item.date && (
                        <span className="text-[10px] text-text-muted">
                          {new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 bg-surface-raised rounded text-[10px] text-text-muted capitalize">{item.type}</span>
                    </div>
                    <h3 className="text-sm font-medium text-text-primary">{item.title}</h3>
                    {item.description && <p className="text-xs text-text-muted mt-0.5">{item.description}</p>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0 mt-1" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
