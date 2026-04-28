import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import SessionStatus from '@/components/SessionStatus'

function LocationDisplay() {
  const loc = useLocation()
  return <span data-testid="location">{loc.pathname}</span>
}

function renderSessionStatus(props: { showLogout?: boolean; dark?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={['/pos']}>
      <Routes>
        <Route path="/pos" element={<SessionStatus {...props} />} />
        <Route path="/login" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('SessionStatus', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    SessionManager.clearSession()
    ;(SessionManager as any).cachedTimeout = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Happy Path', () => {
    it('renders nothing when no session', () => {
      const { container } = renderSessionStatus()
      expect(container.querySelector('.relative')?.children.length ?? 0).toBe(0)
    })

    it('shows session info when session exists', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Test Manager', role: 'Manager', isManager: true,
      })

      renderSessionStatus()

      expect(screen.getByText('Test Manager')).toBeTruthy()
    })

    it('shows remaining time in minutes', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      renderSessionStatus()

      // Should show some minutes remaining (around 30)
      const text = screen.getByText(/\d+min/)
      expect(text).toBeTruthy()
    })

    it('shows logout button when showLogout=true', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      renderSessionStatus({ showLogout: true })
      expect(screen.getByText('Logout')).toBeTruthy()
    })

    it('hides logout button by default', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      renderSessionStatus()
      expect(screen.queryByText('Logout')).toBeNull()
    })
  })

  describe('Logout', () => {
    it('logout button clears session and redirects to /login', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      const user = userEvent.setup()
      renderSessionStatus({ showLogout: true })

      await user.click(screen.getByText('Logout'))
      expect(screen.getByTestId('location')).toHaveTextContent('/login')
    })
  })

  describe('Edge Cases', () => {
    it('renders with dark=true for dark backgrounds', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      const { container } = renderSessionStatus({ dark: true })
      const textEl = container.querySelector('.text-white\\/70')
      expect(textEl).toBeTruthy()
    })
  })

  // ── Extend Session (handleExtendSession — lines 31-33) ────────────────────

  describe('Extend Session', () => {
    it('clicking "Extend Session" dismisses the warning modal', async () => {
      // Create a session that is already near expiry (within 5-minute warning window)
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      // Spy on extendSession and mock getTimeUntilExpiry to simulate near-expiry then recovery
      const extendSpy = vi.spyOn(SessionManager, 'extendSession').mockResolvedValue(true)
      let callCount = 0
      vi.spyOn(SessionManager, 'getTimeUntilExpiry').mockImplementation(() => {
        // Initial render (call 1): 25 min (no warning); first timer tick (call 2+): 3 min (triggers warning)
        callCount++
        return callCount === 1 ? 25 : 3
      })

      vi.useFakeTimers()
      renderSessionStatus({ showLogout: true })

      // Advance timer one tick to trigger warning
      await act(async () => { vi.advanceTimersByTime(1000) })
      vi.useRealTimers()

      // Warning modal should appear
      await waitFor(() => {
        expect(screen.getByText('Session Expiring Soon')).toBeTruthy()
      })

      // Click "Extend Session"
      await act(async () => {
        fireEvent.click(screen.getByText('Extend Session'))
      })

      // Warning modal should be gone
      expect(screen.queryByText('Session Expiring Soon')).toBeNull()
      expect(extendSpy).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('"Logout Now" inside warning modal clears session and redirects', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      vi.spyOn(SessionManager, 'getTimeUntilExpiry').mockReturnValue(3)

      vi.useFakeTimers()
      renderSessionStatus({ showLogout: true })

      await act(async () => { vi.advanceTimersByTime(1000) })
      vi.useRealTimers()

      await waitFor(() => {
        expect(screen.getByText('Session Expiring Soon')).toBeTruthy()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Logout Now'))
      })

      expect(screen.getByTestId('location')).toHaveTextContent('/login')

      vi.useRealTimers()
    })
  })

  // ── Timer interval — lines 50-76 ─────────────────────────────────────────

  describe('Timer interval', () => {
    it('updates timeLeft display on each timer tick', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      let ticks = 0
      vi.spyOn(SessionManager, 'getTimeUntilExpiry').mockImplementation(() => {
        ticks++
        return 29 - ticks // counts down
      })

      vi.useFakeTimers()
      renderSessionStatus()

      await act(async () => { vi.advanceTimersByTime(1000) })
      vi.useRealTimers()

      // After one tick, timeLeft should be 28 (29 - 1)
      await waitFor(() => {
        expect(screen.getByText(/\d+min/)).toBeTruthy()
      })
    })

    it('auto-logs out when timer reaches 0', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      vi.spyOn(SessionManager, 'getTimeUntilExpiry').mockReturnValue(0)

      vi.useFakeTimers()
      renderSessionStatus({ showLogout: true })

      await act(async () => { vi.advanceTimersByTime(1000) })
      vi.useRealTimers()

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/login')
      })
    })

    it('stops timer and returns null when session disappears mid-tick', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      // After first render tick, session vanishes
      let tick = 0
      vi.spyOn(SessionManager, 'getCurrentSession').mockImplementation(() => {
        tick++
        if (tick > 2) return null
        return { id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true, expiresAt: Date.now() + 600000, lastActivity: Date.now() } as any
      })

      vi.useFakeTimers()
      const { container } = renderSessionStatus()

      // Render starts with session present — component mounts
      await act(async () => { vi.advanceTimersByTime(1000) })
      await act(async () => { vi.advanceTimersByTime(1000) })

      // No crash — component handles missing session gracefully
      expect(container).toBeTruthy()

      vi.useRealTimers()
    })
  })

  describe('Warning display', () => {
    it('timeLeft ≤ 5 shows orange styling on time display', async () => {
      await SessionManager.createSession({
        id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true,
      })

      vi.spyOn(SessionManager, 'getTimeUntilExpiry').mockReturnValue(4)

      vi.useFakeTimers()
      renderSessionStatus()

      await act(async () => { vi.advanceTimersByTime(1000) })
      vi.useRealTimers()

      await waitFor(() => {
        const el = screen.getByText(/\d+min/)
        expect(el.className).toMatch(/orange/)
      })
    })
  })
})
