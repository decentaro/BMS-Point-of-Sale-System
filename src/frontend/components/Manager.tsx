import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  History,
  RotateCcw,
  Package,
  Boxes,
  Users,
  Receipt,
  Settings,
  BarChart2,
  Activity,
  ShieldAlert,
  LogOut,
} from 'lucide-react'
import { Button } from './ui/button'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionGuard from './SessionGuard'
import SessionStatus from './SessionStatus'
import SessionManager from '../utils/SessionManager'

interface NavCard {
  route: string
  label: string
  sub: string
  icon: React.ElementType
  accent: string
}

const CASHIER_CARDS: NavCard[] = [
  { route: '/pos',           label: 'Point of Sale',  sub: 'Start selling',      icon: ShoppingCart, accent: 'emerald' },
  { route: '/sales-history', label: 'Sales History',  sub: 'View transactions',  icon: History,      accent: 'blue'    },
  { route: '/returns',       label: 'Returns',        sub: 'Process refunds',    icon: RotateCcw,    accent: 'orange'  },
]

const INVENTORY_CARDS: NavCard[] = [
  { route: '/inventory',            label: 'Basic Inventory',    sub: 'Add / edit products',    icon: Package,  accent: 'teal'   },
  { route: '/inventory-management', label: 'Advanced Inventory', sub: 'Adjustments & tracking', icon: Boxes,    accent: 'teal'   },
]

const MANAGER_CARDS: NavCard[] = [
  { route: '/employees',    label: 'Employees',   sub: 'Manage staff',    icon: Users,   accent: 'violet' },
  { route: '/tax-settings', label: 'Tax Settings', sub: 'Configure taxes', icon: Receipt, accent: 'navy'   },
]

const SYSTEM_CARDS: NavCard[] = [
  { route: '/system-settings', label: 'System Settings', sub: 'Preferences',          icon: Settings,    accent: 'slate'  },
  { route: '/reports',         label: 'Reports',         sub: 'Analytics',             icon: BarChart2,   accent: 'emerald'},
  { route: '/user-activity',   label: 'User Activity',   sub: 'Audit trail',           icon: Activity,    accent: 'blue'   },
  { route: '/admin',           label: 'Admin Panel',     sub: 'Technical settings',    icon: ShieldAlert, accent: 'red'    },
]

const ACCENT_CLASSES: Record<string, { icon: string; hover: string; bg: string }> = {
  emerald: { icon: 'text-emerald-600', hover: 'hover:border-emerald-300 hover:bg-emerald-50', bg: 'bg-emerald-50' },
  blue:    { icon: 'text-blue-600',    hover: 'hover:border-blue-300 hover:bg-blue-50',       bg: 'bg-blue-50'    },
  orange:  { icon: 'text-orange-500',  hover: 'hover:border-orange-300 hover:bg-orange-50',   bg: 'bg-orange-50'  },
  teal:    { icon: 'text-teal-600',    hover: 'hover:border-teal-300 hover:bg-teal-50',       bg: 'bg-teal-50'    },
  violet:  { icon: 'text-violet-600',  hover: 'hover:border-violet-300 hover:bg-violet-50',   bg: 'bg-violet-50'  },
  navy:    { icon: 'text-[hsl(215,65%,30%)]', hover: 'hover:border-slate-400 hover:bg-slate-100', bg: 'bg-slate-100' },
  slate:   { icon: 'text-slate-600',   hover: 'hover:border-slate-300 hover:bg-slate-100',   bg: 'bg-slate-50'   },
  red:     { icon: 'text-red-600',     hover: 'hover:border-red-300 hover:bg-red-50',         bg: 'bg-red-50'     },
}

const NavCardButton: React.FC<{ card: NavCard; onClick: () => void }> = ({ card, onClick }) => {
  const ac = ACCENT_CLASSES[card.accent] ?? ACCENT_CLASSES.slate
  const Icon = card.icon
  return (
    <button
      onClick={onClick}
      className={`
        h-[72px] w-full flex flex-col items-center justify-center gap-1
        bg-white border border-slate-200 rounded-xl shadow-sm
        transition-all duration-150 active:scale-[0.97]
        ${ac.hover}
      `}
    >
      <Icon className={`w-5 h-5 ${ac.icon}`} />
      <span className="text-[13px] font-semibold text-slate-800 leading-tight">{card.label}</span>
      <span className="text-[10px] text-slate-400 leading-none">{card.sub}</span>
    </button>
  )
}

const Manager: React.FC = () => {
  const navigate = useNavigate()
  const { businessSettings, loading } = useBusinessSettings()

  const session = SessionManager.getCurrentSession()
  const roles = (session?.role || 'Cashier').split(',').map(r => r.trim())
  const hasCashier  = roles.includes('Cashier')  || roles.includes('Manager')
  const hasInventory = roles.includes('Inventory') || roles.includes('Manager')
  const isManager   = roles.includes('Manager')

  return (
    <SessionGuard>
      <div className="w-full h-full flex flex-col bg-slate-50">
        {/* Header */}
        <header className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              SessionManager.clearSession()
              navigate('/login')
            }}
            className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </Button>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-emerald-600 leading-tight">
              {loading ? '—' : (businessSettings.businessName || 'Business Name')}
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">
              {roles.join(' · ')} Dashboard
            </p>
          </div>

          <SessionStatus />
        </header>

        {/* Main content */}
        <main className="flex-1 px-5 py-5 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-5">

            {/* Cashier section */}
            {hasCashier && (
              <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
                  Quick Actions
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  {CASHIER_CARDS.map(card => (
                    <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
                  ))}
                </div>
              </section>
            )}

            {/* Inventory section */}
            {hasInventory && (
              <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
                  Inventory
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {INVENTORY_CARDS.map(card => (
                    <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
                  ))}
                </div>
              </section>
            )}

            {/* Manager-only sections */}
            {isManager && (
              <>
                <section>
                  <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
                    Management
                  </h2>
                  <div className="grid grid-cols-4 gap-3">
                    {MANAGER_CARDS.map(card => (
                      <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
                    System &amp; Reports
                  </h2>
                  <div className="grid grid-cols-4 gap-3">
                    {SYSTEM_CARDS.map(card => (
                      <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
                    ))}
                  </div>
                </section>
              </>
            )}

          </div>
        </main>
      </div>
    </SessionGuard>
  )
}

export default Manager
