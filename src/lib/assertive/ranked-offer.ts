import type { PublicSearchSnapshot, PublicSearchEntry } from './public-search'

export function selectRankedOffer<T extends { item_id: string }>(
  catalogId: string,
  offers: T[],
  snapshot: PublicSearchSnapshot,
): { offer: T; entry: PublicSearchEntry } | null {
  if (!snapshot.available) return null

  const candidates = snapshot.entries
    .filter(
      (e) =>
        e.catalog_product_id === catalogId &&
        !e.sponsored &&
        Number.isInteger(e.position) &&
        e.position > 0 &&
        Number.isInteger(e.organic_position) &&
        (e.organic_position as number) > 0 &&
        e.item_id !== null &&
        e.item_id !== '',
    )
    .slice()
    .sort((a, b) => a.position - b.position)

  for (const entry of candidates) {
    const offer = offers.find((o) => o.item_id === entry.item_id)
    if (offer) return { offer, entry }
  }

  return null
}
