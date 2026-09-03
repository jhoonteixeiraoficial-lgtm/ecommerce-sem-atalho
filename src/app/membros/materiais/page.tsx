'use client'

import { useState, useEffect, useRef } from 'react'
import { Download, FileText, Image, FileSpreadsheet, Search } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

interface Material {
  id: string
  title: string
  description: string
  category: string
  file_url: string
  downloads: number
}

const categoryIcons: Record<string, typeof FileText> = {
  Planilhas: FileSpreadsheet,
  Checklists: FileText,
  Guias: FileText,
  Templates: FileText,
}

export default function MateriaisPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Todos')
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    async function fetchMaterials() {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setMaterials(data)
      }
      setLoading(false)
    }

    fetchMaterials()
  }, [supabase])

  const categories = ['Todos', ...new Set(materials.map((m) => m.category))]

  const filteredMaterials = materials.filter((m) => {
    const matchesSearch =
      m.title.toLowerCase().includes(search.toLowerCase()) ||
      m.description.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = activeCategory === 'Todos' || m.category === activeCategory
    return matchesSearch && matchesCategory
  })

  function handleDownload(url: string) {
    if (url) {
      window.open(url, '_blank')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Materiais</h1>
          <p className="text-sm text-text-muted mt-1">Baixe materiais exclusivos</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 rounded-xl bg-surface border border-border-subtle animate-pulse">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-surface-raised w-8 h-8" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-surface-raised rounded w-16" />
                  <div className="h-4 bg-surface-raised rounded w-3/4" />
                  <div className="h-3 bg-surface-raised rounded w-full" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-subtle">
                <div className="h-3 bg-surface-raised rounded w-20" />
                <div className="h-7 bg-surface-raised rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Materiais</h1>
        <p className="text-sm text-text-muted mt-1">Baixe materiais exclusivos</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Buscar materiais..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
              activeCategory === cat
                ? 'bg-accent text-white'
                : 'bg-surface text-text-muted hover:bg-surface-raised'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredMaterials.map((material) => {
          const Icon = categoryIcons[material.category] || FileText
          return (
            <div key={material.id} className="p-5 rounded-xl bg-surface border border-border-subtle hover:border-border transition-colors">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-surface-raised flex-shrink-0">
                  <Icon className="w-4 h-4 text-text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] text-accent font-medium uppercase tracking-wider">{material.category}</span>
                  <h3 className="text-sm font-medium text-text-primary mt-1">{material.title}</h3>
                  <p className="text-xs text-text-muted mt-1">{material.description}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-subtle">
                <span className="text-[10px] text-text-muted">{material.downloads} downloads</span>
                <Button size="sm" variant="secondary" onClick={() => handleDownload(material.file_url)}>
                  <Download className="w-3.5 h-3.5" />
                  Baixar
                </Button>
              </div>
            </div>
          )
        })}
        {filteredMaterials.length === 0 && (
          <div className="col-span-full text-center py-8 text-text-muted">
            <p>Nenhum material encontrado</p>
          </div>
        )}
      </div>
    </div>
  )
}
