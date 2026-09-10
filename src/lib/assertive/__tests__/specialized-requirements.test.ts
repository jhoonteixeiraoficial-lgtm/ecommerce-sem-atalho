import { describe, expect, it } from 'vitest'
import { normalizeSpecializedIssues } from '../specialized-requirements'

describe('specialized Mercado Livre requirements', () => {
  it('transforma erro de guia de tamanhos em blocker acionável sem inventar identificador', () => {
    const result = normalizeSpecializedIssues([{
      code: 'item.size_chart.required',
      message: 'Size chart is required',
      severity: 'error',
    }])

    expect(result).toEqual([expect.objectContaining({
      kind: 'SIZE_CHART',
      is_blocker: true,
      code: 'item.size_chart.required',
      attribute_ids: [],
    })])
  })

  it('mantém compatibilidade veicular opcional como orientação', () => {
    const result = normalizeSpecializedIssues([{
      code: 'item.vehicle_compatibility.recommended',
      message: 'Add vehicle compatibility',
      severity: 'warning',
    }])

    expect(result[0]).toMatchObject({ kind: 'VEHICLE_COMPATIBILITY', is_blocker: false })
  })
})
