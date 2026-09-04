'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Upload, Video, X, CheckCircle, AlertCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import { createLesson, AdminApiError } from '@/lib/learning/admin-client'
import { toYouTubeEmbedUrl } from '@/lib/learning/video'

interface Module {
  id: string
  title: string
  slug: string
}

interface VideoUploadProps {
  modules: Module[]
  onUploadComplete?: () => void
}

export default function VideoUpload({ modules, onUploadComplete }: VideoUploadProps) {
  const [source, setSource] = useState<'upload' | 'youtube'>('youtube')
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [youtubeInput, setYoutubeInput] = useState('')
  const [youtubeError, setYoutubeError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [moduleId, setModuleId] = useState('')
  const [slug, setSlug] = useState('')
  const [duration, setDuration] = useState('')
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [supabase] = useState(() => createClient())

  const ACCEPTED_TYPES = ['video/mp4', 'video/webm', 'video/ogg']
  const MAX_SIZE = 500 * 1024 * 1024

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const validateFile = (f: File): string | null => {
    if (!ACCEPTED_TYPES.includes(f.type)) return 'Formato não aceito. Use MP4, WebM ou OGG.'
    if (f.size > MAX_SIZE) return 'Arquivo muito grande. Máximo 500MB.'
    return null
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0]
      const err = validateFile(f)
      if (err) { setError(err); return }
      setError('')
      setFile(f)
      setSuccess(false)
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0]
      const err = validateFile(f)
      if (err) { setError(err); return }
      setError('')
      setFile(f)
      setSuccess(false)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setProgress(0)
    setError('')

    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const filePath = `videos/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('course-videos')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      setError('Erro ao fazer upload: ' + uploadError.message)
      setUploading(false)
      return
    }

    // `course-videos` is a private bucket (subscriber-only RLS); a "public"
    // URL is never reachable for it. Mint a long-lived signed URL instead so
    // the stored transitional videoUrl is actually playable by members.
    const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60
    const { data: signedData, error: signedError } = await supabase.storage
      .from('course-videos')
      .createSignedUrl(filePath, TEN_YEARS_SECONDS)

    if (signedError || !signedData?.signedUrl) {
      setError('Erro ao gerar link do vídeo: ' + (signedError?.message ?? 'desconhecido'))
      setUploading(false)
      return
    }

    setVideoUrl(signedData.signedUrl)
    setProgress(100)
    setUploading(false)
    setSuccess(true)
  }

  const handleSave = async () => {
    if (!title || !moduleId || !slug) {
      setError('Preencha título, módulo e slug.')
      return
    }
    setSaving(true)
    setError('')

    try {
      await createLesson({
        moduleId,
        slug,
        title,
        description,
        videoUrl,
        durationSeconds: duration ? parseInt(duration) * 60 : 0,
        sortOrder: 0,
        isPublished: false,
        releaseAt: null,
      })
    } catch (createError) {
      const message = createError instanceof AdminApiError
        ? createError.message
        : 'Erro desconhecido'
      setError('Erro ao salvar aula: ' + message)
      setSaving(false)
      return
    }

    setSuccess(true)
    setFile(null)
    setTitle('')
    setDescription('')
    setModuleId('')
    setSlug('')
    setDuration('')
    setVideoUrl('')
    setProgress(0)
    setSaving(false)
    onUploadComplete?.()
  }

  const removeFile = () => {
    setFile(null)
    setVideoUrl('')
    setProgress(0)
    setSuccess(false)
    setError('')
  }

  const handleValidateYoutube = () => {
    setYoutubeError('')
    const embed = toYouTubeEmbedUrl(youtubeInput.trim())
    if (!embed) {
      setYoutubeError('URL do YouTube inválida. Cole a URL completa do vídeo (não listado).')
      return
    }
    setVideoUrl(embed)
    setSuccess(true)
  }

  const resetYoutube = () => {
    setYoutubeInput('')
    setYoutubeError('')
    setVideoUrl('')
    setSuccess(false)
  }

  const metadataForm = (
    <div className="space-y-3 pt-2 border-t border-border-subtle">
      <Input
        label="Título da aula"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ex: Introdução ao Marketing"
      />
      <Input
        label="Slug"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="ex: introducao-ao-marketing"
      />
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">Módulo</label>
        <select
          value={moduleId}
          onChange={(e) => setModuleId(e.target.value)}
          className="w-full bg-surface border border-border rounded-lg px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
        >
          <option value="">Selecione um módulo</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>
      </div>
      <Input
        label="Descrição"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Breve descrição da aula"
      />
      <Input
        label="Duração (minutos)"
        type="number"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
        placeholder="Ex: 15"
      />
      <Button onClick={handleSave} loading={saving} className="w-full">
        Salvar Aula
      </Button>
    </div>
  )

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Video className="w-5 h-5 text-accent" />
        <h3 className="text-lg font-semibold text-text-primary">Nova Aula</h3>
      </div>

      <div className="flex gap-1.5 p-1 bg-surface-raised rounded-lg w-fit">
        <button
          onClick={() => { setSource('youtube'); setFile(null); setVideoUrl(''); setSuccess(false); setError('') }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            source === 'youtube' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          YouTube (não listado)
        </button>
        <button
          onClick={() => { setSource('upload'); resetYoutube(); setError('') }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            source === 'upload' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          Upload de arquivo
        </button>
      </div>

      {source === 'youtube' ? (
        <div className="space-y-3">
          {!videoUrl ? (
            <>
              <Input
                label="URL do vídeo no YouTube (não listado)"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              {youtubeError && (
                <div className="flex items-center gap-2 text-error text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {youtubeError}
                </div>
              )}
              <Button onClick={handleValidateYoutube} disabled={!youtubeInput.trim()} className="w-full">
                Validar vídeo
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle className="w-4 h-4" />
                Vídeo do YouTube validado!
              </div>
              {metadataForm}
            </>
          )}
        </div>
      ) : !file ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-accent bg-accent/5'
              : 'border-border-subtle hover:border-accent/40 hover:bg-surface-raised'
          }`}
        >
          <Upload className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-sm text-text-secondary mb-1">
            Arraste um vídeo ou clique para selecionar
          </p>
          <p className="text-xs text-text-muted">MP4, WebM, OGG · Máximo 500MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/ogg"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-surface-raised rounded-lg">
            <Video className="w-5 h-5 text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary truncate">{file.name}</p>
              <p className="text-xs text-text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <button onClick={removeFile} className="text-text-muted hover:text-error transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-text-muted text-right">{progress}%</p>
            </div>
          )}

          {success && videoUrl && (
            <div className="flex items-center gap-2 text-success text-sm">
              <CheckCircle className="w-4 h-4" />
              Upload concluído!
            </div>
          )}

          {!videoUrl && !success && (
            <Button onClick={handleUpload} loading={uploading} className="w-full">
              Fazer Upload
            </Button>
          )}

          {videoUrl && metadataForm}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-error text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </Card>
  )
}
