import React from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionManager from '../utils/SessionManager'
import SessionStatus from './SessionStatus'

const NAVY = 'hsl(215,65%,30%)'

// ── Section card ────────────────────────────────────────────────────────────
interface SectionCardProps {
  label: string
  children: React.ReactNode
  className?: string
}
export const SectionCard: React.FC<SectionCardProps> = ({ label, children, className = '' }) => (
  <div className={`flex flex-col bg-white rounded-2xl shadow-sm p-4 ${className}`}>
    <div className="flex items-center gap-2 mb-3 flex-shrink-0">
      <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: NAVY }} />
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
    </div>
    <div className="flex-1 min-h-0">{children}</div>
  </div>
)

// ── Shell ────────────────────────────────────────────────────────────────────
interface DashboardShellProps {
  title: string
  children: React.ReactNode
}

const DashboardShell: React.FC<DashboardShellProps> = ({ title, children }) => {
  const navigate = useNavigate()
  const { businessSettings, loading } = useBusinessSettings()

  return (
    <div className="w-full h-full flex flex-col">
      {/* Nav header */}
      <header
        className="h-16 px-5 flex items-center justify-between flex-shrink-0"
        style={{ background: NAVY }}
      >
        <button
          onClick={async () => { await SessionManager.logout(); navigate('/login') }}
          className="flex items-center gap-1.5 text-white/70 hover:text-white border border-white/25 hover:border-white/50 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors active:scale-95"
        >
          <LogOut className="w-3.5 h-3.5" />
          Logout
        </button>

        <div className="text-center">
          <div className="text-white text-lg font-bold leading-tight tracking-tight">
            {loading ? '—' : (businessSettings.businessName || 'Business Name')}
          </div>
          <div className="text-white/50 text-[11px] font-medium mt-0.5">{title}</div>
        </div>

        <SessionStatus dark />
      </header>

      {/* Content — no scroll, fills remaining height */}
      <main className="flex-1 bg-slate-100 overflow-hidden">
        <div className="h-full px-5 py-4">
          {children}
        </div>
      </main>
    </div>
  )
}

export default DashboardShell
