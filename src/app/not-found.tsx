import Link from 'next/link'
import Button from '@/components/ui/Button'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-accent mb-4">404</h1>
        <h2 className="text-2xl font-bold text-text-primary mb-4">Página não encontrada</h2>
        <p className="text-text-secondary mb-8">
          A página que você procura não existe ou foi movida.
        </p>
        <Link href="/">
          <Button>
            Voltar para o Início
          </Button>
        </Link>
      </div>
    </div>
  )
}
