import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100'
    
    const variants = {
      primary: 'bg-accent text-bg hover:bg-accent-hover hover:shadow-[0_4px_24px_rgba(200,164,78,0.25)] focus-visible:outline-accent',
      secondary: 'bg-transparent text-text-primary border border-border hover:bg-surface-raised hover:border-accent/40 hover:shadow-[0_2px_12px_rgba(200,164,78,0.1)] focus-visible:outline-accent',
      ghost: 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-raised focus-visible:outline-accent',
    }
    
    const sizes = {
      sm: 'h-8 px-3.5 text-xs rounded-md gap-1.5',
      md: 'h-10 px-5 text-sm rounded-lg gap-2',
      lg: 'h-12 px-7 text-base rounded-lg gap-2',
    }

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} animate-spin`} />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
