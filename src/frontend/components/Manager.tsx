import React from 'react'
import { useNavigate } from 'react-router-dom'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import DashboardShell, { SectionCard } from './DashboardShell'
import { CASHIER_CARDS, INVENTORY_CARDS, MANAGER_CARDS, SYSTEM_CARDS } from '../config/nav-data'
import NavCardButton from './ui/NavCardButton'

const Manager: React.FC = () => {
  const navigate = useNavigate()

  const session = SessionManager.getCurrentSession()
  const roles = (session?.role || 'Cashier').split(',').map(r => r.trim())
  const hasCashier   = roles.includes('Cashier')   || roles.includes('Manager')
  const hasInventory = roles.includes('Inventory') || roles.includes('Manager')
  const isManager    = roles.includes('Manager')

  // Manager sees all sections in a 2-col × 2-row grid that fills the canvas
  if (isManager) {
    return (
      <SessionGuard>
        <DashboardShell title="Manager Dashboard">
          <div className="h-full grid grid-cols-2 gap-4">
            {/* Left column */}
            <div className="flex flex-col gap-4">
              <SectionCard label="Quick Actions" className="flex-1">
                <div className="h-full grid grid-cols-3 gap-3">
                  {CASHIER_CARDS.map(card => (
                    <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
                  ))}
                </div>
              </SectionCard>

              <SectionCard label="Management" className="flex-1">
                <div className="h-full grid grid-cols-2 gap-3">
                  {MANAGER_CARDS.map(card => (
                    <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
                  ))}
                </div>
              </SectionCard>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              <SectionCard label="Inventory" className="flex-1">
                <div className="h-full grid grid-cols-2 gap-3">
                  {INVENTORY_CARDS.map(card => (
                    <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
                  ))}
                </div>
              </SectionCard>

              <SectionCard label="System & Reports" className="flex-1">
                <div className="h-full grid grid-cols-2 gap-3">
                  {SYSTEM_CARDS.map(card => (
                    <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        </DashboardShell>
      </SessionGuard>
    )
  }

  // Multi-role non-manager: stack sections, each flex-1
  return (
    <SessionGuard>
      <DashboardShell title="Dashboard">
        <div className="h-full flex flex-col gap-4">
          {hasCashier && (
            <SectionCard label="Quick Actions" className="flex-1">
              <div className="h-full grid grid-cols-3 gap-3">
                {CASHIER_CARDS.map(card => (
                  <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
                ))}
              </div>
            </SectionCard>
          )}
          {hasInventory && (
            <SectionCard label="Inventory" className="flex-1">
              <div className="h-full grid grid-cols-2 gap-3">
                {INVENTORY_CARDS.map(card => (
                  <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </DashboardShell>
    </SessionGuard>
  )
}

export default Manager
