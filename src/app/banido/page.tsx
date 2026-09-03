'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Ban, Mail } from 'lucide-react'
import Link from 'next/link'

export default function BanidoPage() {
  const [banReason, setBanReason] = useState('')
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    const fetchBanReason = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('ban_reason')
          .eq('id', user.id)
          .single()
        if (profile?.ban_reason) {
          setBanReason(profile.ban_reason)
        }
      }
    }
    fetchBanReason()
  }, [])

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto">
          <Ban className="w-8 h-8 text-error" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-text-primary">Sua conta foi suspensa</h1>
          <p className="text-text-muted">
            Você não tem mais acesso à plataforma.
          </p>
        </div>

        {banReason && (
          <div className="p-4 rounded-xl bg-surface border border-border-subtle">
            <p className="text-xs text-text-muted mb-1">Motivo:</p>
            <p className="text-sm text-text-primary">{banReason}</p>
          </div>
        )}

        <div className="space-y-3">
          <Link
            href="mailto:suporte@esasematalho.com.br"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-bg font-medium text-sm hover:bg-accent-hover transition-colors"
          >
            <Mail className="w-4 h-4" />
            Entrar em contato com o suporte
          </Link>
          
          <p className="text-xs text-text-muted">
            Se você acha que isso é um erro, entre em contato com o suporte.
          </p>
        </div>
      </div>
    </div>
  )
}
