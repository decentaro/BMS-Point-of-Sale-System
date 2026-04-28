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

let mockSession: any
vi.mock('@/utils/SessionManager', () => ({
  default: {
    getCurrentSession: () => mockSession,
    logout: vi.fn().mockResolvedValue(undefined),
    getDashboardRoute: () => '/manager',
  },
}))

// NavCardButton: render a simple button with the card label
vi.mock('@/components/ui/NavCardButton', () => ({
  default: ({ card, onClick }: { card: any; onClick: () => void }) => (
    <button data-testid={`nav-${card.route}`} onClick={onClick}>{card.label}</button>
  ),
}))

import Manager from '@/components/Manager'

beforeEach(() => {
  mockSession = { role: 'Manager', username: 'admin' }
})

describe('Manager', () => {
  describe('Manager role', () => {
    it('shows "Manager Dashboard" title', () => {
      render(<Manager />)
      expect(screen.getByText('Manager Dashboard')).toBeTruthy()
    })

    it('shows Quick Actions section with cashier cards', () => {
      render(<Manager />)
      expect(screen.getByText('Quick Actions')).toBeTruthy()
      expect(screen.getByText('Point of Sale')).toBeTruthy()
      expect(screen.getByText('Sales History')).toBeTruthy()
      expect(screen.getByText('Returns')).toBeTruthy()
    })

    it('shows Management section', () => {
      render(<Manager />)
      expect(screen.getByText('Management')).toBeTruthy()
      expect(screen.getByText('Employees')).toBeTruthy()
      expect(screen.getByText('Tax Settings')).toBeTruthy()
    })

    it('shows Inventory section', () => {
      render(<Manager />)
      expect(screen.getByText('Inventory')).toBeTruthy()
      expect(screen.getByText('Basic Inventory')).toBeTruthy()
      expect(screen.getByText('Advanced Inventory')).toBeTruthy()
    })

    it('shows System & Reports section', () => {
      render(<Manager />)
      expect(screen.getByText('System & Reports')).toBeTruthy()
      expect(screen.getByText('Reports')).toBeTruthy()
      expect(screen.getByText('Admin Panel')).toBeTruthy()
    })

    it('navigates when a nav card is clicked', () => {
      render(<Manager />)
      fireEvent.click(screen.getByTestId('nav-/pos'))
      expect(mockNavigate).toHaveBeenCalledWith('/pos')
    })
  })

  describe('Cashier-only role', () => {
    beforeEach(() => {
      mockSession = { role: 'Cashier', username: 'cashier1' }
    })

    it('shows "Dashboard" title (not Manager Dashboard)', () => {
      render(<Manager />)
      expect(screen.getByText('Dashboard')).toBeTruthy()
      expect(screen.queryByText('Manager Dashboard')).toBeNull()
    })

    it('shows Quick Actions for cashier', () => {
      render(<Manager />)
      expect(screen.getByText('Quick Actions')).toBeTruthy()
      expect(screen.getByText('Point of Sale')).toBeTruthy()
    })

    it('does not show Management or System sections', () => {
      render(<Manager />)
      expect(screen.queryByText('Management')).toBeNull()
      expect(screen.queryByText('System & Reports')).toBeNull()
    })
  })

  describe('Inventory-only role', () => {
    beforeEach(() => {
      mockSession = { role: 'Inventory', username: 'inv1' }
    })

    it('shows Inventory section', () => {
      render(<Manager />)
      expect(screen.getByText('Inventory')).toBeTruthy()
    })

    it('does not show Quick Actions (no cashier role)', () => {
      render(<Manager />)
      expect(screen.queryByText('Quick Actions')).toBeNull()
    })
  })

  describe('Multi-role (Cashier + Inventory)', () => {
    beforeEach(() => {
      mockSession = { role: 'Cashier, Inventory', username: 'multi' }
    })

    it('shows both Quick Actions and Inventory sections', () => {
      render(<Manager />)
      expect(screen.getByText('Quick Actions')).toBeTruthy()
      expect(screen.getByText('Inventory')).toBeTruthy()
    })

    it('does not show Management section', () => {
      render(<Manager />)
      expect(screen.queryByText('Management')).toBeNull()
    })
  })

  describe('Null session fallback', () => {
    beforeEach(() => {
      mockSession = null
    })

    it('falls back to Cashier role when session is null — shows Quick Actions only', () => {
      render(<Manager />)
      // null session → role defaults to 'Cashier' → hasCashier=true, isManager=false
      expect(screen.getByText('Dashboard')).toBeTruthy()
      expect(screen.getByText('Quick Actions')).toBeTruthy()
      expect(screen.queryByText('Manager Dashboard')).toBeNull()
    })

    it('does not show Management or Inventory sections when session is null', () => {
      render(<Manager />)
      expect(screen.queryByText('Management')).toBeNull()
      expect(screen.queryByText('Inventory')).toBeNull()
    })
  })
})
