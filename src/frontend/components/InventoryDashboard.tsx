import React from 'react'
import { useNavigate } from 'react-router-dom'
import SessionGuard from './SessionGuard'
import DashboardShell, { SectionCard } from './DashboardShell'
import { INVENTORY_CARDS } from '../config/nav-data'
import NavCardButton from './ui/NavCardButton'

const InventoryDashboard: React.FC = () => {
  const navigate = useNavigate()

  return (
    <SessionGuard requiredRole="Inventory">
      <DashboardShell title="Inventory Dashboard">
        <div className="h-full flex flex-col justify-center">
          <SectionCard label="Inventory">
            <div className="grid grid-cols-2 gap-4" style={{ height: 200 }}>
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

export default InventoryDashboard
