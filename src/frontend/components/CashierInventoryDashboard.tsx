import React from 'react'
import { useNavigate } from 'react-router-dom'
import SessionGuard from './SessionGuard'
import DashboardShell, { SectionCard } from './DashboardShell'
import { CASHIER_CARDS, INVENTORY_CARDS } from '../config/nav-data'
import NavCardButton from './ui/NavCardButton'

const CashierInventoryDashboard: React.FC = () => {
  const navigate = useNavigate()

  return (
    <SessionGuard requiredRoles={['Cashier', 'Inventory']}>
      <DashboardShell title="Cashier & Inventory">
        <div className="h-full flex flex-col gap-4">
          <SectionCard label="Quick Actions" className="flex-1">
            <div className="h-full grid grid-cols-3 gap-3">
              {CASHIER_CARDS.map(card => (
                <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
              ))}
            </div>
          </SectionCard>

          <SectionCard label="Inventory" className="flex-1">
            <div className="h-full grid grid-cols-2 gap-3">
              {INVENTORY_CARDS.map(card => (
                <NavCardButton key={card.route} card={card} onClick={() => navigate(card.route)} />
              ))}
            </div>
          </SectionCard>
        </div>
      </DashboardShell>
    </SessionGuard>
  )
}

export default CashierInventoryDashboard
