/**
 * Entendimento visual do produto via IA.
 *
 * Analisa fotos do produto (usuário ou catálogo) para entender:
 *  - Tipo de produto (ferramenta, eletrônico, etc.)
 *  - Aparência visual (cor, formato, tamanho relativo)
 *  - Acessórios visíveis
 *  - Estado (novo, usado)
 *  - O que pode ser melhorado na foto
 */
import { runTaskJson } from './ai-router'
import type { AIConfig } from './types'

export interface ProductVisualProfile {
  /** Tipo categorizado do produto */
  product_type: 'tool' | 'electronics' | 'fashion' | 'home' | 'beauty' | 'sports' | 'auto' | 'grocery' | 'other'
  /** Descrição visual resumida (1 linha) */
  visual_summary: string
  /** Cor predominante */
  dominant_color: string
  /** Formato geral */
  shape: string
  /** Tamanho relativo estimado */
  size_estimate: string
  /** Acessórios visíveis nas fotos */
  visible_accessories: string[]
  /** O que a foto mostra bem */
  photo_strengths: string[]
  /** O que está faltando na foto */
  photo_gaps: string[]
  /** Sugestão de como melhorar a capa */
  cover_improvement: string
  /** Se a foto é fiel ao produto real */
  fidelity_confidence: 'high' | 'medium' | 'low'
  /** Razão da fidelidade */
  fidelity_reason: string
}

const VISUAL_UNDERSTANDING_PROMPT = `Analise as imagens do produto abaixo e retorne um perfil visual completo.

Para cada imagem, identifique:
1. Tipo de produto (tool/electronics/fashion/home/beauty/sports/auto/grocery/other)
2. Cor predominante do produto
3. Formato geral (retangular, cilíndrico, irregular, etc.)
4. Tamanho relativo (pequeno/médio/grande comparado com as mãos humanas)
5. Acessórios visíveis (bateria, carregador, cabo, broca, etc.)
6. Pontos fortes da foto (fundo limpo, boa iluminação, produto centralizado)
7. Pontos fracos da foto (fundo sujo, iluminação ruim, produto cortado)
8. Se a foto parece fiel ao produto real ou se parece editada/manipulada

IMPORTANTE: Se houver múltiplas fotos do MESMO produto, analise todas juntas para dar um veredito final sobre fidelidade.

Retorne APENAS o JSON:
{
  "product_type": "tool",
  "visual_summary": "Parafusadeira sem fio amarela com preto, formato pistol-grip",
  "dominant_color": "amarelo",
  "shape": "pistol-grip com mandril na frente",
  "size_estimate": "médio (tamanho de uma mão humana)",
  "visible_accessories": ["bateria recarregável", "carregador", "mandril", "caixa de transport"],
  "photo_strengths": ["fundo limpo", "produto centralizado", "boas iluminações"],
  "photo_gaps": ["falta foto de detalhe do mandril", "falta foto em uso"],
  "cover_improvement": "A capa atual está boa. Considere mostrar o produto de frente com fundo mais limpo.",
  "fidelity_confidence": "high",
  "fidelity_reason": "Todas as fotos mostram o mesmo produto amarelo com as mesmas características"
}`

/**
 * Analisa fotos do produto para entender o que é visualmente.
 */
export async function understandProductVisuals(
  imageUrls: string[],
  config: AIConfig | null,
  productName?: string
): Promise<ProductVisualProfile> {
  if (!imageUrls.length || !config) {
    return getDefaultProfile()
  }

  try {
    const imageList = imageUrls.map((u, i) => `[${i}] ${u}`).join('\n')
    const context = productName ? `\nProduto declarado: ${productName}` : ''

    const result = await runTaskJson<ProductVisualProfile>(
      'attribute_enrichment',
      config,
      VISUAL_UNDERSTANDING_PROMPT,
      `Analise estas imagens do produto:${context}\n\nImagens:\n${imageList}`,
      { maxTokens: 2000, temperature: 0.1 }
    )

    if (result && result.product_type) {
      return result
    }
  } catch {
    // fallback silencioso
  }

  return getDefaultProfile()
}

function getDefaultProfile(): ProductVisualProfile {
  return {
    product_type: 'other',
    visual_summary: 'Produto não analisado visualmente',
    dominant_color: 'desconhecido',
    shape: 'desconhecido',
    size_estimate: 'desconhecido',
    visible_accessories: [],
    photo_strengths: [],
    photo_gaps: ['Análise visual não disponível'],
    cover_improvement: 'Envie fotos para análise visual',
    fidelity_confidence: 'low',
    fidelity_reason: 'Sem fotos suficientes para análise',
  }
}

/**
 * Verifica se uma foto de concorrente é do MESMO produto visualmente.
 * Usa comparação de Features visuais, não apenas matching de texto.
 */
export async function verifyVisualMatch(
  referenceUrls: string[],
  candidateUrl: string,
  config: AIConfig | null
): Promise<{ is_match: boolean; confidence: number; reason: string }> {
  if (!config || !referenceUrls.length) {
    return { is_match: false, confidence: 0, reason: 'Sem referência para comparação' }
  }

  try {
    const refs = referenceUrls.slice(0, 3).map((u, i) => `[REF ${i}] ${u}`).join('\n')
    const prompt = `Compare esta imagem candidata com as imagens de referência do produto.

REGRAS:
1. Se o candidato mostrar o MESMO produto (mesma marca, modelo, cor, formato), retorne is_match: true
2. Se o candidato mostrar produto DIFERENTE (modelo diferente, cor diferente, formato diferente), retorne is_match: false
3. Considere que fotos do mesmo produto podem ter ângulos diferentes
4. Mas NÃO aceite fotos de produtos similares mas diferentes

Referências do produto:
${refs}

Imagem candidata: ${candidateUrl}

Retorne APENAS: {"is_match": boolean, "confidence": 0-100, "reason": "explicação"}`

    const result = await runTaskJson<{ is_match: boolean; confidence: number; reason: string }>(
      'attribute_enrichment',
      config,
      'Você é um especialista em identificação visual de produtos.',
      prompt,
      { maxTokens: 500, temperature: 0.1 }
    )

    return result || { is_match: false, confidence: 0, reason: 'Falha na análise' }
  } catch {
    return { is_match: false, confidence: 0, reason: 'Erro na análise visual' }
  }
}
