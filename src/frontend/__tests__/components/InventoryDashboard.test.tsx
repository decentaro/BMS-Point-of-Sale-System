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
    getCurrentSession: () => ({ role: 'Inventory', name: 'Test Inventory' }),
    logout: vi.fn().mockResolvedValue(undefined),
    getDashboardRoute: () => '/inventory-dashboard',
  },
}))

vi.mock('@/components/ui/NavCardButton', () => ({
  default: ({ card, onClick }: { card: any; onClick: () => void }) => (
    <button data-testid={`nav-${card.route}`} onClick={onClick}>{card.label}</button>
  ),
}))

import InventoryDashboard from '@/components/InventoryDashboard'

beforeEach(() => {
  mockNavigate.mockClear()
})

describe('InventoryDashboard', () => {
  it('renders the Inventory Dashboard title', () => {
    render(<InventoryDashboard />)
    expect(screen.getByText('Inventory Dashboard')).toBeTruthy()
  })

  it('renders the Inventory section label', () => {
    render(<InventoryDashboard />)
    expect(screen.getByText('Inventory')).toBeTruthy()
  })

  it('renders Basic Inventory nav card', () => {
    render(<InventoryDashboard />)
    expect(screen.getByText('Basic Inventory')).toBeTruthy()
  })

  it('renders Advanced Inventory nav card', () => {
    render(<InventoryDashboard />)
    expect(screen.getByText('Advanced Inventory')).toBeTruthy()
  })

  it('clicking Basic Inventory card navigates to /inventory', () => {
    render(<InventoryDashboard />)
    fireEvent.click(screen.getByTestId('nav-/inventory'))
    expect(mockNavigate).toHaveBeenCalledWith('/inventory')
  })

  it('clicking Advanced Inventory card navigates to /inventory-management', () => {
    render(<InventoryDashboard />)
    fireEvent.click(screen.getByTestId('nav-/inventory-management'))
    expect(mockNavigate).toHaveBeenCalledWith('/inventory-management')
  })
})
