# 📋 PLANO DE MELHORIAS — ECOMMERCE SEM ATALHO
**Versão:** 1.0 | **Data:** 2025-09-15 | **Baseado em:** Análise completa do codebase (272 arquivos TS/TSX)

---

## 🎯 RESUMO EXECUTIVO

O projeto já é **sólido tecnicamente** (814 testes passam, build OK, typecheck OK, Assertive IA funcional).  
O foco agora é **produtização para vendas diretas** — converter visitantes em alunos pagantes e reter.

---

## 🔴 PRIORIDADE CRÍTICA (Vendas Imediatas)

### 1. Checkout Mercado Pago — **Já implementado, falta config**
| Item | Status | Ação |
|------|--------|------|
| `POST /api/checkout/mercadopago` | ✅ Código pronto | Adicionar `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET` no Vercel |
| `POST /api/webhooks/mercadopago` | ✅ Código pronto | Configurar webhook no painel MP apontando para `https://SEU-DOMINIO.vercel.app/api/webhooks/mercadopago` |
| Migrations `payment_transactions` + `checkout_audit_log` | ✅ SQL pronto | Rodar `20260915_mercadopago_checkout.sql` no Supabase |
| `NEXT_PUBLIC_APP_URL` | ✅ Variável pronta | Adicionar no Vercel (Production + Preview) + Redeploy |

**Tempo:** 15 min | **Impacto:** Permite vender **HOJE**

---

### 2. Landing Page de Conversão (VSL → Cadastro)
**Arquivos:** `src/app/vsl/page.tsx`, `src/app/(auth)/cadastro/page.tsx`
| Problema | Solução |
|----------|---------|
| VSL genérica, sem prova social | Adicionar: depoimentos em vídeo, prints de resultados reais, contador de alunos |
| Cadastro sem "value prop" claro | Above-the-fold: "Crie seu 1º anúncio otimizado em 3 min — grátis para testar" |
| Sem lead magnet | Oferecer: "Checklist de 15 pontos para anúncio perfeito" (PDF) em troca do email |

---

### 3. Onboarding Guiado (Ativação)
**Arquivo:** `src/app/(auth)/onboarding/page.tsx`
| Gap | Melhoria |
|-----|----------|
| Onboarding passivo | Wizard de 3 passos: 1) Conecta ML → 2) Sobe 1 foto → 3) Vê análise pronta |
| Usuário não entende "Assertive IA" | Micro-copy: "IA que pesquisa concorrentes, escreve copy e valida no ML antes de publicar" |
| Sem "Aha! moment" rápido | Garantir: 1ª análise pronta em <2 min (já é rápido, só comunicar melhor) |

---

## 🟠 PRIORIDADE ALTA (Retenção + LTV)

### 4. Gamificação no Dashboard
**Arquivo:** `src/app/membros/dashboard/page.tsx`
| Feature | Implementação |
|---------|---------------|
| Streak de estudos | `localStorage` + badge no header ("🔥 7 dias seguidos") |
| Progresso visual por módulo | Barras circulares animadas (já tem `progressPercentage`, só estilizar) |
| Conquistas desbloqueáveis | "Primeira análise", "1º anúncio publicado", "10 aulas completas" |
| Ranking semanal (opt-in) | Top 10 por "anúncios criados" ou "aulas assistidas" |

---

### 5. Comunidade → Engajamento Real
**Arquivos:** `src/components/community/Chat.tsx`, `Feed.tsx`
| Gap | Melhoria |
|-----|----------|
| Chat/Feed isolados | Tabs unificadas: "Geral" | "Minhas dúvidas" | "Resultados" |
| Sem notificações push | Web Push API (Vercel + Service Worker) para: resposta no tópico, menção, live começando |
| Feed sem algoritmo | Ordenar por: "Não lidas" → "Respostas recentes" → "Mais curtidas" |
| Moderação invisível | Badge "Moderador" visível, botão "Reportar" em cada post/comentário |

---

### 6. Assertive IA — UX de "Mágica"
**Arquivos:** `src/app/membros/assertive-ecommerce-ia/novo/page.tsx`, `analise/[id]/page.tsx`, `editor/[id]/page.tsx`
| Friction Point | Fix |
|----------------|-----|
| Usuário não sabe qual input escolher | Default inteligente: se tem foto → `photo`, se tem link → `url`, se só texto → `description` |
| Etapa "Confirme o produto" confusa | Renomear para "✅ O Assertive identificou: **[Nome]** — está certo?" |
| Editor abrumador (2234 linhas) | **Progressive Disclosure**: 1) Título/Preço → 2) Fotos → 3) Ficha técnica → 4) Publicar |
| Validação = botão escondido | CTA fixo no bottom: "✅ Validar no Mercado Livre" (sempre visível) |
| Imagens progressivas = confusas | Toggle simples: "🎨 Gerar fotos com IA" ON/OFF + preview lado a lado |

---

### 7. Email/Lifecycle Automatizado
**Novo:** `src/lib/email/` + Resend/SendGrid
| Trigger | Email |
|---------|-------|
| Cadastro → sem análise em 24h | "Travou na 1ª análise? Responda este email que eu ajudo" |
| Análise pronta → sem editor aberto | "Seu anúncio está pronto para revisão — 2 min" |
| Editor aberto → sem publicar em 48h | "Falta pouco: só validar e publicar" |
| Publicado → 7 dias | "Como foi a performance? Veja dicas de otimização" |
| Cancelamento assinatura | "O que faltou? Queremos melhorar" (NPS) |

---

## 🟡 PRIORIDADE MÉDIA (Qualidade + Escala)

### 8. SEO Técnico Completo
| Item | Status | Ação |
|------|--------|------|
| `sitemap.xml` | ✅ `src/app/sitemap.ts` | Verificar no Search Console |
| `robots.txt` | ✅ `src/app/robots.ts` | Permitir `/membros/assertive-ecommerce-ia/*` |
| JSON-LD (Course, Product, Organization) | ✅ `src/components/seo/StructuredData.tsx` | Testar no Rich Results Test |
| OG/Twitter cards dinâmicos | ✅ `src/lib/seo.ts` | Validar no Facebook Debugger |
| Meta tags por página | ✅ `generateSEOMetadata()` | Auditar com Screaming Frog |
| Core Web Vitals | ⚠️ Parcial | `next/image` em todas imagens, `font-display: swap`, prefetch critical |

---

### 9. Observabilidade & Alertas
**Arquivos:** `src/lib/assertive/observability.ts`, `src/app/api/assertive/analyses/[id]/run/route.ts`
| Métrica | Alerta |
|---------|--------|
| Análises falhando > 5%/hora | Slack/Email imediato |
| Tempo médio análise > 3 min | Investigar bottleneck (Gemini vs Claude) |
| Custo IA/ usuário > R$ 2 | Otimizar prompts / cache |
| Webhook MP falhando | Retry automático + alerta |
| Assinaturas canceladas > 10%/mês | Revisar onboarding |

---

### 10. Performance & Bundle
| Otimização | Ganho Estimado |
|------------|----------------|
| `next/image` em todo lugar (já usa em partes) | -30% LCP |
| Code-split editor (2234 linhas → lazy load) | -150KB JS inicial |
| Prefetch rotas críticas (`/membros/assertive-ecommerce-ia/*`) | -200ms navegação |
| Service Worker para assets estáticos | Offline-first community |
| `next/font` otimizado (já usa Inter) | ✅ OK |

---

## 🟢 PRIORIDADE BAIXA (Nice to Have)

### 11. Mobile App Feel (PWA)
- `manifest.json` ✅ pronto
- Install prompt customizado no dashboard
- Push notifications para lives/novas aulas
- Offline cache de aulas assistidas

### 12. Admin Analytics
- Dashboard: MRR, Churn, LTV, CAC
- Funil: Visitantes → Cadastro → 1ª Análise → Publicação → Assinatura
- Cohort analysis por mês de entrada
- Feature usage: % usa IA fotos, % valida no ML, % publica

### 13. Internacionalização (Futuro)
- `next-intl` structure
- PT-BR → EN/ES para sellers cross-border

---

## 📦 IMPLEMENTAÇÃO SUGERIDA (Sprints de 1 semana)

| Sprint | Foco | Entregáveis |
|--------|------|-------------|
| **0 (HOJE)** | Vender | MP Checkout + Webhook + Vercel envs + Redeploy |
| **1** | Ativação | Onboarding wizard + Landing VSL otimizada |
| **2** | Retenção | Gamificação dashboard + Notificações push |
| **3** | Assertive UX | Progressive disclosure editor + Validação fixa |
| **4** | Comunidade | Feed unificado + Notificações + Moderação |
| **5** | Lifecycle | Emails automatizados + NPS cancelamento |
| **6** | Escala | Observabilidade + Performance + Admin Analytics |

---

## 🛠️ DÉBITO TÉCNICO IDENTIFICADO

| Arquivo | Problema | Risco |
|---------|----------|-------|
| `editor/[id]/page.tsx` (2234 linhas) | God component | Quebra ao adicionar features |
| `pipeline.ts` (1074 linhas) | Lógica de negócio misturada | Hard to test |
| `generator.ts` (690 linhas) | Prompts hardcoded | Mudança de prompt = deploy |
| `concurrency.ts` | Fallback lock frágil | Race condition sob carga |
| `Chat.tsx` / `Feed.tsx` | Duplicação de lógica realtime | Bugs sutis de sync |

**Refatoração sugerida:** Extrair hooks customizados (`useRealtime`, `useAssertiveEditor`, `useAnalysisPipeline`) e mover prompts para arquivos `.md` versionados.

---

## ✅ CHECKLIST DE DEPLOY PRODUÇÃO

- [ ] `MERCADOPAGO_ACCESS_TOKEN` (Production) no Vercel
- [ ] `MERCADOPAGO_WEBHOOK_SECRET` (Production) no Vercel
- [ ] `NEXT_PUBLIC_APP_URL` (Production + Preview) no Vercel
- [ ] 3 Migrations rodadas no Supabase (AI Cache, MP Checkout, Concurrency)
- [ ] Webhook MP configurado → `https://SEU-DOMINIO.vercel.app/api/webhooks/mercadopago`
- [ ] Redeploy no Vercel após env vars
- [ ] Teste sandbox: cartão `5031 7557 3453 0604` / 12/25 / 123 / CPF `12345678909`
- [ ] Verificar `sitemap.xml` e `robots.txt` no domínio
- [ ] Configurar Search Console + GA4
- [ ] Testar fluxo completo: Cadastro → Análise → Editor → Validar → Publicar → Checkout

---

## 💡 IDEIAS FORA DA CAIXA (Diferenciação)

1. **"Anúncio Garantido"** — Se não vender em 30 dias, devolve valor da assinatura do mês
2. **"Biblioteca de Templates"** — Usuários compartilham templates de descrição/ficha técnica (moderado)
3. **"Parceiro Logístico"** — Integração nativa com Melhor Envio / Jadlog para cálculo de frete real
4. **"Certificação ESA"** — Badge verificável no perfil: "Vendedor Certificado Ecommerce Sem Atalho"
5. **"Marketplace de Fornecedores"** — Comunidade indica fornecedores confiáveis (avaliação peer-to-peer)

---

**Próximo passo recomendado:** Focar no **Sprint 0** (checkout funcional) + **Sprint 1** (onboarding + landing). O resto vem com receita entrando. 🚀