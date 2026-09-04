'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight, Pencil, X, Check } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import VideoUpload from '@/components/admin/VideoUpload'
import {
  getAdminLearningTree,
  createModule,
  updateModule,
  deleteModule as deleteModuleRequest,
  updateLesson,
  deleteLesson as deleteLessonRequest,
  AdminApiError,
} from '@/lib/learning/admin-client'

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

function describeError(error: unknown, fallback: string): string {
  return error instanceof AdminApiError ? error.message : fallback
}

export default function AdminLessons() {
  const [modules, setModules] = useState<Module[]>([])
  const [defaultCourseId, setDefaultCourseId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [expandedModule, setExpandedModule] = useState<string | null>(null)
  const [editingLesson, setEditingLesson] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [newModuleTitle, setNewModuleTitle] = useState('')
  const [newModuleSlug, setNewModuleSlug] = useState('')
  const [showNewModule, setShowNewModule] = useState(false)

  const fetchData = async () => {
    try {
      const courses = await getAdminLearningTree()
      const modulesWithLessons: Module[] = courses.flatMap((course) =>
        course.modules.map((mod) => ({
          id: mod.id,
          slug: mod.slug,
          title: mod.title,
          description: mod.description,
          sort_order: mod.sortOrder,
          is_published: mod.isPublished,
          lessons: mod.lessons.map((lesson) => ({
            id: lesson.id,
            slug: lesson.slug,
            title: lesson.title,
            description: lesson.description,
            video_url: lesson.videoUrl,
            duration_minutes: Math.round(lesson.durationSeconds / 60),
            sort_order: lesson.sortOrder,
            is_published: lesson.isPublished,
          })),
        }))
      )

      setModules(modulesWithLessons)
      setDefaultCourseId(courses[0]?.id ?? null)
    } catch (fetchError) {
      setError(describeError(fetchError, 'Erro ao carregar aulas'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Initial client-side load intentionally populates local page state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [])

  const addModule = async () => {
    if (!newModuleTitle || !newModuleSlug) return
    if (!defaultCourseId) {
      setError('Nenhum curso disponível para receber o módulo')
      return
    }
    setError('')

    try {
      await createModule({
        courseId: defaultCourseId,
        title: newModuleTitle,
        slug: newModuleSlug,
        description: '',
        sortOrder: modules.length,
        isPublished: false,
        releaseAt: null,
      })
    } catch (createError) {
      setError(describeError(createError, 'Erro ao criar módulo'))
      return
    }

    setNewModuleTitle('')
    setNewModuleSlug('')
    setShowNewModule(false)
    setLoading(true)
    await fetchData()
  }

  const toggleModulePublish = async (mod: Module) => {
    setError('')
    try {
      await updateModule(mod.id, { isPublished: !mod.is_published })
    } catch (updateError) {
      setError(describeError(updateError, 'Erro ao atualizar módulo'))
      return
    }
    await fetchData()
  }

  const deleteModule = async (id: string) => {
    if (!confirm('Excluir módulo e todas as aulas?')) return
    setError('')
    try {
      await deleteModuleRequest(id)
    } catch (deleteError) {
      setError(describeError(deleteError, 'Erro ao excluir módulo'))
      return
    }
    await fetchData()
  }

  const toggleLessonPublish = async (lesson: Lesson) => {
    setError('')
    try {
      await updateLesson(lesson.id, { isPublished: !lesson.is_published })
    } catch (updateError) {
      setError(describeError(updateError, 'Erro ao atualizar aula'))
      return
    }
    await fetchData()
  }

  const deleteLesson = async (id: string) => {
    if (!confirm('Excluir esta aula?')) return
    setError('')
    try {
      await deleteLessonRequest(id)
    } catch (deleteError) {
      setError(describeError(deleteError, 'Erro ao excluir aula'))
      return
    }
    await fetchData()
  }

  const startEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson.id)
    setEditTitle(lesson.title)
    setEditDesc(lesson.description)
  }

  const saveEditLesson = async (id: string) => {
    setError('')
    try {
      await updateLesson(id, { title: editTitle, description: editDesc })
    } catch (updateError) {
      setError(describeError(updateError, 'Erro ao salvar aula'))
      return
    }
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

      {error && (
        <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">{error}</div>
      )}

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
        <VideoUpload
          modules={modules.map(({ id, title, slug }) => ({ id, title, slug }))}
          onUploadComplete={fetchData}
        />
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
