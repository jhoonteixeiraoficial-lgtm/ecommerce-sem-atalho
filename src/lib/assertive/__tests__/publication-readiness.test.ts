import { describe, it, expect } from 'vitest'
import { payloadHash, wasPayloadChanged, runPreflightChecks, computeReadiness } from '../publication-readiness'
import type { MLItemPayload } from '../publisher'

describe('PublicationReadiness - payloadHash', () => {
  it('produz hash determinístico para o mesmo payload', () => {
    const payload: MLItemPayload = {
      category_id: 'MLB1234567890',
      price: 199.90,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [{ source: 'https://example.com/img1.jpg' }],
      attributes: [
        { id: 'BRAND', value_name: 'Samsung' },
        { id: 'MODEL', value_name: 'Galaxy S24' },
      ],
    }

    const hash1 = payloadHash(payload)
    const hash2 = payloadHash(payload)
    expect(hash1).toBe(hash2)
    expect(hash1).toBeTruthy()
  })

  it('hash muda quando payload muda', () => {
    const base: MLItemPayload = {
      category_id: 'MLB1234567890',
      price: 199.90,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [{ source: 'https://example.com/img1.jpg' }],
      attributes: [{ id: 'BRAND', value_name: 'Samsung' }],
    }

    const changed: MLItemPayload = {
      ...base,
      price: 299.90,
    }

    expect(payloadHash(base)).not.toBe(payloadHash(changed))
  })

  it('hash muda quando attribute muda', () => {
    const base: MLItemPayload = {
      category_id: 'MLB1234567890',
      price: 199.90,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [],
      attributes: [{ id: 'BRAND', value_name: 'Samsung' }],
    }

    const changed: MLItemPayload = {
      ...base,
      attributes: [{ id: 'BRAND', value_name: 'Apple' }],
    }

    expect(payloadHash(base)).not.toBe(payloadHash(changed))
  })
})

describe('PublicationReadiness - wasPayloadChanged', () => {
  it('retorna true quando não tem hash anterior', () => {
    const payload: MLItemPayload = {
      category_id: 'MLB1234567890',
      price: 100,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [],
      attributes: [],
    }

    expect(wasPayloadChanged(payload, null)).toBe(true)
  })

  it('retorna false quando payload não mudou', () => {
    const payload: MLItemPayload = {
      category_id: 'MLB1234567890',
      price: 100,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [],
      attributes: [],
    }

    const hash = payloadHash(payload)
    expect(wasPayloadChanged(payload, hash)).toBe(false)
  })

  it('retorna true quando payload mudou', () => {
    const payload: MLItemPayload = {
      category_id: 'MLB1234567890',
      price: 100,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [],
      attributes: [],
    }

    const hash = payloadHash(payload)
    const changed = { ...payload, price: 200 }
    expect(wasPayloadChanged(changed, hash)).toBe(true)
  })
})

describe('PublicationReadiness - runPreflightChecks', () => {
  const basePayload: MLItemPayload = {
    category_id: 'MLB1055487254',
    price: 199.90,
    currency_id: 'BRL',
    available_quantity: 1,
    buying_mode: 'buy_it_now',
    condition: 'new',
    listing_type_id: 'gold_special',
    pictures: [{ source: 'https://example.com/img1.jpg' }],
    attributes: [
      { id: 'BRAND', value_name: 'Samsung' },
      { id: 'MODEL', value_name: 'Galaxy S24' },
      { id: 'GTIN', value_name: '8806095350971' },
    ],
    title: 'Samsung Galaxy S24',
  }

  it('todos os checks passam com payload válido', () => {
    const checks = runPreflightChecks(
      basePayload,
      { ml_user_id: 123, nickname: 'test', site_id: 'MLB', user_product_model: false, tags: [] },
      [
        { id: 'BRAND', name: 'Marca', tier: 'required', value_type: 'string', fixedValues: true, isVariationOnly: false, readOnly: false } as any,
        { id: 'MODEL', name: 'Modelo', tier: 'required', value_type: 'string', fixedValues: false, isVariationOnly: false, readOnly: false } as any,
      ],
      true
    )

    const errors = checks.filter(c => c.status === 'fail')
    expect(errors).toHaveLength(0)
  })

  it('fail quando não tem token', () => {
    const checks = runPreflightChecks(basePayload, null, [], false)
    const authCheck = checks.find(c => c.check === 'auth_token_valid')
    expect(authCheck?.status).toBe('fail')
  })

  it('fail quando preço inválido', () => {
    const payload = { ...basePayload, price: -10 }
    const checks = runPreflightChecks(payload, null, [], true)
    const priceCheck = checks.find(c => c.check === 'price_valid')
    expect(priceCheck?.status).toBe('fail')
  })

  it('fail quando sem fotos', () => {
    const payload = { ...basePayload, pictures: [] }
    const checks = runPreflightChecks(payload, null, [], true)
    const picsCheck = checks.find(c => c.check === 'pictures_valid')
    expect(picsCheck?.status).toBe('fail')
  })

  it('fail quando categoria inválida', () => {
    const payload = { ...basePayload, category_id: '' }
    const checks = runPreflightChecks(payload, null, [], true)
    const catCheck = checks.find(c => c.check === 'category_resolved')
    expect(catCheck?.status).toBe('fail')
  })

  it('fail quando atributo obrigatório faltando', () => {
    const checks = runPreflightChecks(
      { ...basePayload, attributes: [] },
      null,
      [
        { id: 'BRAND', name: 'Marca', tier: 'required', value_type: 'string', fixedValues: true, isVariationOnly: false, readOnly: false } as any,
      ],
      true
    )
    const attrCheck = checks.find(c => c.check === 'required_attributes')
    expect(attrCheck?.status).toBe('fail')
    expect(attrCheck?.message).toContain('Marca')
  })

  it('warning quando seller_package não preenchido em conta novo modelo', () => {
    const checks = runPreflightChecks(
      basePayload,
      { ml_user_id: 123, nickname: 'test', site_id: 'MLB', user_product_model: true, tags: ['user_product_seller'] },
      [
        { id: 'SELLER_PACKAGE_HEIGHT', name: 'Altura embalagem', tier: 'required', value_type: 'number', fixedValues: false, isVariationOnly: false, readOnly: false } as any,
      ],
      true
    )
    const pkgCheck = checks.find(c => c.check === 'seller_package')
    expect(pkgCheck?.status).toBe('warning')
  })
})

describe('PublicationReadiness - computeReadiness', () => {
  it('ready=true quando preflight passa e ML retorna 204', () => {
    const readiness = computeReadiness(
      [],
      { valid: true, issues: [], status_code: 204 },
      { category_id: 'MLB123', price: 100, currency_id: 'BRL', available_quantity: 1, buying_mode: 'buy_it_now', condition: 'new', listing_type_id: 'gold_special', pictures: [], attributes: [] },
      new Date().toISOString()
    )

    expect(readiness.ready).toBe(true)
    expect(readiness.blocker_count).toBe(0)
    expect(readiness.validated_payload).toBeTruthy()
  })

  it('ready=false quando ML retorna erro', () => {
    const readiness = computeReadiness(
      [],
      {
        valid: false,
        issues: [{ code: 'item.attributes.missing', message: 'Missing', severity: 'error' }],
        status_code: 422,
      },
      null,
      null
    )

    expect(readiness.ready).toBe(false)
    expect(readiness.blocker_count).toBe(1)
  })

  it('ready=false quando preflight tem erro', () => {
    const readiness = computeReadiness(
      [{ check: 'auth_token_valid', status: 'fail', message: 'Token expirado' }],
      { valid: true, issues: [], status_code: 204 },
      null,
      null
    )

    expect(readiness.ready).toBe(false)
    expect(readiness.blocker_count).toBe(1)
  })

  it('warnings não bloqueiam', () => {
    const readiness = computeReadiness(
      [{ check: 'seller_package', status: 'warning', message: 'Não informado' }],
      { valid: true, issues: [{ code: 'low_stock', message: 'Pouco estoque', severity: 'warning' }], status_code: 204 },
      { category_id: 'MLB123', price: 100, currency_id: 'BRL', available_quantity: 1, buying_mode: 'buy_it_now', condition: 'new', listing_type_id: 'gold_special', pictures: [], attributes: [] },
      new Date().toISOString()
    )

    expect(readiness.ready).toBe(true)
    expect(readiness.warning_count).toBe(2)
    expect(readiness.blocker_count).toBe(0)
  })

  it('payload_hash está presente quando payload é fornecido', () => {
    const payload: MLItemPayload = {
      category_id: 'MLB123',
      price: 100,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [],
      attributes: [],
    }

    const readiness = computeReadiness(
      [],
      { valid: true, issues: [], status_code: 204 },
      payload,
      new Date().toISOString()
    )

    expect(readiness.payload_hash).toBeTruthy()
    expect(readiness.validated_payload).toBe(payload)
  })
})
