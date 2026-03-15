import React from 'react'
import { RefreshCcw } from 'lucide-react'
import { cn } from '../../lib/utils'

interface LoadingSpinnerProps {
  className?: string
  size?: number
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  className, 
  size = 32 
}) => {
  return (
    <RefreshCcw 
      size={size} 
      className={cn("text-emerald-600 animate-spin", className)} 
    />
  )
}

interface PageLoaderProps {
  message?: string
}

export const PageLoader: React.FC<PageLoaderProps> = ({ 
  message = "Loading..." 
}) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f9fafb]">
      <div className="text-center animate-in fade-in zoom-in-95 duration-300">
        <LoadingSpinner className="mx-auto mb-4" size={40} />
        <div className="text-slate-600 font-bold tracking-tight text-lg">{message}</div>
      </div>
    </div>
  )
}

export const SectionLoader: React.FC<PageLoaderProps> = ({ 
  message = "Loading..." 
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 w-full h-full min-h-[150px]">
      <div className="text-center animate-in fade-in zoom-in-95 duration-300">
        <LoadingSpinner className="mx-auto mb-4" size={40} />
        <div className="text-slate-600 font-bold tracking-tight text-lg">{message}</div>
      </div>
    </div>
  )
}

interface LoadingTextProps {
  text?: string
  className?: string
  spinnerSize?: number
}

export const LoadingText: React.FC<LoadingTextProps> = ({ 
  text = "Loading...", 
  className,
  spinnerSize = 16
}) => {
  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <LoadingSpinner size={spinnerSize} className="text-current" />
      <span>{text}</span>
    </div>
  )
}
