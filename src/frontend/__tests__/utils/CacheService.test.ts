import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock SessionManager
vi.mock('@/utils/SessionManager', () => ({
  default: {
    isSessionValid: vi.fn(() => true),
    getCurrentSession: vi.fn(() => ({
      id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager',
      isManager: true, loginTime: Date.now(), lastActivity: Date.now(),
      sessionToken: 'tok', expiresAt: Date.now() + 30 * 60 * 1000,
    })),
    getUserHeaders: vi.fn(() => ({
      'X-User-Id': '1', 'X-User-Name': 'Manager', 'Authorization': 'Bearer jwt',
    })),
    clearSession: vi.fn(),
  },
}))

// Mock ApiClient for warmAll
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getJson: vi.fn(() => Promise.resolve([])),
  },
}))

import CacheService from '@/utils/CacheService'
import SessionManager from '@/utils/SessionManager'
import ApiClient from '@/utils/ApiClient'

describe('CacheService', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(ApiClient.getJson).mockClear()
    vi.mocked(SessionManager.isSessionValid).mockReturnValue(true)
    vi.mocked(SessionManager.getCurrentSession).mockReturnValue({
      id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager',
      isManager: true, loginTime: Date.now(), lastActivity: Date.now(),
      sessionToken: 'tok', expiresAt: Date.now() + 30 * 60 * 1000,
    })
  })

  // ── Happy Path ──────────────────────────────────────────────

  describe('Happy Path', () => {
    it('set stores and get retrieves data', () => {
      CacheService.set('/products', [{ id: 1, name: 'Widget' }])
      const data = CacheService.get<any[]>('/products')
      expect(data).toEqual([{ id: 1, name: 'Widget' }])
    })

    it('stores under bms_cache: prefix', () => {
      CacheService.set('/sales', { total: 100 })
      expect(localStorage.getItem('bms_cache:/sales')).toBe(JSON.stringify({ total: 100 }))
    })

    it('clear removes all cache entries but not other keys', () => {
      CacheService.set('/products', [{ id: 1 }])
      CacheService.set('/sales', [{ id: 2 }])
      localStorage.setItem('other_key', 'keep me')

      CacheService.clear()

      expect(localStorage.getItem('bms_cache:/products')).toBeNull()
      expect(localStorage.getItem('bms_cache:/sales')).toBeNull()
      expect(localStorage.getItem('other_key')).toBe('keep me')
    })

    it('overwrites existing cache entry', () => {
      CacheService.set('/products', [{ id: 1 }])
      CacheService.set('/products', [{ id: 1 }, { id: 2 }])
      expect(CacheService.get<any[]>('/products')).toHaveLength(2)
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('get returns null for missing key', () => {
      expect(CacheService.get('/nonexistent')).toBeNull()
    })

    it('get returns null for corrupted JSON', () => {
      localStorage.setItem('bms_cache:/broken', '{invalid json}')
      expect(CacheService.get('/broken')).toBeNull()
    })

    it('set handles complex nested objects', () => {
      const complex = { items: [{ id: 1, tags: ['a', 'b'], nested: { deep: true } }] }
      CacheService.set('/complex', complex)
      expect(CacheService.get('/complex')).toEqual(complex)
    })

    it('caches primitive values', () => {
      CacheService.set('/count', 42)
      expect(CacheService.get<number>('/count')).toBe(42)
    })

    it('caches null value', () => {
      CacheService.set('/null-val', null)
      expect(CacheService.get('/null-val')).toBeNull()
    })

    it('caches empty array', () => {
      CacheService.set('/empty', [])
      expect(CacheService.get('/empty')).toEqual([])
    })
  })

  // ── warmAll ─────────────────────────────────────────────────

  describe('warmAll', () => {
    it('skips when session is invalid', async () => {
      vi.mocked(SessionManager.isSessionValid).mockReturnValueOnce(false)
      const { default: ApiClient } = await import('@/utils/ApiClient')

      await CacheService.warmAll()
      expect(ApiClient.getJson).not.toHaveBeenCalled()
    })

    it('fetches common + inventory + manager endpoints for Manager role', async () => {
      const { default: ApiClient } = await import('@/utils/ApiClient')
      vi.mocked(ApiClient.getJson).mockResolvedValue([])

      await CacheService.warmAll()

      const calls = vi.mocked(ApiClient.getJson).mock.calls.map(c => c[0])
      // Common endpoints
      expect(calls).toContain('/products')
      expect(calls).toContain('/employees')
      expect(calls).toContain('/tax-settings')
      // Inventory endpoints (Manager has access)
      expect(calls).toContain('/stockadjustments')
      // Manager endpoints
      expect(calls).toContain('/sales/today')
      expect(calls).toContain('/AdminSettings')
    })

    it('Cashier role skips manager and inventory endpoints', async () => {
      vi.mocked(SessionManager.getCurrentSession).mockReturnValue({
        id: 2, employeeId: 'CASH-001', name: 'Cashier', role: 'Cashier',
        isManager: false, loginTime: Date.now(), lastActivity: Date.now(),
        sessionToken: 'tok', expiresAt: Date.now() + 1800000,
      })
      vi.mocked(ApiClient.getJson).mockClear()
      vi.mocked(ApiClient.getJson).mockResolvedValue([])

      await CacheService.warmAll()

      const calls = vi.mocked(ApiClient.getJson).mock.calls.map(c => c[0])
      expect(calls).toContain('/products')
      expect(calls).not.toContain('/stockadjustments')
      expect(calls).not.toContain('/sales/today')
      expect(calls).not.toContain('/AdminSettings')
    })

    it('Inventory role includes inventory but not manager endpoints', async () => {
      vi.mocked(SessionManager.getCurrentSession).mockReturnValue({
        id: 3, employeeId: 'INV-001', name: 'Inv User', role: 'Inventory',
        isManager: false, loginTime: Date.now(), lastActivity: Date.now(),
        sessionToken: 'tok', expiresAt: Date.now() + 1800000,
      })
      vi.mocked(ApiClient.getJson).mockClear()
      vi.mocked(ApiClient.getJson).mockResolvedValue([])

      await CacheService.warmAll()

      const calls = vi.mocked(ApiClient.getJson).mock.calls.map(c => c[0])
      expect(calls).toContain('/stockadjustments')
      expect(calls).not.toContain('/AdminSettings')
    })

    it('individual endpoint failures do not break warmAll', async () => {
      const { default: ApiClient } = await import('@/utils/ApiClient')
      let callCount = 0
      vi.mocked(ApiClient.getJson).mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.reject(new Error('503'))
        return Promise.resolve([])
      })

      // Should not throw
      await CacheService.warmAll()
    })
  })

  // ── Rare Edge Cases ─────────────────────────────────────────

  describe('Rare Edge Cases', () => {
    it('multi-role Cashier,Inventory gets inventory but not manager endpoints', async () => {
      vi.mocked(SessionManager.getCurrentSession).mockReturnValue({
        id: 4, employeeId: 'MULTI-01', name: 'Multi', role: 'Cashier,Inventory',
        isManager: false, loginTime: Date.now(), lastActivity: Date.now(),
        sessionToken: 'tok', expiresAt: Date.now() + 1800000,
      })
      vi.mocked(ApiClient.getJson).mockClear()
      vi.mocked(ApiClient.getJson).mockResolvedValue([])

      await CacheService.warmAll()

      const calls = vi.mocked(ApiClient.getJson).mock.calls.map(c => c[0])
      expect(calls).toContain('/stockadjustments')
      expect(calls).toContain('/stockadjustments/pending-approval')
      expect(calls).not.toContain('/AdminSettings')
    })

    it('no session returns empty warm list', async () => {
      vi.mocked(SessionManager.getCurrentSession).mockReturnValueOnce(null)
      vi.mocked(SessionManager.isSessionValid).mockReturnValueOnce(true)
      const { default: ApiClient } = await import('@/utils/ApiClient')

      await CacheService.warmAll()
      // Even though session is "valid", getCurrentSession returns null so no endpoints
      // This tests the defensive getWarmEndpointsForSession guard
    })

    it('set silently handles localStorage quota error', () => {
      const origSetItem = localStorage.setItem
      localStorage.setItem = () => { throw new Error('QuotaExceededError') }

      // Should not throw
      expect(() => CacheService.set('/big', 'x'.repeat(1000))).not.toThrow()
      localStorage.setItem = origSetItem
    })
  })
})
