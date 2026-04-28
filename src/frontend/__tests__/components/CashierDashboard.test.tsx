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
    getCurrentSession: () => ({ role: 'Cashier', name: 'Test Cashier' }),
    logout: vi.fn().mockResolvedValue(undefined),
    getDashboardRoute: () => '/cashier-dashboard',
  },
}))

vi.mock('@/components/ui/NavCardButton', () => ({
  default: ({ card, onClick }: { card: any; onClick: () => void }) => (
    <button data-testid={`nav-${card.route}`} onClick={onClick}>{card.label}</button>
  ),
}))

import CashierDashboard from '@/components/CashierDashboard'

beforeEach(() => {
  mockNavigate.mockClear()
})

describe('CashierDashboard', () => {
  it('renders the Cashier Dashboard title', () => {
    render(<CashierDashboard />)
    expect(screen.getByText('Cashier Dashboard')).toBeTruthy()
  })

  it('renders the Quick Actions section', () => {
    render(<CashierDashboard />)
    expect(screen.getByText('Quick Actions')).toBeTruthy()
  })

  it('renders POS nav card', () => {
    render(<CashierDashboard />)
    expect(screen.getByText('Point of Sale')).toBeTruthy()
  })

  it('renders Sales History nav card', () => {
    render(<CashierDashboard />)
    expect(screen.getByText('Sales History')).toBeTruthy()
  })

  it('renders Returns nav card', () => {
    render(<CashierDashboard />)
    expect(screen.getByText('Returns')).toBeTruthy()
  })

  it('clicking POS card navigates to /pos', () => {
    render(<CashierDashboard />)
    fireEvent.click(screen.getByTestId('nav-/pos'))
    expect(mockNavigate).toHaveBeenCalledWith('/pos')
  })

  it('clicking Sales History card navigates to /sales-history', () => {
    render(<CashierDashboard />)
    fireEvent.click(screen.getByTestId('nav-/sales-history'))
    expect(mockNavigate).toHaveBeenCalledWith('/sales-history')
  })

  it('clicking Returns card navigates to /returns', () => {
    render(<CashierDashboard />)
    fireEvent.click(screen.getByTestId('nav-/returns'))
    expect(mockNavigate).toHaveBeenCalledWith('/returns')
  })
})
