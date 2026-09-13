import type { ImageJobSnapshot } from './image-job-contract'

const MAX_IMAGE_WORKERS = 2

export function nextImageJobRequestCount(snapshot: ImageJobSnapshot, inFlight: number, paused = false): number {
  if (paused || !snapshot.runnable) return 0
  const localWorkers = Number.isFinite(inFlight) ? Math.max(0, Math.floor(inFlight)) : 0
  const occupied = Math.max(localWorkers, snapshot.active_count)
  return Math.max(0, MAX_IMAGE_WORKERS - occupied)
}

type ClientRequest = (input: string, init?: RequestInit) => Promise<Response>

export async function uploadProgressivePhoto(
  listingId: string,
  position: number,
  form: FormData,
  request: ClientRequest = fetch
): Promise<ImageJobSnapshot> {
  const uploadResponse = await request('/api/assertive/upload', { method: 'POST', body: form })
  const upload = await uploadResponse.json() as {
    error?: string
    assets?: Array<{ rendition_asset_id?: string }>
  }
  if (!uploadResponse.ok) throw new Error(upload.error || 'Falha ao enviar a foto.')
  const assetId = upload.assets?.[0]?.rendition_asset_id
  if (!assetId) throw new Error('A foto enviada não gerou uma imagem segura para publicação.')

  const assignResponse = await request(`/api/assertive/listings/${listingId}/images/jobs/${position}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_id: assetId }),
  })
  const snapshot = await assignResponse.json() as ImageJobSnapshot & { error?: string }
  if (!assignResponse.ok) throw new Error(snapshot.error || 'Falha ao vincular a foto ao espaço escolhido.')
  return snapshot
}
