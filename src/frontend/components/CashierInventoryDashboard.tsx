import React from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { Button } from './ui/button'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import SessionStatus from './SessionStatus'
import { CASHIER_CARDS, INVENTORY_CARDS } from '../config/nav-data'
import NavCardButton from './ui/NavCardButton'

const CashierInventoryDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { businessSettings, loading } = useBusinessSettings()

  return (
    <SessionGuard requiredRoles={['Cashier', 'Inventory']}>
      <div className="w-full h-full flex flex-col bg-slate-50">
        <header className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => { await SessionManager.logout(); navigate('/login') }}
            className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </Button>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-emerald-600 leading-tight">
              {loading ? '—' : (businessSettings.businessName || 'Business Name')}
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">Cashier &amp; Inventory</p>
          </div>

          <SessionStatus />
        </header>

        <main className="flex-1 px-5 py-5 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-5">

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

          </div>
        </main>
      </div>
    </SessionGuard>
  )
}

export default CashierInventoryDashboard
