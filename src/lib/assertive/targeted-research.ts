import type { AIConfig } from './types'
import type { ProductTruth } from './truth'
import type { ClassifiedAttribute } from './taxonomy'
import type { EnrichedAttribute } from './enrichment'
import { runTaskJson } from './ai-router'
import { searchWeb } from './websearch'

interface TargetedResult {
  attribute_id: string
  value?: string
  source: string
  evidence?: string
  source_url?: string
}

/**
 * Pesquisa atributo ESPECÍFICO que continuou faltando depois do autofill geral.
 * Não depende da pesquisa genérica — foca no atributo individual.
 */
export async function targetedAttributeResearch(
  config: AIConfig | null,
  truth: ProductTruth,
  attributeSpec: ClassifiedAttribute,
  exactProductAttributes: Array<{ title: string; attributes: Record<string, string> }>
): Promise<TargetedResult | null> {
  if (!config) return null

  const brand = truth.fields.brand?.value || ''
  const model = truth.fields.model?.value || ''
  const productName = truth.name || ''

  const queries = buildTargetedQueries(productName, brand, model, attributeSpec)

  for (const query of queries) {
    try {
      const search = await searchWeb(query)
      if (!search.available || !search.sources.length) continue

      const sourcesBlock = search.sources
        .map((s, i) => `[${i + 1}] ${s.title || s.url}\nURL: ${s.url}\n${s.snippet}`)
        .join('\n\n')

      const extracted = await runTaskJson<{ value?: string; not_applicable?: boolean; evidence?: string }>(
        'attribute_enrichment',
        config,
        `Você é um pesquisador técnico. Extraia o valor EXATO do atributo "${attributeSpec.name}" para o produto especificado.

REGRAS:
1. Só afirme o valor se estiver EXPLÍCITO na fonte fornecida.
2. Se as fontes falam de outro produto (marca/modelo diferente), responda {"not_applicable": true}.
3. Se o atributo não se aplica a este tipo de produto, responda {"not_applicable": true}.
4. Se não encontrou, responda {}.
5. Nunca invente.
6. ${attributeSpec.value_type === 'number_unit' ? `O valor DEVE incluir a unidade (ex: "${attributeSpec.allowed_units?.[0]?.id || 'unidade'}").` : ''}
7. ${attributeSpec.values?.length ? `Valores permitidos: ${attributeSpec.values.map(v => v.name).join(', ')}` : ''}

Responda SOMENTE JSON: {"value": "...", "evidence": "trecho da fonte"}`,
        `PRODUTO: ${productName}
Marca: ${brand}
Modelo: ${model}

ATRIBUTO: ${attributeSpec.name} (${attributeSpec.id})
Tipo: ${attributeSpec.value_type}

FONTES:
${sourcesBlock.slice(0, 4000)}`,
        { maxTokens: 800 }
      )

      if (extracted.not_applicable) {
        return { attribute_id: attributeSpec.id, source: 'web', evidence: 'Não aplicável ao produto' }
      }

      if (extracted.value) {
        return {
          attribute_id: attributeSpec.id,
          value: extracted.value,
          source: 'web',
          evidence: extracted.evidence,
          source_url: search.sources[0]?.url,
        }
      }
    } catch {
      continue
    }
  }

  return null
}

function buildTargetedQueries(
  productName: string,
  brand: string,
  model: string,
  spec: ClassifiedAttribute
): string[] {
  const queries: string[] = []
  const attrName = spec.name
  const base = `"${brand}" "${model}" ${attrName}`.trim()

  queries.push(base)

  if (brand && model) {
    queries.push(`${brand} ${model} ${attrName} ficha técnica`)
    queries.push(`${brand} ${model} ${attrName} especificações`)
  }

  if (productName) {
    queries.push(`${productName} ${attrName}`)
    queries.push(`${productName} ${attrName} manual`)
  }

  return queries
}
