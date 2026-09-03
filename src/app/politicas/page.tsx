import Link from 'next/link'

export default function PoliticasPage() {
  return (
    <div className="min-h-screen bg-bg py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-text-primary mb-8">Políticas</h1>

        <div className="space-y-4">
          <Link href="/politicas/privacidade" className="block p-6 bg-surface rounded-xl border border-border-subtle hover:border-accent/30 transition-colors">
            <h2 className="text-xl font-bold text-text-primary mb-2">Política de Privacidade</h2>
            <p className="text-text-secondary">Como coletamos, usamos e protegemos suas informações.</p>
          </Link>

          <Link href="/politicas/termos" className="block p-6 bg-surface rounded-xl border border-border-subtle hover:border-accent/30 transition-colors">
            <h2 className="text-xl font-bold text-text-primary mb-2">Termos de Uso</h2>
            <p className="text-text-secondary">Regras e condições para uso da plataforma.</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
