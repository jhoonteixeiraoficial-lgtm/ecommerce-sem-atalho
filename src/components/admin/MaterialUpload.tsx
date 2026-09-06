'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Upload, FileText, X, CheckCircle, AlertCircle, Link as LinkIcon } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'

interface MaterialUploadProps {
  onUploadComplete?: () => void
}

export default function MaterialUpload({ onUploadComplete }: MaterialUploadProps) {
  const [mode, setMode] = useState<'upload' | 'link'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [fileUrl, setFileUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('geral')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [supabase] = useState(() => createClient())

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
    const filePath = `materials/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('course-materials')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      setError('Erro ao fazer upload: ' + uploadError.message)
      setUploading(false)
      return
    }

    setFileUrl(filePath)
    setProgress(100)
    setUploading(false)
    setSuccess(true)
  }

  const handleSave = async () => {
    if (!title) {
      setError('Preencha o título do material.')
      return
    }

    const url = mode === 'upload' ? fileUrl : linkUrl
    if (!url) {
      setError(mode === 'upload' ? 'Faça o upload do arquivo primeiro.' : 'Cole o link do material.')
      return
    }

    setSaving(true)
    setError('')

    const { error: insertError } = await supabase.from('materials').insert({
      title,
      description,
      file_url: url,
      file_type: mode,
      category,
      is_premium: true,
    })

    if (insertError) {
      setError('Erro ao salvar material: ' + insertError.message)
      setSaving(false)
      return
    }

    setSuccess(true)
    setFile(null)
    setTitle('')
    setCategory('geral')
    setDescription('')
    setFileUrl('')
    setLinkUrl('')
    setProgress(0)
    setSaving(false)
    onUploadComplete?.()
  }

  const removeFile = () => {
    setFile(null)
    setFileUrl('')
    setProgress(0)
    setSuccess(false)
    setError('')
  }

  const resetAll = () => {
    setFile(null)
    setFileUrl('')
    setLinkUrl('')
    setProgress(0)
    setSuccess(false)
    setError('')
    setTitle('')
    setCategory('geral')
    setDescription('')
  }

  const isReady = mode === 'link' ? linkUrl : fileUrl

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-accent" />
        <h3 className="text-lg font-semibold text-text-primary">Adicionar Material</h3>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1.5 p-1 bg-surface-raised rounded-lg w-fit">
        <button
          onClick={() => { resetAll(); setMode('upload') }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
            mode === 'upload' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload arquivo
        </button>
        <button
          onClick={() => { resetAll(); setMode('link') }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
            mode === 'link' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary'
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          Colar link
        </button>
      </div>

      {mode === 'upload' ? (
        !file ? (
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
              Arraste um arquivo ou clique para selecionar
            </p>
            <p className="text-xs text-text-muted">Todos os formatos · Máximo 500MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="*/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-surface-raised rounded-lg">
              <FileText className="w-5 h-5 text-accent shrink-0" />
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

            {success && fileUrl && (
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle className="w-4 h-4" />
                Upload concluído!
              </div>
            )}

            {!fileUrl && !success && (
              <Button onClick={handleUpload} loading={uploading} className="w-full">
                Fazer Upload
              </Button>
            )}
          </div>
        )
      ) : (
        <Input
          label="Link do material"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://drive.google.com/... ou qualquer link de download"
        />
      )}

      {/* Metadata form - show when file is uploaded (upload mode) or link is entered (link mode) */}
      {isReady && (
        <div className="space-y-3 pt-2 border-t border-border-subtle">
          <Input
            label="Título do material"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Planilha de Custos"
          />
          <Input
            label="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve descrição do material"
          />
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
            >
              <option value="geral">Geral</option>
              <option value="planilha">Planilha</option>
              <option value="template">Template</option>
              <option value="ebook">E-book</option>
              <option value="checklist">Checklist</option>
              <option value="guia">Guia</option>
              <option value="documento">Documento</option>
              <option value="imagem">Imagem</option>
            </select>
          </div>
          <Button onClick={handleSave} loading={saving} className="w-full">
            Salvar Material
          </Button>
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
