interface MarketplacePublicationSource {
  title?: string | null
  price?: number | null
  ml_permalink?: string | null
  publication_status?: string | null
  ml_response?: {
    reconciliation?: { status?: 'confirmed' | 'pending'; checked_at?: string; error?: string } | null
    marketplace_item?: {
      title?: string | null
      price?: number | null
      status?: string | null
      permalink?: string | null
      shipping?: {
        mode?: string | null
        free_shipping?: boolean | null
        logistic_type?: string | null
      } | null
    } | null
  } | null
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo no Mercado Livre',
  paused: 'Pausado no Mercado Livre',
  closed: 'Encerrado no Mercado Livre',
  under_review: 'Em revisão no Mercado Livre',
}

export function resolveMarketplacePublication(source: MarketplacePublicationSource) {
  const snapshot = source.ml_response?.marketplace_item
  const reconciliation = source.ml_response?.reconciliation?.status || null
  const status = snapshot?.status || source.publication_status || null
  const shipping = snapshot?.shipping
    ? {
        mode: snapshot.shipping.mode || null,
        freeShipping: snapshot.shipping.free_shipping ?? null,
        logisticType: snapshot.shipping.logistic_type || null,
      }
    : null

  return {
    title: snapshot?.title || source.title || '',
    price: snapshot?.price ?? source.price ?? null,
    status,
    statusLabel: reconciliation === 'pending'
      ? 'Publicado, sincronização pendente'
      : status
        ? STATUS_LABELS[status] || `Status no Mercado Livre: ${status}`
        : 'Publicado no Mercado Livre',
    permalink: snapshot?.permalink || source.ml_permalink || null,
    reconciliation,
    shipping,
  }
}
