# Admin Panel with Ban System - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete admin panel with user management, banning system, and content control for the ecommerce-sem-atalho platform.

**Architecture:** Add ban columns to profiles table via SQL migration, enhance admin dashboard with more stats, rebuild user management page with full CRUD operations, add ban check to middleware, create ban page, and add admin community management.

**Tech Stack:** Next.js, Supabase (PostgreSQL + RLS), TypeScript, React, Tailwind CSS, lucide-react icons

**Spec:** User-provided specification (inline)

## Global Constraints

- Existing UI components: Card, Button, Input from `src/components/ui/`
- Supabase client via `@/lib/supabase/client`
- Admin check pattern: query profiles table for role = 'admin'
- Portuguese language for all UI text
- Dark theme with accent color scheme (gold/accent)

---

### Task 1: SQL Migration for Ban System

**Files:**
- Create: `supabase/migrations/008_user_bans.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add banned status to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ban_reason TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

-- Banned users blocked from member area
CREATE POLICY "banned_users_blocked"
  ON public.profiles FOR SELECT
  USING (
    NOT is_banned
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

- [ ] **Step 2: Verify migration syntax**

---

### Task 2: Enhanced Admin Dashboard

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add lives, community posts, and banned users count to stats**
- [ ] **Step 2: Add quick action links for community management**

---

### Task 3: User Management Page

**Files:**
- Modify: `src/app/admin/users/page.tsx`

- [ ] **Step 1: Add search functionality**
- [ ] **Step 2: Add role change dropdown**
- [ ] **Step 3: Add ban/unban button with reason modal**
- [ ] **Step 4: Add delete user with confirmation**

---

### Task 4: Middleware Ban Check

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add is_banned check for authenticated users on protected routes**

---

### Task 5: Ban Page

**Files:**
- Create: `src/app/banido/page.tsx`

- [ ] **Step 1: Create simple ban page with message and contact link**

---

### Task 6: Admin Community Management

**Files:**
- Create: `src/app/admin/community/page.tsx`

- [ ] **Step 1: List all community posts with user info**
- [ ] **Step 2: Add delete post and ban user actions**
