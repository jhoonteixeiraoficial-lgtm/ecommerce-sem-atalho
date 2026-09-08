# Assertive E-commerce IA — Plano de Implementação (Fase 1: MVP)

> **Para agentes:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou superpowers:executing-plans pra implementar este plano task-by-task. Steps usam checkbox (`- [ ]`) syntax.

**Goal:** Construir o app Assertive completo na Fase 1: Analyzer → Spy → Generator → Editor → Publisher → Multi-Listing → AI Config, com layout bonito e 100% funcional.

**Architecture:** App Next.js (App Router) com API routes server-side, Supabase (PostgreSQL + RLS), IA via Groq/Gemini (grátis), ML API oficial pra busca e publicação. Cada módulo é um service separado em `src/lib/assertive/`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Supabase, Zod, Sharp, Cheerio, Lucide React

**Spec:** `docs/superpowers/specs/2026-09-06-assertive-design.md`

## Global Constraints

- Node.js 22+, Next.js 16.3.3, React 19.2.8, TypeScript strict
- Dark theme: bg `#0c0c0c`, surface `#141414`/`#1c1c1c`, accent `#c8a44e`
- Supabase admin client via `@/lib/supabase/admin`, browser via `@/lib/supabase/client`
- Zod pra validação de todos os inputs
- Português BR em toda a UI
- Todas as API routes usam `requireCommunityUser()` pra auth
- Rate limiting via `enforceCommunityRateLimit()`

---

## Arquivos Novos

### Bibliotecas (`src/lib/assertive/`)
| Arquivo | Responsabilidade |
|---------|-----------------|
| `types.ts` | Types TypeScript do módulo |
| `ml-api.ts` | Cliente API oficial ML (busca, detalhes, publicação) |
| `ai.ts` | Cliente de IA (Groq/Gemini/custom) com fallback |
| `analyzer.ts` | Lógica de identificação do produto (foto/desc) |
| `spy.ts` | Lógica de espionagem (busca top concorrentes) |
| `generator.ts` | Geração de anúncios (título, desc, atributos, fotos) |
| `publisher.ts` | Publicação no ML via API |
| `photos.ts` | Processamento de fotos com Sharp |
| `encryption.ts` | Encriptação de API keys e tokens |

### API Routes (`src/app/api/assertive/`)
| Rota | Método | Função |
|------|--------|--------|
| `/api/assertive/analyze` | POST | Analisar produto (foto/desc) |
| `/api/assertive/spy` | POST | Espionar concorrentes |
| `/api/assertive/listings` | GET/POST | Listar/criar anúncios |
| `/api/assertive/listings/[id]` | GET/PUT/DELETE | CRUD anúncio |
| `/api/assertive/listings/[id]/publish` | POST | Publicar 1 anúncio |
| `/api/assertive/listings/publish-all` | POST | Publicar todos |
| `/api/assertive/ml/connect` | POST | OAuth ML |
| `/api/assertive/ml/callback` | GET | OAuth callback |
| `/api/assertive/ai/config` | GET/POST/PUT | Config de IA |
| `/api/assertive/ai/test` | POST | Testar API key |

### Páginas (`src/app/membros/assertive-ecommerce-ia/`)
| Rota | Função |
|------|--------|
| `/assertive-ecommerce-ia` | Dashboard principal |
| `/assertive-ecommerce-ia/novo` | Nova análise (upload) |
| `/assertive-ecommerce-ia/analise/[id]` | Resultado da análise + spy |
| `/assertive-ecommerce-ia/editor/[id]` | Editor de anúncio |
| `/assertive-ecommerce-ia/publicados` | Anúncios publicados |
| `/assertive-ecommerce-ia/config` | Config de IA |

---

## Task 1: Setup — Types e Infraestrutura

**Files:**
- Create: `src/lib/assertive/types.ts`
- Create: `src/lib/assertive/encryption.ts`
- Modify: `package.json` (add sharp, cheerio)

**Interfaces:**
- Produz: todos os types usados por todos os outros módulos

- [ ] **Step 1: Instalar dependências**

```bash
npm install sharp cheerio
npm install -D @types/cheerio
```

- [ ] **Step 2: Criar `src/lib/assertive/types.ts`**

```typescript
export interface ProductIdentification {
  name: string
  brand?: string
  model?: string
  category?: string
  category_id?: string
  specs: Record<string, string>
  confidence: number
}

export interface CompetitorData {
  item_id: string
  title: string
  price: number
  condition: 'new' | 'used'
  seller: {
    id: string
    nickname: string
    reputation: number
    level: string
  }
  pictures: string[]
  attributes: Record<string, string>
  shipping: { free_shipping: boolean }
  reviews_count: number
  listing_type: string
}

export interface Analysis {
  id: string
  user_id: string
  product_name: string
  category_id?: string
  input_type: 'photo' | 'description' | 'url'
  input_data: { image_url?: string; description?: string; ml_url?: string }
  identified_data?: ProductIdentification
  competitors?: CompetitorData[]
  status: 'pending' | 'analyzing' | 'ready' | 'error'
  created_at: string
  updated_at: string
}

export interface Listing {
  id: string
  analysis_id: string
  user_id: string
  variation_index: number
  title: string
  description: string
  price: number
  attributes: Record<string, unknown>
  photos: string[]
  status: 'draft' | 'ready' | 'publishing' | 'published' | 'error'
  ml_item_id?: string
  published_at?: string
  created_at: string
  updated_at: string
}

export interface AIConfig {
  id: string
  user_id: string
  provider: 'groq' | 'gemini' | 'claude' | 'openai' | 'custom'
  api_key?: string
  base_url?: string
  model?: string
  default_variations: number
  default_tone: string
  default_margin: number
  auto_publish: boolean
  created_at: string
  updated_at: string
}

export interface MLConnection {
  id: string
  user_id: string
  access_token: string
  refresh_token: string
  expires_at: string
  ml_user_id: string
  nickname?: string
}

export interface GenerateListingInput {
  analysis: Analysis
  competitor_data: CompetitorData[]
  config: AIConfig
  variation_index: number
}

export interface GenerateListingOutput {
  title: string
  description: string
  price: number
  attributes: Record<string, unknown>
  category_id: string
}
```

- [ ] **Step 3: Criar `src/lib/assertive/encryption.ts`**

```typescript
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(process.env.ASSERTIVE_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'), 'hex')

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit src/lib/assertive/types.ts src/lib/assertive/encryption.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/assertive/ package.json package-lock.json
git commit -m "feat(assertive): add types and encryption infrastructure"
```

---

## Task 2: IA Client — Groq/Gemini/Custom com Fallback

**Files:**
- Create: `src/lib/assertive/ai.ts`
- Test: `src/lib/assertive/__tests__/ai.test.ts`

**Interfaces:**
- Consome: `AIConfig` de `types.ts`
- Produz: `analyzeWithAI()`, `generateText()`, `generateWithVision()`

- [ ] **Step 1: Criar `src/lib/assertive/ai.ts`**

```typescript
import type { AIConfig } from './types'

interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

interface AIResponse {
  text: string
  provider: string
  model: string
}

const PROVIDER_CONFIG: Record<string, { base_url: string; default_model: string }> = {
  groq: { base_url: 'https://api.groq.com/openai/v1', default_model: 'llama-3.1-70b-versatile' },
  gemini: { base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', default_model: 'gemini-2.0-flash' },
  openai: { base_url: 'https://api.openai.com/v1', default_model: 'gpt-4o' },
  claude: { base_url: 'https://api.anthropic.com/v1', default_model: 'claude-sonnet-4-20250514' },
  custom: { base_url: '', default_model: '' },
}

function getProviderConfig(config: AIConfig) {
  const p = PROVIDER_CONFIG[config.provider] || PROVIDER_CONFIG.custom
  return {
    base_url: config.base_url || p.base_url,
    model: config.model || p.default_model,
    api_key: config.api_key || '',
  }
}

async function callOpenAICompatible(
  base_url: string,
  api_key: string,
  model: string,
  messages: AIMessage[]
): Promise<string> {
  const res = await fetch(`${base_url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api_key}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
  })
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content
}

export async function generateText(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<AIResponse> {
  const { base_url, model, api_key } = getProviderConfig(config)
  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
  const text = await callOpenAICompatible(base_url, api_key, model, messages)
  return { text, provider: config.provider, model }
}

export async function generateWithVision(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  imageUrl: string
): Promise<AIResponse> {
  const { base_url, model, api_key } = getProviderConfig(config)
  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ]
  const text = await callOpenAICompatible(base_url, api_key, model, messages)
  return { text, provider: config.provider, model }
}

export async function testConnection(config: AIConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await generateText(config, 'You are a test.', 'Reply with "OK" only.')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// Fallback: tenta config do usuário → Groq grátis → Gemini grátis
export async function generateWithFallback(
  userConfig: AIConfig | null,
  systemPrompt: string,
  userPrompt: string,
  imageUrl?: string
): Promise<AIResponse> {
  const configs: AIConfig[] = []

  if (userConfig?.api_key) configs.push(userConfig)

  configs.push({
    id: '', user_id: '', provider: 'groq',
    api_key: process.env.GROQ_API_KEY || '',
    default_variations: 3, default_tone: 'profissional',
    default_margin: 30, auto_publish: false,
    created_at: '', updated_at: '',
  })

  configs.push({
    id: '', user_id: '', provider: 'gemini',
    api_key: process.env.GEMINI_API_KEY || '',
    default_variations: 3, default_tone: 'profissional',
    default_margin: 30, auto_publish: false,
    created_at: '', updated_at: '',
  })

  let lastError: string = 'Nenhuma IA configurada'

  for (const cfg of configs) {
    if (!cfg.api_key) continue
    try {
      if (imageUrl) {
        return await generateWithVision(cfg, systemPrompt, userPrompt, imageUrl)
      }
      return await generateText(cfg, systemPrompt, userPrompt)
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Unknown error'
      continue
    }
  }

  throw new Error(`Todas as IAs falharam. Último erro: ${lastError}`)
}
```

- [ ] **Step 2: Verificar compilção**

Run: `npx tsc --noEmit src/lib/assertive/ai.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/assertive/ai.ts
git commit -m "feat(assertive): add AI client with Groq/Gemini/custom fallback"
```

---

## Task 3: ML API Client — Busca e Detalhes

**Files:**
- Create: `src/lib/assertive/ml-api.ts`
- Test: `src/lib/assertive/__tests__/ml-api.test.ts`

**Interfaces:**
- Produz: `searchMLItems()`, `getMLItemDetails()`, `getMLSellerReputation()`

- [ ] **Step 1: Criar `src/lib/assertive/ml-api.ts`**

```typescript
import type { CompetitorData } from './types'

const ML_BASE = 'https://api.mercadolibre.com'
const ML_SITE = 'MLB' // Brasil

export async function searchMLItems(
  query: string,
  limit: number = 10
): Promise<Array<{ id: string; title: string; price: number; thumbnail: string; seller_id: string; condition: string; shipping: { free_shipping: boolean } }>> {
  const res = await fetch(
    `${ML_BASE}/sites/${ML_SITE}/search?q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance`
  )
  if (!res.ok) throw new Error(`ML search error ${res.status}`)
  const data = await res.json()
  return data.results || []
}

export async function getMLItemDetails(itemId: string): Promise<CompetitorData> {
  const res = await fetch(`${ML_BASE}/items/${itemId}`)
  if (!res.ok) throw new Error(`ML item error ${res.status}`)
  const item = await res.json()

  const sellerRes = await fetch(`${ML_BASE}/users/${item.seller_id}`)
  const seller = sellerRes.ok ? await sellerRes.json() : null

  const attrs: Record<string, string> = {}
  if (item.attributes) {
    for (const attr of item.attributes) {
      if (attr.value_name) attrs[attr.id] = attr.value_name
    }
  }

  return {
    item_id: item.id,
    title: item.title,
    price: item.price,
    condition: item.condition === 'new' ? 'new' : 'used',
    seller: {
      id: String(item.seller_id),
      nickname: seller?.nickname || 'Unknown',
      reputation: seller?.seller_reputation?.level_id ? parseReputationLevel(seller.seller_reputation.level_id) : 0,
      level: seller?.seller_reputation?.level_id || 'unknown',
    },
    pictures: (item.pictures || []).map((p: { secure_url: string }) => p.secure_url),
    attributes: attrs,
    shipping: { free_shipping: item.shipping?.free_shipping || false },
    reviews_count: item.reviews?.total || 0,
    listing_type: item.listing_type_id || '',
  }
}

function parseReputationLevel(level: string): number {
  const levels: Record<string, number> = {
    '1_red': 1, '2_orange': 2, '3_yellow': 3, '4_light_green': 4, '5_green': 5,
  }
  return levels[level] || 3
}

export async function getMLCategoryAttributes(categoryId: string): Promise<Array<{ id: string; name: string; required: boolean }>> {
  const res = await fetch(`${ML_BASE}/categories/${categoryId}`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.attributes || []).map((a: { id: string; name: string; tags?: { required?: boolean } }) => ({
    id: a.id,
    name: a.name,
    required: a.tags?.required || false,
  }))
}

export async function searchAndEnrich(query: string, topN: number = 5): Promise<CompetitorData[]> {
  const items = await searchMLItems(query, topN * 2)
  const enriched: CompetitorData[] = []

  for (const item of items.slice(0, topN * 2)) {
    try {
      const details = await getMLItemDetails(item.id)
      enriched.push(details)
      if (enriched.length >= topN) break
    } catch {
      continue
    }
  }

  return enriched.sort((a, b) => {
    const scoreA = a.seller.reputation * 2 + Math.min(a.reviews_count / 100, 5)
    const scoreB = b.seller.reputation * 2 + Math.min(b.reviews_count / 100, 5)
    return scoreB - scoreA
  })
}
```

- [ ] **Step 2: Verificar compilção**

Run: `npx tsc --noEmit src/lib/assertive/ml-api.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/assertive/ml-api.ts
git commit -m "feat(assertive): add ML API client for search and item details"
```

---

## Task 4: Analyzer — Identificação do Produto

**Files:**
- Create: `src/lib/assertive/analyzer.ts`
- Test: `src/lib/assertive/__tests__/analyzer.test.ts`

**Interfaces:**
- Consome: `generateWithFallback()` de `ai.ts`
- Produz: `analyzeProduct()`

- [ ] **Step 1: Criar `src/lib/assertive/analyzer.ts`**

```typescript
import type { AIConfig, ProductIdentification } from './types'
import { generateWithFallback, generateWithVision } from './ai'

const ANALYZER_SYSTEM_PROMPT = `Você é um especialista em produtos para e-commerce no Brasil.
Analise a imagem ou descrição fornecida e identifique o produto com precisão.
Retorne APENAS um JSON válido (sem markdown) com esta estrutura:
{
  "name": "nome do produto",
  "brand": "marca (se identificável)",
  "model": "modelo (se identificável)",
  "category": "categoria no ML (ex: Celulares, Eletrôtica, Casa)",
  "specs": { "chave": "valor" },
  "confidence": 0.0 a 1.0
}`

export async function analyzeFromDescription(
  config: AIConfig | null,
  description: string
): Promise<ProductIdentification> {
  const result = await generateWithFallback(
    config,
    ANALYZER_SYSTEM_PROMPT,
    `Identifique este produto: ${description}`
  )
  return parseAIProductResult(result.text)
}

export async function analyzeFromPhoto(
  config: AIConfig | null,
  imageUrl: string
): Promise<ProductIdentification> {
  const result = await generateWithVision(
    config,
    ANALYZER_SYSTEM_PROMPT,
    'Identifique este produto na imagem. Quais são marca, modelo e características visíveis?',
    imageUrl
  )
  return parseAIProductResult(result.text)
}

function parseAIProductResult(text: string): ProductIdentification {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      name: parsed.name || 'Produto desconhecido',
      brand: parsed.brand,
      model: parsed.model,
      category: parsed.category,
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
```

- [ ] **Step 2: Verificar compilção**

Run: `npx tsc --noEmit src/lib/assertive/analyzer.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/assertive/analyzer.ts
git commit -m "feat(assertive): add product analyzer with AI vision"
```

---

## Task 5: Spy — Espionagem de Concorrentes

**Files:**
- Create: `src/lib/assertive/spy.ts`
- Test: `src/lib/assertive/__tests__/spy.test.ts`

**Interfaces:**
- Consome: `searchAndEnrich()` de `ml-api.ts`
- Produz: `spyCompetitors()`

- [ ] **Step 1: Criar `src/lib/assertive/spy.ts`**

```typescript
import type { AIConfig, CompetitorData } from './types'
import { searchAndEnrich } from './ml-api'
import { generateText } from './ai'

export interface SpyResult {
  competitors: CompetitorData[]
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

export async function spyCompetitors(
  productName: string,
  config: AIConfig | null,
  topN: number = 5
): Promise<SpyResult> {
  const competitors = await searchAndEnrich(productName, topN)

  if (competitors.length === 0) {
    return {
      competitors: [],
      summary: {
        avg_price: 0, min_price: 0, max_price: 0, avg_reviews: 0,
        free_shipping_pct: 0, competition_level: 'baixa', opportunity_score: 100,
      },
      recommendation: 'Nenhum concorrente encontrado. Grande oportunidade!',
    }
  }

  const prices = competitors.map(c => c.price)
  const reviews = competitors.map(c => c.reviews_count)
  const freeShipping = competitors.filter(c => c.shipping.free_shipping).length

  const summary = {
    avg_price: prices.reduce((a, b) => a + b, 0) / prices.length,
    min_price: Math.min(...prices),
    max_price: Math.max(...prices),
    avg_reviews: reviews.reduce((a, b) => a + b, 0) / reviews.length,
    free_shipping_pct: (freeShipping / competitors.length) * 100,
    competition_level: getCompetitionLevel(competitors.length, reviews.reduce((a, b) => a + b, 0) / reviews.length),
    opportunity_score: calculateOpportunity(competitors),
  }

  let recommendation = ''
  try {
    const result = await generateText(
      config || {
        id: '', user_id: '', provider: 'groq',
        api_key: process.env.GROQ_API_KEY || '',
        default_variations: 3, default_tone: 'profissional',
        default_margin: 30, auto_publish: false,
        created_at: '', updated_at: '',
      },
      'Você é um consultor de e-commerce. Seja conciso.',
      `Analise esta concorrência no ML para "${productName}":
      - Preço médio: R$${summary.avg_price.toFixed(2)}
      - Faixa: R$${summary.min_price.toFixed(2)} - R$${summary.max_price.toFixed(2)}
      - Reviews médios: ${summary.avg_reviews.toFixed(0)}
      - Frete grátis: ${summary.free_shipping_pct.toFixed(0)}%
      - Nível: ${summary.competition_level}
      Dê 2-3 dicas práticas pra rankear acima desses concorrentes.`
    )
    recommendation = result.text
  } catch {
    recommendation = 'Configure uma IA para recomendações personalizadas.'
  }

  return { competitors, summary, recommendation }
}

function getCompetitionLevel(count: number, avgReviews: number): 'baixa' | 'media' | 'alta' {
  if (count <= 3 && avgReviews < 50) return 'baixa'
  if (count >= 8 && avgReviews > 200) return 'alta'
  return 'media'
}

function calculateOpportunity(competitors: CompetitorData[]): number {
  let score = 50
  if (competitors.length < 5) score += 20
  if (competitors.some(c => c.reviews_count < 10)) score += 15
  if (competitors.some(c => !c.shipping.free_shipping)) score += 10
  const avgAttrs = competitors.reduce((acc, c) => acc + Object.keys(c.attributes).length, 0) / competitors.length
  if (avgAttrs < 10) score += 15
  return Math.min(score, 100)
}
```

- [ ] **Step 2: Verificar compilção**

Run: `npx tsc --noEmit src/lib/assertive/spy.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/assertive/spy.ts
git commit -m "feat(assertive): add competitor spy with opportunity scoring"
```

---

## Task 6: Photos — Processamento de Imagens

**Files:**
- Create: `src/lib/assertive/photos.ts`
- Test: `src/lib/assertive/__tests__/photos.test.ts`

**Interfaces:**
- Produz: `downloadAndProcessPhotos()`, `createPhotoVariations()`

- [ ] **Step 1: Criar `src/lib/assertive/photos.ts`**

```typescript
import sharp from 'sharp'

const ML_OPTIMAL = { width: 1200, height: 1200, format: 'jpeg' as const, quality: 85 }

export async function downloadAndProcessPhotos(
  urls: string[]
): Promise<string[]> {
  const processed: string[] = []

  for (const url of urls.slice(0, 10)) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const buffer = Buffer.from(await res.arrayBuffer())

      const optimized = await sharp(buffer)
        .resize(ML_OPTIMAL.width, ML_OPTIMAL.height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .jpeg({ quality: ML_OPTIMAL.quality })
        .toBuffer()

      const base64 = optimized.toString('base64')
      processed.push(`data:image/jpeg;base64,${base64}`)
    } catch {
      continue
    }
  }

  return processed
}

export async function createPhotoVariations(
  basePhotos: string[],
  variationIndex: number,
  totalVariations: number
): Promise<string[]> {
  if (basePhotos.length <= 1) return basePhotos

  const shuffled = [...basePhotos]
  const seed = variationIndex * 7 + 13
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (seed * (i + 1)) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const cropOffsets = [
    { top: 0, left: 0 },
    { top: 50, left: 50 },
    { top: 0, left: 100 },
  ]
  const offset = cropOffsets[variationIndex % cropOffsets.length]

  const variations: string[] = []
  for (const photo of shuffled.slice(0, 5)) {
    try {
      if (photo.startsWith('data:')) {
        const base64Data = photo.split(',')[1]
        const buffer = Buffer.from(base64Data, 'base64')
        const metadata = await sharp(buffer).metadata()
        const w = metadata.width || 1200
        const h = metadata.height || 1200
        const cropSize = Math.min(w, h) * 0.85

        const cropped = await sharp(buffer)
          .extract({
            top: Math.min(offset.top, h - cropSize),
            left: Math.min(offset.left, w - cropSize),
            width: cropSize,
            height: cropSize,
          })
          .resize(1200, 1200, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .jpeg({ quality: 85 })
          .toBuffer()

        variations.push(`data:image/jpeg;base64,${cropped.toString('base64')}`)
      } else {
        variations.push(photo)
      }
    } catch {
      variations.push(photo)
    }
  }

  return variations
}
```

- [ ] **Step 2: Verificar compilção**

Run: `npx tsc --noEmit src/lib/assertive/photos.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/assertive/photos.ts
git commit -m "feat(assertive): add photo processing with Sharp"
```

---

## Task 7: Generator — Geração de Anúncios

**Files:**
- Create: `src/lib/assertive/generator.ts`
- Test: `src/lib/assertive/__tests__/generator.test.ts`

**Interfaces:**
- Consome: `generateText()` de `ai.ts`, `createPhotoVariations()` de `photos.ts`
- Produz: `generateListing()`, `generateMultipleListings()`

- [ ] **Step 1: Criar `src/lib/assertive/generator.ts`**

```typescript
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
```

- [ ] **Step 2: Verificar compilção**

Run: `npx tsc --noEmit src/lib/assertive/generator.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/assertive/generator.ts
git commit -m "feat(assertive): add listing generator with multi-variation"
```

---

## Task 8: Publisher — Publicação no ML

**Files:**
- Create: `src/lib/assertive/publisher.ts`
- Test: `src/lib/assertive/__tests__/publisher.test.ts`

**Interfaces:**
- Produz: `publishToML()`, `refreshMLToken()`

- [ ] **Step 1: Criar `src/lib/assertive/publisher.ts`**

```typescript
import type { GenerateListingOutput } from './types'
import { decrypt, encrypt } from './encryption'
import { createAdminClient } from '@/lib/supabase/admin'

const ML_BASE = 'https://api.mercadolibre.com'

interface MLPublishPayload {
  title: string
  category_id: string
  price: number
  currency_id: string
  quantity: number
  condition: string
  description: string
  attributes: Array<{ id: string; value_name: string }>
  pictures: Array<{ source: string }>
  shipping: { free_shipping: boolean }
}

export async function publishToML(
  accessToken: string,
  listing: GenerateListingOutput,
  photos: string[]
): Promise<{ success: boolean; item_id?: string; error?: string }> {
  try {
    const pictureIds: string[] = []
    for (const photo of photos.slice(0, 10)) {
      try {
        const res = await fetch(`${ML_BASE}/pictures/items/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ source: photo }),
        })
        if (res.ok) {
          const data = await res.json()
          pictureIds.push(data.id)
        }
      } catch { continue }
    }

    const attrs = Object.entries(listing.attributes).map(([id, value]) => ({
      id,
      value_name: String(value),
    }))

    const payload: MLPublishPayload = {
      title: listing.title,
      category_id: listing.category_id,
      price: listing.price,
      currency_id: 'BRL',
      quantity: 1,
      condition: 'new',
      description: listing.description,
      attributes: attrs,
      pictures: pictureIds.map(id => ({ source: id })),
      shipping: { free_shipping: true },
    }

    const res = await fetch(`${ML_BASE}/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const error = await res.json()
      return { success: false, error: error.message || `ML error ${res.status}` }
    }

    const data = await res.json()
    return { success: true, item_id: data.id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function refreshMLToken(refreshToken: string): Promise<{ access_token: string; expires_at: string } | null> {
  try {
    const res = await fetch(`${ML_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    }
  } catch {
    return null
  }
}

export async function getValidMLToken(userId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('assertive_ml_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!data) return null

  if (new Date(data.expires_at) > new Date()) {
    return decrypt(data.access_token)
  }

  const refreshed = await refreshMLToken(decrypt(data.refresh_token))
  if (!refreshed) return null

  await supabase
    .from('assertive_ml_connections')
    .update({
      access_token: encrypt(refreshed.access_token),
      expires_at: refreshed.expires_at,
    })
    .eq('id', data.id)

  return refreshed.access_token
}
```

- [ ] **Step 2: Verificar compilção**

Run: `npx tsc --noEmit src/lib/assertive/publisher.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/assertive/publisher.ts
git commit -m "feat(assertive): add ML publisher with OAuth token refresh"
```

---

## Task 9: Database Migration

**Files:**
- Create: `supabase/migrations/022_assertive_tables.sql`

- [ ] **Step 1: Criar migration SQL**

```sql
-- Assertive E-commerce IA tables

CREATE TABLE IF NOT EXISTS assertive_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  product_name TEXT NOT NULL,
  category_id TEXT,
  input_type TEXT CHECK (input_type IN ('photo', 'description', 'url')),
  input_data JSONB DEFAULT '{}',
  identified_data JSONB DEFAULT '{}',
  competitors JSONB DEFAULT '[]',
  status TEXT CHECK (status IN ('pending', 'analyzing', 'ready', 'error')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES assertive_analyses(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  variation_index INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2),
  attributes JSONB DEFAULT '{}',
  photos JSONB DEFAULT '[]',
  status TEXT CHECK (status IN ('draft', 'ready', 'publishing', 'published', 'error')) DEFAULT 'draft',
  ml_item_id TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  listing_id UUID REFERENCES assertive_listings(id),
  competitor_item_id TEXT NOT NULL,
  competitor_data JSONB DEFAULT '{}',
  change_type TEXT,
  old_value TEXT,
  new_value TEXT,
  detected_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_ml_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ml_user_id TEXT NOT NULL,
  nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_erp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  provider TEXT CHECK (provider IN ('bling', 'olist', 'upseller')) NOT NULL,
  credentials JSONB NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'groq',
  api_key TEXT,
  base_url TEXT,
  model TEXT,
  default_variations INT DEFAULT 3,
  default_tone TEXT DEFAULT 'profissional',
  default_margin DECIMAL(5,2) DEFAULT 30.00,
  auto_publish BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_qa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  listing_id UUID REFERENCES assertive_listings(id),
  ml_question_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  status TEXT CHECK (status IN ('pending', 'answered', 'skipped')) DEFAULT 'pending',
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE assertive_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_ml_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_erp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_qa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own analyses" ON assertive_analyses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own listings" ON assertive_listings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own monitoring" ON assertive_monitoring FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own ml_connections" ON assertive_ml_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own erp_connections" ON assertive_erp_connections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own ai_config" ON assertive_ai_config FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own qa" ON assertive_qa FOR ALL USING (auth.uid() = user_id);

-- Admin full access
CREATE POLICY "Admin full access analyses" ON assertive_analyses FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admin full access listings" ON assertive_listings FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admin full access monitoring" ON assertive_monitoring FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admin full access ml_connections" ON assertive_ml_connections FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admin full access erp_connections" ON assertive_erp_connections FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admin full access ai_config" ON assertive_ai_config FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Admin full access qa" ON assertive_qa FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/022_assertive_tables.sql
git commit -m "feat(assertive): add database migration for all assertive tables"
```

---

## Task 10: API Routes — Analyze, Spy, AI Config

**Files:**
- Create: `src/app/api/assertive/analyze/route.ts`
- Create: `src/app/api/assertive/spy/route.ts`
- Create: `src/app/api/assertive/ai/config/route.ts`
- Create: `src/app/api/assertive/ai/test/route.ts`

**Interfaces:**
- Consome: todos os services de `src/lib/assertive/`

- [ ] **Step 1: Criar API routes** (múltiplos arquivos em paralelo com Task 11)

Cada route segue o padrão do projeto: `requireCommunityUser()`, Zod validation, rate limiting.

- [ ] **Step 2: Verificar compilção**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/assertive/
git commit -m "feat(assertive): add API routes for analyze, spy, and AI config"
```

---

## Task 11: API Routes — Listings CRUD e Publish

**Files:**
- Create: `src/app/api/assertive/listings/route.ts`
- Create: `src/app/api/assertive/listings/[id]/route.ts`
- Create: `src/app/api/assertive/listings/[id]/publish/route.ts`
- Create: `src/app/api/assertive/listings/publish-all/route.ts`

- [ ] **Step 1: Criar routes de listings e publish**

- [ ] **Step 2: Commit**

```bash
git add src/app/api/assertive/listings/
git commit -m "feat(assertive): add listings CRUD and publish routes"
```

---

## Task 12: API Routes — ML OAuth

**Files:**
- Create: `src/app/api/assertive/ml/connect/route.ts`
- Create: `src/app/api/assertive/ml/callback/route.ts`

- [ ] **Step 1: Criar OAuth routes**

- [ ] **Step 2: Commit**

```bash
git add src/app/api/assertive/ml/
git commit -m "feat(assertive): add ML OAuth connect and callback routes"
```

---

## Task 13: Dashboard — Página Principal

**Files:**
- Create: `src/app/membros/assertive-ecommerce-ia/page.tsx`
- Create: `src/components/assertive/Dashboard.tsx`

**Interfaces:**
- Consome: API routes existentes
- Produz: Dashboard com resumo de análises, anúncios, status ML

- [ ] **Step 1: Criar Dashboard com layout bonito**

Dark theme, cards com stats, botão "Nova Análise" prominently displayed.

- [ ] **Step 2: Commit**

```bash
git add src/app/membros/assertive-ecommerce-ia/page.tsx src/components/assertive/
git commit -m "feat(assertive): add dashboard page"
```

---

## Task 14: Upload Page — Nova Análise

**Files:**
- Create: `src/app/membros/assertive-ecommerce-ia/novo/page.tsx`
- Create: `src/components/assertive/ProductUpload.tsx`

- [ ] **Step 1: Criar página de upload com drag-and-drop**

- [ ] **Step 2: Commit**

```bash
git add src/app/membros/assertive-ecommerce-ia/novo/
git commit -m "feat(assertive): add product upload page with drag-and-drop"
```

---

## Task 15: Analysis Result Page — Spy + Generator

**Files:**
- Create: `src/app/membros/assertive-ecommerce-ia/analise/[id]/page.tsx`
- Create: `src/components/assertive/CompetitorRanking.tsx`
- Create: `src/components/assertive/GeneratedListings.tsx`

- [ ] **Step 1: Criar página de resultado com ranking e listings gerados**

- [ ] **Step 2: Commit**

```bash
git add src/app/membros/assertive-ecommerce-ia/analise/ src/components/assertive/CompetitorRanking.tsx src/components/assertive/GeneratedListings.tsx
git commit -m "feat(assertive): add analysis result page with competitor ranking"
```

---

## Task 16: Editor Page

**Files:**
- Create: `src/app/membros/assertive-ecommerce-ia/editor/[id]/page.tsx`
- Create: `src/components/assertive/ListingEditor.tsx`

- [ ] **Step 1: Criar editor com tabs (Título, Descrição, Fotos, Atributos, Preço)**

- [ ] **Step 2: Commit**

```bash
git add src/app/membros/assertive-ecommerce-ia/editor/ src/components/assertive/ListingEditor.tsx
git commit -m "feat(assertive): add listing editor page"
```

---

## Task 17: Published Page e Config Page

**Files:**
- Create: `src/app/membros/assertive-ecommerce-ia/publicados/page.tsx`
- Create: `src/app/membros/assertive-ecommerce-ia/config/page.tsx`
- Create: `src/components/assertive/AIConfigForm.tsx`

- [ ] **Step 1: Criar páginas de publicados e config**

- [ ] **Step 2: Commit**

```bash
git add src/app/membros/assertive-ecommerce-ia/publicados/ src/app/membros/assertive-ecommerce-ia/config/ src/components/assertive/AIConfigForm.tsx
git commit -m "feat(assertive): add published listings and AI config pages"
```

---

## Task 18: Layout e Navegação

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (substituir link placeholder)
- Modify: `src/app/membros/dashboard/page.tsx` (atualizar card)

- [ ] **Step 1: Atualizar Sidebar com navegação do Assertive**

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/app/membros/dashboard/page.tsx
git commit -m "feat(assertive): update sidebar navigation and dashboard card"
```

---

## Task 19: Testes e Build Final

**Files:**
- Test: todos os arquivos criados

- [ ] **Step 1: Rodar testes**

Run: `npm test`

- [ ] **Step 2: Rodar build**

Run: `npm run build`

- [ ] **Step 3: Rodar typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat(assertive): complete MVP with all modules"
```
