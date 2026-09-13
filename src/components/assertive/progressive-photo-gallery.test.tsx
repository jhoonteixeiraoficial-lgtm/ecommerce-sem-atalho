import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ImageJobSnapshot, ImageJobStatus } from '@/lib/assertive/image-job-contract'
import { ProgressivePhotoGallery } from './progressive-photo-gallery'

function snapshot(): ImageJobSnapshot {
  const statuses: ImageJobStatus[] = ['QUEUED', 'RUNNING', 'REVIEW', 'SUCCEEDED', 'RETRYABLE', 'DISMISSED']
  return {
    listing_id: 'listing-1',
    target_count: 6,
    ready_count: 1,
    visible_count: 2,
    active_count: 1,
    reference_status: 'RUNNING',
    reference_count: 2,
    reference_origins: ['ML_CATALOG', 'COMPETITOR'],
    runnable: true,
    slots: statuses.map((status, position) => ({
      position,
      role: position === 0 ? 'MAIN' : position < 3 ? 'DETAIL' : position < 5 ? 'LIFESTYLE' : 'INFORMATIONAL',
      title: position === 0 ? 'Foto principal' : `Composição ${position + 1}`,
      description: 'Composição fiel ao produto confirmado.',
      required: position < 3,
      status,
      asset_id: ['REVIEW', 'SUCCEEDED'].includes(status) ? `asset-${position}` : null,
      preview_url: ['REVIEW', 'SUCCEEDED'].includes(status) ? `https://cdn.example/${position}.jpg` : null,
      attempts: status === 'RETRYABLE' ? 1 : 0,
      error_code: status === 'RETRYABLE' ? 'IMAGE_PROVIDER_UNAVAILABLE' : null,
      error_message: status === 'RETRYABLE' ? 'Tente novamente em instantes.' : null,
      auto_verdict: status === 'REVIEW' ? 'REVIEW' : status === 'SUCCEEDED' ? 'ACCEPT' : null,
      manual: false,
    })),
  }
}

describe('ProgressivePhotoGallery', () => {
  it('renders six fixed positions and only safe output previews', () => {
    const html = renderToStaticMarkup(
      <ProgressivePhotoGallery
        snapshot={snapshot()}
        busy={false}
        readOnly={false}
        onConfirm={vi.fn()}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
        onOpen={vi.fn()}
        onUpload={vi.fn()}
      />
    )

    expect(html.match(/data-slot-position=/g)).toHaveLength(6)
    expect(html).toContain('1 de 6 prontas')
    expect(html).toContain('Buscando referência')
    expect(html).toContain('Gerando com Gemini')
    expect(html).toContain('Revisar')
    expect(html).toContain('Tentar novamente')
    expect(html).toContain('Fundo branco')
    expect(html).toContain('https://cdn.example/2.jpg')
    expect(html).not.toContain('private-reference')
  })

  it('offers human confirmation for review output and recovery for dismissed slots', () => {
    const html = renderToStaticMarkup(
      <ProgressivePhotoGallery
        snapshot={snapshot()}
        busy={false}
        readOnly={false}
        onConfirm={vi.fn()}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
        onOpen={vi.fn()}
        onUpload={vi.fn()}
      />
    )

    expect(html).toContain('Confirmar imagem')
    expect(html).toContain('Reabrir posição')
    expect(html.match(/Usar foto própria/g)).toHaveLength(5)
  })

  it('exposes reference recovery when acquisition reaches a terminal failure', () => {
    const failed = snapshot()
    failed.reference_status = 'FAILED'
    failed.runnable = false
    failed.slots[0] = {
      ...failed.slots[0],
      status: 'QUEUED',
      error_code: 'REFERENCE_NOT_FOUND',
      error_message: 'Nenhuma referência exata foi encontrada.',
    }

    const html = renderToStaticMarkup(
      <ProgressivePhotoGallery
        snapshot={failed}
        busy={false}
        readOnly={false}
        onConfirm={vi.fn()}
        onRetry={vi.fn()}
        onRemove={vi.fn()}
        onOpen={vi.fn()}
        onUpload={vi.fn()}
      />
    )

    expect(html).toContain('Referências indisponíveis')
    expect(html).toContain('Nenhuma referência exata foi encontrada.')
    expect(html).toContain('Tentar referências')
  })
})
