'use client'

import type { ImageJobSlot, ImageJobSnapshot, ImageJobStatus } from '@/lib/assertive/image-job-contract'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ImageIcon,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'

interface ProgressivePhotoGalleryProps {
  snapshot: ImageJobSnapshot
  busy: boolean
  readOnly: boolean
  onConfirm(slot: ImageJobSlot): void
  onRetry(slot: ImageJobSlot): void
  onRemove(slot: ImageJobSlot): void
  onOpen(slot: ImageJobSlot): void
  onUpload(position: number): void
  /** Quando houver slots prontos para revisão e o usuário quiser aprovar todos de uma vez. */
  onConfirmAllReviewing?(): void
}

const ROLE_LABELS: Record<ImageJobSlot['role'], string> = {
  MAIN: 'Principal',
  DETAIL: 'Detalhe',
  LIFESTYLE: 'Em uso',
  PACKAGING: 'Embalagem',
  INFORMATIONAL: 'Técnica',
}

const STATUS_STYLES: Record<ImageJobStatus, { label: string; className: string }> = {
  QUEUED: { label: 'Na fila', className: 'border-white/10 bg-white/[0.04] text-gray-400' },
  RUNNING: { label: 'Gerando com Gemini', className: 'border-amber-400/25 bg-amber-400/10 text-amber-200' },
  RETRYABLE: { label: 'Tentar novamente', className: 'border-orange-400/25 bg-orange-400/10 text-orange-200' },
  REVIEW: { label: 'Revisar', className: 'border-blue-400/30 bg-blue-400/10 text-blue-200' },
  SUCCEEDED: { label: 'Pronta', className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' },
  FAILED: { label: 'Tentar novamente', className: 'border-red-400/25 bg-red-400/10 text-red-200' },
  DISMISSED: { label: 'Posição removida', className: 'border-white/10 bg-white/[0.03] text-gray-500' },
}

function slotStatus(slot: ImageJobSlot, referenceStatus: ImageJobStatus) {
  if (slot.status === 'QUEUED' && ['FAILED', 'DISMISSED'].includes(referenceStatus)) {
    return { label: 'Referências indisponíveis', className: 'border-red-400/25 bg-red-400/10 text-red-200' }
  }
  if (slot.status === 'QUEUED' && referenceStatus !== 'SUCCEEDED') {
    return { label: 'Buscando referência', className: 'border-violet-400/25 bg-violet-400/10 text-violet-200' }
  }
  return STATUS_STYLES[slot.status]
}

function StatusIcon({ status }: { status: ImageJobStatus }) {
  if (status === 'RUNNING') return <Loader2 className="h-3 w-3 animate-spin" />
  if (status === 'SUCCEEDED') return <Check className="h-3 w-3" />
  if (status === 'REVIEW') return <ShieldCheck className="h-3 w-3" />
  if (status === 'FAILED' || status === 'RETRYABLE') return <AlertCircle className="h-3 w-3" />
  return <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
}

export function ProgressivePhotoGallery({
  snapshot,
  busy,
  readOnly,
  onConfirm,
  onRetry,
  onRemove,
  onOpen,
  onUpload,
  onConfirmAllReviewing,
}: ProgressivePhotoGalleryProps) {
  const reviewSlots = snapshot.slots.filter(s => s.status === 'REVIEW' && Boolean(s.asset_id))
  const canBulkConfirm = !readOnly && reviewSlots.length >= 2 && Boolean(onConfirmAllReviewing)
  const completion = Math.round((snapshot.ready_count / snapshot.target_count) * 100)

  return (
    <section
      id="listing-photos"
      aria-labelledby="progressive-gallery-title"
      className="overflow-hidden rounded-xl border border-[#242424] bg-[#141414]"
    >
      <div className="border-b border-[#242424] bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.11),transparent_44%)] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="progressive-gallery-title" className="flex items-center gap-2 font-semibold text-white">
              <ImageIcon className="h-4 w-4 text-amber-500" />
              Estúdio de fotos
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">
              Seis composições independentes, baseadas apenas nas referências confirmadas do produto.
            </p>
          </div>
          {canBulkConfirm && (
            <button
              type="button"
              onClick={onConfirmAllReviewing}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
              aria-label={`Aprovar todas as ${reviewSlots.length} fotos em revisão`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aprovar {reviewSlots.length} em revisão
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-gray-300">{snapshot.ready_count} de 6 prontas</span>
              <span className="text-gray-600">{completion}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#252525]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-300 transition-[width] duration-500"
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            {snapshot.reference_status === 'RUNNING' || snapshot.reference_status === 'QUEUED'
              ? <Loader2 className="h-3 w-3 animate-spin text-violet-300" />
              : <Sparkles className="h-3 w-3 text-violet-300" />}
            {snapshot.reference_count > 0
              ? `${snapshot.reference_count} referências privadas verificadas`
              : ['FAILED', 'DISMISSED'].includes(snapshot.reference_status)
                ? 'Envie uma foto própria ou tente buscar referências novamente'
                : 'Preparando referências privadas'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px bg-[#252525] sm:grid-cols-2 xl:grid-cols-3">
        {snapshot.slots.map(slot => {
          const status = slotStatus(slot, snapshot.reference_status)
          const referenceBlocked = slot.status === 'QUEUED'
            && ['FAILED', 'DISMISSED'].includes(snapshot.reference_status)
          const canRetry = referenceBlocked
            || ['RETRYABLE', 'FAILED', 'REVIEW', 'SUCCEEDED', 'DISMISSED'].includes(slot.status)
          const canRemove = !['RUNNING', 'DISMISSED'].includes(slot.status)
          return (
            <article
              key={slot.position}
              data-slot-position={slot.position}
              className="group min-w-0 bg-[#141414] p-3.5 sm:p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#252525] text-[10px] font-bold text-gray-400">
                      {slot.position + 1}
                    </span>
                    <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                      {ROLE_LABELS[slot.role]}
                    </span>
                    {slot.required && <span className="text-[9px] font-semibold uppercase text-amber-500/80">Essencial</span>}
                  </div>
                  <h3 className="mt-2 truncate text-sm font-medium text-gray-100">{slot.title}</h3>
                </div>
                {slot.position === 0 && (
                  <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[9px] font-semibold text-gray-200">
                    Fundo branco
                  </span>
                )}
              </div>

              <div className="relative aspect-square overflow-hidden rounded-lg border border-[#292929] bg-[#191919]">
                {slot.preview_url ? (
                  <button
                    type="button"
                    onClick={() => onOpen(slot)}
                    className="absolute inset-0 h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                    aria-label={`Ampliar ${slot.title}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slot.preview_url} alt={slot.title} className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[linear-gradient(135deg,rgba(255,255,255,0.025)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.025)_50%,rgba(255,255,255,0.025)_75%,transparent_75%)] bg-[length:22px_22px] px-5 text-center">
                    {slot.status === 'RUNNING' || (slot.status === 'QUEUED'
                      && ['QUEUED', 'RUNNING', 'RETRYABLE'].includes(snapshot.reference_status))
                      ? <Loader2 className="mb-2 h-6 w-6 animate-spin text-amber-400/70" />
                      : <ImageIcon className="mb-2 h-6 w-6 text-gray-700" />}
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-gray-600">{slot.description}</p>
                  </div>
                )}
                <div className={`absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium backdrop-blur ${status.className}`}>
                  <StatusIcon status={slot.status} />
                  {status.label}
                </div>
                {slot.manual && (
                  <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-[9px] font-medium text-gray-200">
                    Foto própria
                  </span>
                )}
              </div>

              {slot.error_message && (referenceBlocked || ['RETRYABLE', 'FAILED'].includes(slot.status)) && (
                <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-orange-200/70">{slot.error_message}</p>
              )}

              {!readOnly && (
                <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2">
                  {slot.status === 'REVIEW' && slot.asset_id && (
                    <button
                      type="button"
                      onClick={() => onConfirm(slot)}
                      disabled={busy}
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-blue-400 px-2.5 text-[11px] font-semibold text-black transition hover:bg-blue-300 disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirmar imagem
                    </button>
                  )}
                  {slot.status !== 'RUNNING' && (
                    <button
                      type="button"
                      onClick={() => onUpload(slot.position)}
                      disabled={busy}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#333] px-2.5 text-[11px] font-medium text-gray-300 transition hover:border-amber-500/40 hover:text-white disabled:opacity-40"
                    >
                      <Upload className="h-3 w-3" />
                      Usar foto própria
                    </button>
                  )}
                  {canRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(slot)}
                      disabled={busy}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#333] px-2.5 text-[11px] font-medium text-gray-300 transition hover:border-amber-500/40 hover:text-white disabled:opacity-40"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {referenceBlocked
                        ? 'Tentar referências'
                        : slot.status === 'DISMISSED' ? 'Reabrir posição' : 'Gerar outra'}
                    </button>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => onRemove(slot)}
                      disabled={busy}
                      aria-label={`Remover posição ${slot.position + 1}`}
                      className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
