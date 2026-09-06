'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Upload, Link as LinkIcon, FileText, Sparkles, ArrowRight, Loader2, AlertCircle } from 'lucide-react'

type InputType = 'photo' | 'description' | 'url'

export default function NovoPage() {
  const [inputType, setInputType] = useState<InputType>('description')
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 10MB.')
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setPreview(result)
      setInputValue(result)
    }
    reader.readAsDataURL(file)
  }

  async function uploadPhotoToStorage(dataUrl: string): Promise<string | null> {
    try {
      const base64 = dataUrl.split(',')[1]
      const mime = dataUrl.split(';')[0].split(':')[1]
      const ext = mime.split('/')[1] || 'jpg'
      const binary = atob(base64)
      const array = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)

      const fileName = `assertive/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, array, { contentType: mime })

      if (error) {
        console.error('Upload error:', error)
        return null
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(data.path)
      return urlData.publicUrl
    } catch (e) {
      console.error('Upload failed:', e)
      return null
    }
  }

  async function handleAnalyze() {
    if (!inputValue) return
    setLoading(true)
    setError(null)

    try {
      let finalValue = inputValue

      if (inputType === 'photo' && inputValue.startsWith('data:')) {
        const uploadedUrl = await uploadPhotoToStorage(inputValue)
        if (!uploadedUrl) {
          setError('Erro ao enviar foto. Tente novamente.')
          setLoading(false)
          return
        }
        finalValue = uploadedUrl
      }

      const res = await fetch('/api/assertive/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_type: inputType, input_value: finalValue }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao analisar produto')
        setLoading(false)
        return
      }

      if (data.id) {
        router.push(`/membros/assertive-ecommerce-ia/analise/${data.id}`)
      } else {
        setError('Erro ao criar análise')
      }
    } catch (e) {
      console.error('Analyze error:', e)
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { type: 'description' as InputType, icon: FileText, label: 'Descrição' },
    { type: 'photo' as InputType, icon: Upload, label: 'Foto' },
    { type: 'url' as InputType, icon: LinkIcon, label: 'URL ML' },
  ]

  return (
    <div className="min-h-screen bg-[#0c0c0c] p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Nova Análise</h1>
            <p className="text-gray-400 text-sm">Envie um produto para analisar e gerar anúncios otimizados</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.type}
              onClick={() => { setInputType(tab.type); setInputValue(''); setPreview(null); setError(null) }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                inputType === tab.type
                  ? 'bg-amber-500 text-black'
                  : 'bg-[#1c1c1c] text-gray-400 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-[#141414] border border-[#1c1c1c] rounded-xl p-6">
          {inputType === 'photo' && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {preview ? (
                <div className="relative">
                  <img src={preview} alt="Preview" className="w-full h-64 object-contain rounded-lg bg-[#1c1c1c]" />
                  <button
                    onClick={() => { setPreview(null); setInputValue('') }}
                    className="absolute top-2 right-2 bg-red-500/80 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-500"
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-48 border-2 border-dashed border-[#2a2a2a] rounded-xl flex flex-col items-center justify-center gap-3 hover:border-amber-500/50 transition text-gray-400 hover:text-white"
                >
                  <Upload className="w-10 h-10" />
                  <p>Clique para enviar uma foto</p>
                  <p className="text-xs text-gray-500">JPG, PNG, WebP (máx 10MB)</p>
                </button>
              )}
            </div>
          )}

          {inputType === 'description' && (
            <textarea
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Descreva o produto... Ex: 'Capa de celular iPhone 15 Pro Max, silicone, cor preta, com suporte para cartão'"
              className="w-full h-48 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-4 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-amber-500/50"
            />
          )}

          {inputType === 'url' && (
            <input
              type="url"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="https://www.mercadolivre.com.br/produto-exemplo/MLB-123456"
              className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
            />
          )}

          <button
            onClick={handleAnalyze}
            disabled={!inputValue || loading}
            className="w-full mt-6 bg-gradient-to-r from-amber-500 to-orange-600 text-black py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {inputType === 'photo' ? 'Enviando foto...' : 'Analisando produto...'}
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Analisar e Espionar
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
