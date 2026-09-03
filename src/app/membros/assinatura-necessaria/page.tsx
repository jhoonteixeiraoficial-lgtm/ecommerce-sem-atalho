'use client'

import { Shield } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'

export default function AssinaturaNecessariaPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
          <Shield className="w-8 h-8 text-accent" />
        </div>
        <h1 className="text-2xl font-semibold text-text-primary mb-3 tracking-tight">
          Assinatura necessária
        </h1>
        <p className="text-text-secondary mb-8">
          Para acessar esta área, você precisa ter uma assinatura ativa no E-commerce Sem Atalho.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/#planos">
            <Button>
              Ver planos
            </Button>
          </Link>
          <Link href="/membros/perfil">
            <Button variant="secondary">
              Minha assinatura
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
