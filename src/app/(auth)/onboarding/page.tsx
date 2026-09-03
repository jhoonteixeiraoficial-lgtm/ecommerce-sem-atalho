'use client'

import { useState } from 'react'
import { Rocket, ShoppingBag, Target, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import Button from '@/components/ui/Button'

interface StepOption {
  id: string
  label: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
}

interface Step {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  options?: StepOption[]
  multiple?: boolean
}

const steps: Step[] = [
  {
    title: 'Bem-vindo ao E-commerce Sem Atalho!',
    description: 'Vamos personalizar sua experiência para você aproveitar ao máximo.',
    icon: Rocket,
  },
  {
    title: 'Qual seu nível de experiência?',
    options: [
      { id: 'iniciante', label: 'Iniciante', description: 'Nunca vendei online' },
      { id: 'intermediario', label: 'Intermediário', description: 'Já tenho alguma experiência' },
      { id: 'avancado', label: 'Avançado', description: 'Já vendo no Mercado Livre' },
    ],
  },
  {
    title: 'O que mais te interessa?',
    options: [
      { id: 'anuncios', label: 'Criar Anúncios', icon: Target },
      { id: 'produtos', label: 'Encontrar Produtos', icon: ShoppingBag },
    ],
    multiple: true,
  },
  {
    title: 'Tudo pronto!',
    description: 'Sua conta está configurada. Vamos começar?',
  },
]

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0)
  const [selections, setSelections] = useState<Record<string, string[]>>({})

  const step = steps[currentStep]

  const toggleSelection = (id: string, multiple?: boolean) => {
    setSelections(prev => {
      if (multiple) {
        const current = prev['interests'] || []
        return {
          ...prev,
          interests: current.includes(id)
            ? current.filter(i => i !== id)
            : [...current, id]
        }
      }
      return { ...prev, level: [id] }
    })
  }

  const isStepComplete = () => {
    if (currentStep === 1) return !!selections.level?.length
    if (currentStep === 2) return (selections.interests?.length || 0) > 0
    return true
  }

  return (
    <div className="w-full max-w-lg">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-accent">E-commerce Sem Atalho</h1>
      </div>

      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i <= currentStep ? 'bg-accent' : 'bg-border'
            }`}
          />
        ))}
      </div>

      <div className="bg-surface border border-border-subtle rounded-2xl p-8 text-center">
        <div className="flex justify-center mb-4">
          {step.icon && <step.icon className="w-12 h-12 text-accent" />}
          {currentStep === steps.length - 1 && (
            <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
              <Check className="w-6 h-6 text-success" />
            </div>
          )}
        </div>

        <h2 className="text-xl font-bold text-text-primary mb-2">{step.title}</h2>
        {step.description && <p className="text-text-muted">{step.description}</p>}

        {step.options && (
          <div className="grid grid-cols-1 gap-3 mt-6">
            {step.options.map((option) => {
              const isSelected = step.multiple
                ? selections['interests']?.includes(option.id)
                : selections.level?.[0] === option.id
              return (
                <button
                  key={option.id}
                  onClick={() => toggleSelection(option.id, step.multiple)}
                  className={`p-4 rounded-lg border text-left transition-colors ${
                    isSelected
                      ? 'bg-accent/20 border-accent'
                      : 'bg-bg border-border-subtle hover:bg-surface-raised'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {option.icon && <option.icon className="w-5 h-5 text-accent" />}
                    <div>
                      <div className="font-medium text-text-primary">{option.label}</div>
                      {option.description && (
                        <div className="text-sm text-text-muted">{option.description}</div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex gap-4 mt-6">
        {currentStep > 0 && (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setCurrentStep(prev => prev - 1)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={() => {
            if (currentStep < steps.length - 1) {
              setCurrentStep(prev => prev + 1)
            } else {
              window.location.href = '/membros/dashboard'
            }
          }}
          disabled={!isStepComplete()}
        >
          {currentStep === steps.length - 1 ? 'Começar' : 'Próximo'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
