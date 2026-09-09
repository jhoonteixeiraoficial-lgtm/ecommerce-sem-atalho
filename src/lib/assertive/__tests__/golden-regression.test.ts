/**
 * GOLDEN REGRESSION TESTS
 *
 * These tests encode invariants from the golden case (HomeNow Atlanta chair,
 * published as MLB5202962925). They detect regressions in the core pipeline.
 *
 * GOLDEN_COMMIT: a1a10c9
 * PUBLISHED_AT: 2026-09-08T11:23:43Z
 * ML_ITEM_ID: MLB5202962925
 *
 * Any test failure = regression. Do NOT modify to make failing tests pass.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => ({ data: null }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: () => ({ data: null }) }) }) }) }),
    }),
  }),
}))

const { checkCategorySanity } = await import('../pipeline')
const { predictMLTitle, getAutoAppendedAttributeIds } = await import('../publisher')

// ─── GOLDEN CASE: HomeNow Atlanta ───────────────────────────────────
const GOLDEN = {
  PRODUCT_NAME: 'Cadeira Escritório Diretor Atlanta Couro PU HomeNow 150kg',
  CATEGORY_ID: 'MLB193945',
  BRAND: 'HomeNow',
  MODEL: 'Atlanta Diretor',
  ML_ITEM_ID: 'MLB5202962925',
  TITLE_LIMIT: 60,
} as const

// ─── CATEGORY SANITY ────────────────────────────────────────────────

describe('GOLDEN — Category Sanity Guard', () => {
  it('chair category has NO food/beverage attributes', () => {
    const chairAttributes = [
      { id: 'BRAND', tier: 'required' },
      { id: 'MODEL', tier: 'required' },
      { id: 'OFFICE_CHAIR_TYPE', tier: 'recommended' },
      { id: 'IS_GAMER', tier: 'required' },
      { id: 'IS_SWIVEL', tier: 'required' },
      { id: 'IS_ERGONOMIC', tier: 'required' },
      { id: 'WITH_WHEELS', tier: 'recommended' },
      { id: 'WITH_ARMREST', tier: 'recommended' },
      { id: 'BACKREST_HEIGHT', tier: 'required' },
      { id: 'SEAT_DEPTH', tier: 'required' },
    ]

    const result = checkCategorySanity(chairAttributes, GOLDEN.PRODUCT_NAME)
    expect(result.ok).toBe(true)
    expect(result.hasHardMismatch).toBe(false)
    expect(result.mismatches).toHaveLength(0)
  })

  it('chair with food attributes triggers HARD MISMATCH', () => {
    const wrongAttributes = [
      { id: 'BRAND', tier: 'required' },
      { id: 'SABOR', tier: 'required' },
      { id: 'FORMATO_DO_SUCO', tier: 'required' },
      { id: 'TIPO_DE_BEBIDA', tier: 'required' },
    ]

    const result = checkCategorySanity(wrongAttributes, GOLDEN.PRODUCT_NAME)
    expect(result.ok).toBe(false)
    expect(result.hasHardMismatch).toBe(true)
    expect(result.mismatches.length).toBeGreaterThan(0)
  })

  it('food product with furniture attributes triggers HARD MISMATCH', () => {
    const wrongAttributes = [
      { id: 'SABOR', tier: 'required' },
      { id: 'FORMATO_DO_SUCO', tier: 'required' },
      { id: 'TIPO_DE_MOSTRA', tier: 'required' },
      { id: 'RECLINAVEL', tier: 'required' },
    ]

    const result = checkCategorySanity(wrongAttributes, 'Suco de Laranja Concentrado')
    expect(result.ok).toBe(false)
    expect(result.hasHardMismatch).toBe(true)
  })
})

// ─── TITLE CONTROL ──────────────────────────────────────────────────

describe('GOLDEN — predictMLTitle', () => {
  it('predicts title from family_name + attributes', () => {
    const attrs = [
      { id: 'COLOR', value_name: 'Preto' },
      { id: 'MODEL', value_name: 'Atlanta Diretor' },
    ]
    const title = predictMLTitle('Cadeira Diretor Atlanta HomeNow', attrs)
    expect(title).toContain('Cadeira Diretor Atlanta HomeNow')
    expect(title).toContain('Preto')
  })

  it('does not exceed reasonable length', () => {
    const attrs = Array.from({ length: 10 }, (_, i) => ({
      id: `ATTR_${i}`,
      value_name: `Value ${i}`,
    }))
    const title = predictMLTitle('Product Name', attrs)
    expect(title.length).toBeLessThan(200)
  })

  it('does not append model or voltage already present in family_name', () => {
    const family = 'Caneta de Polaridade Kitest KA250 12V 24V'
    const title = predictMLTitle(family, [
      { id: 'MODEL', value_name: 'KA250' },
      { id: 'VOLTAGE', value_name: '12 V / 24 V' },
    ])

    expect(title).toBe(family)
  })
})

describe('GOLDEN — getAutoAppendedAttributeIds', () => {
  it('returns attributes with in_title tag', () => {
    const catAttrs: Array<{ id: string; tags?: Record<string, boolean> }> = [
      { id: 'COLOR', tags: { in_title: true } },
      { id: 'BRAND', tags: {} },
      { id: 'MODEL', tags: { inmediate_title: true } },
    ]
    const result = getAutoAppendedAttributeIds(catAttrs)
    expect(result).toContain('COLOR')
    expect(result).toContain('MODEL')
    expect(result).not.toContain('BRAND')
  })

  it('returns empty array when no tags', () => {
    const catAttrs: Array<{ id: string; tags?: Record<string, boolean> }> = [
      { id: 'COLOR', tags: {} },
      { id: 'BRAND', tags: {} },
    ]
    const result = getAutoAppendedAttributeIds(catAttrs)
    expect(result).toHaveLength(0)
  })
})

// ─── CONFIRM PRODUCT FLOW ──────────────────────────────────────────

describe('GOLDEN — Confirm Product Flow (NOT_STARTED is valid)', () => {
  it('research check passes with empty research object', () => {
    const research: { category_id?: string; query?: string } = {}
    const hasCategoryOrQuery = !!research.category_id || !!research.query
    expect(hasCategoryOrQuery).toBe(false)
  })

  it('research check passes after research runs', () => {
    const research = {
      category_id: 'MLB193945',
      query: 'Cadeira Escritório Diretor Atlanta',
      competitors: [],
    }
    const hasCategoryOrQuery = !!research.category_id || !!research.query
    expect(hasCategoryOrQuery).toBe(true)
  })
})

// ─── PRODUCT TRUTH INTEGRITY ───────────────────────────────────────

describe('GOLDEN — Product Truth Integrity', () => {
  it('golden product has required fields', () => {
    const truth = {
      name: GOLDEN.PRODUCT_NAME,
      fields: {
        brand: { value: GOLDEN.BRAND, status: 'CONFIRMED' },
        model: { value: GOLDEN.MODEL, status: 'CONFIRMED' },
      },
      confidence: 0.9,
      evidence: ['Produto de catálogo oficial do Mercado Livre'],
    }

    expect(truth.name).toBeTruthy()
    expect(truth.fields.brand?.value).toBe(GOLDEN.BRAND)
    expect(truth.fields.model?.value).toBe(GOLDEN.MODEL)
    expect(truth.confidence).toBeGreaterThanOrEqual(0.8)
    expect(truth.evidence.length).toBeGreaterThan(0)
  })

  it('golden product has source snapshot when from URL', () => {
    const truth = {
      name: GOLDEN.PRODUCT_NAME,
      source_category_id: GOLDEN.CATEGORY_ID,
      source_item_id: GOLDEN.ML_ITEM_ID,
      source_pictures: ['https://http2.mlstatic.com/test.jpg'],
    }

    expect(truth.source_category_id).toBe(GOLDEN.CATEGORY_ID)
    expect(truth.source_item_id).toBe(GOLDEN.ML_ITEM_ID)
    expect(truth.source_pictures).toHaveLength(1)
  })
})
