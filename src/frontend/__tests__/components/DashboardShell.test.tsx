import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/components/SessionStatus', () => ({
  default: () => null,
}))

let mockBusinessSettings: any
let mockLoading: boolean
vi.mock('@/contexts/SettingsContext', () => ({
  useBusinessSettings: () => ({ businessSettings: mockBusinessSettings, loading: mockLoading }),
}))

let mockLogout: ReturnType<typeof vi.fn>
vi.mock('@/utils/SessionManager', () => ({
  default: {
    logout: (...args: any[]) => mockLogout(...args),
    getDashboardRoute: () => '/manager',
  },
}))

import DashboardShell, { SectionCard } from '@/components/DashboardShell'

beforeEach(() => {
  mockBusinessSettings = { businessName: 'Acme Corp' }
  mockLoading = false
  mockLogout = vi.fn().mockResolvedValue(undefined)
})

describe('DashboardShell', () => {
  describe('Header', () => {
    it('shows business name from settings', () => {
      render(<DashboardShell title="Point of Sale"><div /></DashboardShell>)
      expect(screen.getByText('Acme Corp')).toBeTruthy()
    })

    it('shows "—" when settings are loading', () => {
      mockLoading = true
      render(<DashboardShell title="POS"><div /></DashboardShell>)
      expect(screen.getByText('—')).toBeTruthy()
    })

    it('shows fallback "Business Name" when businessName is empty', () => {
      mockBusinessSettings = { businessName: '' }
      render(<DashboardShell title="POS"><div /></DashboardShell>)
      expect(screen.getByText('Business Name')).toBeTruthy()
    })

    it('renders the title subtitle', () => {
      render(<DashboardShell title="Manager Dashboard"><div /></DashboardShell>)
      expect(screen.getByText('Manager Dashboard')).toBeTruthy()
    })

    it('renders Logout button', () => {
      render(<DashboardShell title="POS"><div /></DashboardShell>)
      expect(screen.getByText('Logout')).toBeTruthy()
    })

    it('Logout calls SessionManager.logout and navigates to /login', async () => {
      render(<DashboardShell title="POS"><div /></DashboardShell>)
      await act(async () => { fireEvent.click(screen.getByText('Logout')) })
      expect(mockLogout).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })

  describe('Content', () => {
    it('renders children in main area', () => {
      render(<DashboardShell title="POS"><div data-testid="child">Child Content</div></DashboardShell>)
      expect(screen.getByTestId('child')).toBeTruthy()
      expect(screen.getByText('Child Content')).toBeTruthy()
    })
  })
})

describe('SectionCard', () => {
  it('renders label', () => {
    render(<SectionCard label="Quick Actions"><div>content</div></SectionCard>)
    expect(screen.getByText('Quick Actions')).toBeTruthy()
  })

  it('renders children', () => {
    render(<SectionCard label="Section"><span data-testid="inner">Inner</span></SectionCard>)
    expect(screen.getByTestId('inner')).toBeTruthy()
  })

  it('applies extra className', () => {
    const { container } = render(<SectionCard label="X" className="custom-cls"><div /></SectionCard>)
    expect(container.firstChild?.nodeName).toBe('DIV')
    expect((container.firstChild as HTMLElement).className).toContain('custom-cls')
  })
})
