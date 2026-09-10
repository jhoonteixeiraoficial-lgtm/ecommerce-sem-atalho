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
  apiKey?: string
  models?: string[]
}

function editPrompt(mode: ProductImageEditMode, productName?: string): string {
  const framing = mode === 'COVER_CLEANUP'
    ? 'Crie uma foto de capa quadrada, centralizada, com fundo branco puro (#FFFFFF), iluminação neutra e sombra de contato natural.'
    : 'Limpe o fundo e melhore exposição, nitidez e enquadramento, mantendo o ângulo atual da fotografia.'
  const identity = productName?.trim() ? `Identidade declarada apenas como contexto: "${productName.trim().slice(0, 180)}".` : ''

  return `Edite a fotografia anexada para publicação em marketplace. ${framing}
${identity}

REGRAS INEGOCIÁVEIS:
- NÃO altere o produto, sua geometria, proporções, cor, material, textura ou acabamento.
- NÃO altere, invente, corrija ou traduza marca, logotipo, etiqueta, texto, código ou controle visível.
- NÃO adicione nem remova produto, peça, acessório, embalagem, cabo, porta, botão ou unidade.
- NÃO crie outro ângulo, outro modelo, outra variante nem uma cena de uso inexistente.
- Preserve integralmente quantidade, sinais de uso e conteúdo visível da fotografia original.
- Não adicione texto promocional, selo, borda, marca-d'água ou elemento decorativo.

Retorne exatamente uma imagem 1:1. A única mudança permitida é apresentação fotográfica: fundo, exposição, balanço de branco, nitidez e centralização.`
}

export async function editProductImage(input: EditProductImageInput): Promise<ProductImageEditResult> {
  const apiKey = input.apiKey || process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY ausente para melhoria de imagem.')
  if (!input.source.byteLength) throw new Error('A imagem original está vazia.')

  const models = (input.models?.length ? input.models : modelNamesForProvider('gemini', 'image_generation')).slice(0, 2)
  if (!models.length) throw new Error('Nenhum modelo Gemini de imagem configurado.')
  const startedAt = Date.now()
  const prompt = editPrompt(input.mode, input.productName)
  const promptHash = createHash('sha256').update(prompt).digest('hex')
  const sourceHash = createHash('sha256').update(input.source).digest('hex')
  let lastError = 'falha desconhecida'

  for (let index = 0; index < models.length; index++) {
    const model = models[index]
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
        attempts: index + 1,
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
  throw new Error(`Falha ao melhorar a imagem. Último erro: ${lastError}`)
}
