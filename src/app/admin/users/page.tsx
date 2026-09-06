'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Shield, Users, BarChart3, Search, Ban, ChevronDown, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

interface UserProfile {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  role: string
  status: string
  is_banned: boolean
  ban_reason: string
  created_at: string
  subscriptions: Array<{
    plan: string
    status: string
    current_period_end: string
  }>
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{ userId: string; newRole: string } | null>(null)
  const [banConfirm, setBanConfirm] = useState<{ userId: string; userName: string } | null>(null)
  const [banReason, setBanReason] = useState('')
  const [unbanConfirm, setUnbanConfirm] = useState<string | null>(null)
  const [accessModal, setAccessModal] = useState<{ userId: string; userName: string } | null>(null)
  const [accessPlan, setAccessPlan] = useState<'comunidade' | 'acertive' | 'combo'>('combo')
  const [revokeConfirm, setRevokeConfirm] = useState<{ userId: string; userName: string } | null>(null)
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const debouncedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debouncedTimerRef.current) clearTimeout(debouncedTimerRef.current)
    debouncedTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(1)
    }, 300)
    return () => {
      if (debouncedTimerRef.current) clearTimeout(debouncedTimerRef.current)
    }
  }, [searchTerm])

  const fetchUsers = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await fetch(`/api/admin/users?${params}`)
      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 403) { router.push('/membros/dashboard'); return }
      if (!res.ok) {
        let message = 'Erro ao carregar dados'
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch {
          // Body wasn't valid JSON; fall back to the generic message.
        }
        setError(message)
        setLoading(false)
        return
      }
      const data = await res.json()
      setUsers(data.users || [])
      setTotalPages(data.totalPages || 1)
      setTotal(data.total || 0)
    } catch {
      setError('Erro ao carregar dados')
    }
    setLoading(false)
  }, [supabase, router, page, debouncedSearch])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleRoleChange = async (userId: string, newRole: string) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_role', role: newRole }),
    })

    if (res.ok) {
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
      setRoleChangeConfirm(null)
    }
  }

  const handleBanUser = async () => {
    if (!banConfirm || !banReason.trim()) return

    const res = await fetch(`/api/admin/users/${banConfirm.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_status', status: 'banned', reason: banReason.trim() }),
    })

    if (res.ok) {
      setUsers(users.map(u =>
        u.id === banConfirm.userId
          ? { ...u, is_banned: true, ban_reason: banReason.trim(), status: 'banned' }
          : u
      ))
      setBanConfirm(null)
      setBanReason('')
    }
  }

  const handleGrantAccess = async () => {
    if (!accessModal) return

    const res = await fetch(`/api/admin/users/${accessModal.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'grant_subscription', plan: accessPlan }),
    })

    if (res.ok) {
      setUsers(users.map(u =>
        u.id === accessModal.userId
          ? { ...u, subscriptions: [{ plan: accessPlan, status: 'active', current_period_end: new Date(Date.now() + 365 * 86400000).toISOString() }] }
          : u
      ))
      setAccessModal(null)
    }
  }

  const handleRevokeAccess = async () => {
    if (!revokeConfirm) return

    const res = await fetch(`/api/admin/users/${revokeConfirm.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke_subscription' }),
    })

    if (res.ok) {
      setUsers(users.map(u =>
        u.id === revokeConfirm.userId ? { ...u, subscriptions: [] } : u
      ))
      setRevokeConfirm(null)
    }
  }

  const handleUnbanUser = async (userId: string) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_status', status: 'active', reason: 'Reactivated by admin' }),
    })

    if (res.ok) {
      setUsers(users.map(u =>
        u.id === userId
          ? { ...u, is_banned: false, ban_reason: '', status: 'active' }
          : u
      ))
      setUnbanConfirm(null)
    }
  }

  if (loading) {
    return <div className="p-6 text-text-muted">Carregando...</div>
  }

  if (error) {
    return <div className="p-6 text-error">{error}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-accent" />
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Gerenciar Usuarios</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-surface border border-border-subtle text-center">
          <Users className="w-5 h-5 text-accent mx-auto mb-2" />
          <div className="text-2xl font-semibold text-text-primary">{total}</div>
          <div className="text-xs text-text-muted">Total de usuarios</div>
        </div>
        <div className="p-5 rounded-xl bg-surface border border-border-subtle text-center">
          <BarChart3 className="w-5 h-5 text-success mx-auto mb-2" />
          <div className="text-2xl font-semibold text-success">-</div>
          <div className="text-xs text-text-muted">Assinantes ativos</div>
        </div>
        <div className="p-5 rounded-xl bg-surface border border-border-subtle text-center">
          <Ban className="w-5 h-5 text-error mx-auto mb-2" />
          <div className="text-2xl font-semibold text-error">-</div>
          <div className="text-xs text-text-muted">Suspensos</div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-surface border border-border-subtle rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
        />
      </div>

      <div className="rounded-xl bg-surface border border-border-subtle overflow-hidden">
        <div className="p-4 border-b border-border-subtle">
          <h3 className="text-sm font-medium text-text-primary">
            {users.length} usuario{users.length !== 1 ? 's' : ''} (página {page} de {totalPages}, {total} total)
          </h3>
        </div>
        <div className="divide-y divide-border-subtle">
          {users.map((user) => (
            <div key={user.id} className="p-4 flex items-center gap-4 hover:bg-surface-raised transition-colors">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium shrink-0 overflow-hidden ${
                user.is_banned ? 'bg-error/10 text-error' : 'bg-accent/10 text-accent'
              }`}>
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.full_name || ''} className="w-full h-full object-cover" />
                ) : (
                  user.full_name?.charAt(0) || user.email?.charAt(0) || '?'
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate flex items-center gap-2">
                  {user.full_name || 'Sem nome'}
                  {user.role === 'admin' && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/10 text-accent">
                      ADMIN
                    </span>
                  )}
                  {user.is_banned && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-error/10 text-error">
                      SUSPENSO
                    </span>
                  )}
                </div>
                <div className="text-xs text-text-muted truncate">{user.email}</div>
                {user.is_banned && user.ban_reason && (
                  <div className="text-xs text-error mt-0.5">Motivo: {user.ban_reason}</div>
                )}
              </div>

              <div className="text-right shrink-0 flex flex-col items-end gap-1">
                {user.subscriptions?.length > 0 ? (
                  <>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${
                      user.subscriptions[0].status === 'active'
                        ? 'bg-success/10 text-success'
                        : 'bg-error/10 text-error'
                    }`}>
                      {user.subscriptions[0].status} - {user.subscriptions[0].plan}
                    </span>
                    {user.subscriptions[0].status === 'active' && (
                      <button
                        onClick={() => setRevokeConfirm({ userId: user.id, userName: user.full_name || 'Usuario' })}
                        className="text-[10px] text-error hover:underline"
                      >
                        Revogar acesso
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="px-2 py-1 rounded-full text-[10px] font-medium bg-surface-raised text-text-muted">
                      sem assinatura
                    </span>
                    <button
                      onClick={() => { setAccessModal({ userId: user.id, userName: user.full_name || 'Usuario' }); setAccessPlan('combo') }}
                      className="text-[10px] text-accent hover:underline"
                    >
                      Conceder acesso
                    </button>
                  </>
                )}
              </div>

              <div className="text-xs text-text-muted shrink-0">
                {new Date(user.created_at).toLocaleDateString('pt-BR')}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <div className="relative">
                  <button
                    onClick={() => setRoleChangeConfirm(
                      roleChangeConfirm?.userId === user.id
                        ? null
                        : { userId: user.id, newRole: user.role === 'admin' ? 'member' : 'admin' }
                    )}
                    className="p-1.5 rounded-lg hover:bg-surface-raised transition-colors"
                  >
                    <ChevronDown className="w-4 h-4 text-text-muted" />
                  </button>
                  {roleChangeConfirm?.userId === user.id && (
                    <div className="absolute right-0 top-full mt-1 w-40 rounded-lg bg-surface border border-border-subtle shadow-lg z-10">
                      <button
                        onClick={() => handleRoleChange(user.id, user.role === 'admin' ? 'member' : 'admin')}
                        className="w-full px-3 py-2 text-left text-xs text-text-primary hover:bg-surface-raised transition-colors"
                      >
                        Tornar {user.role === 'admin' ? 'Membro' : 'Admin'}
                      </button>
                    </div>
                  )}
                </div>

                {user.is_banned ? (
                  <button
                    onClick={() => setUnbanConfirm(user.id)}
                    className="p-1.5 rounded-lg hover:bg-success/10 transition-colors"
                    title="Desbanir"
                  >
                    <Ban className="w-4 h-4 text-success" />
                  </button>
                ) : (
                  <button
                    onClick={() => setBanConfirm({ userId: user.id, userName: user.full_name || 'Usuario' })}
                    className="p-1.5 rounded-lg hover:bg-error/10 transition-colors"
                    title="Banir"
                  >
                    <Ban className="w-4 h-4 text-error" />
                  </button>
                )}
              </div>

              {unbanConfirm === user.id && (
                <div className="fixed inset-0 bg-bg/80 flex items-center justify-center p-4 z-50">
                  <div className="max-w-sm w-full rounded-xl bg-surface border border-border-subtle p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Ban className="w-5 h-5 text-success" />
                        <h3 className="text-lg font-medium text-text-primary">Desbanir Usuario</h3>
                      </div>
                      <button onClick={() => setUnbanConfirm(null)}>
                        <X className="w-4 h-4 text-text-muted" />
                      </button>
                    </div>
                    <p className="text-sm text-text-muted">
                      Tem certeza que deseja desbanir <strong>{user.full_name || 'este usuario'}</strong>?
                    </p>
                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="ghost" onClick={() => setUnbanConfirm(null)}>Cancelar</Button>
                      <Button
                        variant="primary"
                        onClick={() => handleUnbanUser(user.id)}
                        className="bg-success hover:bg-success/90"
                      >
                        Desbanir
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Anterior
          </Button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number
            if (totalPages <= 5) {
              pageNum = i + 1
            } else if (page <= 3) {
              pageNum = i + 1
            } else if (page >= totalPages - 2) {
              pageNum = totalPages - 4 + i
            } else {
              pageNum = page - 2 + i
            }
            return (
              <Button
                key={pageNum}
                variant={pageNum === page ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setPage(pageNum)}
                className={pageNum === page ? 'bg-accent' : ''}
              >
                {pageNum}
              </Button>
            )
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Próximo
          </Button>
        </div>
      )}

      {banConfirm && (
        <div className="fixed inset-0 bg-bg/80 flex items-center justify-center p-4 z-50">
          <div className="max-w-sm w-full rounded-xl bg-surface border border-border-subtle p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-error" />
                <h3 className="text-lg font-medium text-text-primary">Suspender Usuario</h3>
              </div>
              <button onClick={() => { setBanConfirm(null); setBanReason('') }}>
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <p className="text-sm text-text-muted">
              Tem certeza que deseja suspender <strong>{banConfirm.userName}</strong>?
            </p>
            <textarea
              placeholder="Motivo da suspensao..."
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              className="w-full bg-surface border border-border-subtle rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors min-h-[80px] resize-none"
            />
            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setBanConfirm(null); setBanReason('') }}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleBanUser}
                disabled={!banReason.trim()}
                className="bg-error hover:bg-error/90"
              >
                Suspender
              </Button>
            </div>
          </div>
        </div>
      )}

      {accessModal && (
        <div className="fixed inset-0 bg-bg/80 flex items-center justify-center p-4 z-50">
          <div className="max-w-sm w-full rounded-xl bg-surface border border-border-subtle p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-text-primary">Conceder Acesso</h3>
              <button onClick={() => setAccessModal(null)}>
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <p className="text-sm text-text-muted">
              Conceder acesso manual (365 dias) para <strong>{accessModal.userName}</strong>.
            </p>
            <select
              value={accessPlan}
              onChange={(e) => setAccessPlan(e.target.value as typeof accessPlan)}
              className="w-full bg-surface border border-border-subtle rounded-lg px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="comunidade">Comunidade</option>
              <option value="acertive">Assertive IA</option>
              <option value="combo">Combo</option>
            </select>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" onClick={() => setAccessModal(null)}>Cancelar</Button>
              <Button variant="primary" onClick={handleGrantAccess}>Conceder</Button>
            </div>
          </div>
        </div>
      )}

      {revokeConfirm && (
        <div className="fixed inset-0 bg-bg/80 flex items-center justify-center p-4 z-50">
          <div className="max-w-sm w-full rounded-xl bg-surface border border-border-subtle p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-text-primary">Revogar Acesso</h3>
              <button onClick={() => setRevokeConfirm(null)}>
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <p className="text-sm text-text-muted">
              Tem certeza que deseja revogar o acesso de <strong>{revokeConfirm.userName}</strong>?
            </p>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" onClick={() => setRevokeConfirm(null)}>Cancelar</Button>
              <Button variant="primary" onClick={handleRevokeAccess} className="bg-error hover:bg-error/90">Revogar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
