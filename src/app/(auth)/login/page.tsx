'use client'

import { useState } from 'react'
import { ArrowRight, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [supabase] = useState(() => createClient())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.target as HTMLFormElement
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }

    window.location.href = '/membros/dashboard'
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Image */}
      <div className="hidden lg:flex lg:w-[60%] relative bg-bg overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&h=800&fit=crop"
          alt="Centro de distribuição"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/60 to-transparent" />
        
        {/* Content overlay */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <img src="/logo-horizontal.svg" alt="E-commerce Sem Atalho" className="h-10 mb-16" />
            
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Estratégias práticas para
              <br />
              vender mais e escalar
              <br />
              <span className="text-accent">seu e-commerce.</span>
            </h1>
            
            <div className="flex items-center gap-3 mt-8">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm text-text-secondary">
                Método validado
                <br />
                <span className="text-text-muted">por quem vive o e-commerce</span>
                <br />
                <span className="text-text-muted">todos os dias.</span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <img src="/logo-icon.svg" alt="" className="h-12" />
            <div>
              <p className="text-xs text-text-muted">Copyright © 2026 - E-commerce Sem Atalho</p>
              <p className="text-xs text-text-muted">Todos os direitos reservados.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="w-full lg:w-[40%] bg-surface flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-10">
            <img src="/logo-horizontal.svg" alt="E-commerce Sem Atalho" className="h-8" />
          </div>

          <div className="mb-10 text-center lg:text-left">
            <img src="/logo-horizontal.svg" alt="E-commerce Sem Atalho" className="h-10 mb-8 hidden lg:block" />
            <h1 className="text-2xl font-bold text-text-primary mb-2">Acesse sua conta</h1>
            <p className="text-sm text-text-muted">Entre com seu e-mail e senha para continuar</p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-error/10 border border-error/20 text-sm text-error">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  name="email"
                  type="email"
                  placeholder="seu@email.com"
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-bg border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Sua senha"
                  required
                  className="w-full pl-12 pr-12 py-3.5 bg-bg border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-border bg-bg text-accent focus:ring-accent" />
                Lembrar de mim
              </label>
              <a href="#" className="text-sm text-accent hover:text-accent-hover transition-colors">
                Esqueceu sua senha?
              </a>
            </div>

            <Button type="submit" loading={loading} className="w-full py-3.5 text-base">
              Entrar
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-text-muted">
            Não tem uma conta?{' '}
            <Link href="/cadastro" className="text-accent hover:text-accent-hover font-medium transition-colors">
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
