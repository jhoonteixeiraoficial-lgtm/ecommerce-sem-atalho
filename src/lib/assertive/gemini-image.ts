import { modelNamesForProvider } from './ai-models'
import { createHash } from 'node:crypto'

export type ProductImageEditMode = 'COVER_CLEANUP' | 'DETAIL_CLEANUP'

export interface ProductImageEditResult {
  buffer: Buffer
  mime_type: string
  provider: 'gemini'
  model: string
  attempts: number
  latency_ms: number
  prompt_hash: string
  source_sha256: string
  output_sha256: string
}

export interface EditProductImageInput {
  source: Buffer
  mime_type: string
  mode: ProductImageEditMode
  productName?: string
  shot?: { order: number; title: string; description: string; required: boolean }
  apiKey?: string
  models?: string[]
}

export interface GenerateProductImageInput {
  productName: string
  facts: Array<{ label: string; value: string }>
  reference?: { buffer: Buffer; mime_type: string }
  shot?: { order: number; title: string; description: string; required: boolean }
  apiKey?: string
  models?: string[]
}

export interface ProductImageGenerationResult {
  buffer: Buffer
  mime_type: string
  provider: 'gemini'
  model: string
  attempts: number
  latency_ms: number
  prompt_hash: string
  truth_brief_hash: string
  source_sha256: string | null
  output_sha256: string
}

function editPrompt(
  mode: ProductImageEditMode,
  productName?: string,
  shot?: EditProductImageInput['shot']
): string {
  const framing = mode === 'COVER_CLEANUP'
    ? 'Crie uma foto de capa quadrada, centralizada, com fundo branco puro (#FFFFFF), iluminação neutra e sombra de contato natural.'
    : 'Limpe o fundo e melhore exposição, nitidez e enquadramento, mantendo o ângulo atual da fotografia.'
  const identity = productName?.trim() ? `Identidade declarada apenas como contexto: "${productName.trim().slice(0, 180)}".` : ''
  const composition = shot
    ? `Objetivo desta posição da galeria: "${shot.title.slice(0, 100)} — ${shot.description.slice(0, 300)}". Atenda ao objetivo somente por recorte, enquadramento, fundo e iluminação; se ele exigir uma face ou peça não visível, preserve a vista original em vez de inventar.`
    : ''

  return `Edite a fotografia anexada para publicação em marketplace. ${framing}
${identity}
${composition}

REGRAS INEGOCIÁVEIS:
- NÃO altere o produto, sua geometria, proporções, cor, material, textura ou acabamento.
- NÃO altere, invente, corrija ou traduza marca, logotipo, etiqueta, texto, código ou controle visível.
- NÃO adicione nem remova produto, peça, acessório, embalagem, cabo, porta, botão ou unidade.
- NÃO crie outro ângulo, outro modelo, outra variante nem uma cena de uso inexistente.
- Preserve integralmente quantidade, sinais de uso e conteúdo visível da fotografia original.
- Não adicione texto promocional, selo, borda, marca-d'água ou elemento decorativo.

Retorne exatamente uma imagem 1:1. A única mudança permitida é apresentação fotográfica: fundo, exposição, balanço de branco, nitidez e centralização.`
}

function imageApiKeys(explicit?: string): string[] {
  return [...new Set([explicit?.trim(), process.env.GEMINI_API_KEY?.trim()].filter((key): key is string => Boolean(key)))]
}

export async function editProductImage(input: EditProductImageInput): Promise<ProductImageEditResult> {
  const apiKeys = imageApiKeys(input.apiKey)
  if (!apiKeys.length) throw new Error('GEMINI_API_KEY ausente para melhoria de imagem.')
  if (!input.source.byteLength) throw new Error('A imagem original está vazia.')

  const models = (input.models?.length ? input.models : modelNamesForProvider('gemini', 'image_generation')).slice(0, 2)
  if (!models.length) throw new Error('Nenhum modelo Gemini de imagem configurado.')
  const startedAt = Date.now()
  const prompt = editPrompt(input.mode, input.productName, input.shot)
  const promptHash = createHash('sha256').update(prompt).digest('hex')
  const sourceHash = createHash('sha256').update(input.source).digest('hex')
  let lastError = 'falha desconhecida'
  let attempts = 0

  for (const apiKey of apiKeys) {
    for (const model of models) {
      attempts += 1
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { data: input.source.toString('base64'), mimeType: input.mime_type } },
              ],
            }],
            generationConfig: {
              responseModalities: ['IMAGE'],
              imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
            },
          }),
          signal: controller.signal,
        }
      )
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`${model} retornou HTTP ${response.status}: ${detail.slice(0, 180)}`)
      }

      const payload = await response.json()
      const parts = payload?.candidates?.[0]?.content?.parts
      const image = Array.isArray(parts)
        ? parts.find((part: { inlineData?: { data?: unknown; mimeType?: unknown } }) => typeof part?.inlineData?.data === 'string')?.inlineData
        : undefined
      if (!image || typeof image.data !== 'string' || typeof image.mimeType !== 'string' || !image.mimeType.startsWith('image/')) {
        throw new Error(`${model} não retornou uma imagem válida.`)
      }
      if (!/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(image.data)) throw new Error(`${model} retornou base64 inválido.`)
      const buffer = Buffer.from(image.data, 'base64')
      if (!buffer.byteLength || buffer.byteLength > 20 * 1024 * 1024) throw new Error(`${model} retornou imagem vazia ou excessiva.`)

      return {
        buffer,
        mime_type: image.mimeType,
        provider: 'gemini',
        model,
        attempts,
        latency_ms: Date.now() - startedAt,
        prompt_hash: promptHash,
        source_sha256: sourceHash,
        output_sha256: createHash('sha256').update(buffer).digest('hex'),
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'erro desconhecido'
    } finally {
      clearTimeout(timer)
    }
    }
  }
  throw new Error(`Falha ao melhorar a imagem. Último erro: ${lastError}`)
}

export async function generateProductImage(input: GenerateProductImageInput): Promise<ProductImageGenerationResult> {
  const apiKeys = imageApiKeys(input.apiKey)
  if (!apiKeys.length) throw new Error('GEMINI_API_KEY ausente para geração de imagem.')

  const productName = input.productName.trim().slice(0, 180)
  const facts = input.facts
    .map(fact => ({ label: fact.label.trim().slice(0, 80), value: fact.value.trim().slice(0, 180) }))
    .filter(fact => fact.label && fact.value)
    .slice(0, 20)
  if (!productName) throw new Error('Identidade do produto ausente para geração de imagem.')

  const brief = JSON.stringify({ productName, facts })
  const truthBriefHash = createHash('sha256').update(brief).digest('hex')
  const referenceInstruction = input.reference
    ? 'Use a imagem anexada somente como referência visual de identidade. Crie uma nova composição e não reproduza fundo, cenário, texto promocional, selo ou marca-d’água da referência.'
    : 'Não há referência visual. Represente somente os elementos sustentados pela identidade e pelos fatos confirmados.'
  const factLines = facts.map(fact => `- ${fact.label}: ${fact.value}`).join('\n') || '- Nenhum detalhe adicional confirmado.'
  const shotInstruction = input.shot?.order === 1
    ? 'Foto principal: produto inteiro, centralizado e com fundo branco puro (#FFFFFF).'
    : input.shot
      ? `Imagem ${input.shot.order}: ${input.shot.title}. Objetivo: ${input.shot.description}. Use somente partes e ângulos comprovados pela referência visual.`
      : 'Foto principal: produto inteiro, centralizado e com fundo branco puro (#FFFFFF).'
  const prompt = `Crie uma fotografia profissional para marketplace do produto "${productName}".
${referenceInstruction}

FATOS CONFIRMADOS:
${factLines}

COMPOSIÇÃO SOLICITADA:
${shotInstruction}

REGRAS INEGOCIÁVEIS:
- Na foto principal, use fundo branco puro. Nas fotos secundárias, objetos de cenário devem ficar claramente separados e nunca parecer itens inclusos.
- Preserve exatamente marca, modelo, variante, cor, formato e quantidade quando estiverem confirmados.
- Não invente acessório, embalagem, texto, logotipo, conexão, controle, medida, certificação ou benefício.
- Preserve o ponto de vista comprovado. Não revele lados, conexões ou peças ausentes das referências exatas.
- Não inclua selo, preço, borda, marca-d’água ou chamada promocional.

Retorne exatamente uma imagem.`
  const promptHash = createHash('sha256').update(prompt).digest('hex')
  const sourceHash = input.reference
    ? createHash('sha256').update(input.reference.buffer).digest('hex')
    : null
  const models = (input.models?.length ? input.models : modelNamesForProvider('gemini', 'image_generation')).slice(0, 2)
  if (!models.length) throw new Error('Nenhum modelo Gemini de imagem configurado.')

  const startedAt = Date.now()
  let lastError = 'falha desconhecida'
  let attempts = 0
  for (const apiKey of apiKeys) {
    for (const model of models) {
      attempts += 1
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)
    try {
      const parts: Array<Record<string, unknown>> = [{ text: prompt }]
      if (input.reference) {
        parts.push({
          inlineData: {
            data: input.reference.buffer.toString('base64'),
            mimeType: input.reference.mime_type,
          },
        })
      }
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              responseModalities: ['IMAGE'],
              imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
            },
          }),
          signal: controller.signal,
        }
      )
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`${model} retornou HTTP ${response.status}: ${detail.slice(0, 180)}`)
      }

      const payload = await response.json()
      const responseParts = payload?.candidates?.[0]?.content?.parts
      const image = Array.isArray(responseParts)
        ? responseParts.find((part: { inlineData?: { data?: unknown; mimeType?: unknown } }) => typeof part?.inlineData?.data === 'string')?.inlineData
        : undefined
      if (!image || typeof image.data !== 'string' || typeof image.mimeType !== 'string' || !image.mimeType.startsWith('image/')) {
        throw new Error(`${model} não retornou uma imagem válida.`)
      }
      if (!/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(image.data)) throw new Error(`${model} retornou base64 inválido.`)
      const buffer = Buffer.from(image.data, 'base64')
      if (!buffer.byteLength || buffer.byteLength > 20 * 1024 * 1024) throw new Error(`${model} retornou imagem vazia ou excessiva.`)

      return {
        buffer,
        mime_type: image.mimeType,
        provider: 'gemini',
        model,
        attempts,
        latency_ms: Date.now() - startedAt,
        prompt_hash: promptHash,
        truth_brief_hash: truthBriefHash,
        source_sha256: sourceHash,
        output_sha256: createHash('sha256').update(buffer).digest('hex'),
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'erro desconhecido'
    } finally {
      clearTimeout(timer)
    }
    }
  }
  throw new Error(`Falha ao gerar a imagem. Último erro: ${lastError}`)
}
