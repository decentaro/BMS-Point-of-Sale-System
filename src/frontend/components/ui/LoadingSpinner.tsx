import React from 'react'
import { cn } from '../../lib/utils'

interface LoadingSpinnerProps {
  className?: string
  size?: number
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  className,
  size = 32,
}) => {
  return (
    <svg
      className={cn('animate-spin-smooth text-emerald-600', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <circle
        className="opacity-20"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

interface PageLoaderProps {
  message?: string
}

export const PageLoader: React.FC<PageLoaderProps> = ({
  message = 'Loading...',
}) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <LoadingSpinner className="mx-auto mb-3" size={40} />
        <div className="text-slate-600 font-medium text-sm">{message}</div>
      </div>
    </div>
  )
}

export const SectionLoader: React.FC<PageLoaderProps> = ({
  message = 'Loading...',
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-10 w-full h-full min-h-[160px]">
      <LoadingSpinner className="mx-auto mb-3" size={36} />
      <div className="text-slate-500 font-medium text-sm">{message}</div>
    </div>
  )
}

interface LoadingTextProps {
  text?: string
  className?: string
  spinnerSize?: number
}

export const LoadingText: React.FC<LoadingTextProps> = ({
  text = 'Loading...',
  className,
  spinnerSize = 16,
}) => {
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <LoadingSpinner size={spinnerSize} className="text-current" />
      <span>{text}</span>
    </div>
  )
}
