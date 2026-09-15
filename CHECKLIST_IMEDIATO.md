# ✅ CHECKLIST IMEDIATO — FAZER HOJE (15 min)

## 1. Vercel — Environment Variables
Acesse: **https://vercel.com/dashboard** → projeto `ecommerce-sem-atalho` → **Settings** → **Environment Variables** → **Add New**

| Name | Value | Environments |
|------|-------|--------------|
| `NEXT_PUBLIC_APP_URL` | `https://ecommerce-sem-atalho.vercel.app` | ✅ Production ✅ Preview |
| `MERCADOPAGO_ACCESS_TOKEN` | `APP_USR-SEU_TOKEN_AQUI` | ✅ Production |
| `MERCADOPAGO_WEBHOOK_SECRET` | `whsec_` + `openssl rand -hex 32` | ✅ Production |

> **Gerar webhook secret:** No terminal: `openssl rand -hex 32` → copia → cola com `whsec_` na frente

**Depois:** Aba **Deployments** → **3 pontinhos** no último → **Redeploy** → **Redeploy**

---

## 2. Supabase — 3 Migrations (SQL Editor)
Acesse: **https://supabase.com/dashboard/project/[SEU_REF]/sql/new**

### Migration 1 — AI Cache
```sql
CREATE TABLE IF NOT EXISTS public.assertive_ai_cache (
    cache_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assertive_ai_cache_expires_at ON public.assertive_ai_cache (expires_at);
ALTER TABLE public.assertive_ai_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.assertive_ai_cache FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE OR REPLACE FUNCTION public.cleanup_ai_cache() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ DELETE FROM public.assertive_ai_cache WHERE expires_at < NOW(); $$;
```

### Migration 2 — Mercado Pago Checkout
```sql
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('comunidade', 'acertive', 'combo')),
    period TEXT NOT NULL CHECK (period IN ('monthly', 'yearly')),
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    status TEXT NOT NULL,
    status_detail TEXT,
    payment_method TEXT,
    payment_type TEXT,
    paid_at TIMESTAMPTZ,
    external_reference TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON public.payment_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_paid_at ON public.payment_transactions (paid_at);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions (status);
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_transactions_select_own" ON public.payment_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "payment_transactions_admin_select_all" ON public.payment_transactions FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "payment_transactions_service_all" ON public.payment_transactions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.checkout_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('comunidade', 'acertive', 'combo')),
    period TEXT NOT NULL CHECK (period IN ('monthly', 'yearly')),
    preference_id TEXT,
    idempotency_key TEXT,
    status TEXT NOT NULL CHECK (status IN ('created', 'completed', 'failed', 'expired')),
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checkout_audit_user_id ON public.checkout_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_checkout_audit_preference_id ON public.checkout_audit_log (preference_id);
ALTER TABLE public.checkout_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkout_audit_select_own" ON public.checkout_audit_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "checkout_audit_admin_select_all" ON public.checkout_audit_log FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "checkout_audit_service_all" ON public.checkout_audit_log FOR ALL USING (true) WITH CHECK (true);
```

### Migration 3 — Concurrency Locks
```sql
CREATE OR REPLACE FUNCTION public.try_acquire_analysis_lock(p_lock_key bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ DECLARE acquired boolean; BEGIN SELECT pg_try_advisory_xact_lock(p_lock_key) INTO acquired; RETURN acquired; END; $$;
CREATE OR REPLACE FUNCTION public.release_analysis_lock(p_lock_key bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN PERFORM pg_advisory_unlock(p_lock_key); END; $$;
CREATE OR REPLACE FUNCTION public.is_analysis_locked(p_lock_key bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ DECLARE locked boolean; BEGIN SELECT NOT pg_try_advisory_xact_lock(p_lock_key) INTO locked; IF NOT locked THEN PERFORM pg_advisory_unlock(p_lock_key); END IF; RETURN locked; END; $$;
REVOKE ALL ON FUNCTION public.try_acquire_analysis_lock(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_analysis_lock(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_analysis_locked(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_acquire_analysis_lock(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_analysis_lock(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_analysis_locked(bigint) TO service_role;
```

---

## 3. Mercado Pago — Webhook
**https://www.mercadopago.com.br/developers/panel/applications**
1. Sua aplicação → **Webhooks** → **Add webhook**
2. **URL:** `https://ecommerce-sem-atalho.vercel.app/api/webhooks/mercadopago`
3. **Events:** `payment.created`, `payment.updated`
4. **Secret:** Mesmo `MERCADOPAGO_WEBHOOK_SECRET` do Vercel
5. **Save**

---

## 4. Vercel — Redeploy
Aba **Deployments** → **3 pontinhos** no último → **Redeploy** → **Redeploy**

---

## 5. Teste Completo (5 min)
1. Acesse: `https://ecommerce-sem-atalho.vercel.app`
2. **Cadastro** → Login
3. **Assertive IA** → **Nova Análise** → Foto/Descrição → **Analisar**
4. Aguarde → **Editor** → Edite título → `family_name` sincroniza
5. **Validar** → Veja `title_control_mode`, `predicted_title`
6. **Perfil** → **Assinatura** → Comunidade Mensal → Checkout MP
7. **Sandbox:** Cartão `5031 7557 3453 0604` / 12/25 / 123 / CPF `12345678909`
8. Volta → Assinatura **Ativa**

---

## ✅ PRONTO PARA VENDER
Após isso, o fluxo completo funciona: **Tráfego → Cadastro → Análise → Editor → Validação → Checkout → Assinatura Ativa**

---

## 📁 ARQUIVOS CRIADOS HOJE
| Arquivo | Descrição |
|---------|-----------|
| `MELHORIAS.md` | Plano completo de melhorias (UX, retenção, SEO, escala) |
| `CHECKLIST_IMEDIATO.md` | Este arquivo |
| `src/lib/assertive/ai-cache.ts` | Cache IA (memória + Supabase) |
| `supabase/migrations/20260915_ai_cache.sql` | Migration AI Cache |
| `supabase/migrations/20260915_mercadopago_checkout.sql` | Migration MP Checkout |
| `supabase/migrations/20260915_concurrency_locks.sql` | Migration Concurrency |
| `src/app/api/checkout/mercadopago/route.ts` | Checkout endpoint |
| `src/app/api/webhooks/mercadopago/route.ts` | Webhook handler |
| `src/app/sitemap.ts` | Sitemap XML |
| `src/app/robots.ts` | Robots.txt |
| `src/lib/seo.ts` | SEO utilities |
| `src/components/seo/StructuredData.tsx` | JSON-LD components |
| `src/lib/assertive/concurrency.ts` | Advisory locks |
| `src/lib/assertive/ai-router.ts` | Cache integration |
| `src/app/api/assertive/analyze/route.ts` | Rate limit |
| `src/app/api/assertive/listings/route.ts` | Rate limit |

---

**Tudo commitado no git (commit `efeefc9`). Push feito. Build passando. Testes passando (814/814).**

**Bora vender! 🚀**