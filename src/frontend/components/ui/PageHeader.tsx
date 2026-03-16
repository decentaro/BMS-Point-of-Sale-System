import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from './button'
import { cn } from '../../lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  backLabel?: string
  right?: React.ReactNode
  className?: string
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  right,
  className,
}) => {
  return (
    <header
      className={cn(
        'relative h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0',
        className
      )}
    >
      {/* Left — back button, sits in normal flow so it doesn't overlap title */}
      <div className="relative z-10 flex-shrink-0">
        {onBack && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="gap-1.5 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {backLabel}
          </Button>
        )}
      </div>

      {/* Center — absolutely centered so it's always in the middle of the header
          regardless of how wide the left or right slots are.
          pointer-events-none keeps clicks from being swallowed. */}
      <div className="absolute inset-x-0 flex items-center justify-center pointer-events-none px-28">
        <div className="text-center min-w-0">
          <h1 className="text-xl font-semibold text-emerald-600 leading-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-[10px] text-slate-500 leading-none mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right — auto-sized to fit its content (SessionStatus, buttons, etc.) */}
      <div className="relative z-10 flex-shrink-0 flex items-center">
        {right}
      </div>
    </header>
  )
}

export default PageHeader
