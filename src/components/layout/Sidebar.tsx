'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Video,
  Calendar,
  Download,
  Bell,
  Sparkles,
  HelpCircle,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
  Shield,
} from 'lucide-react'
import { useState, useEffect, useCallback, useEffectEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

const navGroups = [
  {
    title: 'Início',
    items: [{ icon: LayoutDashboard, label: 'Início', href: '/membros/dashboard' }],
  },
  {
    title: 'Aprender',
    items: [
      { icon: BookOpen, label: 'Aulas', href: '/membros/aulas' },
      { icon: Video, label: 'Lives', href: '/membros/lives' },
      { icon: Calendar, label: 'Calendário', href: '/membros/calendario' },
      { icon: Download, label: 'Materiais', href: '/membros/materiais' },
      { icon: Bell, label: 'Atualizações', href: '/membros/atualizacoes' },
    ],
  },
  {
    title: 'Comunidade',
    items: [{ icon: Users, label: 'Comunidade', href: '/membros/comunidade' }],
  },
  {
    title: 'Ferramentas',
    items: [{ icon: Sparkles, label: 'Assertive IA', href: '/membros/assertive-ecommerce-ia' }],
  },
  {
    title: 'Conta',
    items: [
      { icon: HelpCircle, label: 'Suporte', href: '/membros/suporte' },
      { icon: User, label: 'Perfil', href: '/membros/perfil' },
    ],
  },
]

const adminGroup = { title: 'Administração', items: [{ icon: Shield, label: 'Administração', href: '/admin' }] }

interface SidebarProps {
  open: boolean
  onClose: () => void
  isAdmin?: boolean
}

export default function Sidebar({ open, onClose, isAdmin = false }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [supabase] = useState(() => createClient())
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const closeForNavigation = useEffectEvent(onClose)
  const groups = isAdmin ? [...navGroups, adminGroup] : navGroups

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, updated_at')
          .eq('id', user.id)
          .single()
        if (data) {
          setAvatarUrl(data.avatar_url ? `${data.avatar_url}?v=${data.updated_at || Date.now()}` : null)
          setUserName(data.full_name?.charAt(0) || user.email?.charAt(0) || 'U')
        }
      }
    }
    fetchProfile()
  }, [supabase])

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }, [supabase])

  useEffect(() => {
    closeForNavigation()
  }, [pathname])

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-surface border-r border-border-subtle transform transition-transform duration-200 lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-border-subtle">
          <Link href="/membros/dashboard" className="text-sm font-semibold text-text-primary tracking-tight">
            E-commerce Sem Atalho
          </Link>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-secondary rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-4 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-3 mb-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-accent-soft text-accent'
                          : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised'
                      }`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-2 border-t border-border-subtle space-y-2">
          <Link href="/membros/perfil" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-raised transition-colors">
            <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-xs font-medium text-accent overflow-hidden flex-shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                userName
              )}
            </div>
            <span className="text-sm text-text-secondary truncate">Meu Perfil</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-muted hover:text-text-secondary rounded-lg hover:bg-surface-raised transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col bg-surface border-r border-border-subtle transition-all duration-200 ${collapsed ? 'w-16' : 'w-56'}`}>
        <div className="h-14 flex items-center px-4 border-b border-border-subtle">
          {!collapsed && (
            <Link href="/membros/dashboard" className="text-sm font-semibold text-text-primary tracking-tight">
              E-commerce Sem Atalho
            </Link>
          )}
        </div>

        <nav className="flex-1 py-3 px-2 space-y-4 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? 'bg-accent-soft text-accent'
                          : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised'
                      }`}
                    >
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-2 border-t border-border-subtle space-y-2">
          {!collapsed && (
            <Link href="/membros/perfil" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-raised transition-colors">
              <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-xs font-medium text-accent overflow-hidden flex-shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  userName
                )}
              </div>
              <span className="text-sm text-text-secondary truncate">Meu Perfil</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/membros/perfil" className="flex items-center justify-center py-2">
              <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center text-xs font-medium text-accent overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  userName
                )}
              </div>
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 text-text-muted hover:text-text-secondary py-2 rounded-lg hover:bg-surface-raised transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-text-muted hover:text-text-secondary rounded-lg hover:bg-surface-raised transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
