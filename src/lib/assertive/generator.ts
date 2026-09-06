import type { AIConfig, Analysis, CompetitorData, GenerateListingOutput } from './types'
import { generateWithFallback } from './ai'
import { createPhotoVariations } from './photos'

const TITLE_SYSTEM = `Você é um especialista em SEO para Mercado Livre.
Gere títulos otimizados (máx 60 caracteres) seguindo as regras do ML:
- Palavras-chave relevantes no início
- Marca e modelo quando aplicável
- Diferencial competitivo
- Sem caracteres especiais excessivos
Retorne APENAS o título, sem aspas ou explicação.`

const DESCRIPTION_SYSTEM = `Você é um copywriter especializado em e-commerce para Mercado Livre.
Gere uma descrição persuasiva e completa em HTML simples (<p>, <strong>, <ul>, <li>).
Estrutura: Gancho → Benefícios → Especificações → Garantia → CTA.
Seja persuasivo mas honesto. Use emojis com moderação.`

const ATTRIBUTES_SYSTEM = `Você é um especialista em categorias do Mercado Livre.
Dado um produto e sua categoria, gere os atributos completos em JSON.
Inclua: NCM, peso, dimensões, material, cor, modelo, compatibilidade.
Retorne APENAS JSON válido: { "attribute_id": "valor" }`

export async function generateListing(
  analysis: Analysis,
  competitors: CompetitorData[],
  config: AIConfig,
  variationIndex: number = 0
): Promise<GenerateListingOutput> {
  const competitorSummary = competitors.map(c =>
    `- ${c.title} | R$${c.price} | Reviews: ${c.reviews_count} | Atributos: ${Object.keys(c.attributes).length}`
  ).join('\n')

  const titlePrompt = `Produto: ${analysis.product_name}
Concorrentes:\n${competitorSummary}
Variação: ${variationIndex + 1}
Gere um título OTIMIZADO que supere esses concorrentes.`

  const titleResult = await generateWithFallback(config, TITLE_SYSTEM, titlePrompt)
  const title = titleResult.text.slice(0, 60)

  const descPrompt = `Produto: ${analysis.product_name}
Marca: ${analysis.identified_data?.brand || 'N/A'}
Modelo: ${analysis.identified_data?.model || 'N/A'}
Características: ${JSON.stringify(analysis.identified_data?.specs || {})}
Concorrentes:\n${competitorSummary}
Gere uma descrição COMPLETA e OTIMIZADA.`

  const descResult = await generateWithFallback(config, DESCRIPTION_SYSTEM, descPrompt)
  const description = descResult.text

  const avgPrice = competitors.reduce((a, c) => a + c.price, 0) / (competitors.length || 1)
  const price = Math.round(avgPrice * (1 - config.default_margin / 100) * 100) / 100

  let attributes: Record<string, string> = {}
  try {
    const attrPrompt = `Produto: ${analysis.product_name}
Categoria ML: ${analysis.category_id || 'Geral'}
Dados: ${JSON.stringify(analysis.identified_data?.specs || {})}`

    const attrResult = await generateWithFallback(config, ATTRIBUTES_SYSTEM, attrPrompt)
    const cleaned = attrResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    attributes = JSON.parse(cleaned)
  } catch {
    attributes = {}
  }

  return { title, description, price, attributes, category_id: analysis.category_id || '' }
}

export async function generateMultipleListings(
  analysis: Analysis,
  competitors: CompetitorData[],
  config: AIConfig,
  basePhotos: string[],
  count: number = 3
): Promise<Array<GenerateListingOutput & { photos: string[] }>> {
  const listings: Array<GenerateListingOutput & { photos: string[] }> = []

  for (let i = 0; i < count; i++) {
    const listing = await generateListing(analysis, competitors, config, i)
    const photos = await createPhotoVariations(basePhotos, i, count)
    listings.push({ ...listing, photos })
  }

  return listings
}
