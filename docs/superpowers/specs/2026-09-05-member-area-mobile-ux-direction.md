# Member Area Mobile-First UX Direction

Date: 2026-09-05
Status: Approved direction, recorded for future execution. Not yet implemented.
Owner directive: preserve authentication, authorization, admin, users, community, APIs, database, progress, and every other currently-working real feature. This is a UX/navigation/presentation direction, not an architecture change.

## Objective

On mobile especially, the member area must feel like a modern app/community product, not a desktop dashboard stretched onto a small screen.

## 1. Home Is The Feed

Landing in the member area opens the community feed, not a card-heavy dashboard. The home screen prioritizes, in order of importance:

1. Community posts.
2. Novidades/avisos.
3. Lives (live now, upcoming).
4. Interaction (reactions, comments, chat entry point).
5. "Continue watching" when the member has real lesson progress.

The feed is the center of the experience, not a secondary tab.

## 2. Mobile Navigation

- A hamburger button in the top bar opens full navigation, grouped:

  ```
  COMEÇAR
  - Início / Feed
  - Aulas

  LIVES E CONTEÚDO
  - Lives
  - Gravações
  - Calendário
  - Materiais
  - Atualizações

  COMUNIDADE
  - Feed
  - Chat
  - Membros

  FERRAMENTAS
  - Acertive Ecom
  - (future tools/apps land here)

  CONTA
  - Perfil
  - Suporte

  ADMINISTRAÇÃO
  - Owner/admin only. A non-admin member must never see or be able to reach this group or /admin.
  ```

- A bottom navigation bar carries the primary shortcuts, e.g.: `Início | Comunidade | Aulas | Avisos | Perfil`.
- The hamburger menu owns full navigation; the bottom bar owns quick access to the most-used destinations only.

## 3. Lessons Flow

```
Aulas
  -> course/module list
  -> open a module
  -> lesson list
  -> open a lesson
  -> large player + lesson content
```

Lesson list rows show: thumbnail, title, duration (when available), progress, completed state, current lesson, next lesson. The entire row is tappable to open the lesson. A "Continuar assistindo" section appears only when there is real progress to show.

## 4. Individual Lesson Screen

A screen focused on consuming content, structured as:

1. Lesson title.
2. Large video player.
3. Instructor name/photo, when applicable.
4. Progress.
5. "Marcar como concluída."
6. Description/summary.
7. Downloadable materials.
8. Previous lesson | Next lesson.

On mobile the video occupies nearly the full available width. Avoid stacking many competing cards/info blocks around the player.

## 5. Video Source: Unlisted YouTube (MVP)

For the MVP, support unlisted YouTube as the primary video source, alongside the existing self-upload path (`course-videos` bucket) which may remain available.

In the lesson admin form, add a video source choice:

- YouTube.
- Upload próprio (existing signed-upload flow, preserved as-is).

When YouTube is selected, the admin pastes a URL such as `https://youtube.com/watch?v=...`. The system must:

- Validate the URL.
- Extract the video ID.
- Persist it.
- Optionally fetch/store a thumbnail.
- Render the video embedded inside the member area lesson screen.

The member must never leave the platform or be redirected to youtube.com to watch — the player is embedded directly on the lesson page. Hosting 4-8GB files in Supabase Storage is explicitly out of scope for this MVP; YouTube unlisted is the primary path.

## 6. Desktop

Desktop may keep a sidebar, but its architecture must mirror the same information hierarchy as mobile, not simply stretch the mobile layout:

```
Feed
Aulas
Comunidade
Lives
Materiais
Ferramentas
Perfil
Administração (owner/admin only)
```

## 7. Visual Identity

Do not visually clone another platform — only the UX logic described above is prescribed. Keep the existing E-commerce Sem Atalho identity: black/graphite base, gold accent, premium, modern, clean, few competing elements, strong typography, and an overall feel closer to a native app than a desktop admin panel.

## 8. No Mocks

Every element shown must come from real data. When there is no lesson, live, material, atualização, or avaliação to show, render a real, honest empty state. Never fabricate placeholder content to make a screen look fuller.

## 9. Execution Order (when this phase starts)

Do not start this redesign until current functional bugs are closed. Do not rebuild backend/data layers that are already GREEN (canonical learning schema/APIs from the 2026-09-03 plan, community APIs, admin APIs, auth/authorization). Sequence:

1. Functional stability (close known critical bugs first).
2. YouTube embed video source (admin + member lesson player).
3. Lessons/modules flow (list -> module -> lesson, per section 3-4 above).
4. Feed as home (per section 1).
5. Mobile navigation (hamburger + grouped menu + bottom nav, per section 2).
6. Desktop finishing pass (per section 6).
7. Mobile/desktop QA.

## Relationship To Other Specs

- Supersedes/refines the member-experience shape described in `docs/superpowers/specs/2026-09-02-esa-ecosystem-reconstruction-design.md` section 7 (Member Experience) with this concrete mobile-first navigation/IA direction. All authorization, data-model, and API boundaries defined there and in `docs/superpowers/specs/2026-09-03-canonical-learning-progress-design.md` remain binding and unchanged.
- Does not affect `docs/superpowers/specs/2026-09-01-esa-visual-overhaul-design.md`, which is scoped only to the public landing page.
- The YouTube-embed video source (section 5) extends, rather than replaces, the existing transitional self-upload video path documented in the canonical learning design's Non-Goals ("Video upload processing or signed media URLs"); a follow-up implementation plan must define the exact schema change (e.g. a `video_source`/`video_id` field alongside the existing `video_url`), the admin-schema validation, and the DTO/player changes needed on both member and admin sides.

## Non-Goals (for this direction document)

- No immediate implementation. This document only records the approved direction.
- No architecture rewrite of auth, authorization, admin, community, database, or the canonical learning APIs.
- No custom video hosting/transcoding pipeline.
- No redesign of the public landing page (separate spec, separate scope).
