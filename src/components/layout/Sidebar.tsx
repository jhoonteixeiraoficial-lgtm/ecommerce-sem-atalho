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

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/membros/dashboard' },
  { icon: BookOpen, label: 'Aulas', href: '/membros/aulas' },
  { icon: Users, label: 'Comunidade', href: '/membros/comunidade' },
  { icon: Video, label: 'Lives', href: '/membros/lives' },
  { icon: Calendar, label: 'Calendário', href: '/membros/calendario' },
  { icon: Download, label: 'Materiais', href: '/membros/materiais' },
  { icon: Bell, label: 'Atualizações', href: '/membros/atualizacoes' },
  { icon: Sparkles, label: 'Acertive Ecom', href: '/membros/acertive-ecom' },
  { icon: HelpCircle, label: 'Suporte', href: '/membros/suporte' },
  { icon: User, label: 'Perfil', href: '/membros/perfil' },
]

const adminItem = { icon: Shield, label: 'Administração', href: '/admin' }

interface SidebarProps {
  open: boolean
  onClose: () => void
  isAdmin?: boolean
}

export default function Sidebar({ open, onClose, isAdmin = false }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [supabase] = useState(() => createClient())
  const closeForNavigation = useEffectEvent(onClose)
  const navItems = isAdmin ? [...menuItems, adminItem] : menuItems

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

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
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
        </nav>

        <div className="p-2 border-t border-border-subtle">
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

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
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
        </nav>

        <div className="p-2 border-t border-border-subtle">
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
