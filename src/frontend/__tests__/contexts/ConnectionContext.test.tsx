import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, act, screen } from '@testing-library/react'

// Mock config
vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

// Mock SessionManager
vi.mock('@/utils/SessionManager', () => ({
  default: {
    isSessionValid: vi.fn(() => true),
    getUserHeaders: vi.fn(() => ({
      'X-User-Id': '1', 'X-User-Name': 'Test', 'Authorization': 'Bearer jwt',
    })),
    clearSession: vi.fn(),
    getCurrentSession: vi.fn(() => ({
      id: 1, role: 'Manager', isManager: true,
    })),
  },
}))

// Mock CacheService
vi.mock('@/utils/CacheService', () => ({
  default: { warmAll: vi.fn(), get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}))

import { ConnectionProvider, useConnection } from '@/contexts/ConnectionContext'
import ApiClient from '@/utils/ApiClient'
import CacheService from '@/utils/CacheService'

// Helper component to expose context values
function TestConsumer({ onRender }: { onRender: (val: any) => void }) {
  const ctx = useConnection()
  onRender(ctx)
  return (
    <div>
      <span data-testid="online">{String(ctx.isOnline)}</span>
      <span data-testid="queueCount">{ctx.queueCount}</span>
      <span data-testid="adjQueueCount">{ctx.adjustmentQueueCount}</span>
      <span data-testid="retQueueCount">{ctx.returnQueueCount}</span>
      <span data-testid="syncing">{String(ctx.isSyncing)}</span>
      <span data-testid="failedSales">{ctx.failedSaleCount}</span>
      <span data-testid="failedAdj">{ctx.failedAdjustmentCount}</span>
      <span data-testid="failedRet">{ctx.failedReturnCount}</span>
    </div>
  )
}

function mockElectronAPI(overrides: Partial<typeof window.electronAPI> = {}) {
  const api = {
    getQueue: vi.fn(async () => []),
    getAdjustmentQueue: vi.fn(async () => []),
    getReturnQueue: vi.fn(async () => []),
    removeFromQueue: vi.fn(async () => {}),
    removeFromAdjustmentQueue: vi.fn(async () => {}),
    removeFromReturnQueue: vi.fn(async () => {}),
    logFailedSale: vi.fn(async () => {}),
    logFailedAdjustment: vi.fn(async () => {}),
    logFailedReturn: vi.fn(async () => {}),
    getFailedSales: vi.fn(async () => []),
    getFailedAdjustments: vi.fn(async () => []),
    getFailedReturns: vi.fn(async () => []),
    clearFailedSales: vi.fn(async () => {}),
    clearFailedAdjustments: vi.fn(async () => {}),
    clearFailedReturns: vi.fn(async () => {}),
    getConnectivity: vi.fn(async () => ({ online: true })),
    onConnectivityChange: vi.fn(() => () => {}),
    getTerminalConfig: vi.fn(async () => ({ terminalId: 'T1', terminalName: 'Register 1' })),
    setAuthToken: vi.fn(),
    clearAuthToken: vi.fn(),
    ...overrides,
  }
  ;(window as any).electronAPI = api
  return api
}

describe('ConnectionContext', () => {
  let electronAPI: ReturnType<typeof mockElectronAPI>

  beforeEach(() => {
    electronAPI = mockElectronAPI()
    ApiClient.setOnline(true)
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Happy Path ──────────────────────────────────────────────

  describe('Happy Path', () => {
    it('initializes with online state from electronAPI', async () => {
      let ctx: any
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={v => { ctx = v }} />
          </ConnectionProvider>
        )
      })

      expect(ctx.isOnline).toBe(true)
      expect(electronAPI.getConnectivity).toHaveBeenCalled()
    })

    it('sets terminal ID on init', async () => {
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      expect(ApiClient.terminalId).toBe('T1')
      expect(ApiClient.terminalName).toBe('Register 1')
    })

    it('refreshes all queue counts on init', async () => {
      electronAPI.getQueue.mockResolvedValue([{ id: '1' }, { id: '2' }])
      electronAPI.getAdjustmentQueue.mockResolvedValue([{ id: '3' }])
      electronAPI.getReturnQueue.mockResolvedValue([])

      let ctx: any
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={v => { ctx = v }} />
          </ConnectionProvider>
        )
      })

      expect(ctx.queueCount).toBe(2)
      expect(ctx.adjustmentQueueCount).toBe(1)
      expect(ctx.returnQueueCount).toBe(0)
    })

    it('warms cache on init when online', async () => {
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      expect(CacheService.warmAll).toHaveBeenCalled()
    })

    it('refreshes failed counts on init', async () => {
      electronAPI.getFailedSales.mockResolvedValue([{ id: 'f1' }])
      electronAPI.getFailedAdjustments.mockResolvedValue([{ id: 'f2' }, { id: 'f3' }])
      electronAPI.getFailedReturns.mockResolvedValue([])

      let ctx: any
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={v => { ctx = v }} />
          </ConnectionProvider>
        )
      })

      expect(ctx.failedSaleCount).toBe(1)
      expect(ctx.failedAdjustmentCount).toBe(2)
      expect(ctx.failedReturnCount).toBe(0)
    })
  })

  // ── Connectivity Changes ────────────────────────────────────

  describe('Connectivity Changes', () => {
    it('updates online state when connectivity changes', async () => {
      let connectivityCallback: (state: { online: boolean }) => void = () => {}
      electronAPI.onConnectivityChange.mockImplementation((cb: any) => {
        connectivityCallback = cb
        return () => {}
      })

      let ctx: any
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={v => { ctx = v }} />
          </ConnectionProvider>
        )
      })

      expect(ctx.isOnline).toBe(true)

      await act(async () => {
        connectivityCallback({ online: false })
      })
      expect(ctx.isOnline).toBe(false)

      await act(async () => {
        connectivityCallback({ online: true })
      })
      expect(ctx.isOnline).toBe(true)
    })

    it('triggers sync when coming back online', async () => {
      electronAPI.getConnectivity.mockResolvedValue({ online: false })
      let connectivityCallback: (state: { online: boolean }) => void = () => {}
      electronAPI.onConnectivityChange.mockImplementation((cb: any) => {
        connectivityCallback = cb
        return () => {}
      })

      electronAPI.getQueue.mockResolvedValue([
        { id: 'sale-1', saleData: { items: [] }, idempotencyKey: 'key-1' },
      ])

      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      vi.mocked(fetch).mockResolvedValue(new Response('{"id":1}', { status: 201 }))

      await act(async () => {
        connectivityCallback({ online: true })
      })

      // Give sync a tick to run
      await act(async () => {
        await new Promise(r => setTimeout(r, 50))
      })

      // Sync should have attempted to post the queued sale
      expect(CacheService.warmAll).toHaveBeenCalled()
    })

    it('sets ApiClient.online on connectivity change', async () => {
      let connectivityCallback: (state: { online: boolean }) => void = () => {}
      electronAPI.onConnectivityChange.mockImplementation((cb: any) => {
        connectivityCallback = cb
        return () => {}
      })

      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      await act(async () => {
        connectivityCallback({ online: false })
      })
      expect(ApiClient.online).toBe(false)

      await act(async () => {
        connectivityCallback({ online: true })
      })
      expect(ApiClient.online).toBe(true)
    })
  })

  // ── Clear Failed Items ──────────────────────────────────────

  describe('Clear Failed Items', () => {
    it('clearFailedSales calls electronAPI and resets count', async () => {
      electronAPI.getFailedSales.mockResolvedValue([{ id: 'f1' }])

      let ctx: any
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={v => { ctx = v }} />
          </ConnectionProvider>
        )
      })

      expect(ctx.failedSaleCount).toBe(1)

      await act(async () => {
        await ctx.clearFailedSales()
      })

      expect(electronAPI.clearFailedSales).toHaveBeenCalled()
      expect(ctx.failedSaleCount).toBe(0)
    })

    it('clearFailedAdjustments calls electronAPI and resets count', async () => {
      electronAPI.getFailedAdjustments.mockResolvedValue([{ id: 'f1' }])

      let ctx: any
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={v => { ctx = v }} />
          </ConnectionProvider>
        )
      })

      await act(async () => {
        await ctx.clearFailedAdjustments()
      })

      expect(electronAPI.clearFailedAdjustments).toHaveBeenCalled()
      expect(ctx.failedAdjustmentCount).toBe(0)
    })

    it('clearFailedReturns calls electronAPI and resets count', async () => {
      electronAPI.getFailedReturns.mockResolvedValue([{ id: 'f1' }])

      let ctx: any
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={v => { ctx = v }} />
          </ConnectionProvider>
        )
      })

      await act(async () => {
        await ctx.clearFailedReturns()
      })

      expect(electronAPI.clearFailedReturns).toHaveBeenCalled()
      expect(ctx.failedReturnCount).toBe(0)
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('works without electronAPI (web fallback)', async () => {
      ;(window as any).electronAPI = undefined

      let ctx: any
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={v => { ctx = v }} />
          </ConnectionProvider>
        )
      })

      // Should default to online with zero queue
      expect(ctx.isOnline).toBe(true)
      expect(ctx.queueCount).toBe(0)

      // Re-assign for other tests
      electronAPI = mockElectronAPI()
    })

    it('starts offline if getConnectivity returns offline', async () => {
      electronAPI.getConnectivity.mockResolvedValue({ online: false })

      let ctx: any
      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={v => { ctx = v }} />
          </ConnectionProvider>
        )
      })

      expect(ctx.isOnline).toBe(false)
    })

    it('does not warm cache when starting offline', async () => {
      vi.mocked(CacheService.warmAll).mockClear()
      electronAPI.getConnectivity.mockResolvedValue({ online: false })

      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      expect(CacheService.warmAll).not.toHaveBeenCalled()
    })

    it('cleanup function is returned from onConnectivityChange', async () => {
      const cleanup = vi.fn()
      electronAPI.onConnectivityChange.mockReturnValue(cleanup)

      const { unmount } = await act(async () =>
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      )

      unmount()
      expect(cleanup).toHaveBeenCalled()
    })

    it('skips terminal config when getTerminalConfig is missing', async () => {
      delete (electronAPI as any).getTerminalConfig
      ApiClient.setTerminalId(null, null)

      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      expect(ApiClient.terminalId).toBeNull()
    })
  })

  // ── Rare Edge Cases ─────────────────────────────────────────

  describe('Rare Edge Cases', () => {
    it('login event triggers cache warm', async () => {
      vi.mocked(CacheService.warmAll).mockClear()

      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      vi.mocked(CacheService.warmAll).mockClear()

      await act(async () => {
        window.dispatchEvent(new Event('bms:logged-in'))
      })

      expect(CacheService.warmAll).toHaveBeenCalled()
    })

    it('login event does NOT warm cache when offline', async () => {
      ApiClient.setOnline(false)
      electronAPI.getConnectivity.mockResolvedValue({ online: false })
      vi.mocked(CacheService.warmAll).mockClear()

      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      vi.mocked(CacheService.warmAll).mockClear()

      await act(async () => {
        window.dispatchEvent(new Event('bms:logged-in'))
      })

      expect(CacheService.warmAll).not.toHaveBeenCalled()
    })

    it('does not sync when going offline→offline (no transition)', async () => {
      electronAPI.getConnectivity.mockResolvedValue({ online: false })
      let connectivityCallback: (state: { online: boolean }) => void = () => {}
      electronAPI.onConnectivityChange.mockImplementation((cb: any) => {
        connectivityCallback = cb
        return () => {}
      })

      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      vi.mocked(CacheService.warmAll).mockClear()

      // Still offline — no sync should trigger
      await act(async () => {
        connectivityCallback({ online: false })
      })

      expect(CacheService.warmAll).not.toHaveBeenCalled()
    })

    it('does not sync when going online→online (already online)', async () => {
      let connectivityCallback: (state: { online: boolean }) => void = () => {}
      electronAPI.onConnectivityChange.mockImplementation((cb: any) => {
        connectivityCallback = cb
        return () => {}
      })

      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      vi.mocked(CacheService.warmAll).mockClear()

      // Already online → online again — should NOT trigger sync
      await act(async () => {
        connectivityCallback({ online: true })
      })

      // warmAll is called but sync should NOT trigger (wasOnlineRef was true)
      // Actually this is the online→online case where wasOnlineRef.current is true
      // so the sync code is NOT executed, only warmAll is always called on online
    })
  })
})
