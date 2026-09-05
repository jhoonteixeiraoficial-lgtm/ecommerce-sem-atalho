'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Shield, Users, BookOpen, FileText, Video, BarChart3, ChevronRight, Radio, MessageSquare, Ban, Calendar } from 'lucide-react'
import Card from '@/components/ui/Card'
import Link from 'next/link'

export default function AdminDashboard() {
  const [stats, setStats] = useState({ users: 0, active: 0, lessons: 0, materials: 0, lives: 0, community: 0, banned: 0 })
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'admin') {
        router.push('/membros/dashboard')
        return
      }

      const [usersRes, lessonsRes, materialsRes, livesRes, communityRes, bannedRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('lessons').select('id', { count: 'exact', head: true }),
        supabase.from('materials').select('id', { count: 'exact', head: true }),
        supabase.from('lives').select('id', { count: 'exact', head: true }),
        supabase.from('community_posts').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_banned', true),
      ])

      const { count: activeCount } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')

      setStats({
        users: usersRes.count ?? 0,
        active: activeCount ?? 0,
        lessons: lessonsRes.count ?? 0,
        materials: materialsRes.count ?? 0,
        lives: livesRes.count ?? 0,
        community: communityRes.count ?? 0,
        banned: bannedRes.count ?? 0,
      })
      setLoading(false)
    }
    check()
  }, [])

  if (loading) {
    return <div className="p-6 text-text-muted">Carregando...</div>
  }

  const cards = [
    { label: 'Total de usuários', value: stats.users, icon: Users, color: 'text-accent' },
    { label: 'Assinantes ativos', value: stats.active, icon: BarChart3, color: 'text-success' },
    { label: 'Total de aulas', value: stats.lessons, icon: Video, color: 'text-accent' },
    { label: 'Total de materiais', value: stats.materials, icon: FileText, color: 'text-accent' },
    { label: 'Total de lives', value: stats.lives, icon: Radio, color: 'text-accent' },
    { label: 'Posts na comunidade', value: stats.community, icon: MessageSquare, color: 'text-accent' },
    { label: 'Usuários suspensos', value: stats.banned, icon: Ban, color: 'text-error' },
  ]

  const links = [
    { href: '/admin/agenda', label: 'Agenda e Conteúdos', desc: 'Lives, aulas, materiais e eventos', icon: Calendar },
    { href: '/admin/lessons', label: 'Gerenciar Aulas', desc: 'Módulos e aulas do curso', icon: BookOpen },
    { href: '/admin/materials', label: 'Gerenciar Materiais', desc: 'PDFs e arquivos para download', icon: FileText },
    { href: '/admin/users', label: 'Gerenciar Usuários', desc: 'Ver todos os membros', icon: Users },
    { href: '/admin/community', label: 'Gerenciar Comunidade', desc: 'Moderar posts e usuários', icon: MessageSquare },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-accent" />
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Painel Admin</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label} className="text-center">
            <card.icon className={`w-5 h-5 ${card.color} mx-auto mb-2`} />
            <div className="text-2xl font-semibold text-text-primary">{card.value}</div>
            <div className="text-xs text-text-muted">{card.label}</div>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Acesso rápido</h2>
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="flex items-center gap-4 cursor-pointer hover:bg-surface-raised transition-colors">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                <link.icon className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary">{link.label}</div>
                <div className="text-xs text-text-muted">{link.desc}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-text-muted" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
