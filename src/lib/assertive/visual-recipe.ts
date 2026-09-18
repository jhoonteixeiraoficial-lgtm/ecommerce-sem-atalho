import type { AIConfig } from './types'
import { runTaskJson } from './ai-router'

/**
 * Receita Visual — o "especialista em fotos" do Assertive.
 *
 * Analisa as fotos de um anúncio escalado e extrai a ESTRATÉGIA visual
 * (tipos de foto, ângulo, fundo, luz, composição, infográficos, ordem) e
 * QUAL DÚVIDA DE COMPRA cada foto resolve para quem vai comprar.
 * A receita alimenta a geração de fotos NOVAS do produto do vendedor —
 * replica a estratégia vencedora sem copiar um único pixel.
 */

export interface PhotoRecipeShot {
  order: number
  /** tipo de foto: hero | detalhe | infografico | em_uso | ambiente | kit | dimensao */
  type: string
  angle: string
  background: string
  lighting: string
  composition: string
  /** o que a foto comunica (ex.: "capacidade", "à prova de vazamento") */
  message: string
  /** elementos de texto/gráfico que o original usava (tema, não texto literal) */
  overlay_theme: string | null
  /** a dúvida de compra que esta foto existe para responder */
  buyer_doubt: string
}

export interface PhotoRecipe {
  /** por que esse conjunto de fotos converte */
  strategy: string
  shots: PhotoRecipeShot[]
  /** o que faremos MELHOR que o original */
  upgrades: string[]
  /** dúvidas de compra que o anúncio escalado NÃO respondeu — oportunidade */
  doubts_missing: string[]
}

const SYSTEM = `Você é um diretor de fotografia especialista em fotos de produto para marketplace (Mercado Livre) e pensa como o COMPRADOR.
Analise as fotos do anúncio informado e extraia a RECEITA VISUAL completa:
1. O que cada foto é (tipo: hero, detalhe, infografico, em_uso, ambiente, kit, dimensao), como foi feita
   (ângulo, fundo, luz, composição), o que comunica e QUAL DÚVIDA DE COMPRA ela responde.
2. O conjunto todo precisa sanar as dúvidas de quem compra: tamanho real, material, resistência,
   funcionamento, conteúdo da embalagem, como usar, caber no espaço, diferenças de variação.
3. Proponha o que faremos MELHOR (upgrades) e liste as dúvidas de compra que o original NÃO respondeu.
NÃO descreva marcas de terceiros nem copie textos: extraia estrutura e estratégia.
Responda SOMENTE com JSON:
{"strategy":"...","shots":[{"order":1,"type":"hero","angle":"...","background":"...","lighting":"...","composition":"...","message":"...","overlay_theme":null,"buyer_doubt":"..."}],"upgrades":["..."],"doubts_missing":["..."]}`

export async function analyzePhotoRecipe(
  config: AIConfig | null,
  input: {
    /** descrição curta do produto (truth) */
    productName: string
    /** URLs públicas das fotos do anúncio escalado, na ordem do anúncio */
    images: Array<{ url: string }>
  }
): Promise<PhotoRecipe | null> {
  if (!input.images.length) return null
  try {
    // URLs públicas das fotos: o router anexa os pixels (tier visão)
    // automaticamente quando options.images está presente.
    const imageList = input.images.map((_, i) => `[${i}] anexo ${i + 1}`).join('\n')
    const result = await runTaskJson<PhotoRecipe>(
      'visual_understanding',
      config,
      SYSTEM,
      `Produto: ${input.productName}.\nEstas são as fotos do anúncio escalado, na ordem do anúncio (${input.images.length} imagens).\n${imageList}\nExtraia a receita visual completa, a dúvida de compra que cada foto resolve, os upgrades e as dúvidas que ficaram sem resposta.`,
      { images: input.images.map(img => img.url).filter(Boolean).slice(0, 6), maxTokens: 2500 }
    )
    if (!result?.shots?.length) return null
    return {
      strategy: String(result.strategy || ''),
      shots: result.shots.slice(0, 8).map((s, i) => ({
        order: i + 1,
        type: String(s.type || 'detalhe'),
        angle: String(s.angle || ''),
        background: String(s.background || ''),
        lighting: String(s.lighting || ''),
        composition: String(s.composition || ''),
        message: String(s.message || ''),
        overlay_theme: s.overlay_theme ? String(s.overlay_theme) : null,
        buyer_doubt: String(s.buyer_doubt || ''),
      })),
      upgrades: (result.upgrades || []).map(String).filter(Boolean).slice(0, 6),
      doubts_missing: (result.doubts_missing || []).map(String).filter(Boolean).slice(0, 6),
    }
  } catch {
    return null
  }
}

/** Transforma a receita em prompt de geração para UMA foto nova. */
export function recipeShotPrompt(recipe: PhotoRecipe, shot: PhotoRecipeShot, productName: string): string {
  const style = [
    `Professional marketplace product photograph of ${productName}`,
    shot.type === 'hero' ? 'main hero shot, product centered, occupying most of the frame' : `shot type: ${shot.type}`,
    shot.angle && `camera angle: ${shot.angle}`,
    shot.background && `background: ${shot.background}`,
    shot.lighting && `lighting: ${shot.lighting}`,
    shot.composition && `composition: ${shot.composition}`,
    shot.buyer_doubt && `the photo must clearly answer this buyer question: ${shot.buyer_doubt}`,
    shot.overlay_theme && `include this infographic theme (clean, minimal text): ${shot.overlay_theme}`,
    'photorealistic, sharp focus, e-commerce listing quality',
    'IMPORTANT: keep the exact product from the reference image unchanged (shape, color, material, branding, proportions)',
  ].filter(Boolean).join('. ')
  return style
}
