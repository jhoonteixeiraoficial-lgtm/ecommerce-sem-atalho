'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Trash2, Pencil, ExternalLink, X, Check, Link as LinkIcon, Upload } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import MaterialUpload from '@/components/admin/MaterialUpload'

interface Material {
  id: string
  title: string
  description: string
  file_url: string
  file_type: string
  category: string
  is_premium: boolean
  download_count: number
  created_at: string
}

export default function AdminMaterials() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState('')
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

    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('created_at', { ascending: false })

    setMaterials(data || [])
    setLoading(false)
  }

  useEffect(() => {
    // Initial client-side load intentionally populates local page state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [])

  const deleteMaterial = async (id: string) => {
    if (!confirm('Excluir este material?')) return
    await supabase.from('materials').delete().eq('id', id)
    await fetchData()
  }

  const startEdit = (m: Material) => {
    setEditingId(m.id)
    setEditTitle(m.title)
    setEditDesc(m.description)
    setEditCategory(m.category)
  }

  const saveEdit = async (id: string) => {
    await supabase.from('materials').update({
      title: editTitle,
      description: editDesc,
      category: editCategory,
    }).eq('id', id)
    setEditingId(null)
    await fetchData()
  }

  if (loading) {
    return <div className="p-6 text-text-muted">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Gerenciar Materiais</h1>
        </div>
        <Button onClick={() => setShowUpload(!showUpload)}>
          <Plus className="w-4 h-4" />
          Novo Material
        </Button>
      </div>

      {showUpload && <MaterialUpload onUploadComplete={fetchData} />}

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border-subtle">
          <h3 className="text-sm font-medium text-text-primary">Materiais ({materials.length})</h3>
        </div>
        <div className="divide-y divide-border-subtle">
          {materials.length === 0 && (
            <div className="p-6 text-center text-text-muted text-sm">Nenhum material encontrado.</div>
          )}
          {materials.map((m) => (
            <div key={m.id} className="p-4 hover:bg-surface-raised transition-colors">
              {editingId === m.id ? (
                <div className="space-y-2">
                  <Input
                    label="Título"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                  <Input
                    label="Descrição"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                  />
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">Categoria</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
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
                  <div className="flex gap-2">
                    <Button onClick={() => saveEdit(m.id)} size="sm">
                      <Check className="w-3 h-3" />
                      Salvar
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)} size="sm">
                      <X className="w-3 h-3" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    m.file_type === 'link' ? 'bg-blue-500/10' : 'bg-accent/10'
                  }`}>
                    {m.file_type === 'link' ? (
                      <LinkIcon className="w-5 h-5 text-blue-400" />
                    ) : (
                      <Upload className="w-5 h-5 text-accent" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{m.title}</div>
                    <div className="text-xs text-text-muted">
                      {m.category} · {m.file_type === 'link' ? 'Link externo' : 'Arquivo'} · {m.is_premium ? 'Premium' : 'Grátis'} · {m.download_count} downloads
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={m.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted hover:text-accent transition-colors p-1"
                      title="Abrir"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => startEdit(m)}
                      className="text-text-muted hover:text-accent transition-colors p-1"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteMaterial(m.id)}
                      className="text-text-muted hover:text-error transition-colors p-1"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
