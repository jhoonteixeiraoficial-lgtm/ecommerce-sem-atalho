import { describe, expect, it, vi } from 'vitest'
import type { ImageJobSnapshot } from '../image-job-contract'
import { nextImageJobRequestCount, uploadProgressivePhoto } from '../progressive-photo-client'

function snapshot(overrides: Partial<ImageJobSnapshot> = {}): ImageJobSnapshot {
  return {
    listing_id: 'listing-1',
    target_count: 6,
    ready_count: 0,
    visible_count: 0,
    active_count: 0,
    reference_status: 'SUCCEEDED',
    reference_count: 2,
    reference_origins: ['ML_CATALOG'],
    runnable: true,
    slots: [],
    ...overrides,
  }
}

describe('nextImageJobRequestCount', () => {
  it('never schedules more than two concurrent workers', () => {
    const runnable = snapshot()

    expect(nextImageJobRequestCount(runnable, 0)).toBe(2)
    expect(nextImageJobRequestCount(runnable, 1)).toBe(1)
    expect(nextImageJobRequestCount(runnable, 2)).toBe(0)
  })

  it('accounts for active server workers without double-counting local requests', () => {
    const oneActive = snapshot({ active_count: 1 })

    expect(nextImageJobRequestCount(oneActive, 0)).toBe(1)
    expect(nextImageJobRequestCount(oneActive, 1)).toBe(1)
    expect(nextImageJobRequestCount(snapshot({ active_count: 2 }), 0)).toBe(0)
  })

  it('stops when no job is currently runnable', () => {
    expect(nextImageJobRequestCount(snapshot({ runnable: false }), 0)).toBe(0)
  })

  it('pauses new workers while the user is uploading or saving a slot', () => {
    expect(nextImageJobRequestCount(snapshot(), 0, true)).toBe(0)
  })
})

describe('uploadProgressivePhoto', () => {
  it('uploads one photo and atomically assigns its safe rendition to the chosen slot', async () => {
    const expected = snapshot({ ready_count: 1 })
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({
        assets: [{ rendition_asset_id: 'rendition-1', preview_url: 'https://cdn.example/manual.jpg' }],
        urls: ['https://cdn.example/manual.jpg'],
      }))
      .mockResolvedValueOnce(Response.json(expected))
    const form = new FormData()
    form.append('files', new Blob(['photo'], { type: 'image/jpeg' }), 'manual.jpg')

    await expect(uploadProgressivePhoto('listing-1', 2, form, request)).resolves.toEqual(expected)
    expect(request).toHaveBeenNthCalledWith(1, '/api/assertive/upload', { method: 'POST', body: form })
    expect(request).toHaveBeenNthCalledWith(2, '/api/assertive/listings/listing-1/images/jobs/2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_id: 'rendition-1' }),
    })
  })

  it('does not assign a slot when upload normalization fails', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ error: 'Imagem inválida.' }, { status: 400 }))

    await expect(uploadProgressivePhoto('listing-1', 2, new FormData(), request))
      .rejects.toThrow('Imagem inválida.')
    expect(request).toHaveBeenCalledTimes(1)
  })
})
