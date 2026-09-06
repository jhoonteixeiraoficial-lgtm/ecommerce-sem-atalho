import type { AIConfig, ProductIdentification } from './types'
import { generateWithFallback } from './ai'

const ANALYZER_SYSTEM_PROMPT = `Você é um especialista em produtos para e-commerce no Brasil.

REGRAS OBRIGATÓRIAS:
1. Identifique EXATAMENTE o produto descrito ou mostrado na imagem
2. NÃO invente nem adivinhe - se não tiver certeza, diga "desconhecido"
3. O nome do produto deve ser EXATO e ESPECÍFICO (ex: "Caneta de Polaridade KA 250", não "produto genérico")
4. A categoria DEVE ser uma categoria real do Mercado Livre

Retorne APENAS um JSON válido (sem markdown, sem texto extra) com esta estrutura EXATA:
{
  "name": "nome exato do produto (o mais específico possível)",
  "brand": "marca real (null se não identificável)",
  "model": "modelo real (null se não identificável)",
  "category": "categoria ML exata (ex: Ferramentas, Celulares, Eletrônica)",
  "category_path": "caminho completo (ex: Ferramentas > Ferramentas Manuais > Medição e Teste)",
  "specs": {},
  "confidence": 0.8
}`

function parseAIProductResult(text: string): ProductIdentification {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      name: parsed.name || 'Produto desconhecido',
      brand: parsed.brand || undefined,
      model: parsed.model || undefined,
      category: parsed.category || parsed.category_path || undefined,
      category_id: parsed.category_id || undefined,
      specs: parsed.specs || {},
      confidence: parsed.confidence || 0.5,
    }
  } catch {
    return {
      name: text.slice(0, 100),
      specs: {},
      confidence: 0.3,
    }
  }
}

export async function analyzeFromDescription(
  config: AIConfig | null,
  description: string
): Promise<ProductIdentification> {
  const result = await generateWithFallback(
    config,
    ANALYZER_SYSTEM_PROMPT,
    `O usuário está vendendo no Mercado Livre. Analise esta descrição e identifique EXATAMENTE qual é o produto:\n\n"${description}"\n\nIMPORTANTE: Identifique o produto EXATO descrito acima. Não confunda com produtos parecidos.`
  )
  return parseAIProductResult(result.text)
}

export async function analyzeFromPhoto(
  config: AIConfig | null,
  imageUrl: string
): Promise<ProductIdentification> {
  const result = await generateWithFallback(
    config,
    ANALYZER_SYSTEM_PROMPT,
    'O usuário está vendendo no Mercado Livre. Analise esta imagem e identifique EXATAMENTE qual é o produto mostrado. Descreva marca, modelo, cor e características visíveis.',
    imageUrl
  )
  return parseAIProductResult(result.text)
}

export async function analyzeFromUrl(
  config: AIConfig | null,
  mlUrl: string,
  mlToken?: string | null
): Promise<ProductIdentification> {
  const match = mlUrl.match(/MLB-?\d+/)
  const itemId = match ? match[0].replace('-', '') : null

  // Prefer the official API when the user already connected their ML account
  if (itemId && mlToken) {
    try {
      const res = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: { Authorization: `Bearer ${mlToken}`, Accept: 'application/json' },
      })
      if (res.ok) {
        const item = await res.json()
        const description = `${item.title} - ${(item.attributes || []).map((a: { value_name: string }) => a.value_name).filter(Boolean).join(', ')}`
        return analyzeFromDescription(config, description)
      }
    } catch { /* fall through to slug parsing */ }
  }

  // Fallback: extract product name straight from the URL slug (works without ML OAuth)
  const path = mlUrl.split('?')[0].split('/').filter(Boolean)
  const slug = path.find(p => p.includes('-') && !/^MLB/i.test(p)) || path[path.length - 1] || ''
  const fromSlug = decodeURIComponent(slug).replace(/-/g, ' ').replace(/\b(p|MLB\d+)\b/gi, '').trim()

  if (!fromSlug) throw new Error('Não foi possível identificar o produto a partir da URL. Conecte sua conta do Mercado Livre para consultar o anúncio diretamente.')

  return analyzeFromDescription(config, fromSlug)
}
