# Assertive E-commerce IA — Design Spec

> **Data:** 2026-09-06
> **Status:** Draft — aguardando revisão do usuário
> **Versão:** 1.0

---

## 1. Visão Geral

O **Assertive** é um aplicativo web dentro da plataforma ESA que permite ao usuário, com uma única foto ou descrição, gerar anúncios otimizados para o Mercado Livre — superior aos top vendedores — e publicá-los automaticamente. O app opera de forma **100% automatizada**: o membro apenas loga, envia o produto, e a IA faz todo o resto.

### Público-alvo
- Usuários com plano **acertive** ou **combo** ativo
- Vendedores no Mercado Livre que querem dominar buscas

### Proposta de valor
"Em 2 minutos, crie anúncios melhores que os top 5 vendedores do ML — e publique direto da sua conta."

---

## 2. Arquitetura de Módulos

```
┌─────────────────────────────────────────────────────┐
│                    ASSERTIVE                         │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ ANALYZER │→ │   SPY    │→ │GENERATOR │         │
│  │  (foto/  │  │ (busca ML│  │(IA cria  │         │
│  │  desc)   │  │  top 5)  │  │ anuncio) │         │
│  └──────────┘  └──────────┘  └────┬─────┘         │
│                                    ↓                │
│                              ┌──────────┐           │
│                              │ EDITOR   │           │
│                              │(usuario  │           │
│                              │ revisa)  │           │
│                              └────┬─────┘           │
│                                    ↓                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │MONITOR   │  │ REPRICER │  │PUBLISHER │         │
│  │(vigia    │  │(ajusta   │  │(publica  │         │
│  │concurr.) │  │preco)    │  │no ML)    │         │
│  └──────────┘  └──────────┘  └──────────┘         │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ANALYTICS │  │AUTO-RESP │  │ MULTI-   │         │
│  │(dashb.)  │  │(perguntas│  │ LISTING  │         │
│  │          │  │ 24h IA)  │  │(N anunc.)│         │
│  └──────────┘  └──────────┘  └──────────┘         │
│                                                     │
│  ┌──────────────────────────────────────┐           │
│  │          INTEGRAÇÕES                 │           │
│  │  ML OAuth · Bling · Olist · Upseller │           │
│  └──────────────────────────────────────┘           │
└─────────────────────────────────────────────────────┘
```

---

## 3. Módulo: Analyzer (Entrada)

### Responsabilidade
Receber input do usuário e identificar o produto.

### Input aceito
- **Foto** (upload de imagem do produto)
- **Descrição textual** (nome do produto, modelo, etc.)
- **URL do anúncio ML** (scraping do anúncio existente)

### Fluxo
1. Usuário envia foto ou digita descrição
2. IA de visão (Groq Vision / Gemini Flash Vision) analisa e extrai:
   - Nome do produto
   - Categoria ML provável
   - Marca e modelo
   - Características visíveis (cor, material, tamanho)
3. Sistema confirma com usuário: "Identificamos: [produto]. Está correto?"
4. Busca automática de categorias ML compatíveis

### IA utilizada
- **Groq** (Llama 3.2 Vision) — gratuito, rápido
- **Gemini Flash Vision** — gratuito, fallback

### Interface
- Tela de upload com drag-and-drop
- Preview da imagem enviada
- Card de confirmação com dados identificados
- Botão "Confirmar e Espionar"

---

## 4. Módulo: Spy (Espionagem)

### Responsabilidade
Buscar e coletar dados dos top anúncios do produto no ML.

### Fonte de dados
- **Primária:** API oficial do Mercado Livre (`GET /sites/MLB/search?q=...`)
- **Complementar:** Scraping das páginas de resultado (Puppeteer/Cheerio) pra dados que a API não retorna
- **Enriquecimento:** API de terceiros opcional (Parse.bot) pra dados de销量

### Dados coletados por concorrente
| Campo | Fonte |
|-------|-------|
| Título | API ML |
| Descrição | API ML (endpoint item) |
| Preço | API ML |
| Fotos (todas) | API ML (array de pictures) |
| Reputação do vendedor | API ML (seller ID → reputation) |
| Quantidade de reviews | API ML |
| Atributos preenchidos | API ML |
| Frete grátis | API ML |
| Condição (novo/usado) | API ML |
| Data de criação | API ML |

### Critérios de ranking (top 5)
1. Reputação do vendedor (atinum/gold)
2. Quantidade de reviews
3. Preço competitivo
4. Quantidade de fotos (mais fotos = mais confiança)
5. Descrição completa (proporção de campos preenchidos)

### Interface
- Ranking visual: "Top 5 Vendedores" com cards
- Cada card mostra: foto principal, título, preço, reputação (estrelas), % de campos preenchidos
- Botão "Ver detalhes" expande com: todas as fotos, descrição completa, atributos
- Resumo: "Concorrência média: 65% otimizada. Sua oportunidade: ALTA"

---

## 5. Módulo: Generator (Criação)

### Responsabilidade
Gerar um anúncio **superior** aos top 5 concorrentes, preenchendo 100% dos campos.

### O que a IA gera

#### 5.1 Título (até 60 caracteres)
- SEO ML: palavras-chave relevantes no início
- Formato: `[Produto] [Marca] [Modelo] [Diferencial] [Atributo]`
- Exemplo: "Capa iPhone 15 Pro Max Silicone Premium Anti-Impacto"
- Gera 3-5 variações pro usuário escolher

#### 5.2 Descrição
- Estrutura persuasiva:gancho → benefícios → especificações → garantia → CTA
- Include todas as palavras-chave relevantes
- Tom profissional mas acessível
- HTML formatado (ML aceita HTML na descrição)

#### 5.3 Atributos (100% preenchidos)
- Consulta schema da categoria ML pra saber todos os campos
- Preenche NCM, CFOP, peso, dimensões
- Preenche variações (cores, tamanhos, modelos)
- Preenche atributos ocultos (compatibilidade, material, etc.)
- Preenche garantia e tipo de garantia

#### 5.4 Fotos
- Baixa todas as fotos do top vendedor
- Melhora com Sharp: resize pra resolução ideal ML, otimiza compressão
- Gera variações de crop/foco pra cada listing diferente
- Não altera o conteúdo visual (direitos autorais), apenas qualidade técnica

#### 5.5 Preço
- Analisa faixa de preços dos top 5
- Sugere preço competitivo com margem configurável
- Mostra: "Faixa: R$89-R$150 | Preço sugerido: R$119,90"

#### 5.6 Multi-Listing (variações anti-bloqueio)
- Gera N anúncios do mesmo produto (máx. 10 por padrão)
- Cada anúncio tem:
  - Título diferente (paráfrases da IA)
  - Descrição reescrita (mesma informação, estrutura diferente)
  - Fotos diferentes (crops/ordens diferentes das mesmas imagens)
  - Atributos ligeiramente variados

### IA utilizada
- **Texto:** Groq (Llama 3.1 70B) — gratuito
- **Fallback premium:** Campo pra usuário inserir API key Claude/OpenAI
- **Fotos:** Sharp (gratuito, processamento local)

### Interface
- Editor WYSIWYG simplificado
- Tabs: Título | Descrição | Fotos | Atributos | Preço
- Toggle "Modo Multi-Anúncio" com slider (1-10 anúncios)
- Preview de cada variação antes de publicar
- Botão "Publicar Todos" ou "Publicar Selecionados"

---

## 6. Módulo: Editor (Revisão)

### Responsabilidade
Permitir que o usuário revise e edite tudo antes de publicar.

### Funcionalidades
- Editar título (com contador de caracteres ML)
- Editar descrição (com preview HTML)
- Remover/adicionar fotos
- Editar preço
- Editar atributos individualmente
- Reordenar fotos
- Comparar lado a lado com concorrentes
- Histórico de versões (undo/redo)

---

## 7. Módulo: Publisher (Publicação)

### Responsabilidade
Publicar anúncios no ML via API oficial.

### Integração ML
- **Auth:** OAuth 2.0 (usuário autoriza a app)
- **Escopo:** `read write` (busca + publicação)
- **Endpoint:** `POST /items` (criar anúncio)
- **Upload de fotos:** `POST /items/$ID/pictures`

### Fluxo
1. Usuário conecta conta ML (botão "Conectar Minha Conta ML")
2. Redirect OAuth → autorização → callback
3. App armazena access_token (encriptado, Supabase)
4. Ao publicar: monta payload JSON conforme schema ML
5. Envia pra API ML
6. Retorna link do anúncio publicado
7. Armazena ID do anúncio pra monitoramento

### Multi-Listing
- Publica N anúncios em sequência (com delay entre cada um pra evitar rate limit)
- Delay aleatório: 30-90 segundos entre publicações
- Mostra progresso: "Publicando 3/10..."

### Retry
- Se falhar, retry automático 3x com backoff exponencial
- Se ML retornar erro de duplicação, regenera variação automaticamente

---

## 8. Módulo: Monitor (Vigilância)

### Responsabilidade
Vigiar os anúncios do usuário e dos concorrentes.

### O que monitora
- **Anúncios do usuário:** visualizações, vendas, posição na busca
- **Concorrentes:** mudanças de preço, título, fotos
- **Alertas:** "Concorrente X baixou preço em 15%", "Seu anúncio caiu da página 1"

### Frequência
- Verificação a cada 6 horas (Supabase cron)
- Alertas em tempo real no dashboard

### Interface
- Timeline de eventos
- Notificações push (futuro)
- Resumo semanal por e-mail

---

## 9. Módulo: Repricer (Reajuste Automático)

### Responsabilidade
Sugerir ou aplicar ajustes de preço automaticamente.

### Lógica
- Meta do usuário: "ser o mais barato", "manter margem de 30%", "top 3 preço"
- Calcula preço ideal baseado nos concorrentes atuais
- Aplica ajuste automático (se configurado) ou sugere (se manual)

### Interface
- Configuração de regra: "Manter preço entre X% abaixo do menor concorrente"
- Toggle "Auto-Repricing" ligado/desligado
- Histórico de ajustes

---

## 10. Módulo: Multi-Listing Engine

### Responsabilidade
Gerar múltiplos anúncios únicos do mesmo produto.

### Regras anti-bloqueio
1. **Título:** cada anúncio tem título diferente (mínimo 40% diferente)
2. **Descrição:** reescrita completa (mesma informação, estrutura e palavras diferentes)
3. **Fotos:** mesma base, mas crops/ordens diferentes
4. **Atributos:** variações sutis (ex: "Material: Silicone" vs "Material: TPU")
5. **Timing:** publicação espaçada (30-90s entre cada)
6. **Preço:** pode variar ligeiramente (±5%)

### Limites configuráveis
- Máximo de anúncios por produto: 1-10 (padrão: 5)
- Intervalo entre publicações: 30-180 segundos
- Diferença mínima de título: 40%

---

## 11. Módulo: Auto-Responder

### Responsabilidade
Responder automaticamente perguntas dos compradores no ML.

### Funcionalidade
- Recebe webhook de perguntas do ML
- IA gera resposta contextualizada (sobre o produto, prazo de entrega, etc.)
- Publica resposta via API ML
- Log de todas as respostas pra auditoria

### Limites
- Resposta em até 5 minutos
- Tom: profissional, amigável
- Não responde off-topic (redireciona pro suporte)

---

## 12. Módulo: Analytics Dashboard

### Responsabilidade
Mostrar performance dos anúncios do usuário.

### Métricas
- Visualizações totais
- Cliques / Taxa de cliques (CTR)
- Vendas estimadas
- Posição média na busca
- Comparativo com concorrentes
- ROI estimado

### Interface
- Gráficos de tendência (7d, 30d, 90d)
- Ranking dos anúncios do usuário
- Tabela de concorrentes com mudanças

---

## 13. Integrações ERP

### O padrão (cada ERP é um adapter):

#### Bling
- API REST v3 (OAuth 2.0)
- Sincroniza: produtos, estoque, preços
- Endpoint: `GET /produtos`, `GET /estoques`

#### Olist
- API REST (token)
- Sincroniza: pedidos, estoque, preços
- Endpoint: `GET /products`, `GET /stock`

#### Upseller
- API REST (key)
- Sincroniza: pedidos, catálogo
- Endpoint: similar

### Fluxo
1. Usuário vai em "Integrações"
2. Seleciona ERP (Bling/Olist/Upseller)
3. Insere API key / autoriza OAuth
4. App sincroniza catálogo de produtos
5. Quando anúncio é publicado, estoque é atualizado automaticamente

---

## 14. Modelo de IA — Estratégia

### Configuração Única (configure uma vez, usa pra sempre)

O usuário configura **uma única vez** na página de configurações:
- Seleciona provedor (Groq grátis, Gemini grátis, ou "Personalizado")
- Se personalizado: insere API key, URL base, modelo
- Define preferências padrão: tom, variações, margem
- Salva → a partir de agora, toda geração usa essas configurações automaticamente

**Não precisa cadastrar nada a cada solicitação.** O app sempre usa a config salva.

### Hierarquia de fallback

```
1. Config salva do usuário (groq/gemini/custom)
   ↓ não existe config
2. Groq (grátis) → fallback automático
   ↓ rate limit
3. Gemini Flash (grátis)
   ↓ falhou
4. Mensagem: "Configure sua IA em Configurações"
```

### Limites do free tier
| Provider | Free Tier | Rate Limit |
|----------|-----------|------------|
| Groq | 14,400 req/dia | 30 req/min |
| Gemini Flash | 1,500 req/dia | 15 req/min |

### Cálculo de uso
- 1 análise (Spy) = ~5 req (busca + detalhes de 5 concorrentes)
- 1 geração (Generator) = ~3 req (título + descrição + atributos)
- 1 anúncio completo = ~8 req
- 10 multi-listings = ~50 req
- **Free tier sustenta ~200 análises/dia** — mais que suficiente

---

## 15. Modelo de Dados (Supabase)

### Tabelas

```sql
-- Análises do usuário
CREATE TABLE assertive_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  product_name TEXT NOT NULL,
  category_id TEXT, -- ML category
  input_type TEXT CHECK (input_type IN ('photo', 'description', 'url')),
  input_data JSONB, -- { image_url, description, ml_url }
  identified_data JSONB, -- { name, brand, model, category, specs }
  competitors JSONB, -- array de top 5 com todos os dados
  status TEXT CHECK (status IN ('pending', 'analyzing', 'ready', 'error')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Anúncios gerados
CREATE TABLE assertive_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES assertive_analyses(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  variation_index INT NOT NULL, -- 0, 1, 2... (multi-listing)
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10,2),
  attributes JSONB, -- todos os campos ML
  photos JSONB, -- array de URLs processadas
  status TEXT CHECK (status IN ('draft', 'ready', 'publishing', 'published', 'error')),
  ml_item_id TEXT, -- ID no ML após publicar
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Monitoramento de concorrentes
CREATE TABLE assertive_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  listing_id UUID REFERENCES assertive_listings(id),
  competitor_item_id TEXT NOT NULL,
  competitor_data JSONB,
  change_type TEXT, -- 'price', 'title', 'description'
  old_value TEXT,
  new_value TEXT,
  detected_at TIMESTAMPTZ DEFAULT now()
);

-- Integrações ML
CREATE TABLE assertive_ml_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  access_token TEXT NOT NULL, -- encriptado
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ml_user_id TEXT NOT NULL,
  nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Integrações ERP
CREATE TABLE assertive_erp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  provider TEXT CHECK (provider IN ('bling', 'olist', 'upseller')) NOT NULL,
  credentials JSONB NOT NULL, -- encriptado
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Configuração de IA do usuário (pre-configurada, usa sempre)
CREATE TABLE assertive_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL UNIQUE,
  -- Provedor: groq/gemini = free tier; claude/openai/custom = API key do usuário
  provider TEXT NOT NULL DEFAULT 'groq',
  api_key TEXT, -- encriptado, null = usar free tier
  base_url TEXT, -- ex: https://api.anthropic.com — null = default do provider
  model TEXT, -- ex: claude-sonnet-4-20250514, gpt-4o, llama-3.1-70b-versatile
  -- Config de geração (preference do usuário)
  default_variations INT DEFAULT 3, -- quantos anúncios gerar por padrão
  default_tone TEXT DEFAULT 'profissional', -- profissional/casual/persuasivo
  default_margin DECIMAL(5,2) DEFAULT 30.00, -- margem %
  auto_publish BOOLEAN DEFAULT false, -- publicar direto sem revisar?
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Perguntas e respostas (auto-responder)
CREATE TABLE assertive_qa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  listing_id UUID REFERENCES assertive_listings(id),
  ml_question_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  status TEXT CHECK (status IN ('pending', 'answered', 'skipped')),
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### RLS Policies
- Todas as tabelas: user só vê seus próprios dados
- Admin: acesso total
- Service role (API routes): acesso total via admin client

---

## 16. Rotas da API

```
POST   /api/assertive/analyze              -- Analisar produto (foto/desc)
GET    /api/assertive/analyses             -- Listar análises do usuário
GET    /api/assertive/analyses/[id]        -- Detalhe da análise
POST   /api/assertive/spy                  -- Espionar concorrentes
GET    /api/assertive/listings             -- Listar anúncios gerados
POST   /api/assertive/listings             -- Criar anúncio (generator)
PUT    /api/assertive/listings/[id]        -- Editar anúncio
DELETE /api/assertive/listings/[id]        -- Deletar anúncio
POST   /api/assertive/listings/[id]/publish -- Publicar no ML
POST   /api/assertive/listings/publish-all -- Publicar todos de uma análise
GET    /api/assertive/monitor              -- Eventos de monitoramento
GET    /api/assertive/analytics            -- Dados de performance
POST   /api/assertive/ml/connect           -- Conectar conta ML (OAuth)
GET    /api/assertive/ml/callback          -- OAuth callback
POST   /api/assertive/erp/connect          -- Conectar ERP
GET    /api/assertive/ai/config            -- Buscar config de IA (já salva)
POST   /api/assertive/ai/config            -- Criar config de IA
PUT    /api/assertive/ai/config            -- Atualizar config de IA
POST   /api/assertive/ai/test             -- Testar conexão com IA (validar key)
POST   /api/assertive/auto-respond         -- Processar pergunta (webhook ML)
```

---

## 17. Páginas (Frontend)

```
/membros/assertive-ecommerce-ia/              -- Dashboard principal
/membros/assertive-ecommerce-ia/novo          -- Criar nova análise (upload)
/membros/assertive-ecommerce-ia/analise/[id]  -- Resultado da análise + spy
/membros/assertive-ecommerce-ia/editor/[id]   -- Editor de anúncio
/membros/assertive-ecommerce-ia/publicados    -- Anúncios publicados
/membros/assertive-ecommerce-ia/monitor       -- Monitor de concorrência
/membros/assertive-ecommerce-ia/analytics     -- Dashboard de performance
/membros/assertive-ecommerce-ia/integracoes   -- Conectar ML / ERPs
/membros/assertive-ecommerce-ia/config        -- Config de IA (configuração única)
```

---

## 18. Segurança

- **API keys de IA:** encriptadas com AES-256 no Supabase
- **Tokens ML:** encriptados, nunca expostos no client
- **Credenciais ERP:** encriptadas, acesso apenas server-side
- **RLS:** usuário só acessa seus próprios dados
- **Rate limiting:** mesmo padrão da comunidade (sliding window)
- **Input sanitization:** todas as entradas passam por sanitização

---

## 19. Fases de Implementação

### Fase 1 — MVP (2-3 semanas)
- Analyzer (foto → produto)
- Spy (busca ML top 5)
- Generator (título + descrição + preço)
- Editor (revisão manual)
- Publisher (publicação 1 anúncio via ML OAuth)
- Multi-listing básico (gerar 3-5 variações)

### Fase 2 — Automação (1-2 semanas)
- Monitor de concorrência
- Repricer básico
- Auto-responder
- Integração Bling (estoque sync)

### Fase 3 — Premium (1-2 semanas)
- Analytics dashboard completo
- Integração Olist + Upseller
- Multi-conta
- Relatório de nicho/oportunidades
- Alertas por e-mail/notificação

---

## 20. Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind v4 |
| Backend | Next.js API Routes (server-side) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth ML | OAuth 2.0 (mercadolibre.com.ar) |
| IA Texto | Groq (grátis) → Gemini Flash (fallback) → Claude/OpenAI (user key) |
| IA Visão | Groq Vision (grátis) → Gemini Flash Vision (fallback) |
| Processamento fotos | Sharp (gratuito) |
| Scraping ML | Puppeteer + Cheerio (server-side) |
| Publicação ML | API oficial ML (`POST /items`) |
| Monitoramento | Supabase cron + Edge Functions |
| Deploy | Vercel (já configurado) |

---

## 21. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| ML muda API | Monitorar changelog, adapter pattern |
| Rate limit ML | Delay entre publicações, fila de jobs |
| IA gera conteúdo ruim | Preview obrigatório antes de publicar |
| ML bloqueia multi-listing | Variações suficientes (40%+ diferente) |
| Free tier estoura | Fallback automático pro provider seguinte |
| Scraping quebra | Usar API oficial sempre que possível |
| Custos de infra crescem | Supabase free tier aguenta bastante |

---

## 22. Métricas de Sucesso

- **Adoption:** % de membros acertive que usam o Assertive
- **Time-to-publish:** Tempo médio de foto → anúncio publicado (meta: <5 min)
- **Listing quality:** % de campos preenchidos (meta: 100%)
- **Ranking:** Posição média dos anúncios na busca ML
- **Sales impact:** Aumento de vendas dos usuários após usar o app
