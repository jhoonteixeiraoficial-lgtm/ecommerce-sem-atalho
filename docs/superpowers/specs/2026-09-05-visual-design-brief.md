# Design brief — E-commerce Sem Atalho (benchmark: Tynk-style community, Finclass, Notion/Linear/Stripe)

Status: existing design tokens (`src/app/globals.css`) already match this brief almost exactly
(`--color-bg: #0c0c0c`, `--color-surface: #141414`, `--color-accent: #c8a44e`) — no token rework needed.

## Navigation
- Mobile: hamburger opens a grouped drawer (Início/Aprender/Comunidade/Ferramentas/Ajuda/Conta/Administração),
  NOT a flat list. Bottom nav: 4-5 items max (Início · Aulas · Comunidade · Perfil).
- Desktop: keep fixed sidebar (~260px), grafite bg, active item = 2-3px accent left bar, no full pill highlight needed.

## Feed/home
- Short hero/banner card (live agora / novo lançamento), accent border only, no glow.
- "Continuar assistindo" horizontal carousel with thin progress bar on thumbnail.
- Community feed section below, real posts, empty-state when none.

## Aulas
- Module accordion listing; active/completed lesson = graphite+1 tone bg + accent check.
- Lesson screen: big 16:9 player, lesson list beside (desktop) / below (mobile), simple tabs (Sobre/Materiais/Comentários).

## Community/chat
- Two-column desktop (channel list + feed/chat), full-screen mobile per view (channel list -> chat with back header).
- No colored shadows, no bounce animations.

## Cards / type / spacing
- Cards: 12-16px radius, graphite bg, 1px border at 6-8% white opacity, no heavy drop-shadow.
- 8px spacing grid. One neutral geometric sans for UI (already using system default — keep).
- Accent is for CTA/active/progress only, max 1-2 gold elements per screen.

## Microinteractions
- 120-180ms ease-out hover/focus transitions, no bounce/spring.
- Hover: +4-6% surface lightening + border 6%->15% opacity, no scale/shadow.
- Avoid: neon glow, multicolor gradients, gamified confetti, 3D icons, colored blurred shadows (casino look).

## Full agent output
See task session for the complete reference table and rationale (Finclass mentor/badge patterns,
Hotmart/Kiwify module accordion, Notion/Linear microinteractions, Stripe/Shopify catalog patterns).
