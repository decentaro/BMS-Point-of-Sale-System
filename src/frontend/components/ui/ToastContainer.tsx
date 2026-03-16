import React from 'react'
import { useToast, Toast, ToastType } from '../../contexts/ToastContext'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-600 text-white border-emerald-700',
  error:   'bg-red-600 text-white border-red-700',
  warning: 'bg-amber-500 text-white border-amber-600',
  info:    'bg-[hsl(215,65%,20%)] text-white border-[hsl(215,65%,14%)]',
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 shrink-0" />,
  error:   <XCircle className="w-4 h-4 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 shrink-0" />,
  info:    <Info className="w-4 h-4 shrink-0" />,
}

const ToastItem: React.FC<{ toast: Toast }> = ({ toast }) => {
  const { dismissToast } = useToast()
  return (
    <div
      className={`
        animate-toast-enter
        flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border
        text-sm font-medium min-w-[280px] max-w-sm
        ${STYLES[toast.type]}
      `}
    >
      {ICONS[toast.type]}
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => dismissToast(toast.id)}
        className="opacity-70 hover:opacity-100 transition-opacity ml-1 shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

const ToastContainer: React.FC = () => {
  const { toasts } = useToast()
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>
  )
}

export default ToastContainer
