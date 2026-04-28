import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// This file tests config/api.ts WITHOUT mocking it, so the real module code runs
// and contributes to coverage. All other test files mock @/config/api, so those
// lines never execute — this test is the only one that actually runs them.

describe('config/api (unmocked)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('API_BASE_URL is a non-empty string containing http', async () => {
    const { API_BASE_URL } = await import('@/config/api')
    expect(typeof API_BASE_URL).toBe('string')
    expect(API_BASE_URL.length).toBeGreaterThan(0)
    expect(API_BASE_URL).toContain('http')
  })

  it('API_CONFIG.baseUrl matches API_BASE_URL', async () => {
    const { API_CONFIG, API_BASE_URL } = await import('@/config/api')
    expect(API_CONFIG.baseUrl).toBe(API_BASE_URL)
  })

  it('API_CONFIG.timeout is 30000', async () => {
    const { API_CONFIG } = await import('@/config/api')
    expect(API_CONFIG.timeout).toBe(30000)
  })

  it('default export equals API_CONFIG', async () => {
    const mod = await import('@/config/api')
    expect(mod.default).toEqual(mod.API_CONFIG)
  })

  it('falls back to default URL when VITE_API_BASE_URL is empty', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    const { API_BASE_URL } = await import('@/config/api')
    expect(API_BASE_URL).toBe('http://127.0.0.1:5002/api')
  })

  it('uses VITE_API_BASE_URL when set', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://custom-host:9000/api')
    const { API_BASE_URL } = await import('@/config/api')
    expect(API_BASE_URL).toBe('http://custom-host:9000/api')
  })

  it('VITE_API_BASE_URL result also has timeout 30000', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://custom-host:9000/api')
    const { API_CONFIG } = await import('@/config/api')
    expect(API_CONFIG.timeout).toBe(30000)
  })
})
