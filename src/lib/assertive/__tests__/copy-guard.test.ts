import { describe, expect, it } from 'vitest'
import { factualDescription, guardTitle, verifyDescriptionClaims, verifyProtectedIdentityText } from '../copy-guard'
import type { CopyBrief } from '../copy-brief'

const brief: CopyBrief = {
  product_name: 'Caneta de Polaridade',
  facts: [
    { id: 'product_type', label: 'Produto', value: 'Caneta de Polaridade', protected: true },
    { id: 'brand', label: 'Marca', value: 'Kitest', protected: true },
    { id: 'model', label: 'Modelo', value: 'KA250', protected: true },
    { id: 'voltage', label: 'Voltagem', value: '12 V / 24 V', protected: false },
  ],
  protected_phrases: ['Caneta de Polaridade', 'Kitest', 'KA250'],
  allowed_measurements: ['12 V', '24 V'],
  keywords: ['teste circuito'],
  category: { id: 'MLB1', name: 'Ferramentas', title_limit: 60 },
  benchmark_patterns: { title_shapes: [], description_shapes: [] },
}

describe('copy identity and claim guards', () => {
  it('rejeita mutação de uma letra no substantivo protegido', () => {
    expect(verifyProtectedIdentityText(
      'Testador Circuito Kitest KA250 Canela Polaridade',
      brief
    )).toEqual({ valid: false, reason_codes: ['IDENTITY_TOKEN_MUTATED'] })
  })

  it('rejeita medida que não existe nos fatos e usa fallback seguro', () => {
    const result = guardTitle(brief, 'Caneta de Polaridade Kitest KA250 48V', 60)
    expect(result.accepted).toBe(false)
    expect(result.value).not.toContain('48V')
  })

  it('respeita o limite oficial da categoria', () => {
    const result = guardTitle(brief, 'Caneta de Polaridade Kitest KA250 12V 24V para Teste Circuito Automotivo', 55)
    expect(result.value.length).toBeLessThanOrEqual(55)
  })

  it.each([
    'Garantia de 5 anos',
    'Homologado pela Anatel',
    'Compatível com todos os veículos',
    'Acompanha carregador e bateria',
    'Elimina 100% das bactérias',
  ])('rejeita alegação sem fato: %s', claim => {
    expect(verifyDescriptionClaims(claim, brief).valid).toBe(false)
  })

  it('gera fallback factual completo quando uma descrição é rejeitada', () => {
    const description = factualDescription(brief, 'Caneta de Polaridade Kitest KA250 12V 24V')

    expect(description).toContain('Destaques do produto')
    expect(description).toContain('Antes de comprar')
    expect(description.length).toBeGreaterThanOrEqual(250)
    expect(verifyDescriptionClaims(description, brief).valid).toBe(true)
  })
})
