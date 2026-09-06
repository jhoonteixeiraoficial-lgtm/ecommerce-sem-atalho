'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera, ImagePlus, Link as LinkIcon, FileText, Sparkles, ArrowRight,
  Loader2, AlertCircle, X, Plug, CheckCircle2,
} from 'lucide-react'

type InputType = 'photo' | 'description' | 'url'

interface Photo {
  id: string
  previewUrl: string
  file: File
}

const MAX_PHOTOS = 6

export default function NovoPage() {
  const [inputType, setInputType] = useState<InputType>('photo')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [description, setDescription] = useState('')
  const [photoHint, setPhotoHint] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mlConnected, setMlConnected] = useState<boolean | null>(null)

  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/assertive/ml/status')
      .then(r => r.json())
      .then(d => setMlConnected(Boolean(d.connected)))
      .catch(() => setMlConnected(false))
  }, [])

  // libera as URLs de preview ao desmontar para não vazar memória
  useEffect(() => {
    return () => {
      photos.forEach(p => URL.revokeObjectURL(p.previewUrl))
    }
  }, [photos])

  const addFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return
    setError(null)

    const incoming: Photo[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
        setError('Envie apenas imagens (JPG, PNG ou WebP).')
        continue
      }
      if (file.size > 12 * 1024 * 1024) {
        setError(`"${file.name}" tem mais de 12MB.`)
        continue
      }
      incoming.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        previewUrl: URL.createObjectURL(file),
        file,
      })
    }

    setPhotos(prev => {
      const merged = [...prev, ...incoming]
      if (merged.length > MAX_PHOTOS) {
        setError(`Máximo de ${MAX_PHOTOS} fotos.`)
        merged.slice(MAX_PHOTOS).forEach(p => URL.revokeObjectURL(p.previewUrl))
      }
      return merged.slice(0, MAX_PHOTOS)
    })
  }, [])

  function removePhoto(id: string) {
    setPhotos(prev => {
      const target = prev.find(p => p.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter(p => p.id !== id)
    })
  }

  async function uploadPhotos(): Promise<string[]> {
    const form = new FormData()
    photos.forEach(p => form.append('files', p.file, p.file.name))

    const res = await fetch('/api/assertive/upload', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Falha ao enviar as fotos.')
    return data.urls as string[]
  }

  const canSubmit =
    !loading &&
    (inputType === 'photo'
      ? photos.length > 0
      : inputType === 'description'
        ? description.trim().length >= 8
        : /^https?:\/\/.+/.test(url.trim()))

  async function handleAnalyze() {
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    try {
      let photoUrls: string[] = []

      if (inputType === 'photo') {
        setStage('Enviando fotos...')
        photoUrls = await uploadPhotos()
      }

      setStage('Identificando o produto...')
      const res = await fetch('/api/assertive/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_type: inputType,
          photos: inputType === 'photo' ? photoUrls : undefined,
          description:
            inputType === 'description'
              ? description.trim()
              : inputType === 'photo' && photoHint.trim()
                ? photoHint.trim()
                : undefined,
          url: inputType === 'url' ? url.trim() : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Não foi possível identificar o produto.')
        setLoading(false)
        setStage('')
        return
      }

      router.push(`/membros/assertive-ecommerce-ia/analise/${data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de conexão. Tente novamente.')
      setLoading(false)
      setStage('')
    }
  }

  async function connectML() {
    const res = await fetch('/api/assertive/ml/connect', { method: 'POST' })
    const data = await res.json()
    if (data.url) window.open(data.url, 'ml-oauth', 'width=520,height=720')
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'ml-connected' && e.data.ok) setMlConnected(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const tabs = [
    { type: 'photo' as InputType, icon: Camera, label: 'Foto' },
    { type: 'description' as InputType, icon: FileText, label: 'Descrição' },
    { type: 'url' as InputType, icon: LinkIcon, label: 'Link ML' },
  ]

  return (
    <div className="min-h-screen bg-[#0c0c0c] px-4 py-6 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Nova Análise</h1>
            <p className="text-gray-400 text-sm">Mostre o produto e o Assertive faz o trabalho pesado</p>
          </div>
        </div>

        {mlConnected === false && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-5">
            <div className="flex items-start gap-3">
              <Plug className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-amber-200 text-sm font-medium">Conecte sua conta do Mercado Livre</p>
                <p className="text-amber-200/60 text-xs mt-1">
                  A pesquisa de concorrência e a publicação usam a API oficial do Mercado Livre.
                </p>
                <button
                  onClick={connectML}
                  className="mt-3 bg-amber-500 text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-400 transition"
                >
                  Conectar agora
                </button>
              </div>
            </div>
          </div>
        )}

        {mlConnected === true && (
          <div className="flex items-center gap-2 text-emerald-400/80 text-xs mb-5">
            <CheckCircle2 className="w-4 h-4" />
            Conta do Mercado Livre conectada
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-5">
          {tabs.map(tab => (
            <button
              key={tab.type}
              onClick={() => { setInputType(tab.type); setError(null) }}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
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

        <div className="bg-[#141414] border border-[#1f1f1f] rounded-xl p-4 sm:p-6">
          {inputType === 'photo' && (
            <div>
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                multiple
                onChange={e => { addFiles(e.target.files); e.target.value = '' }}
                className="hidden"
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => { addFiles(e.target.files); e.target.value = '' }}
                className="hidden"
              />

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {photos.map((p, i) => (
                    <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-[#1c1c1c] group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.previewUrl} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 bg-black/70 text-amber-400 text-[10px] px-1.5 py-0.5 rounded">
                          Principal
                        </span>
                      )}
                      <button
                        onClick={() => removePhoto(p.id)}
                        aria-label="Remover foto"
                        className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 hover:bg-red-500 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {photos.length < MAX_PHOTOS && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => cameraRef.current?.click()}
                    className="h-28 border-2 border-dashed border-[#2a2a2a] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-amber-500/50 hover:text-white transition text-gray-400"
                  >
                    <Camera className="w-7 h-7" />
                    <span className="text-sm font-medium">Tirar foto</span>
                  </button>
                  <button
                    onClick={() => galleryRef.current?.click()}
                    className="h-28 border-2 border-dashed border-[#2a2a2a] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-amber-500/50 hover:text-white transition text-gray-400"
                  >
                    <ImagePlus className="w-7 h-7" />
                    <span className="text-sm font-medium">Escolher da galeria</span>
                  </button>
                </div>
              )}

              <p className="text-gray-500 text-xs mt-3">
                Fotos nítidas da embalagem e das etiquetas ajudam a identificar marca, modelo e especificações.
              </p>

              {photos.length > 0 && (
                <input
                  value={photoHint}
                  onChange={e => setPhotoHint(e.target.value)}
                  placeholder="Opcional: algo que a foto não mostra (ex: voltagem 12V, kit com 3 peças)"
                  className="w-full mt-4 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                />
              )}
            </div>
          )}

          {inputType === 'description' && (
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descreva o produto com o máximo de detalhes reais. Ex: Caneta de polaridade automotiva Kitest KA-250, 6 a 24V, cabo de 1,5m, ponta de aço"
              className="w-full h-44 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-4 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-amber-500/50"
            />
          )}

          {inputType === 'url' && (
            <div>
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://produto.mercadolivre.com.br/MLB-123456789-..."
                className="w-full bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
              />
              <p className="text-gray-500 text-xs mt-3">
                Cole o link de um anúncio parecido com o seu produto. Usamos apenas como ponto de partida da identificação.
              </p>
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!canSubmit}
            className="w-full mt-5 bg-gradient-to-r from-amber-500 to-orange-600 text-black py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {stage || 'Processando...'}
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Analisar produto
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
