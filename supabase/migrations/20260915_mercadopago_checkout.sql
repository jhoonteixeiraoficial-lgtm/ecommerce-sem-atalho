-- Migration: 20260915_mercadopago_checkout.sql
-- Tabelas para checkout Mercado Pago e auditoria

-- Tabela de transações de pagamento (idempotência)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id TEXT NOT NULL UNIQUE,           -- ID do pagamento no Mercado Pago
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('comunidade', 'acertive', 'combo')),
    period TEXT NOT NULL CHECK (period IN ('monthly', 'yearly')),
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    status TEXT NOT NULL,                       -- approved, pending, rejected, etc.
    status_detail TEXT,
    payment_method TEXT,                        -- credit_card, pix, boleto, etc.
    payment_type TEXT,                          -- credit_card, ticket, account_money
    paid_at TIMESTAMPTZ,
    external_reference TEXT,                    -- "user_id:plan:period"
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON public.payment_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_paid_at ON public.payment_transactions (paid_at);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions (status);

-- RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas suas transações
CREATE POLICY "payment_transactions_select_own"
    ON public.payment_transactions FOR SELECT
    USING (auth.uid() = user_id);

-- Admin vê todas
CREATE POLICY "payment_transactions_admin_select_all"
    ON public.payment_transactions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Service role pode inserir/atualizar (webhook)
CREATE POLICY "payment_transactions_service_all"
    ON public.payment_transactions FOR ALL
    USING (true)
    WITH CHECK (true);

-- ----------------------------------------------------------------
-- Tabela de auditoria de checkout
-- ----------------------------------------------------------------
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

CREATE POLICY "checkout_audit_select_own"
    ON public.checkout_audit_log FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "checkout_audit_admin_select_all"
    ON public.checkout_audit_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "checkout_audit_service_all"
    ON public.checkout_audit_log FOR ALL
    USING (true)
    WITH CHECK (true);

-- ----------------------------------------------------------------
-- Comentários
-- ----------------------------------------------------------------
COMMENT ON TABLE public.payment_transactions IS
'Registro imutável de cada pagamento processado via webhook Mercado Pago.
Chave única payment_id garante idempotência (mesmo pagamento não processa 2x).';

COMMENT ON TABLE public.checkout_audit_log IS
'Log de auditoria de criação de preferências de checkout.
Útil para debug de conversão e detecção de fraudes.';