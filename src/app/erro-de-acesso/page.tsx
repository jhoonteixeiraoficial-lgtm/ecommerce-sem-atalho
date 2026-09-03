import Link from 'next/link'

export default function AccessErrorPage() {
  return (
    <main className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="max-w-md text-center rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-3">
          Não foi possível verificar seu acesso
        </h1>
        <p className="text-sm text-text-muted mb-6">
          O serviço está temporariamente indisponível. Tente novamente em alguns instantes.
        </p>
        <Link href="/login" className="text-sm font-medium text-accent hover:text-accent-hover">
          Voltar para o login
        </Link>
      </div>
    </main>
  )
}
