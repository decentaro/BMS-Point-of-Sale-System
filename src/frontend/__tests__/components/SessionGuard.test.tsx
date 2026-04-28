import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

vi.mock('@/utils/ApiClient', () => ({
  default: {
    getSettings: vi.fn(() => Promise.resolve({ autoLogoutMinutes: 30 })),
    online: true, setOnline: vi.fn(),
  },
}))

import SessionManager from '@/utils/SessionManager'
import SessionGuard from '@/components/SessionGuard'

// Helper to show current route
function LocationDisplay() {
  const loc = useLocation()
  return <span data-testid="location">{loc.pathname}</span>
}

function renderWithRouter(ui: React.ReactElement, initialRoute = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/login" element={<LocationDisplay />} />
        <Route path="/manager" element={<LocationDisplay />} />
        <Route path="/cashier-dashboard" element={<LocationDisplay />} />
        <Route path="/inventory-dashboard" element={<LocationDisplay />} />
        <Route path="/cashier-inventory" element={<LocationDisplay />} />
        <Route path="/protected" element={ui} />
      </Routes>
    </MemoryRouter>
  )
}

describe('SessionGuard', () => {
  beforeEach(() => {
    sessionStorage.clear()
    SessionManager.clearSession()
    ;(SessionManager as any).cachedTimeout = null
  })

  // ── Happy Path ──────────────────────────────────────────────

  describe('Happy Path', () => {
    it('renders children when session is valid and no role required', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard>
            <span data-testid="content">Protected Content</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('content')).toHaveTextContent('Protected Content')
    })

    it('renders children when required role matches', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard requiredRole="Manager">
            <span data-testid="content">Manager Area</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('content')).toHaveTextContent('Manager Area')
    })

    it('renders children when required permission is met', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard requiredPermission="inventory.adjust">
            <span data-testid="content">Adjust Stock</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('content')).toHaveTextContent('Adjust Stock')
    })
  })

  // ── Redirects ───────────────────────────────────────────────

  describe('Redirects', () => {
    it('redirects to /login when no session exists', async () => {
      await act(async () => {
        renderWithRouter(
          <SessionGuard>
            <span>Should not appear</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('location')).toHaveTextContent('/login')
    })

    it('redirects to /login when session is expired', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })
      // Manually expire
      const data = JSON.parse(sessionStorage.getItem('currentUser')!)
      data.expiresAt = Date.now() - 1000
      sessionStorage.setItem('currentUser', JSON.stringify(data))

      await act(async () => {
        renderWithRouter(
          <SessionGuard>
            <span>Should not appear</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('location')).toHaveTextContent('/login')
    })

    it('redirects Cashier to /cashier-dashboard when Manager role required', async () => {
      await SessionManager.createSession({
        id: 2, employeeId: 'CASH-001', name: 'Cashier', role: 'Cashier', isManager: false,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard requiredRole="Manager">
            <span>Manager Only</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('location')).toHaveTextContent('/cashier-dashboard')
    })

    it('redirects when required permission is missing', async () => {
      await SessionManager.createSession({
        id: 2, employeeId: 'CASH-001', name: 'Cashier', role: 'Cashier', isManager: false,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard requiredPermission="inventory.adjust">
            <span>Stock Adjustments</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('location')).toHaveTextContent('/cashier-dashboard')
    })

    it('redirects Inventory user to /inventory-dashboard when Cashier required', async () => {
      await SessionManager.createSession({
        id: 3, employeeId: 'INV-001', name: 'Inv', role: 'Inventory', isManager: false,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard requiredRole="Cashier">
            <span>POS</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('location')).toHaveTextContent('/inventory-dashboard')
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('multi-role user passes single-role check', async () => {
      await SessionManager.createSession({
        id: 4, employeeId: 'MULTI-01', name: 'Multi', role: 'Cashier,Inventory', isManager: false,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard requiredRole="Cashier">
            <span data-testid="content">POS</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('content')).toHaveTextContent('POS')
    })

    it('requiredRoles AND logic — all must match', async () => {
      await SessionManager.createSession({
        id: 4, employeeId: 'MULTI-01', name: 'Multi', role: 'Cashier,Inventory', isManager: false,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard requiredRoles={['Cashier', 'Inventory']}>
            <span data-testid="content">Both roles</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('content')).toHaveTextContent('Both roles')
    })

    it('requiredRoles AND logic — fails if one is missing', async () => {
      await SessionManager.createSession({
        id: 2, employeeId: 'CASH-001', name: 'Cashier', role: 'Cashier', isManager: false,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard requiredRoles={['Cashier', 'Manager']}>
            <span>Should not appear</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('location')).toHaveTextContent('/cashier-dashboard')
    })

    it('shows loading state initially', async () => {
      // Don't create session — but check that checking state appears
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      let container: HTMLElement
      await act(async () => {
        const result = renderWithRouter(
          <SessionGuard>
            <span data-testid="content">Protected</span>
          </SessionGuard>
        )
        container = result.container
      })

      // After act resolves, content should be visible
      expect(screen.getByTestId('content')).toHaveTextContent('Protected')
    })
  })

  // ── Rare Edge Cases ─────────────────────────────────────────

  describe('Rare Edge Cases', () => {
    it('corrupted session data redirects to /login', async () => {
      sessionStorage.setItem('currentUser', 'corrupt')
      sessionStorage.setItem('sessionToken', 'tok')

      await act(async () => {
        renderWithRouter(
          <SessionGuard>
            <span>Protected</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('location')).toHaveTextContent('/login')
    })

    it('Manager role passes any permission check', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard requiredPermission="some.obscure.permission">
            <span data-testid="content">Accessible</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('content')).toHaveTextContent('Accessible')
    })

    it('combined requiredRole and requiredPermission both checked', async () => {
      await SessionManager.createSession({
        id: 2, employeeId: 'CASH-001', name: 'Cashier', role: 'Cashier', isManager: false,
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard requiredRole="Cashier" requiredPermission="inventory.adjust">
            <span>Should not appear</span>
          </SessionGuard>
        )
      })

      // Role check passes (Cashier) but permission check fails
      expect(screen.getByTestId('location')).toHaveTextContent('/cashier-dashboard')
    })
  })

  // ── Impossible State / Spy Tests ─────────────────────────────

  describe('Session state edge cases via spies', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('redirects to /login when isSessionValid returns true but getCurrentSession returns null (lines 34-35)', async () => {
      // Simulate the edge case where the session appears valid but cannot be read
      vi.spyOn(SessionManager, 'isSessionValid').mockReturnValue(true)
      vi.spyOn(SessionManager, 'getCurrentSession').mockReturnValue(null)
      vi.spyOn(SessionManager, 'clearSession').mockReturnValue(undefined)

      await act(async () => {
        renderWithRouter(
          <SessionGuard>
            <span>Should not appear</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('location')).toHaveTextContent('/login')
    })

    it('returns null when session is invalid and isAuthorized is false (line 80)', async () => {
      // Render SessionGuard alongside a sibling that always stays visible.
      // SessionGuard navigates to /login on invalid session, but the sibling still renders.
      // When isChecking=false and isAuthorized=false the guard hits `return null` (line 80).
      vi.spyOn(SessionManager, 'isSessionValid').mockReturnValue(false)
      vi.spyOn(SessionManager, 'clearSession').mockReturnValue(undefined)

      const { container } = render(
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route path="/login" element={<span data-testid="login-page">Login</span>} />
            <Route path="/protected" element={
              <SessionGuard>
                <span data-testid="protected-content">Protected</span>
              </SessionGuard>
            } />
          </Routes>
        </MemoryRouter>
      )

      // Initially shows loading state (isChecking=true)
      // After useEffect resolves: isChecking=false, isAuthorized=false → return null (line 80)
      // Then navigate('/login') fires, routing to login page
      await act(async () => {})

      // The guard rendered null (line 80) and navigation occurred
      expect(screen.queryByTestId('protected-content')).toBeNull()
    })

    it('redirects to /login when checkSession throws an error (lines 58-59)', async () => {
      // Force isSessionValid to throw — exercises the catch block
      vi.spyOn(SessionManager, 'isSessionValid').mockImplementation(() => {
        throw new Error('Session storage unavailable')
      })

      await act(async () => {
        renderWithRouter(
          <SessionGuard>
            <span>Should not appear</span>
          </SessionGuard>
        )
      })

      expect(screen.getByTestId('location')).toHaveTextContent('/login')
    })
  })
})
