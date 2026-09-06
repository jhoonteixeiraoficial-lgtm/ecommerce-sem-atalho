'use client'

import { useState, useEffect } from 'react'
import { Search, Bell, Menu } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface HeaderProps {
  onMenuToggle?: () => void
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, updated_at')
          .eq('id', user.id)
          .single()
        if (data) {
          setAvatarUrl(data.avatar_url || null)
          setUserName(data.full_name?.charAt(0) || user.email?.charAt(0) || 'U')
        }
      }
    }
    fetchProfile()
  }, [])

  return (
    <header className="h-14 bg-surface border-b border-border-subtle flex items-center justify-between px-4 lg:px-5">
      <div className="lg:hidden">
        <button
          onClick={onMenuToggle}
          className="p-2.5 text-text-muted hover:text-text-secondary hover:bg-surface-raised rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <div className="hidden md:flex flex-1 max-w-md mx-8">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                alert(`Buscando por: "${searchQuery}"`)
              }
            }}
            className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <button className="relative p-2.5 text-text-muted hover:text-text-secondary hover:bg-surface-raised rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-accent rounded-full"></span>
        </button>

        <Link href="/membros/perfil" className="min-w-[44px] min-h-[44px] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-surface-raised border border-border flex items-center justify-center text-xs font-medium text-text-secondary hover:border-accent/40 transition-colors cursor-pointer overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              userName
            )}
          </div>
        </Link>
      </div>
    </header>
  )
}
