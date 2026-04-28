import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock API config
vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

// Mock ApiClient — getSettings returns system settings
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getSettings: vi.fn(() => Promise.resolve({ autoLogoutMinutes: 30 })),
    online: true,
    setOnline: vi.fn(),
  },
}))

import SessionManager from '@/utils/SessionManager'

const mockUser = {
  id: 1,
  employeeId: 'MGR-001',
  name: 'Test Manager',
  role: 'Manager',
  isManager: true,
}

describe('SessionManager', () => {
  beforeEach(() => {
    sessionStorage.clear()
    // Reset static state
    SessionManager.clearSession()
    // Reset cached timeout
    ;(SessionManager as any).cachedTimeout = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Happy Path ──────────────────────────────────────────────

  describe('Happy Path', () => {
    it('createSession stores session in sessionStorage', async () => {
      const session = await SessionManager.createSession(mockUser)

      expect(session.id).toBe(1)
      expect(session.employeeId).toBe('MGR-001')
      expect(session.name).toBe('Test Manager')
      expect(session.role).toBe('Manager')
      expect(session.isManager).toBe(true)
      expect(session.sessionToken).toHaveLength(64) // 32 bytes hex
      expect(session.expiresAt).toBeGreaterThan(Date.now())
    })

    it('getCurrentSession returns valid session', async () => {
      await SessionManager.createSession(mockUser)
      const session = SessionManager.getCurrentSession()
      expect(session).not.toBeNull()
      expect(session!.employeeId).toBe('MGR-001')
    })

    it('isSessionValid returns true for active session', async () => {
      await SessionManager.createSession(mockUser)
      expect(SessionManager.isSessionValid()).toBe(true)
    })

    it('clearSession removes all session data', async () => {
      await SessionManager.createSession(mockUser)
      SessionManager.setToken('jwt-token')

      SessionManager.clearSession()

      expect(SessionManager.isSessionValid()).toBe(false)
      expect(SessionManager.getCurrentSession()).toBeNull()
      expect(sessionStorage.getItem('jwtToken')).toBeNull()
    })

    it('setToken stores JWT in memory and sessionStorage', () => {
      SessionManager.setToken('my-jwt-token')
      expect(sessionStorage.getItem('jwtToken')).toBe('my-jwt-token')
    })

    it('getUserHeaders includes auth info', async () => {
      await SessionManager.createSession(mockUser)
      SessionManager.setToken('jwt-123')

      const headers = SessionManager.getUserHeaders()
      expect(headers['X-User-Id']).toBe('1')
      expect(headers['X-User-Name']).toBe('Test Manager')
      expect(headers['Authorization']).toBe('Bearer jwt-123')
    })

    it('getTimeUntilExpiry returns minutes remaining', async () => {
      await SessionManager.createSession(mockUser)
      const minutes = SessionManager.getTimeUntilExpiry()
      expect(minutes).toBeGreaterThanOrEqual(29) // ~30 min minus time to execute
      expect(minutes).toBeLessThanOrEqual(30)
    })

    it('extendSession refreshes expiry', async () => {
      await SessionManager.createSession(mockUser)
      const before = SessionManager.getCurrentSession()!.expiresAt

      // Advance time slightly
      vi.useFakeTimers()
      vi.advanceTimersByTime(60000) // 1 minute

      const extended = await SessionManager.extendSession()
      expect(extended).toBe(true)

      const after = SessionManager.getCurrentSession()!.expiresAt
      expect(after).toBeGreaterThan(before)

      vi.useRealTimers()
    })
  })

  // ── Role & Permission Checks ────────────────────────────────

  describe('Role & Permission Checks', () => {
    it('hasRole returns true for matching role (case-insensitive)', async () => {
      await SessionManager.createSession(mockUser)
      expect(SessionManager.hasRole('Manager')).toBe(true)
      expect(SessionManager.hasRole('manager')).toBe(true)
      expect(SessionManager.hasRole('MANAGER')).toBe(true)
    })

    it('hasRole returns false for non-matching role', async () => {
      await SessionManager.createSession(mockUser)
      expect(SessionManager.hasRole('Cashier')).toBe(false)
    })

    it('hasRole supports multi-role', async () => {
      await SessionManager.createSession({ ...mockUser, role: 'Cashier,Inventory' })
      expect(SessionManager.hasRole('Cashier')).toBe(true)
      expect(SessionManager.hasRole('Inventory')).toBe(true)
      expect(SessionManager.hasRole('Manager')).toBe(false)
    })

    it('hasPermission — Manager has all permissions', async () => {
      await SessionManager.createSession(mockUser)
      expect(SessionManager.hasPermission('pos.sale')).toBe(true)
      expect(SessionManager.hasPermission('inventory.adjust')).toBe(true)
      expect(SessionManager.hasPermission('anything')).toBe(true)
    })

    it('hasPermission — Cashier has limited permissions', async () => {
      await SessionManager.createSession({ ...mockUser, role: 'Cashier', isManager: false })
      expect(SessionManager.hasPermission('pos.sale')).toBe(true)
      expect(SessionManager.hasPermission('pos.return')).toBe(true)
      expect(SessionManager.hasPermission('inventory.view')).toBe(true)
      expect(SessionManager.hasPermission('inventory.adjust')).toBe(false)
    })

    it('hasPermission — Inventory role permissions', async () => {
      await SessionManager.createSession({ ...mockUser, role: 'Inventory', isManager: false })
      expect(SessionManager.hasPermission('inventory.view')).toBe(true)
      expect(SessionManager.hasPermission('inventory.add')).toBe(true)
      expect(SessionManager.hasPermission('inventory.edit')).toBe(true)
      expect(SessionManager.hasPermission('inventory.adjust')).toBe(true)
      expect(SessionManager.hasPermission('pos.sale')).toBe(false)
    })

    it('hasPermission — multi-role unions permissions', async () => {
      await SessionManager.createSession({ ...mockUser, role: 'Cashier,Inventory', isManager: false })
      expect(SessionManager.hasPermission('pos.sale')).toBe(true)
      expect(SessionManager.hasPermission('inventory.adjust')).toBe(true)
    })

    it('requirePermission throws for missing permission', async () => {
      await SessionManager.createSession({ ...mockUser, role: 'Cashier', isManager: false })
      expect(() => SessionManager.requirePermission('inventory.adjust', 'adjust stock'))
        .toThrow('Insufficient permissions to adjust stock')
    })

    it('requirePermission does not throw for valid permission', async () => {
      await SessionManager.createSession(mockUser)
      expect(() => SessionManager.requirePermission('anything')).not.toThrow()
    })
  })

  // ── Dashboard Routing ───────────────────────────────────────

  describe('Dashboard Routing', () => {
    it('Manager routes to /manager', async () => {
      await SessionManager.createSession(mockUser)
      expect(SessionManager.getDashboardRoute()).toBe('/manager')
    })

    it('Cashier routes to /cashier-dashboard', async () => {
      await SessionManager.createSession({ ...mockUser, role: 'Cashier' })
      expect(SessionManager.getDashboardRoute()).toBe('/cashier-dashboard')
    })

    it('Inventory routes to /inventory-dashboard', async () => {
      await SessionManager.createSession({ ...mockUser, role: 'Inventory' })
      expect(SessionManager.getDashboardRoute()).toBe('/inventory-dashboard')
    })

    it('Cashier,Inventory routes to /cashier-inventory', async () => {
      await SessionManager.createSession({ ...mockUser, role: 'Cashier,Inventory' })
      expect(SessionManager.getDashboardRoute()).toBe('/cashier-inventory')
    })

    it('no session routes to /login', () => {
      expect(SessionManager.getDashboardRoute()).toBe('/login')
    })
  })

  // ── Session Timeout ─────────────────────────────────────────

  describe('Session Timeout', () => {
    it('getSessionTimeout fetches from API', async () => {
      const timeout = await SessionManager.getSessionTimeout()
      expect(timeout).toBe(30 * 60 * 1000) // 30 min in ms
    })

    it('getSessionTimeout enforces 5-minute minimum', async () => {
      const { default: ApiClient } = await import('@/utils/ApiClient')
      vi.mocked(ApiClient.getSettings).mockResolvedValueOnce({ autoLogoutMinutes: 2 })
      ;(SessionManager as any).cachedTimeout = null

      const timeout = await SessionManager.getSessionTimeout()
      expect(timeout).toBe(5 * 60 * 1000) // 5 min minimum
    })

    it('getSessionTimeout falls back to 30min on API error', async () => {
      const { default: ApiClient } = await import('@/utils/ApiClient')
      vi.mocked(ApiClient.getSettings).mockRejectedValueOnce(new Error('offline'))
      ;(SessionManager as any).cachedTimeout = null

      const timeout = await SessionManager.getSessionTimeout()
      expect(timeout).toBe(30 * 60 * 1000)
    })

    it('getSessionTimeout caches result', async () => {
      const { default: ApiClient } = await import('@/utils/ApiClient')
      vi.mocked(ApiClient.getSettings).mockClear()
      ;(SessionManager as any).cachedTimeout = null

      await SessionManager.getSessionTimeout()
      await SessionManager.getSessionTimeout()

      // Should only call API once (cached after first call)
      expect(ApiClient.getSettings).toHaveBeenCalledTimes(1)
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('getCurrentSession returns null when no session stored', () => {
      expect(SessionManager.getCurrentSession()).toBeNull()
    })

    it('getCurrentSession returns null when token mismatch', async () => {
      await SessionManager.createSession(mockUser)
      sessionStorage.setItem('sessionToken', 'tampered-token')
      expect(SessionManager.getCurrentSession()).toBeNull()
    })

    it('getCurrentSession returns null for expired session', async () => {
      await SessionManager.createSession(mockUser)
      // Manually expire
      const data = JSON.parse(sessionStorage.getItem('currentUser')!)
      data.expiresAt = Date.now() - 1000
      sessionStorage.setItem('currentUser', JSON.stringify(data))

      expect(SessionManager.getCurrentSession()).toBeNull()
    })

    it('getCurrentSession clears corrupted session data', () => {
      sessionStorage.setItem('currentUser', 'not-json')
      sessionStorage.setItem('sessionToken', 'tok')

      expect(SessionManager.getCurrentSession()).toBeNull()
      expect(sessionStorage.getItem('currentUser')).toBeNull()
    })

    it('getUserHeaders returns defaults when no session', () => {
      const headers = SessionManager.getUserHeaders()
      expect(headers['X-User-Id']).toBe('0')
      expect(headers['X-User-Name']).toBe('Unknown')
    })

    it('getTimeUntilExpiry returns 0 when no session', () => {
      expect(SessionManager.getTimeUntilExpiry()).toBe(0)
    })

    it('extendSession returns false when no session', async () => {
      expect(await SessionManager.extendSession()).toBe(false)
    })

    it('extendForBusinessAction returns false when no session', async () => {
      expect(await SessionManager.extendForBusinessAction('sale')).toBe(false)
    })

    it('hasRole returns false when no session', () => {
      expect(SessionManager.hasRole('Manager')).toBe(false)
    })

    it('hasPermission returns false when no session', () => {
      expect(SessionManager.hasPermission('pos.sale')).toBe(false)
    })
  })

  // ── Rare Edge Cases ─────────────────────────────────────────

  describe('Rare Edge Cases', () => {
    it('createSession clears existing activity timer', async () => {
      await SessionManager.createSession(mockUser)
      // Create second session — should not throw or leak timers
      await SessionManager.createSession({ ...mockUser, employeeId: 'CASH-001', name: 'Cashier' })
      const session = SessionManager.getCurrentSession()
      expect(session!.name).toBe('Cashier')
    })

    it('logout calls server endpoint then clears local session', async () => {
      await SessionManager.createSession(mockUser)
      SessionManager.setToken('jwt-to-invalidate')

      global.fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 200 }))

      await SessionManager.logout()

      expect(fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:5002/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Authorization': 'Bearer jwt-to-invalidate' },
        })
      )
      expect(SessionManager.isSessionValid()).toBe(false)
    })

    it('logout clears session even if API call fails', async () => {
      await SessionManager.createSession(mockUser)
      SessionManager.setToken('jwt')

      global.fetch = vi.fn().mockRejectedValueOnce(new Error('offline'))

      await SessionManager.logout()
      expect(SessionManager.isSessionValid()).toBe(false)
    })

    it('session token is cryptographically random (64 hex chars)', async () => {
      const s1 = await SessionManager.createSession(mockUser)
      SessionManager.clearSession()
      ;(SessionManager as any).cachedTimeout = null
      const s2 = await SessionManager.createSession(mockUser)

      expect(s1.sessionToken).toMatch(/^[0-9a-f]{64}$/)
      expect(s2.sessionToken).toMatch(/^[0-9a-f]{64}$/)
      expect(s1.sessionToken).not.toBe(s2.sessionToken)
    })

    it('refreshSessionTimeout resets expiry from now', async () => {
      vi.useFakeTimers()
      await SessionManager.createSession(mockUser)
      const originalExpiry = SessionManager.getCurrentSession()!.expiresAt

      vi.advanceTimersByTime(5 * 60 * 1000) // 5 min later
      ;(SessionManager as any).cachedTimeout = null

      await SessionManager.refreshSessionTimeout()
      const newExpiry = SessionManager.getCurrentSession()!.expiresAt
      expect(newExpiry).toBeGreaterThan(originalExpiry)

      vi.useRealTimers()
    })

    it('unknown role has no permissions', async () => {
      await SessionManager.createSession({ ...mockUser, role: 'UnknownRole', isManager: false })
      expect(SessionManager.hasPermission('pos.sale')).toBe(false)
      expect(SessionManager.hasPermission('inventory.view')).toBe(false)
    })

    it('isManager=false user without manager role has no isManager', async () => {
      const session = await SessionManager.createSession({
        ...mockUser, role: 'Cashier', isManager: false,
      })
      expect(session.isManager).toBe(false)
    })

    it('getWarningThreshold returns 5 minutes', async () => {
      const threshold = await SessionManager.getWarningThreshold()
      expect(threshold).toBe(5 * 60 * 1000)
    })

    it('getCheckInterval returns 30 seconds', async () => {
      const interval = await SessionManager.getCheckInterval()
      expect(interval).toBe(30 * 1000)
    })
  })
})
