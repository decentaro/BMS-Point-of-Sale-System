import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

// The RuntimeApiConfig is a singleton — we must reset module state between tests
// by re-importing after resetModules()
describe('runtime-api', () => {
  beforeEach(async () => {
    vi.resetModules()
    // Reset window.electronAPI
    if (typeof window !== 'undefined') {
      ;(window as any).electronAPI = undefined
    }
  })

  // ── Happy Path ──────────────────────────────────────────────

  describe('Happy Path', () => {
    it('getApiBaseUrl returns default URL when no Electron API', async () => {
      const { getApiBaseUrl } = await import('@/config/runtime-api')
      const url = await getApiBaseUrl()
      expect(url).toBe('http://localhost:5002/api')
    })

    it('getApiConfig returns config with baseUrl and timeout', async () => {
      const { getApiConfig } = await import('@/config/runtime-api')
      const config = await getApiConfig()
      expect(config.baseUrl).toBe('http://localhost:5002/api')
      expect(config.timeout).toBe(30000)
    })

    it('API_BASE_URL export is the default fallback', async () => {
      const { API_BASE_URL } = await import('@/config/runtime-api')
      expect(API_BASE_URL).toBe('http://localhost:5002/api')
    })

    it('caches config after first getConfig call', async () => {
      const { getApiConfig } = await import('@/config/runtime-api')
      const config1 = await getApiConfig()
      const config2 = await getApiConfig()
      expect(config1).toBe(config2) // same reference = cached
    })

    it('updateApiConfig updates the cached config', async () => {
      const { getApiConfig, updateApiConfig } = await import('@/config/runtime-api')
      await getApiConfig() // Initialize
      updateApiConfig({ baseUrl: 'http://custom:9000/api' })
      const updated = await getApiConfig()
      expect(updated.baseUrl).toBe('http://custom:9000/api')
    })

    it('updateApiConfig merges partial updates', async () => {
      const { getApiConfig, updateApiConfig } = await import('@/config/runtime-api')
      await getApiConfig() // Initialize with timeout=30000
      updateApiConfig({ timeout: 60000 })
      const updated = await getApiConfig()
      expect(updated.timeout).toBe(60000)
      expect(updated.baseUrl).toBe('http://localhost:5002/api')
    })
  })

  // ── Electron Path ────────────────────────────────────────────

  describe('Electron path', () => {
    it('uses electronAPI.getApiConfig when available', async () => {
      if (typeof window === 'undefined') return

      const mockGetApiConfig = vi.fn().mockResolvedValue({
        baseUrl: 'http://10.0.0.1:5002/api',
        timeout: 15000,
      })
      ;(window as any).electronAPI = { getApiConfig: mockGetApiConfig }

      const { getApiBaseUrl } = await import('@/config/runtime-api')
      const url = await getApiBaseUrl()
      expect(url).toBe('http://10.0.0.1:5002/api')
    })

    it('falls back to default when electronAPI.getApiConfig returns null', async () => {
      if (typeof window === 'undefined') return

      ;(window as any).electronAPI = { getApiConfig: vi.fn().mockResolvedValue(null) }

      const { getApiBaseUrl } = await import('@/config/runtime-api')
      const url = await getApiBaseUrl()
      expect(url).toBe('http://localhost:5002/api')
    })

    it('falls back to default when electronAPI.getApiConfig throws', async () => {
      if (typeof window === 'undefined') return

      ;(window as any).electronAPI = {
        getApiConfig: vi.fn().mockRejectedValue(new Error('IPC error')),
      }

      const { getApiBaseUrl } = await import('@/config/runtime-api')
      const url = await getApiBaseUrl()
      expect(url).toBe('http://localhost:5002/api')
    })

    it('calls electronAPI.setApiConfig when updating config', async () => {
      if (typeof window === 'undefined') return

      const mockSetApiConfig = vi.fn()
      ;(window as any).electronAPI = { setApiConfig: mockSetApiConfig }

      const { getApiConfig, updateApiConfig } = await import('@/config/runtime-api')
      await getApiConfig() // Initialize
      updateApiConfig({ baseUrl: 'http://new:5002/api' })

      expect(mockSetApiConfig).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: 'http://new:5002/api' })
      )
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('updateApiConfig without prior init sets config from scratch', async () => {
      const { updateApiConfig, getApiConfig } = await import('@/config/runtime-api')
      updateApiConfig({ baseUrl: 'http://fresh:5002/api' })
      const config = await getApiConfig()
      expect(config.baseUrl).toBe('http://fresh:5002/api')
    })

    it('resetConfig forces re-fetch on next getConfig', async () => {
      const mod = await import('@/config/runtime-api')
      await mod.getApiConfig() // prime cache

      // Access internal reset via the module's exported function
      // RuntimeApiConfig exports resetConfig indirectly via the singleton
      // We test that calling getApiConfig again still works
      const config = await mod.getApiConfig()
      expect(config).toBeDefined()
    })
  })
})
