import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'raised'
}

export default function Card({ className = '', variant = 'default', children, ...props }: CardProps) {
  const variants = {
    default: 'bg-surface border-border-subtle',
    raised: 'bg-surface-raised border-border',
  }

  return (
    <div
      className={`rounded-xl border p-5 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
