# ESA Visual Overhaul — Design Spec

## Overview

Complete visual rewrite of the ESA landing page (`src/app/page.tsx`) to transform it from a generic "infoproduto" landing page into a premium, editorial, corporate-feeling website. Reference: `ecommercepuro.com.br` for design principles only — no content or visual cloning.

**Scope:** Landing page only (`page.tsx` + `globals.css`). No changes to auth, member area, APIs, database, or other routes.

---

## Design Principles (from Ecommerce Puro analysis)

1. **Editorial layout** — numbered sections (01, 02, 03...)
2. **Massive typography** — H1 at 4-6rem desktop, intentional line breaks
3. **Generous whitespace** — 8-12rem padding between major sections
4. **85/15 color ratio** — 85% neutral (black/graphite/white), 15% gold accent
5. **Clean navigation** — minimal header, sticky with blur
6. **Real photography** — spaces for founder photos (not stock)
7. **Fewer, larger cards** — less visual noise, more impact
8. **Corporate feel** — not "infoproduto"
9. **Subtle animations** — fade-in on scroll, no flashy effects
10. **Grid-based** — organized editorial blocks

---

## Implementation Plan

### Phase 1: CSS Foundation (`globals.css`)

**Changes:**
- Remove `.btn-glow` shimmer animation (too "infoproduto")
- Remove `.animate-float` (too playful)
- Add editorial section classes: `.section-editorial` with generous padding
- Add numbered label class: `.section-number` for "01", "02" etc.
- Add typography utility: `.heading-display` for massive H1s
- Add fade-in animation: `@keyframes fadeInUp` for scroll reveal
- Add `.fade-in` class for intersection observer
- Keep all existing design tokens (colors, fonts) — they already match the premium aesthetic
- Add `scroll-behavior: smooth` (already exists, keep)

**Files:** `src/app/globals.css`

### Phase 2: Header Rewrite

**Current:** 111 lines with hamburger menu, nav links, login/signup buttons
**New:** Cleaner, more corporate

**Structure:**
```
[Logo ESA]  [Ecossistema  Soluções  Conteúdo  Acertive  Planos]  [Entrar]  [Conhecer o ESA]
```

- Sticky header with `backdrop-blur-md` on scroll
- Logo: text-based "ESA" or "E-commerce Sem Atalho"
- Nav links: smooth scroll to sections
- CTA: subtle gold outline button
- Mobile: clean hamburger with slide-in menu
- Remove urgency banner entirely

### Phase 3: Hero Rewrite

**Current:** 70+ lines with badges, stats, trust signals, gradient buttons, floating badge
**New:** Clean, editorial, massive typography

**Structure:**
```
Label: "E-commerce na prática"

Headline (massive, 2-3 lines):
"Aprenda a vender no
Mercado Livre com método,
margem e processo."

Subtitle:
"Sem fórmula mágica. Sem promessa de dinheiro fácil.
Da escolha do produto à escala de uma operação real."

CTAs: [Conhecer o ESA]  [Explorar o ecossistema]

[Space for future founder photo / platform mockup]
```

- No stats bar below hero
- No trust signals
- No floating badges
- Clean, lots of whitespace
- Photo placeholder on right side (desktop), hidden on mobile

### Phase 4: Section 01 — Nossa Origem

**Current:** Pain points section with emoji cards
**New:** Editorial origin story

**Structure:**
```
01
Nossa origem

"Quem faz, ensina."

O E-commerce Sem Atalho nasceu para mostrar o que existe
por trás de uma operação real no Mercado Livre.

Produto, fornecedor, preço, anúncio, logística, publicidade,
margem e escala.

Sem fórmula secreta.
Sem promessa de dinheiro fácil.
Somente processo, execução e consistência.

[Space for real photo — operation, office, shipping]
```

- Number "01" as subtle label
- Large editorial text
- Photo placeholder on opposite side
- No cards, no emojis

### Phase 5: Section 02 — O Ecossistema

**Current:** "O que é o ESA" with 6 pillar cards
**New:** Minimalist grid of pillars

**Structure:**
```
O que é o ESA

"Muito além de um curso."

Conteúdo, comunidade, ferramentas e prática conectados
para ajudar você a construir uma operação mais profissional
no Mercado Livre.

[Treinamento] [Comunidade] [Lives] [Acertive Ecom] [Materiais] [Operação real]
```

- Simple text grid, no cards with borders
- Each pillar: icon + label only
- Very clean, almost like a list

### Phase 6: Section 03 — Dores da Operação

**Current:** 4 pain point cards with emojis
**New:** Editorial numbered list

**Structure:**
```
02
Toda operação encontra obstáculos.

01  Produto     Encontrar produtos que façam sentido financeiramente.
02  Margem      Entender taxas, impostos, publicidade e lucro real.
03  Anúncio     Construir ofertas que apareçam e convertam.
04  Logística   Escolher a melhor estratégia para armazenar e enviar.
05  Publicidade Investir em Mercado Ads sem destruir a margem.
06  Escala      Crescer sem perder o controle financeiro.
```

- Horizontal layout on desktop (grid or flex)
- Numbered items, clean typography
- No cards, no colored backgrounds
- Subtle divider lines between items

### Phase 7: Section 04 — Soluções

**Current:** 6 solution cards with icons and descriptions
**New:** Large editorial cards

**Structure:**
```
03
Soluções

"Um ecossistema. Diferentes ferramentas para cada etapa."

[ESA]                    [Acertive Ecom]
Treinamento completo     Tecnologia para auxiliar
para Mercado Livre.      pesquisa e decisões.

[Comunidade ESA]         [Lives]
Ambiente para troca      Conteúdo atualizado
de experiências.         e aplicação prática.

[Materiais]
Planilhas, checklists
e recursos.
```

- 2-column grid on desktop, 1-column on mobile
- Large cards with subtle border
- No icons, just text hierarchy
- Each card: name + short description + subtle CTA

### Phase 8: Section 05 — Comunidade

**Current:** 8-item grid with emojis
**New:** Visual section with photo gallery placeholder

**Structure:**
```
04
Comunidade

"O ambiente também faz parte do aprendizado."

Compartilhe experiências, dúvidas, decisões e aprendizados
com pessoas que também estão construindo suas operações.

[Photo] [Photo] [Photo] [Photo] [Photo]
Operação  Conteúdo  Ferramentas  Bastidores  Comunidade
```

- Horizontal scroll gallery on mobile
- Grid on desktop
- Labels over photo placeholders
- No invented member counts

### Phase 9: Section 06 — Resultados

**Current:** 6 testimonial cards with stars
**New:** Cases library (empty initially)

**Structure:**
```
05
Resultados

"Da teoria para a operação real."

[Espço para futuros cases com imagem, vídeo, descrição]
```

- Placeholder section
- Structure ready for real cases
- No fake testimonials
- Clean, minimal

### Phase 10: Section 07 — Conteúdo (Accordion)

**Current:** 13 module cards in grid
**New:** Elegant vertical accordion

**Structure:**
```
06
Conteúdo

"Do zero à operação."

[00 — Comece Aqui          ▼]
[01 — Mercado Livre do Zero ▼]
[02 — Pesquisa de Produtos  ▼]
...
[12 — Lives                 ▼]
```

- Expandable accordion items
- Number + title on collapsed state
- Description on expanded state
- Subtle border between items
- Smooth animation

### Phase 11: Section 08 — Acertive Ecom

**Current:** Mixed within solutions
**New:** Dedicated SaaS-style section

**Structure:**
```
Tecnologia

"Menos achismo. Mais informação para decidir."

[Mockup placeholder]
Brief description of what Acertive does.
```

- Dark background (different from main)
- Product SaaS layout
- Mockup placeholder
- Clean, technical feel

### Phase 12: Section 09 — Planos

**Current:** 3 pricing cards with badges, "mais popular" tag
**New:** Sophisticated pricing

**Structure:**
```
07
Planos

[ESA]          [Acertive Ecom]     [ESA Completo]
R$97/mês       R$29,90/mês         R$119/mês
Monthly        Monthly              Monthly

[Conhecer]     [Conhecer]          [Conhecer]
```

- No "mais popular" badge
- No timers, no urgency
- Clean cards on neutral background
- ESA Completo slightly larger/highlighted
- Subtle gold border on hover

### Phase 13: Section 10 — CTA Final

**Current:** Gradient button with decorative orbs
**New:** Massive typography closing

**Structure:**
```
Próximo passo

"Não existe atalho.
Existe o próximo passo."

Construa uma operação mais profissional no Mercado Livre
com método, ferramentas e prática.

[Conhecer o ESA]
```

- Dark background
- Very large text
- Single CTA
- No decorative elements
- Clean, powerful ending

### Phase 14: Footer

**Current:** 5-column footer with social icons
**New:** Corporate footer

**Structure:**
```
[Logo ESA]

E-commerce Sem Atalho.
Educação, ferramentas e conteúdo para quem vende no varejo digital.

ESA              Conteúdo        Conta           Legal
Conteúdo         YouTube         Entrar          Termos
Comunidade       Instagram       Criar conta     Privacidade
Acertive
Planos

© 2026 E-commerce Sem Atalho. Todos os direitos reservados.
```

- 4-column grid on desktop
- No CNPJ (user will provide later)
- No social icons in footer (links only)
- Clean, corporate

### Phase 15: Scroll Reveal Animation

**Implementation:**
- Add intersection observer hook in page.tsx
- Apply `.fade-in` class to sections
- Staggered delay for grid items
- Respect `prefers-reduced-motion`

### Phase 16: Responsive Design

**Desktop (1024+):** Full editorial layout, 2-column grids, massive typography
**Tablet (768-1023):** Adapted grids, slightly smaller typography
**Mobile (<768):** Single column, accordion, edge-to-edge images, hamburger menu

Key mobile considerations:
- Hero photo hidden, text centered
- Accordion for modules (not grid)
- Horizontal scroll for gallery
- Large touch targets for CTAs
- No horizontal scroll accidents

---

## Files to Modify

| File | Change |
|------|--------|
| `src/app/page.tsx` | Complete rewrite (717 lines → ~600-700 lines) |
| `src/app/globals.css` | Add editorial classes, remove glow/float animations |

**Files NOT modified:**
- `src/app/layout.tsx` — Keep as-is (font, metadata)
- `src/components/ui/Button.tsx` — Keep as-is
- `src/components/ui/Input.tsx` — Keep as-is
- All member area pages — No changes
- All API routes — No changes
- `src/middleware.ts` — No changes
- `src/lib/supabase/*` — No changes

---

## Content (New Copy)

All section copy provided by user in their specification. Key headlines:

- Hero: "Aprenda a vender no Mercado Livre com método, margem e processo."
- Origin: "Quem faz, ensina."
- Ecosystem: "Muito além de um curso."
- Obstacles: "Toda operação encontra obstáculos."
- Solutions: "Um ecossistema. Diferentes ferramentas para cada etapa."
- Community: "O ambiente também faz parte do aprendizado."
- Results: "Da teoria para a operação real."
- Content: "Do zero à operação."
- Acertive: "Menos achismo. Mais informação para decidir."
- CTA: "Não existe atalho. Existe o próximo passo."

---

## What Still Needs Real Content

| Element | Status |
|---------|--------|
| Founder photos | ✅ Available in `public/fotos/` |
| Platform mockups | ❌ Not yet — create placeholder space |
| Acertive screenshots | ❌ Not yet — create placeholder space |
| Community photos | ❌ Not yet — create placeholder space |
| Real cases/testimonials | ❌ Not yet — section structure ready |
| Company info (CNPJ, address) | ❌ User will provide later |

---

## Verification Checklist

After implementation:
1. Desktop layout review (1920px, 1440px, 1024px)
2. Tablet layout review (768px)
3. Mobile layout review (375px, 414px)
4. All CTAs functional (scroll to sections)
5. Navigation links work
6. Login/cadastro links work
7. FAQ accordion works
8. Module accordion works
9. Mobile hamburger menu works
10. Build passes (`npm run build`)
11. No console errors
12. Performance check (no layout shift)
13. SEO meta tags intact
14. `prefers-reduced-motion` respected
15. Accessibility: focus states, aria labels
