import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WinningListingDNA } from '../dna'
import type { ResearchResult } from '../research'
import type { ProductTruth } from '../truth'

const generateJson = vi.hoisted(() => vi.fn())
vi.mock('../ai', () => ({ generateJson }))

import { buildSemanticTitle, generateListing } from '../generator'

const truth: ProductTruth = {
  name: 'Caneta de polaridade Kitest KA250 12V 24V',
  fields: {
    product_type: { value: 'caneta de polaridade', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
    brand: { value: 'Kitest', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
    model: { value: 'KA250', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
    voltage: { value: '12 V / 24 V', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
  },
  identity: {
    name: 'Caneta de polaridade Kitest KA250', product_type: 'caneta de polaridade', function: 'testar polaridade',
    brand: 'Kitest', model: 'KA250', family_or_line: null, variant: null, voltage: '12 V / 24 V',
    kit_pack: null, dimensions: null, condition: 'new', gtin: '7898559182505', seller_sku: null,
    confidence: 1, evidence: ['fonte'], unknowns: [], conflicts: [],
  },
  uncertain: [],
  evidence: ['fonte'],
  confidence: 1,
}

const research = {
  query: truth.name,
  category_id: 'MLB60658',
  competitors: [],
  price_stats: { min: 90, max: 110, median: 100, avg: 100, sample_size: 2 },
} as unknown as ResearchResult

function dna(basis: 'EXACT_PRODUCT' | 'COMPARABLE_PRODUCT'): WinningListingDNA {
  return {
    title_patterns: [], important_keywords: [], must_have_attributes: [], high_value_attributes: [],
    description_structure: ['Produto', 'Especificações'],
    image_patterns: { median_count: 5, max_count: 8, recommendation: '' },
    price_context: { min: 90, max: 110, median: 100, suggested: 97, basis, sample_size: 2 },
    logistics_patterns: { free_shipping_pct: 0, fulfillment_pct: 0, note: '' },
    common_weaknesses: [], opportunities: [], references_analyzed: 2,
  }
}

describe('listing generator semantic guards', () => {
  beforeEach(() => {
    generateJson.mockReset().mockResolvedValue({
      title: 'Kitest KA250 Caneta Teste Circuito Caneta 12v 24v Promoção',
      title_alternatives: [],
      family_name: 'Caneta Kitest KA250',
      description: 'Produto\n\nEspecificações confirmadas.',
      attributes: [],
      missing: [],
      image_plan: [],
      improvements: [],
    })
  })

  it('monta o título a partir da identidade canônica confirmada', async () => {
    const result = await generateListing({
      config: null,
      truth,
      research,
      dna: dna('EXACT_PRODUCT'),
      category: { id: 'MLB60658', name: 'Ferramentas', path_from_root: [], settings: { max_title_length: 60 } },
      attributes: [],
    })

    expect(result.title).toBe('Caneta de Polaridade Kitest KA250 12V 24V')
  })

  it('registra fallback quando a IA troca Caneta por Canela', async () => {
    generateJson.mockResolvedValue({
      title: 'Testador Circuito Kitest KA250 Canela Polaridade 12V 24V',
      title_alternatives: [],
      family_name: 'Testador Kitest KA250 Canela Polaridade',
      description: 'Caneta de polaridade para verificação elétrica.',
      attributes: [],
      missing: [],
      image_plan: [],
      improvements: [],
    })

    const result = await generateListing({
      config: null,
      truth,
      research,
      dna: dna('EXACT_PRODUCT'),
      category: { id: 'MLB60658', name: 'Ferramentas', path_from_root: [], settings: { max_title_length: 60 } },
      attributes: [],
    })

    expect(result.title).toContain('Caneta')
    expect(result.title).not.toContain('Canela')
    expect(result.improvements).toEqual(expect.arrayContaining([expect.stringContaining('COPY_GUARD')]))
  })

  it('remove medida inventada mesmo quando tipo, marca e modelo estão corretos', async () => {
    generateJson.mockResolvedValue({
      title: 'Caneta de Polaridade Kitest KA250 48V',
      title_alternatives: [],
      family_name: 'Caneta de Polaridade Kitest KA250 48V',
      description: 'Caneta de polaridade para verificação elétrica.',
      attributes: [],
      missing: [],
      image_plan: [],
      improvements: [],
    })

    const result = await generateListing({
      config: null,
      truth,
      research,
      dna: dna('EXACT_PRODUCT'),
      category: { id: 'MLB60658', name: 'Ferramentas', path_from_root: [], settings: { max_title_length: 60 } },
      attributes: [],
    })

    expect(result.title).toBe('Caneta de Polaridade Kitest KA250 12V 24V')
    expect(result.family_name).not.toContain('48V')
  })

  it('não aplica automaticamente preço derivado só de comparáveis', async () => {
    const result = await generateListing({
      config: null,
      truth,
      research: { ...research, price_basis: 'COMPARABLE_PRODUCT' },
      dna: dna('COMPARABLE_PRODUCT'),
      category: null,
      attributes: [],
    })

    expect(result.price).toBeNull()
    expect(result.price_rationale).toContain('produtos comparáveis')
  })

  it('preserva o título golden quando ele já contém a identidade confirmada', async () => {
    const goldenTitle = 'Cadeira Escritório Diretor Atlanta Couro PU HomeNow 150kg'
    generateJson.mockResolvedValue({
      title: goldenTitle, title_alternatives: [], family_name: 'Cadeira Diretor Atlanta HomeNow',
      description: 'Descrição', attributes: [], missing: [], image_plan: [], improvements: [],
    })
    const goldenTruth: ProductTruth = {
      ...truth,
      name: goldenTitle,
      fields: {
        product_type: { value: 'cadeira escritório', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
        brand: { value: 'HomeNow', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
        model: { value: 'Atlanta Diretor', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
        material: { value: 'Couro PU', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
        capacity: { value: '150 kg', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
      },
      identity: {
        ...truth.identity!, name: goldenTitle, product_type: 'cadeira escritório', brand: 'HomeNow',
        model: 'Atlanta Diretor', voltage: null, gtin: null,
      },
    }

    const result = await generateListing({
      config: null, truth: goldenTruth, research, dna: dna('EXACT_PRODUCT'),
      category: { id: 'MLB193945', name: 'Cadeiras', path_from_root: [], settings: { max_title_length: 60 } },
      attributes: [],
    })

    expect(result.title).toBe(goldenTitle)
  })

  it('remove descrição com especificações comerciais não confirmadas', async () => {
    generateJson.mockResolvedValue({
      title: 'Caneta de Polaridade Kitest KA250 12V 24V',
      title_alternatives: [], family_name: 'Caneta Kitest KA250',
      description: 'Potência de 500 W, garantia de 5 anos e carregador incluso.',
      attributes: [], missing: [], image_plan: [], improvements: [],
    })

    const result = await generateListing({
      config: null, truth, research, dna: dna('EXACT_PRODUCT'), category: null, attributes: [],
    })

    expect(result.description).toContain('Voltagem: 12 V / 24 V')
    expect(result.description).not.toMatch(/500 W|garantia de 5 anos|carregador incluso/i)
  })

  it('não deixa marca ou modelo conflitante entrar no family_name e nas alternativas', async () => {
    generateJson.mockResolvedValue({
      title: 'Caneta de Polaridade Kitest KA250 12V 24V',
      title_alternatives: ['Detector de tensão Vonder XYZ', 'Caneta de Polaridade Kitest KA250'],
      family_name: 'Detector de tensão Vonder XYZ',
      description: 'Caneta de polaridade para verificação elétrica.',
      attributes: [], missing: [], image_plan: [], improvements: [],
    })

    const result = await generateListing({
      config: null, truth, research, dna: dna('EXACT_PRODUCT'), category: null, attributes: [],
    })

    expect(result.family_name).toContain('Kitest KA250')
    expect(result.family_name).not.toContain('Vonder')
    expect(result.title_alternatives.join(' ')).not.toContain('Vonder')
  })

  it('preserva o status não publicável de um atributo inferido', async () => {
    generateJson.mockResolvedValue({
      title: 'Caneta de Polaridade Kitest KA250',
      title_alternatives: [],
      family_name: 'Caneta de Polaridade Kitest KA250',
      description: 'Caneta de polaridade para verificação elétrica.',
      attributes: [{ id: 'COLOR', value_name: 'Preto' }],
      missing: [],
      image_plan: [],
      improvements: [],
    })
    const inferredTruth: ProductTruth = {
      ...truth,
      fields: {
        ...truth.fields,
        color: {
          value: 'Preto',
          confidence: 'high',
          source: 'inference',
          evidence: 'Aparência provável',
          status: 'NEEDS_CONFIRMATION',
        },
      },
    }

    const result = await generateListing({
      config: null,
      truth: inferredTruth,
      research,
      dna: dna('EXACT_PRODUCT'),
      category: { id: 'MLB60658', name: 'Ferramentas', path_from_root: [] },
      attributes: [{
        id: 'COLOR', name: 'Cor', value_type: 'string', tier: 'required',
        fixedValues: false, isVariationOnly: false, readOnly: false,
      }],
    })

    expect(result.attributes).toEqual([
      expect.objectContaining({ id: 'COLOR', status: 'NEEDS_CONFIRMATION' }),
    ])
  })

  it('escolhe a alternativa factual com melhor cobertura de busca', async () => {
    generateJson.mockResolvedValue({
      title: 'Caneta de Polaridade Kitest KA250',
      title_alternatives: [
        'Caneta de Polaridade Kitest KA250 Teste 12V 24V',
        'Oferta Caneta Kitest KA250',
      ],
      family_name: 'Caneta de Polaridade Kitest KA250',
      description: 'Caneta de polaridade para testar sistemas elétricos automotivos com segurança.',
      attributes: [], missing: [], image_plan: [], improvements: [],
    })

    const result = await generateListing({
      config: null,
      truth,
      research: { ...research, keywords: ['teste', '12V', '24V'] },
      dna: dna('EXACT_PRODUCT'),
      category: { id: 'MLB60658', name: 'Ferramentas', path_from_root: [], settings: { max_title_length: 60 } },
      attributes: [],
    })

    expect(result.title).toBe('Caneta de Polaridade Kitest KA250 Teste 12V 24V')
  })

  it('nunca entrega título com conector ou pontuação pendurada no final', async () => {
    generateJson.mockResolvedValue({
      title: 'Caneta de Polaridade Kitest KA250 12V 24V +',
      title_alternatives: [],
      family_name: 'Caneta de Polaridade Kitest KA250 +',
      description: 'Caneta de polaridade para testar sistemas elétricos automotivos com segurança.',
      attributes: [], missing: [], image_plan: [], improvements: [],
    })

    const result = await generateListing({
      config: null, truth, research, dna: dna('EXACT_PRODUCT'), category: null, attributes: [],
    })

    expect(result.title).toBe('Caneta de Polaridade Kitest KA250 12V 24V')
    expect(result.family_name).not.toMatch(/[+(/,:;-]$/)
  })

  it('remove somente o trecho sem evidência e preserva a copy útil', async () => {
    generateJson.mockResolvedValue({
      title: 'Caneta de Polaridade Kitest KA250 12V 24V',
      title_alternatives: [],
      family_name: 'Caneta de Polaridade Kitest KA250',
      description: [
        'Teste circuitos automotivos com identificação clara de polaridade.',
        '',
        'Destaques',
        '- Operação confirmada em sistemas 12V e 24V.',
        '- Garantia exclusiva de 5 anos.',
        '',
        'Consulte as especificações antes da compra.',
      ].join('\n'),
      attributes: [], missing: [], image_plan: [], improvements: [],
    })

    const result = await generateListing({
      config: null, truth, research, dna: dna('EXACT_PRODUCT'), category: null, attributes: [],
    })

    expect(result.description).toContain('Teste circuitos automotivos')
    expect(result.description).toContain('Operação confirmada em sistemas 12V e 24V')
    expect(result.description).not.toMatch(/garantia exclusiva|5 anos/i)
    expect(result.description).toContain('Especificações confirmadas')
  })

  it('expande uma resposta curta em descrição comercial factual estruturada', async () => {
    generateJson.mockResolvedValue({
      title: 'Caneta de Polaridade Kitest KA250 12V 24V',
      title_alternatives: [],
      family_name: 'Caneta de Polaridade Kitest KA250',
      description: 'Caneta Kitest KA250.',
      attributes: [], missing: [], image_plan: [], improvements: [],
    })

    const result = await generateListing({
      config: null, truth, research, dna: dna('EXACT_PRODUCT'), category: null, attributes: [],
    })

    expect(result.description).toContain('Destaques do produto')
    expect(result.description).toContain('Especificações confirmadas')
    expect(result.description).toContain('Antes de comprar')
    expect(result.description.length).toBeGreaterThan(220)
  })

  it('remove repetição de token distintivo do modelo no título', () => {
    const processor = {
      name: 'Processador AMD Ryzen 5 5500',
      fields: {
        product_type: { value: 'Processador', confidence: 'confirmed', source: 'description', evidence: 'texto' },
        brand: { value: 'AMD', confidence: 'confirmed', source: 'description', evidence: 'texto' },
        model: { value: 'Ryzen 5 5500', confidence: 'confirmed', source: 'description', evidence: 'texto' },
      },
      uncertain: [], evidence: [], confidence: 1,
    } as ProductTruth

    expect(buildSemanticTitle(processor, 'Processador Ryzen 5 AMD Ryzen 5 5500 Novo', 60))
      .toBe('Processador AMD Ryzen 5 5500')
  })
})
