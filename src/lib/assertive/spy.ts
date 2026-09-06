import type { AIConfig } from './types'
import { searchAndEnrichCatalog, type CatalogCompetitor } from './catalog'
import { generateWithFallback } from './ai'

export interface SpyResult {
  competitors: CatalogCompetitor[]
  summary: {
    avg_price: number
    min_price: number
    max_price: number
    avg_reviews: number
    free_shipping_pct: number
    competition_level: 'baixa' | 'media' | 'alta'
    opportunity_score: number
  }
  recommendation: string
}

function calculateOpportunity(competitors: CatalogCompetitor[]): number {
  let score = 50
  if (competitors.length < 3) score += 20
  if (competitors.some(c => !c.shipping.free_shipping)) score += 10
  if (competitors.some(c => c.seller.reputation < 4)) score += 15
  const avgAttrs = competitors.reduce((acc, c) => acc + Object.keys(c.attributes).length, 0) / (competitors.length || 1)
  if (avgAttrs < 10) score += 15
  return Math.min(score, 100)
}

export async function spyCompetitors(
  mlToken: string,
  productName: string,
  config: AIConfig | null,
  topN: number = 6
): Promise<SpyResult> {
  const competitors = await searchAndEnrichCatalog(mlToken, productName, topN)

  if (competitors.length === 0) {
    return {
      competitors: [],
      summary: {
        avg_price: 0, min_price: 0, max_price: 0, avg_reviews: 0,
        free_shipping_pct: 0, competition_level: 'baixa', opportunity_score: 100,
      },
      recommendation: 'Nenhum produto de catálogo encontrado para essa busca. Pode ser uma grande oportunidade ou o produto precisa de uma descrição mais específica.',
    }
  }

  const prices = competitors.map(c => c.price).filter(p => p > 0)
  const freeShipping = competitors.filter(c => c.shipping.free_shipping).length

  const summary = {
    avg_price: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0,
    min_price: prices.length ? Math.min(...prices) : 0,
    max_price: prices.length ? Math.max(...prices) : 0,
    avg_reviews: 0,
    free_shipping_pct: (freeShipping / competitors.length) * 100,
    competition_level: (competitors.length <= 2 ? 'baixa' : competitors.length >= 5 ? 'alta' : 'media') as 'baixa' | 'media' | 'alta',
    opportunity_score: calculateOpportunity(competitors),
  }

  let recommendation = ''
  try {
    const result = await generateWithFallback(
      config,
      'Você é um consultor de e-commerce para Mercado Livre. Seja conciso e prático.',
      `Analise esta concorrência real do Mercado Livre (dados do catálogo oficial) para "${productName}":
      - Preço médio dos vencedores (buy box): R$${summary.avg_price.toFixed(2)}
      - Faixa: R$${summary.min_price.toFixed(2)} - R$${summary.max_price.toFixed(2)}
      - Frete grátis: ${summary.free_shipping_pct.toFixed(0)}% dos vencedores
      - Produtos de catálogo encontrados: ${competitors.length}
      - Reputação média dos vencedores: ${(competitors.reduce((a, c) => a + c.seller.reputation, 0) / competitors.length).toFixed(1)}/5
      Dê 2-3 dicas práticas e específicas para criar um anúncio competitivo.`
    )
    recommendation = result.text
  } catch {
    recommendation = 'Configure uma IA em Configurações para receber recomendações personalizadas.'
  }

  return { competitors, summary, recommendation }
}
