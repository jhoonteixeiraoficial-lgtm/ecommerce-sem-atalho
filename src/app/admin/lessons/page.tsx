'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { BookOpen, Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Pencil, X, Check } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import VideoUpload from '@/components/admin/VideoUpload'

interface Lesson {
  id: string
  slug: string
  title: string
  description: string
  video_url: string
  duration_minutes: number
  sort_order: number
  is_published: boolean
}

interface Module {
  id: string
  slug: string
  title: string
  description: string
  sort_order: number
  is_published: boolean
  lessons: Lesson[]
}

export default function AdminLessons() {
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [expandedModule, setExpandedModule] = useState<string | null>(null)
  const [editingLesson, setEditingLesson] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [newModuleTitle, setNewModuleTitle] = useState('')
  const [newModuleSlug, setNewModuleSlug] = useState('')
  const [showNewModule, setShowNewModule] = useState(false)
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      router.push('/membros/dashboard')
      return
    }

    const { data: mods } = await supabase
      .from('modules')
      .select('*')
      .order('sort_order')

    const { data: lessons } = await supabase
      .from('lessons')
      .select('*')
      .order('sort_order')

    const modulesWithLessons: Module[] = (mods || []).map((m: Record<string, unknown>) => ({
      id: m.id as string,
      slug: m.slug as string,
      title: m.title as string,
      description: (m.description as string) || '',
      sort_order: (m.sort_order as number) || 0,
      is_published: (m.is_published as boolean) || false,
      lessons: (lessons || [])
        .filter((l: Record<string, unknown>) => l.module_id === m.id)
        .map((l: Record<string, unknown>) => ({
          id: l.id as string,
          slug: l.slug as string,
          title: l.title as string,
          description: (l.description as string) || '',
          video_url: (l.video_url as string) || '',
          duration_minutes: (l.duration_minutes as number) || 0,
          sort_order: (l.sort_order as number) || 0,
          is_published: (l.is_published as boolean) || false,
        })),
    }))

    setModules(modulesWithLessons)
    setLoading(false)
  }

  useEffect(() => {
    // Initial client-side load intentionally populates local page state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [])

  const addModule = async () => {
    if (!newModuleTitle || !newModuleSlug) return
    await supabase.from('modules').insert({
      title: newModuleTitle,
      slug: newModuleSlug,
      sort_order: modules.length,
      is_published: false,
    })
    setNewModuleTitle('')
    setNewModuleSlug('')
    setShowNewModule(false)
    setLoading(true)
    await fetchData()
  }

  const toggleModulePublish = async (mod: Module) => {
    await supabase.from('modules').update({ is_published: !mod.is_published }).eq('id', mod.id)
    await fetchData()
  }

  const deleteModule = async (id: string) => {
    if (!confirm('Excluir módulo e todas as aulas?')) return
    await supabase.from('modules').delete().eq('id', id)
    await fetchData()
  }

  const toggleLessonPublish = async (lesson: Lesson) => {
    await supabase.from('lessons').update({ is_published: !lesson.is_published }).eq('id', lesson.id)
    await fetchData()
  }

  const deleteLesson = async (id: string) => {
    if (!confirm('Excluir esta aula?')) return
    await supabase.from('lessons').delete().eq('id', id)
    await fetchData()
  }

  const startEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson.id)
    setEditTitle(lesson.title)
    setEditDesc(lesson.description)
  }

  const saveEditLesson = async (id: string) => {
    await supabase.from('lessons').update({ title: editTitle, description: editDesc }).eq('id', id)
    setEditingLesson(null)
    await fetchData()
  }

  if (loading) {
    return <div className="p-6 text-text-muted">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Gerenciar Aulas</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowNewModule(!showNewModule)}>
            <Plus className="w-4 h-4" />
            Novo Módulo
          </Button>
          <Button onClick={() => setShowUpload(!showUpload)}>
            <Plus className="w-4 h-4" />
            Nova Aula
          </Button>
        </div>
      </div>

      {showNewModule && (
        <Card className="space-y-3">
          <h3 className="text-sm font-medium text-text-primary">Novo Módulo</h3>
          <Input
            label="Título"
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            placeholder="Ex: Módulo 1 - Introdução"
          />
          <Input
            label="Slug"
            value={newModuleSlug}
            onChange={(e) => setNewModuleSlug(e.target.value)}
            placeholder="ex: modulo-1-introducao"
          />
          <div className="flex gap-2">
            <Button onClick={addModule} size="sm">Salvar</Button>
            <Button variant="ghost" onClick={() => setShowNewModule(false)} size="sm">Cancelar</Button>
          </div>
        </Card>
      )}

      {showUpload && (
        <VideoUpload modules={modules.map(({ id, title, slug }) => ({ id, title, slug }))} onUploadComplete={fetchData} />
      )}

      <div className="space-y-3">
        {modules.map((mod) => (
          <Card key={mod.id} className="overflow-hidden">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => setExpandedModule(expandedModule === mod.id ? null : mod.id)}
            >
              {expandedModule === mod.id ? (
                <ChevronDown className="w-4 h-4 text-text-muted shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary">{mod.title}</div>
                <div className="text-xs text-text-muted">{mod.lessons.length} aulas</div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                mod.is_published ? 'bg-success/10 text-success' : 'bg-surface-raised text-text-muted'
              }`}>
                {mod.is_published ? 'Publicado' : 'Rascunho'}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); toggleModulePublish(mod) }}
                className="text-text-muted hover:text-accent transition-colors"
                title={mod.is_published ? 'Despublicar' : 'Publicar'}
              >
                {mod.is_published ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteModule(mod.id) }}
                className="text-text-muted hover:text-error transition-colors"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {expandedModule === mod.id && (
              <div className="mt-3 pt-3 border-t border-border-subtle space-y-2">
                {mod.lessons.length === 0 && (
                  <p className="text-xs text-text-muted py-2">Nenhuma aula neste módulo.</p>
                )}
                {mod.lessons.map((lesson) => (
                  <div key={lesson.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-raised transition-colors">
                    <div className="flex-1 min-w-0">
                      {editingLesson === lesson.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="flex-1 bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent"
                          />
                          <button onClick={() => saveEditLesson(lesson.id)} className="text-success hover:text-success/80">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingLesson(null)} className="text-text-muted hover:text-error">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm text-text-primary">{lesson.title}</div>
                          <div className="text-xs text-text-muted">
                            {lesson.duration_minutes > 0 && `${lesson.duration_minutes} min · `}
                            {lesson.slug}
                          </div>
                        </>
                      )}
                    </div>
                    {editingLesson !== lesson.id && (
                      <div className="flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          lesson.is_published ? 'bg-success/10 text-success' : 'bg-surface-raised text-text-muted'
                        }`}>
                          {lesson.is_published ? 'Pub' : 'Rasc'}
                        </span>
                        <button
                          onClick={() => toggleLessonPublish(lesson)}
                          className="text-text-muted hover:text-accent transition-colors p-1"
                        >
                          {lesson.is_published ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => startEditLesson(lesson)}
                          className="text-text-muted hover:text-accent transition-colors p-1"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteLesson(lesson.id)}
                          className="text-text-muted hover:text-error transition-colors p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
