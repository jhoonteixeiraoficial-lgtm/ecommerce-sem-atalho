'use client'

import { Bell, BookOpen, Video, AlertCircle, ChevronRight } from 'lucide-react'

const updates = [
  { id: 1, type: 'aula', title: 'Nova aula: SEO para Mercado Livre', description: 'Otimize seus anúncios pra aparecer nas primeiras posições.', date: 'Há 2 dias', icon: BookOpen, iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400' },
  { id: 2, type: 'aviso', title: 'Alteração nas taxas do ML', description: 'A partir de 01/10, comissões serão atualizadas.', date: 'Há 5 dias', icon: AlertCircle, iconBg: 'bg-amber-500/15', iconColor: 'text-amber-400' },
  { id: 3, type: 'live', title: 'Live agendada: Mercado Ads', description: 'Aprenda a criar campanhas no Mercado Ads.', date: 'Próxima semana', icon: Video, iconBg: 'bg-purple-500/15', iconColor: 'text-purple-400' },
  { id: 4, type: 'aula', title: 'Módulo de Fornecedores atualizado', description: '2 novas aulas sobre negociação com fornecedores.', date: 'Há 1 semana', icon: BookOpen, iconBg: 'bg-blue-500/15', iconColor: 'text-blue-400' },
  { id: 5, type: 'recurso', title: 'Planilha de Precificação atualizada', description: 'Novos campos pra cálculo de frete e impostos.', date: 'Há 2 semanas', icon: Bell, iconBg: 'bg-green-500/15', iconColor: 'text-green-400' },
]

export default function AtualizacoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Atualizações</h1>
        <p className="text-sm text-text-muted mt-1">Novidades da plataforma</p>
      </div>

      <div className="space-y-2">
        {updates.map((update) => (
          <div key={update.id} className="flex items-start gap-3 p-4 rounded-xl bg-surface border border-border-subtle hover:border-border transition-colors cursor-pointer" onClick={() => alert(`${update.title}\n\n${update.description}`)}>
            <div className={`p-2 rounded-lg ${update.iconBg} flex-shrink-0`}>
              <update.icon className={`w-4 h-4 ${update.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] text-text-muted">{update.date}</span>
                <span className="px-1.5 py-0.5 bg-surface-raised rounded text-[10px] text-text-muted capitalize">{update.type}</span>
              </div>
              <h3 className="text-sm font-medium text-text-primary">{update.title}</h3>
              <p className="text-xs text-text-muted mt-0.5">{update.description}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0 mt-1" />
          </div>
        ))}
      </div>
    </div>
  )
}
