/**
 * ConnectionContext.sync.test.tsx
 *
 * Tests for the three sync queue functions:
 *  - syncQueue         (sales)
 *  - syncAdjustmentQueue
 *  - syncReturnQueue
 *
 * Each sync function shares the same error-handling shape:
 *  - 4xx (permanent) → log failed item, remove from queue, increment failedCount, continue next item
 *  - 5xx / network   → circuit-break, item stays in queue
 *
 * Also covers the 2-minute background cache-refresh interval.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

vi.mock('@/utils/SessionManager', () => ({
  default: {
    isSessionValid: vi.fn(() => true),
    getUserHeaders: vi.fn(() => ({ Authorization: 'Bearer jwt' })),
    clearSession: vi.fn(),
    getCurrentSession: vi.fn(() => ({ id: 1, role: 'Manager', isManager: true })),
  },
}))

vi.mock('@/utils/CacheService', () => ({
  default: { warmAll: vi.fn(), get: vi.fn(), set: vi.fn(), clear: vi.fn() },
}))

import { ConnectionProvider, useConnection } from '@/contexts/ConnectionContext'
import ApiClient from '@/utils/ApiClient'
import CacheService from '@/utils/CacheService'

// ── TestConsumer exposes all sync-relevant fields ────────────────────────────

function TestConsumer({ onRender }: { onRender: (v: any) => void }) {
  const ctx = useConnection()
  onRender(ctx)
  return (
    <div>
      <span data-testid="queueCount">{ctx.queueCount}</span>
      <span data-testid="adjCount">{ctx.adjustmentQueueCount}</span>
      <span data-testid="retCount">{ctx.returnQueueCount}</span>
      <span data-testid="failedSales">{ctx.failedSaleCount}</span>
      <span data-testid="failedAdj">{ctx.failedAdjustmentCount}</span>
      <span data-testid="failedRet">{ctx.failedReturnCount}</span>
      <span data-testid="syncing">{String(ctx.isSyncing)}</span>
      <span data-testid="progress">
        {ctx.syncProgress ? `${ctx.syncProgress.current}/${ctx.syncProgress.total}` : 'null'}
      </span>
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
    getConnectivity: vi.fn(async () => ({ online: false })),  // default: start offline
    onConnectivityChange: vi.fn(() => () => {}),
    getTerminalConfig: vi.fn(async () => ({ terminalId: 'T1', terminalName: 'Test' })),
    setAuthToken: vi.fn(),
    clearAuthToken: vi.fn(),
    ...overrides,
  }
  ;(window as any).electronAPI = api
  return api
}

/** Mount the provider and capture the context, and return a reconnect trigger. */
async function mountOfflineProvider(electronAPI: ReturnType<typeof mockElectronAPI>) {
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

  const reconnect = async () => {
    await act(async () => { connectivityCallback({ online: true }) })
  }

  return { ctx: () => ctx, reconnect }
}

describe('ConnectionContext — Sync Queue Error Handling', () => {
  let electronAPI: ReturnType<typeof mockElectronAPI>

  beforeEach(() => {
    electronAPI = mockElectronAPI()
    ApiClient.setOnline(false)
    global.fetch = vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── syncQueue (sales) ───────────────────────────────────────────────────────

  describe('syncQueue (sales)', () => {
    it('4xx permanent error: logs failed sale, removes from queue, increments failedSaleCount', async () => {
      electronAPI.getQueue.mockResolvedValue([
        { id: 'sale-1', saleData: { items: [] }, idempotencyKey: 'key-1' },
      ])

      const { ctx, reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('Conflict', { status: 409 }))

      await reconnect()
      await waitFor(() => expect(electronAPI.logFailedSale).toHaveBeenCalled(), { timeout: 2000 })

      expect(electronAPI.logFailedSale).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'sale-1', httpStatus: 409 })
      )
      expect(electronAPI.removeFromQueue).toHaveBeenCalledWith('sale-1')
      expect(ctx().failedSaleCount).toBe(1)
      expect(ctx().queueCount).toBe(0)
    })

    it('4xx permanent error: continues processing next item after logging failure', async () => {
      electronAPI.getQueue.mockResolvedValue([
        { id: 'sale-1', saleData: { items: [] }, idempotencyKey: 'k1' },
        { id: 'sale-2', saleData: { items: [] }, idempotencyKey: 'k2' },
      ])

      const { reconnect } = await mountOfflineProvider(electronAPI)
      // Both items get 409 — both should be logged and removed
      vi.mocked(fetch).mockImplementation(async () => new Response('Conflict', { status: 409 }))

      await reconnect()
      await waitFor(() => expect(electronAPI.logFailedSale).toHaveBeenCalledTimes(2), { timeout: 2000 })

      expect(electronAPI.removeFromQueue).toHaveBeenCalledWith('sale-1')
      expect(electronAPI.removeFromQueue).toHaveBeenCalledWith('sale-2')
    })

    it('5xx temporary error: breaks loop, item stays in queue, failedSaleCount unchanged', async () => {
      electronAPI.getQueue.mockResolvedValue([
        { id: 'sale-1', saleData: { items: [] }, idempotencyKey: 'k1' },
      ])

      const { ctx, reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('Server Error', { status: 500 }))

      await reconnect()
      // Give sync time to complete
      await act(async () => { await new Promise(r => setTimeout(r, 80)) })

      // Item should NOT have been logged or removed (circuit breaker fired)
      expect(electronAPI.logFailedSale).not.toHaveBeenCalled()
      expect(electronAPI.removeFromQueue).not.toHaveBeenCalled()
      // failedSaleCount stays at 0 — the sale is still queued, not failed
      expect(ctx().failedSaleCount).toBe(0)
    })

    it('5xx error: stops at first failure — second item not processed', async () => {
      electronAPI.getQueue.mockResolvedValue([
        { id: 'sale-1', saleData: { items: [] }, idempotencyKey: 'k1' },
        { id: 'sale-2', saleData: { items: [] }, idempotencyKey: 'k2' },
      ])

      const { reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('Server Error', { status: 500 }))

      await reconnect()
      await act(async () => { await new Promise(r => setTimeout(r, 80)) })

      // fetch should only have been called once (stopped after first 5xx)
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
      expect(electronAPI.removeFromQueue).not.toHaveBeenCalled()
    })

    it('success path: removes each item, decrements queueCount, resets progress to null', async () => {
      electronAPI.getQueue.mockResolvedValue([
        { id: 'sale-1', saleData: { items: [] }, idempotencyKey: 'k1' },
        { id: 'sale-2', saleData: { items: [] }, idempotencyKey: 'k2' },
      ])

      const { ctx, reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('{"transactionId":"T1"}', { status: 201 }))

      await reconnect()
      await waitFor(() => expect(electronAPI.removeFromQueue).toHaveBeenCalledTimes(2), { timeout: 2000 })

      expect(ctx().queueCount).toBe(0)
      expect(ctx().syncProgress).toBeNull()
      expect(ctx().failedSaleCount).toBe(0)
    })

    it('uses idempotencyKey from queue item as X-Idempotency-Key header', async () => {
      electronAPI.getQueue.mockResolvedValue([
        { id: 'sale-1', saleData: { items: [] }, idempotencyKey: 'idem-abc-123' },
      ])

      const { reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('{"transactionId":"T1"}', { status: 201 }))

      await reconnect()
      await waitFor(() => expect(electronAPI.removeFromQueue).toHaveBeenCalled(), { timeout: 2000 })

      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const requestInit = fetchCall[1] as RequestInit
      const headers = requestInit.headers as Record<string, string>
      expect(headers['X-Idempotency-Key']).toBe('idem-abc-123')
    })

    it('falls back to item.id as idempotency key when idempotencyKey is missing', async () => {
      electronAPI.getQueue.mockResolvedValue([
        { id: 'sale-fallback', saleData: { items: [] } },  // no idempotencyKey
      ])

      const { reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('{"transactionId":"T1"}', { status: 201 }))

      await reconnect()
      await waitFor(() => expect(electronAPI.removeFromQueue).toHaveBeenCalled(), { timeout: 2000 })

      const fetchCall = vi.mocked(fetch).mock.calls[0]
      const requestInit = fetchCall[1] as RequestInit
      const headers = requestInit.headers as Record<string, string>
      expect(headers['X-Idempotency-Key']).toBe('sale-fallback')
    })

    it('network error (no status) breaks loop — item stays in queue', async () => {
      electronAPI.getQueue.mockResolvedValue([
        { id: 'sale-1', saleData: { items: [] }, idempotencyKey: 'k1' },
      ])

      const { ctx, reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

      await reconnect()
      await act(async () => { await new Promise(r => setTimeout(r, 80)) })

      expect(electronAPI.logFailedSale).not.toHaveBeenCalled()
      expect(electronAPI.removeFromQueue).not.toHaveBeenCalled()
      expect(ctx().failedSaleCount).toBe(0)
    })
  })

  // ── syncAdjustmentQueue ─────────────────────────────────────────────────────

  describe('syncAdjustmentQueue', () => {
    it('4xx permanent error: logs failed adjustment, removes from queue, increments failedAdjustmentCount', async () => {
      electronAPI.getAdjustmentQueue.mockResolvedValue([
        { id: 'adj-1', productName: 'Widget A', adjustmentData: { type: 'manual' } },
      ])

      const { ctx, reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('Bad Request', { status: 400 }))

      await reconnect()
      await waitFor(() => expect(electronAPI.logFailedAdjustment).toHaveBeenCalled(), { timeout: 2000 })

      expect(electronAPI.logFailedAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'adj-1', httpStatus: 400 })
      )
      expect(electronAPI.removeFromAdjustmentQueue).toHaveBeenCalledWith('adj-1')
      expect(ctx().failedAdjustmentCount).toBe(1)
      expect(ctx().adjustmentQueueCount).toBe(0)
    })

    it('5xx temporary error: breaks loop, adjustment stays in queue', async () => {
      electronAPI.getAdjustmentQueue.mockResolvedValue([
        { id: 'adj-1', productName: 'Widget A', adjustmentData: { type: 'manual' } },
      ])

      const { ctx, reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('Server Error', { status: 500 }))

      await reconnect()
      await act(async () => { await new Promise(r => setTimeout(r, 80)) })

      expect(electronAPI.logFailedAdjustment).not.toHaveBeenCalled()
      expect(electronAPI.removeFromAdjustmentQueue).not.toHaveBeenCalled()
      expect(ctx().failedAdjustmentCount).toBe(0)
    })

    it('success: posts to /stockadjustments, removes item, decrements adjustmentQueueCount', async () => {
      electronAPI.getAdjustmentQueue.mockResolvedValue([
        { id: 'adj-1', productName: 'Widget A', adjustmentData: { type: 'manual' } },
      ])

      const { ctx, reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('{"id":1}', { status: 201 }))

      await reconnect()
      await waitFor(() => expect(electronAPI.removeFromAdjustmentQueue).toHaveBeenCalled(), { timeout: 2000 })

      expect(ctx().adjustmentQueueCount).toBe(0)
      expect(ctx().failedAdjustmentCount).toBe(0)
      // Verify it posted to the correct endpoint
      const url = vi.mocked(fetch).mock.calls[0][0] as string
      expect(url).toContain('/stockadjustments')
    })
  })

  // ── syncReturnQueue ─────────────────────────────────────────────────────────

  describe('syncReturnQueue', () => {
    it('4xx permanent error: logs failed return, removes from queue, increments failedReturnCount', async () => {
      electronAPI.getReturnQueue.mockResolvedValue([
        { id: 'ret-1', transactionId: 'TXN-001', returnData: { reason: 'damaged' } },
      ])

      const { ctx, reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('Not Found', { status: 404 }))

      await reconnect()
      await waitFor(() => expect(electronAPI.logFailedReturn).toHaveBeenCalled(), { timeout: 2000 })

      expect(electronAPI.logFailedReturn).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ret-1', httpStatus: 404, transactionId: 'TXN-001' })
      )
      expect(electronAPI.removeFromReturnQueue).toHaveBeenCalledWith('ret-1')
      expect(ctx().failedReturnCount).toBe(1)
      expect(ctx().returnQueueCount).toBe(0)
    })

    it('5xx temporary error: breaks loop, return stays in queue', async () => {
      electronAPI.getReturnQueue.mockResolvedValue([
        { id: 'ret-1', transactionId: 'TXN-001', returnData: { reason: 'damaged' } },
      ])

      const { ctx, reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('Server Error', { status: 503 }))

      await reconnect()
      await act(async () => { await new Promise(r => setTimeout(r, 80)) })

      expect(electronAPI.logFailedReturn).not.toHaveBeenCalled()
      expect(electronAPI.removeFromReturnQueue).not.toHaveBeenCalled()
      expect(ctx().failedReturnCount).toBe(0)
    })

    it('success: posts to /returns, removes item, decrements returnQueueCount', async () => {
      electronAPI.getReturnQueue.mockResolvedValue([
        { id: 'ret-1', transactionId: 'TXN-001', returnData: { reason: 'damaged' }, idempotencyKey: 'r-key-1' },
      ])

      const { ctx, reconnect } = await mountOfflineProvider(electronAPI)
      vi.mocked(fetch).mockImplementation(async () => new Response('{"id":1}', { status: 201 }))

      await reconnect()
      await waitFor(() => expect(electronAPI.removeFromReturnQueue).toHaveBeenCalled(), { timeout: 2000 })

      expect(ctx().returnQueueCount).toBe(0)
      const url = vi.mocked(fetch).mock.calls[0][0] as string
      expect(url).toContain('/returns')
    })
  })

  // ── 2-minute cache refresh interval ────────────────────────────────────────

  describe('Cache Refresh Interval', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('warms cache every 2 minutes while online', async () => {
      // Start online so the interval fires
      const api = mockElectronAPI({ getConnectivity: vi.fn(async () => ({ online: true })) })
      ApiClient.setOnline(true)

      await act(async () => {
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      })

      vi.mocked(CacheService.warmAll).mockClear()

      // Advance by 2 minutes + 1 second
      await act(async () => { vi.advanceTimersByTime(2 * 60 * 1000 + 1000) })

      expect(CacheService.warmAll).toHaveBeenCalled()
    })

    it('interval cleanup fires on unmount (no memory leak)', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
      const api = mockElectronAPI({ getConnectivity: vi.fn(async () => ({ online: true })) })
      ApiClient.setOnline(true)

      const { unmount } = await act(async () =>
        render(
          <ConnectionProvider>
            <TestConsumer onRender={() => {}} />
          </ConnectionProvider>
        )
      )

      unmount()
      expect(clearIntervalSpy).toHaveBeenCalled()
    })
  })
})
