'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, BookOpen, Bell, User } from 'lucide-react'

const items = [
  { icon: LayoutDashboard, label: 'Início', href: '/membros/dashboard' },
  { icon: Users, label: 'Comunidade', href: '/membros/comunidade' },
  { icon: BookOpen, label: 'Aulas', href: '/membros/aulas' },
  { icon: Bell, label: 'Avisos', href: '/membros/atualizacoes' },
  { icon: User, label: 'Perfil', href: '/membros/perfil' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border-subtle flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors ${
              isActive ? 'text-accent' : 'text-text-muted'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
