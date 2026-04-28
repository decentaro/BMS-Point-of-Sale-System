/**
 * @vitest-environment node
 *
 * Tests for the Electron connectivity monitor.
 * We import the module directly since it doesn't require('electron').
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The module uses global fetch + AbortSignal.timeout
// We mock fetch; AbortSignal.timeout is available in Node 18+

function createMockBmsApp() {
  const mockWindow = {
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  }
  return {
    mainWindow: mockWindow,
    _mockWindow: mockWindow,
  }
}

let createConnectivityMonitor: any

describe('connectivity monitor', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn()
    vi.resetModules()
    const mod = await import('../../../electron/connectivity.js' as any)
    createConnectivityMonitor = mod.createConnectivityMonitor
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── Happy Path ──────────────────────────────────────────────

  describe('Happy Path', () => {
    it('starts with isOnline=true', () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)
      expect(monitor.isOnline).toBe(true)
    })

    it('check() stays online on successful response', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await monitor.check()

      expect(monitor.isOnline).toBe(true)
      // No change, so no IPC sent
      expect(app._mockWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('check() stays online on 404 (server reachable)', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 404 }))
      await monitor.check()

      expect(monitor.isOnline).toBe(true)
    })

    it('check() goes offline on network error', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'))
      await monitor.check()

      expect(monitor.isOnline).toBe(false)
      expect(app._mockWindow.webContents.send).toHaveBeenCalledWith(
        'connectivity-changed', { online: false }
      )
    })

    it('recovers from offline to online', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      // Go offline
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'))
      await monitor.check()
      expect(monitor.isOnline).toBe(false)

      // Come back online
      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await monitor.check()

      expect(monitor.isOnline).toBe(true)
      expect(app._mockWindow.webContents.send).toHaveBeenCalledWith(
        'connectivity-changed', { online: true }
      )
    })

    it('start() sets up interval and delayed initial check', () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))
      monitor.start()

      expect(monitor.timer).not.toBeNull()
    })

    it('stop() clears timer', () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      monitor.start()
      expect(monitor.timer).not.toBeNull()

      monitor.stop()
      expect(monitor.timer).toBeNull()
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('does not send IPC when state unchanged (online→online)', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await monitor.check()

      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await monitor.check()

      expect(app._mockWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('does not send IPC when state unchanged (offline→offline)', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      // Go offline
      vi.mocked(fetch).mockRejectedValueOnce(new Error('fail'))
      await monitor.check()
      expect(app._mockWindow.webContents.send).toHaveBeenCalledTimes(1)

      // Still offline
      vi.mocked(fetch).mockRejectedValueOnce(new Error('fail'))
      await monitor.check()

      // Should NOT send again
      expect(app._mockWindow.webContents.send).toHaveBeenCalledTimes(1)
    })

    it('does not crash when window is destroyed', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      app._mockWindow.isDestroyed.mockReturnValue(true)

      vi.mocked(fetch).mockRejectedValueOnce(new Error('fail'))
      await monitor.check()

      // State changed but send should be skipped
      expect(monitor.isOnline).toBe(false)
      expect(app._mockWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('does not crash when mainWindow is null', async () => {
      const app = { mainWindow: null }
      const monitor = createConnectivityMonitor(app)

      vi.mocked(fetch).mockRejectedValueOnce(new Error('fail'))
      await monitor.check() // Should not throw
      expect(monitor.isOnline).toBe(false)
    })

    it('stop() is safe to call without start()', () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      expect(() => monitor.stop()).not.toThrow()
      expect(monitor.timer).toBeNull()
    })

    it('stop() then start() works', () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))

      monitor.start()
      monitor.stop()
      monitor.start()
      expect(monitor.timer).not.toBeNull()
      monitor.stop()
    })
  })

  // ── Rare Edge Cases ─────────────────────────────────────────

  describe('Rare Edge Cases', () => {
    it('500 response counts as online (server reachable)', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 500 }))
      await monitor.check()

      expect(monitor.isOnline).toBe(true)
    })

    it('rapid online/offline/online transitions all send IPC', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'))
      await monitor.check()
      expect(app._mockWindow.webContents.send).toHaveBeenCalledTimes(1)

      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 200 }))
      await monitor.check()
      expect(app._mockWindow.webContents.send).toHaveBeenCalledTimes(2)

      vi.mocked(fetch).mockRejectedValueOnce(new Error('offline again'))
      await monitor.check()
      expect(app._mockWindow.webContents.send).toHaveBeenCalledTimes(3)
    })

    it('timeout error (AbortError) treated as offline', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      const abortErr = new Error('AbortError')
      abortErr.name = 'AbortError'
      vi.mocked(fetch).mockRejectedValueOnce(abortErr)
      await monitor.check()

      expect(monitor.isOnline).toBe(false)
    })

    it('fetches correct URL', async () => {
      const app = createMockBmsApp()
      const monitor = createConnectivityMonitor(app)

      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }))
      await monitor.check()

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5002/api/tax-settings',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })
  })
})
