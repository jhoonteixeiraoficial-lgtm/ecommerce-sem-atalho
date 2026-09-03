'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function CadastroPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [supabase] = useState(() => createClient())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.target as HTMLFormElement
    const fullName = (form.elements.namedItem('fullName') as HTMLInputElement).value
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const phone = (form.elements.namedItem('phone') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.')
      setLoading(false)
      return
    }

    // Check for at least one uppercase, one lowercase, and one number
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    
    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
      setError('A senha deve conter pelo menos uma letra maiúscula, uma minúscula e um número.')
      setLoading(false)
      return
    }

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone,
        },
      },
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        setError('Este e-mail já está cadastrado.')
      } else {
        setError('Erro ao criar conta. Tente novamente.')
      }
      setLoading(false)
      return
    }

    // Account created - user needs to verify email and then subscribe
    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="w-full max-w-md text-center">
        <div className="mb-10">
          <Link href="/" className="text-lg font-semibold text-text-primary tracking-tight">E-commerce Sem Atalho</Link>
        </div>
        <div className="bg-surface border border-border-subtle rounded-2xl p-8">
          <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Conta criada!</h2>
          <p className="text-sm text-text-muted mb-6">
            Verifique seu e-mail para confirmar o cadastro. Após a confirmação, faça login e ative sua assinatura para acessar o conteúdo.
          </p>
          <Link href="/login">
            <Button className="w-full">Ir para o Login</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-accent">E-commerce Sem Atalho</h1>
        <p className="text-text-muted mt-2">Comece a vender no Mercado Livre</p>
      </div>

      <div className="bg-surface border border-border-subtle rounded-2xl p-8">
        <h2 className="text-xl font-bold text-text-primary mb-6">Criar sua conta</h2>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-sm text-error">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input 
            label="Nome Completo" 
            name="fullName"
            placeholder="Seu nome"
            required
          />
          <Input 
            label="E-mail" 
            name="email"
            type="email" 
            placeholder="seu@email.com"
            required
          />
          <Input 
            label="Telefone" 
            name="phone"
            type="tel" 
            placeholder="(00) 00000-0000"
            required
          />
          <Input 
            label="Senha" 
            name="password"
            type="password" 
            placeholder="••••••••"
            required
          />
          <Input 
            label="Confirmar Senha" 
            name="confirmPassword"
            type="password" 
            placeholder="••••••••"
            required
          />

          <label className="flex items-start gap-2 text-sm text-text-secondary">
            <input type="checkbox" id="terms" className="mt-0.5 rounded border-border accent-accent" required />
            <span>
              Concordo com os{' '}
              <Link href="/politicas/termos" className="text-accent hover:underline">Termos de Uso</Link>{' '}
              e{' '}
              <Link href="/politicas/privacidade" className="text-accent hover:underline">Política de Privacidade</Link>
            </span>
          </label>

          <Button type="submit" loading={loading} className="w-full">
            Criar Conta
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-text-muted">
          Já tem uma conta?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Entrar
          </Link>
        </div>
      </div>
    </div>
  )
}
