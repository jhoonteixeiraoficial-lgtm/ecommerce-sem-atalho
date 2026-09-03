'use client'

import { useState, useEffect } from 'react'
import { User, Mail, Phone, Lock, CreditCard, LogOut, Check, Shield, Calendar } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import { User as SupabaseUser } from '@supabase/supabase-js'

export default function PerfilPage() {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    setUser(authUser)

    if (authUser) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()
      setProfile(profileData)
      setFullName(profileData?.full_name || '')
      setPhone(profileData?.phone || '')

      const { data: subData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      setSubscription(subData)
    }
  }

  const handleSave = async () => {
    if (!user || saving) return
    setSaving(true)
    setSaved(false)

    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, phone }),
      })

      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      // Silently fail — user sees no save confirmation
    }
    setSaving(false)
  }

  const handlePasswordChange = async () => {
    setPasswordError('')
    setPasswordSuccess(false)

    if (newPassword.length < 6) {
      setPasswordError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas não coincidem.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPasswordError('Erro ao alterar senha. Tente novamente.')
    } else {
      setPasswordSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSuccess(false), 3000)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Meu Perfil</h1>
        <p className="text-sm text-text-muted mt-1">Gerencie suas informações</p>
      </div>

      {/* Avatar & Plan */}
      <div className="p-5 rounded-xl bg-surface border border-border-subtle">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-accent/10 border-2 border-accent/30 flex items-center justify-center text-xl font-bold text-accent">
            {profile?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </div>
          <div className="flex-1">
            <div className="text-base font-medium text-text-primary">
              {profile?.full_name || 'Usuário'}
            </div>
            <div className="text-xs text-text-muted mt-0.5">{user?.email}</div>
            <div className="flex items-center gap-2 mt-2">
              {subscription ? (
                <>
                  <span className="px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-medium rounded-full capitalize">
                    Plano {subscription.plan}
                  </span>
                  <span className={`flex items-center gap-1 text-[10px] ${
                    subscription.status === 'active' ? 'text-success' : 'text-error'
                  }`}>
                    <Check className="w-3 h-3" />
                    {subscription.status === 'active' ? 'Ativo' : subscription.status}
                  </span>
                </>
              ) : (
                <span className="px-2 py-0.5 bg-surface-raised text-text-muted text-[10px] font-medium rounded-full">
                  Sem assinatura
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Subscription Info */}
      {subscription && (
        <div className="p-5 rounded-xl bg-surface border border-border-subtle">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-medium text-text-primary">Assinatura</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Plano</span>
              <span className="text-xs text-text-primary font-medium capitalize">{subscription.plan}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-muted">Status</span>
              <span className={`text-xs font-medium capitalize ${
                subscription.status === 'active' ? 'text-success' : 'text-error'
              }`}>{subscription.status}</span>
            </div>
            {subscription.current_period_end && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Próxima cobrança</span>
                <span className="text-xs text-text-primary">
                  {new Date(subscription.current_period_end).toLocaleDateString('pt-BR')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Personal Data */}
      <div className="p-5 rounded-xl bg-surface border border-border-subtle">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-medium text-text-primary">Dados Pessoais</h3>
        </div>
        <div className="space-y-4">
          <Input label="Nome Completo" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="E-mail" type="email" value={user?.email || ''} disabled />
          <Input label="Telefone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button onClick={handleSave} loading={saving}>
            {saved ? <><Check className="w-4 h-4 mr-1" /> Salvo!</> : 'Salvar alterações'}
          </Button>
        </div>
      </div>

      {/* Security */}
      <div className="p-5 rounded-xl bg-surface border border-border-subtle">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-medium text-text-primary">Segurança</h3>
        </div>
        <div className="space-y-4">
          <Input label="Nova Senha" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Input label="Confirmar Nova Senha" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          {passwordError && <p className="text-xs text-error">{passwordError}</p>}
          {passwordSuccess && <p className="text-xs text-success">Senha alterada com sucesso!</p>}
          <Button variant="secondary" onClick={handlePasswordChange} disabled={!newPassword || !confirmPassword}>
            Alterar senha
          </Button>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-border-subtle text-sm text-text-muted hover:text-error hover:border-error/30 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Sair da conta
      </button>
    </div>
  )
}
