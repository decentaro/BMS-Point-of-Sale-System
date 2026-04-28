import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/components/SessionGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="spinner" />,
  SectionLoader: ({ message }: any) => <div data-testid="section-loader">{message}</div>,
}))

let mockSession: any
vi.mock('@/utils/SessionManager', () => ({
  default: {
    getCurrentSession: () => mockSession,
    getDashboardRoute: () => '/manager',
    logout: vi.fn(),
  },
}))

import Dashboard from '@/components/Dashboard'

beforeEach(() => {
  mockSession = null
})

describe('Dashboard', () => {
  it('shows loading spinner while routing', () => {
    mockSession = { role: 'Manager' }
    render(<Dashboard />)
    expect(screen.getByTestId('spinner')).toBeTruthy()
    expect(screen.getByText('Loading dashboard...')).toBeTruthy()
  })

  it('navigates to /login when no session', () => {
    mockSession = null
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('navigates to /manager for Manager role', () => {
    mockSession = { role: 'Manager' }
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/manager')
  })

  it('navigates to /pos for Cashier role', () => {
    mockSession = { role: 'Cashier' }
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/pos')
  })

  it('navigates to /inventory-dashboard for Inventory role', () => {
    mockSession = { role: 'Inventory' }
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/inventory-dashboard')
  })

  it('navigates to /pos for unknown role', () => {
    mockSession = { role: 'Unknown' }
    render(<Dashboard />)
    expect(mockNavigate).toHaveBeenCalledWith('/pos')
  })
})

// ── Small dashboard components ────────────────────────────────────────────────
// CashierDashboard, InventoryDashboard, CashierInventoryDashboard are thin
// wrappers around DashboardShell + nav cards — covered via Manager.test.tsx
// patterns. Smoke tests verify they render without crash.

import CashierDashboard from '@/components/CashierDashboard'
import InventoryDashboard from '@/components/InventoryDashboard'
import CashierInventoryDashboard from '@/components/CashierInventoryDashboard'

// Shared mocks for all three
vi.mock('@/contexts/SettingsContext', () => ({
  useBusinessSettings: () => ({ businessSettings: { businessName: 'Store' }, loading: false }),
}))
vi.mock('@/components/SessionStatus', () => ({
  default: () => null,
}))
vi.mock('@/components/ui/NavCardButton', () => ({
  default: ({ card }: { card: any }) => <button>{card.label}</button>,
}))

describe('CashierDashboard', () => {
  it('renders Cashier Dashboard title', () => {
    render(<CashierDashboard />)
    expect(screen.getByText('Cashier Dashboard')).toBeTruthy()
  })

  it('shows Quick Actions section with POS card', () => {
    render(<CashierDashboard />)
    expect(screen.getByText('Quick Actions')).toBeTruthy()
    expect(screen.getByText('Point of Sale')).toBeTruthy()
  })
})

describe('InventoryDashboard', () => {
  it('renders Inventory Dashboard title', () => {
    render(<InventoryDashboard />)
    expect(screen.getByText('Inventory Dashboard')).toBeTruthy()
  })

  it('shows Inventory section with Basic Inventory card', () => {
    render(<InventoryDashboard />)
    expect(screen.getByText('Inventory')).toBeTruthy()
    expect(screen.getByText('Basic Inventory')).toBeTruthy()
  })
})

describe('CashierInventoryDashboard', () => {
  it('renders Cashier & Inventory title', () => {
    render(<CashierInventoryDashboard />)
    expect(screen.getByText('Cashier & Inventory')).toBeTruthy()
  })

  it('shows both Quick Actions and Inventory sections', () => {
    render(<CashierInventoryDashboard />)
    expect(screen.getByText('Quick Actions')).toBeTruthy()
    expect(screen.getByText('Inventory')).toBeTruthy()
  })
})
