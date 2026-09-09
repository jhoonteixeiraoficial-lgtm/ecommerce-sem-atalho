import { describe, expect, it } from 'vitest'
import { resolveMarketplacePublication } from '../marketplace-publication'

describe('resolveMarketplacePublication', () => {
  it('prioriza o snapshot autoritativo retornado pelo marketplace', () => {
    const view = resolveMarketplacePublication({
      title: 'Título enviado',
      price: 100,
      publication_status: 'active',
      ml_response: {
        reconciliation: { status: 'confirmed', checked_at: '2026-09-09T12:00:00.000Z' },
        marketplace_item: {
          title: 'Título final do Mercado Livre',
          price: 112.3,
          status: 'paused',
          permalink: 'https://produto.mercadolivre.com.br/MLB-1-produto-_JM',
          shipping: { mode: 'me2', free_shipping: true, logistic_type: 'xd_drop_off' },
        },
      },
    })

    expect(view).toMatchObject({
      title: 'Título final do Mercado Livre',
      price: 112.3,
      status: 'paused',
      statusLabel: 'Pausado no Mercado Livre',
      permalink: 'https://produto.mercadolivre.com.br/MLB-1-produto-_JM',
      reconciliation: 'confirmed',
      shipping: { mode: 'me2', freeShipping: true, logisticType: 'xd_drop_off' },
    })
  })

  it('não inventa estado confirmado quando a reconciliação está pendente', () => {
    const view = resolveMarketplacePublication({
      title: 'Título enviado',
      price: 100,
      publication_status: 'active',
      ml_permalink: 'http://produto.mercadolivre.com.br/MLB-1-produto-_JM',
      ml_response: {
        reconciliation: {
          status: 'pending',
          checked_at: '2026-09-09T12:00:00.000Z',
          error: 'ML 503',
        },
        marketplace_item: null,
      },
    })

    expect(view).toMatchObject({
      title: 'Título enviado',
      price: 100,
      status: 'active',
      statusLabel: 'Publicado, sincronização pendente',
      reconciliation: 'pending',
      permalink: 'http://produto.mercadolivre.com.br/MLB-1-produto-_JM',
      shipping: null,
    })
  })
})
