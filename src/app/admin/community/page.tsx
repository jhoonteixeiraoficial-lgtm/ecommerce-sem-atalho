'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, Trash2, Ban, MessageSquare, User, Calendar } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface CommunityPost {
  id: string
  content: string
  category: string
  created_at: string
  image_url: string
  user_id: string
  profiles: {
    full_name: string
    email: string
    is_banned: boolean
  }
}

export default function AdminCommunityPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [banConfirm, setBanConfirm] = useState<{ userId: string; userName: string } | null>(null)
  const [banReason, setBanReason] = useState('')
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    checkAdminAndFetch()
  }, [])

  const checkAdminAndFetch = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') { router.push('/membros/dashboard'); return }

    const { data, error } = await supabase
      .from('community_posts')
      .select(`
        *,
        profiles:user_id (full_name, email, is_banned)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      setError('Erro ao carregar posts')
    } else {
      setPosts((data as CommunityPost[]) || [])
    }
    setLoading(false)
  }

  const handleDeletePost = async (postId: string) => {
    const { error } = await supabase
      .from('community_posts')
      .delete()
      .eq('id', postId)

    if (!error) {
      setPosts(posts.filter(p => p.id !== postId))
      setDeleteConfirm(null)
    }
  }

  const handleBanUser = async () => {
    if (!banConfirm || !banReason.trim()) return

    const { error } = await supabase
      .from('profiles')
      .update({
        is_banned: true,
        ban_reason: banReason.trim(),
        banned_at: new Date().toISOString()
      })
      .eq('id', banConfirm.userId)

    if (!error) {
      setPosts(posts.map(p =>
        p.user_id === banConfirm.userId
          ? { ...p, profiles: { ...p.profiles, is_banned: true } }
          : p
      ))
      setBanConfirm(null)
      setBanReason('')
    }
  }

  const filteredPosts = posts.filter(post =>
    post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    post.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    post.profiles?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return <div className="p-6 text-text-muted">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-accent" />
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Gerenciar Comunidade</h1>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-error/10 text-error text-sm">{error}</div>
      )}

      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Buscar posts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-surface border border-border-subtle rounded-lg px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
        />
        <div className="text-xs text-text-muted">
          {filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="space-y-3">
        {filteredPosts.map((post) => (
          <Card key={post.id} className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-medium text-accent">
                  {post.profiles?.full_name?.charAt(0) || '?'}
                </div>
                <div>
                  <div className="text-sm font-medium text-text-primary">
                    {post.profiles?.full_name || 'Sem nome'}
                    {post.profiles?.is_banned && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-error/10 text-error">
                        SUSPENSO
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-muted flex items-center gap-2">
                    <span>{post.profiles?.email}</span>
                    <span>·</span>
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(post.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!post.profiles?.is_banned && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBanConfirm({ userId: post.user_id, userName: post.profiles?.full_name || 'Usuário' })}
                    className="text-error hover:bg-error/10"
                  >
                    <Ban className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirm(post.id)}
                  className="text-error hover:bg-error/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="text-sm text-text-primary whitespace-pre-wrap">{post.content}</div>

            {post.category && (
              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-surface-raised text-text-muted">
                {post.category}
              </span>
            )}

            {deleteConfirm === post.id && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-error/5 border border-error/20">
                <span className="text-xs text-error">Excluir este post?</span>
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleDeletePost(post.id)}
                  className="bg-error hover:bg-error/90"
                >
                  Excluir
                </Button>
              </div>
            )}
          </Card>
        ))}

        {filteredPosts.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">Nenhum post encontrado</p>
          </div>
        )}
      </div>

      {banConfirm && (
        <div className="fixed inset-0 bg-bg/80 flex items-center justify-center p-4 z-50">
          <div className="max-w-sm w-full rounded-xl bg-surface border border-border-subtle p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-error" />
              <h3 className="text-lg font-medium text-text-primary">Suspender Usuário</h3>
            </div>
            <p className="text-sm text-text-muted">
              Tem certeza que deseja suspender <strong>{banConfirm.userName}</strong>?
            </p>
            <textarea
              placeholder="Motivo da suspensão..."
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
    </div>
  )
}
