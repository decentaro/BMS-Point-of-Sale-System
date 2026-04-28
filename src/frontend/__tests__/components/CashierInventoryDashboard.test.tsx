import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/components/SessionGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/SessionStatus', () => ({
  default: () => null,
}))

vi.mock('@/contexts/SettingsContext', () => ({
  useBusinessSettings: () => ({ businessSettings: { businessName: 'Test Store' }, loading: false }),
}))

vi.mock('@/utils/SessionManager', () => ({
  default: {
    getCurrentSession: () => ({ role: 'Cashier,Inventory', name: 'Test CI' }),
    logout: vi.fn().mockResolvedValue(undefined),
    getDashboardRoute: () => '/cashier-inventory',
  },
}))

vi.mock('@/components/ui/NavCardButton', () => ({
  default: ({ card, onClick }: { card: any; onClick: () => void }) => (
    <button data-testid={`nav-${card.route}`} onClick={onClick}>{card.label}</button>
  ),
}))

import CashierInventoryDashboard from '@/components/CashierInventoryDashboard'

beforeEach(() => {
  mockNavigate.mockClear()
})

describe('CashierInventoryDashboard', () => {
  it('renders the Cashier & Inventory title', () => {
    render(<CashierInventoryDashboard />)
    expect(screen.getByText('Cashier & Inventory')).toBeTruthy()
  })

  it('renders Quick Actions section for cashier cards', () => {
    render(<CashierInventoryDashboard />)
    expect(screen.getByText('Quick Actions')).toBeTruthy()
  })

  it('renders Inventory section for inventory cards', () => {
    render(<CashierInventoryDashboard />)
    expect(screen.getByText('Inventory')).toBeTruthy()
  })

  it('renders POS cashier nav card', () => {
    render(<CashierInventoryDashboard />)
    expect(screen.getByText('Point of Sale')).toBeTruthy()
  })

  it('renders Basic Inventory nav card', () => {
    render(<CashierInventoryDashboard />)
    expect(screen.getByText('Basic Inventory')).toBeTruthy()
  })

  it('clicking POS card navigates to /pos', () => {
    render(<CashierInventoryDashboard />)
    fireEvent.click(screen.getByTestId('nav-/pos'))
    expect(mockNavigate).toHaveBeenCalledWith('/pos')
  })

  it('clicking Advanced Inventory card navigates to /inventory-management', () => {
    render(<CashierInventoryDashboard />)
    fireEvent.click(screen.getByTestId('nav-/inventory-management'))
    expect(mockNavigate).toHaveBeenCalledWith('/inventory-management')
  })
})
