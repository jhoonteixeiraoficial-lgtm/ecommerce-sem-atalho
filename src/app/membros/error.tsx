'use client'

export default function MembrosError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-white mb-2">Algo deu errado</h2>
      <p className="text-white/60 mb-6 max-w-md">
        Ocorreu um erro inesperado. Por favor, tente novamente.
      </p>
      <button
        onClick={reset}
        className="px-6 py-3 bg-[#c8a44e] text-black font-medium rounded-lg hover:bg-[#d4b05a] transition-colors"
      >
        Tentar novamente
      </button>
    </div>
  )
}
