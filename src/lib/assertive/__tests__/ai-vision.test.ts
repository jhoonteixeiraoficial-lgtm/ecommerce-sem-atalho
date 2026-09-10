import { afterEach, describe, expect, it, vi } from 'vitest'
import { generate, toDataUri } from '../ai'
import { runVisionBatches } from '../ai-router'
import type { AIConfig } from '../types'

const config = {
  provider: 'gemini',
  api_key: 'test-key',
  model: 'gemini-3.1-pro-preview',
} as AIConfig

describe('multimodal transport', () => {
  afterEach(() => vi.restoreAllMocks())

  it('envia partes de imagem reais junto do texto', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await generate(config, 'system', 'compare os anexos', {
      images: ['data:image/jpeg;base64,YQ==', 'data:image/png;base64,Yg=='],
      json: true,
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    const content = body.messages[1].content
    expect(content.filter((part: { type: string }) => part.type === 'image_url')).toHaveLength(2)
    expect(content[0]).toEqual({ type: 'text', text: 'compare os anexos' })
  })

  it('processa oito imagens em lotes estáveis sem truncar', async () => {
    const images = Array.from({ length: 8 }, (_, index) => `image-${index}`)
    const seen: string[][] = []
    const result = await runVisionBatches({
      images,
      batchSize: 4,
      execute: async batch => {
        seen.push(batch)
        return batch.length
      },
    })

    expect(seen).toEqual([images.slice(0, 4), images.slice(4, 8)])
    expect(result).toEqual([4, 4])
  })

  it('rejeita data URI que não representa formato de imagem aceito', async () => {
    await expect(toDataUri('data:text/html;base64,PGgxPm9pPC9oMT4='))
      .rejects.toThrow('Data URI de imagem inválida')
  })
})
