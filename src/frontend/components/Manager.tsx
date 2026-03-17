import React from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Button } from './ui/button'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionGuard from './SessionGuard'
import SessionStatus from './SessionStatus'
import SessionManager from '../utils/SessionManager'
import { CASHIER_CARDS, INVENTORY_CARDS, MANAGER_CARDS, SYSTEM_CARDS } from '../config/nav-data'
import NavCardButton from './ui/NavCardButton'

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
              Manager Dashboard
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
