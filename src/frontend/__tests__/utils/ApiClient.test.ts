import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the config module before importing ApiClient
vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

// Mock SessionManager
vi.mock('@/utils/SessionManager', () => ({
  default: {
    isSessionValid: vi.fn(() => true),
    getUserHeaders: vi.fn(() => ({
      'X-User-Id': '1',
      'X-User-Name': 'TestUser',
      'Authorization': 'Bearer test-jwt-token',
    })),
    clearSession: vi.fn(),
  },
}))

// Mock CacheService for getJson tests
vi.mock('@/utils/CacheService', () => ({
  default: {
    get: vi.fn(() => null),
    set: vi.fn(),
    clear: vi.fn(),
  },
}))

import ApiClient from '@/utils/ApiClient'
import SessionManager from '@/utils/SessionManager'

const BASE = 'http://127.0.0.1:5002/api'

function jsonResponse(data: any, status = 200): Response {
  if (status === 204) return new Response(null, { status: 204 })
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(text: string, status: number): Response {
  if (status === 204) return new Response(null, { status: 204 })
  return new Response(text, { status })
}

describe('ApiClient', () => {
  beforeEach(() => {
    ApiClient.setOnline(true)
    ApiClient.setTerminalId(null, null)
    vi.mocked(SessionManager.isSessionValid).mockReturnValue(true)
    vi.mocked(SessionManager.getUserHeaders).mockReturnValue({
      'X-User-Id': '1',
      'X-User-Name': 'TestUser',
      'Authorization': 'Bearer test-jwt-token',
    })
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Happy Path ──────────────────────────────────────────────

  describe('Happy Path', () => {
    it('GET request succeeds with auth headers', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))

      const resp = await ApiClient.get('/products')
      expect(resp.status).toBe(200)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toBe(`${BASE}/products`)
      const headers = call[1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer test-jwt-token')
      expect(headers['X-User-Id']).toBe('1')
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('POST sends JSON body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ id: 1 }, 201))

      const resp = await ApiClient.post('/sales', { items: [1, 2] })
      expect(resp.status).toBe(201)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[1]?.method).toBe('POST')
      expect(call[1]?.body).toBe(JSON.stringify({ items: [1, 2] }))
    })

    it('PUT sends JSON body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ updated: true }))

      await ApiClient.put('/products/1', { name: 'Updated' })
      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[1]?.method).toBe('PUT')
      expect(call[1]?.body).toBe(JSON.stringify({ name: 'Updated' }))
    })

    it('DELETE sends request without body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(null, 204))

      const resp = await ApiClient.delete('/products/1')
      expect(resp.status).toBe(204)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[1]?.method).toBe('DELETE')
      expect(call[1]?.body).toBeUndefined()
    })

    it('getJson parses response and caches it', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([{ id: 1 }]))

      const { default: CacheService } = await import('@/utils/CacheService')
      const data = await ApiClient.getJson<any[]>('/products')
      expect(data).toEqual([{ id: 1 }])
      expect(CacheService.set).toHaveBeenCalledWith('/products', [{ id: 1 }])
    })

    it('postJson parses JSON response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ id: 42 }, 201))

      const data = await ApiClient.postJson<{ id: number }>('/sales', { items: [] })
      expect(data.id).toBe(42)
    })

    it('requireAuth=false skips session check', async () => {
      vi.mocked(SessionManager.isSessionValid).mockReturnValue(false)
      vi.mocked(SessionManager.getUserHeaders).mockClear()
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))

      const resp = await ApiClient.get('/tax-settings', false)
      expect(resp.status).toBe(200)
      expect(SessionManager.getUserHeaders).not.toHaveBeenCalled()
    })

    it('full URL bypasses base URL prepend', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))

      await ApiClient.get('http://other-host/api/health', false)
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://other-host/api/health')
    })
  })

  // ── Terminal ID Injection ───────────────────────────────────

  describe('Terminal ID Injection', () => {
    it('injects X-Terminal-Id and X-Terminal-Name when set', async () => {
      ApiClient.setTerminalId('term-001', 'Register 1')
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))

      await ApiClient.get('/sales')
      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['X-Terminal-Id']).toBe('term-001')
      expect(headers['X-Terminal-Name']).toBe('Register 1')
    })

    it('omits terminal headers when not set', async () => {
      ApiClient.setTerminalId(null, null)
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))

      await ApiClient.get('/sales')
      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['X-Terminal-Id']).toBeUndefined()
      expect(headers['X-Terminal-Name']).toBeUndefined()
    })
  })

  // ── Offline Behavior ────────────────────────────────────────

  describe('Offline Behavior', () => {
    it('request throws immediately when offline', async () => {
      ApiClient.setOnline(false)

      await expect(ApiClient.get('/products')).rejects.toMatchObject({
        message: 'Offline',
        type: 'network',
      })
      expect(fetch).not.toHaveBeenCalled()
    })

    it('getJson serves from cache when offline', async () => {
      ApiClient.setOnline(false)
      const { default: CacheService } = await import('@/utils/CacheService')
      vi.mocked(CacheService.get).mockReturnValueOnce([{ id: 1, name: 'Cached' }])

      const data = await ApiClient.getJson<any[]>('/products')
      expect(data).toEqual([{ id: 1, name: 'Cached' }])
      expect(CacheService.get).toHaveBeenCalledWith('/products')
    })

    it('getJson throws when offline and no cache', async () => {
      ApiClient.setOnline(false)
      const { default: CacheService } = await import('@/utils/CacheService')
      vi.mocked(CacheService.get).mockReturnValueOnce(null)

      await expect(ApiClient.getJson('/products')).rejects.toMatchObject({
        message: 'Offline',
        type: 'network',
      })
    })
  })

  // ── Auth / Session ──────────────────────────────────────────

  describe('Auth / Session Handling', () => {
    it('throws when session expired and requireAuth=true', async () => {
      vi.mocked(SessionManager.isSessionValid).mockReturnValue(false)

      await expect(ApiClient.get('/products', true)).rejects.toThrow('Session expired')
      expect(fetch).not.toHaveBeenCalled()
    })

    it('401 response clears session and redirects to login', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Unauthorized', 401))

      await expect(ApiClient.get('/products')).rejects.toMatchObject({
        status: 401,
        type: 'auth',
      })
      expect(SessionManager.clearSession).toHaveBeenCalled()
      expect(window.location.href).toBe('#/login')
    })
  })

  // ── Error Classification ────────────────────────────────────

  describe('Error Classification', () => {
    it('400 throws client error (no retry)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Bad Request', 400))

      await expect(ApiClient.get('/products')).rejects.toMatchObject({
        status: 400,
        type: 'client',
      })
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('403 throws client error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Forbidden', 403))

      await expect(ApiClient.get('/products')).rejects.toMatchObject({
        status: 403,
        type: 'client',
      })
    })

    it('404 throws client error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Not Found', 404))

      await expect(ApiClient.get('/products/999')).rejects.toMatchObject({
        status: 404,
        type: 'client',
      })
    })

    it('500 throws server error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Internal Server Error', 500))

      await expect(ApiClient.get('/products', true, { retries: 0 })).rejects.toMatchObject({
        status: 500,
        type: 'server',
      })
    })

    it('timeout throws timeout error', async () => {
      vi.mocked(fetch).mockImplementation(() =>
        new Promise((_, reject) => {
          const err = new Error('AbortError')
          err.name = 'AbortError'
          reject(err)
        })
      )

      await expect(ApiClient.get('/products', true, { retries: 0, timeout: 100 }))
        .rejects.toMatchObject({ type: 'timeout' })
    })

    it('network failure throws network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'))

      await expect(ApiClient.get('/products', true, { retries: 0 }))
        .rejects.toMatchObject({ type: 'network' })
    })
  })

  // ── Retry Logic ─────────────────────────────────────────────

  describe('Retry Logic', () => {
    it('retries GET on 502 and succeeds', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(textResponse('Bad Gateway', 502))
        .mockResolvedValueOnce(textResponse('Bad Gateway', 502))
        .mockResolvedValueOnce(jsonResponse({ ok: true }))

      const resp = await ApiClient.get('/products', true, { retries: 3, retryDelay: 1 })
      expect(resp.status).toBe(200)
      expect(fetch).toHaveBeenCalledTimes(3)
    })

    it('retries GET on 503', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(textResponse('Service Unavailable', 503))
        .mockResolvedValueOnce(jsonResponse({ ok: true }))

      const resp = await ApiClient.get('/products', true, { retries: 2, retryDelay: 1 })
      expect(resp.status).toBe(200)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('retries GET on 504', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(textResponse('Gateway Timeout', 504))
        .mockResolvedValueOnce(jsonResponse({ ok: true }))

      const resp = await ApiClient.get('/products', true, { retries: 2, retryDelay: 1 })
      expect(resp.status).toBe(200)
    })

    it('does NOT retry POST on 500 (prevents duplicate submissions)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Internal Server Error', 500))

      await expect(ApiClient.post('/sales', { items: [] }, true, { retries: 3, retryDelay: 1 }))
        .rejects.toMatchObject({ status: 500, type: 'server' })
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry PUT on 500', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Internal Server Error', 500))

      await expect(ApiClient.put('/products/1', { name: 'x' }, true, { retries: 3, retryDelay: 1 }))
        .rejects.toMatchObject({ status: 500 })
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry POST on 502/503/504 (not idempotent)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Bad Gateway', 502))

      await expect(ApiClient.post('/sales', {}, true, { retries: 3, retryDelay: 1 }))
        .rejects.toMatchObject({ status: 502 })
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('retries DELETE on 502 (idempotent)', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(textResponse('Bad Gateway', 502))
        .mockResolvedValueOnce(jsonResponse(null, 204))

      const resp = await ApiClient.delete('/products/1', true, { retries: 2, retryDelay: 1 })
      expect(resp.status).toBe(204)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('retries on network error (any method)', async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(jsonResponse({ ok: true }, 201))

      const resp = await ApiClient.post('/sales', {}, true, { retries: 2, retryDelay: 1 })
      expect(resp.status).toBe(201)
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('retries on timeout error (any method)', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'

      vi.mocked(fetch)
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce(jsonResponse({ id: 1 }, 201))

      const resp = await ApiClient.post('/sales', {}, true, { retries: 2, retryDelay: 1 })
      expect(resp.status).toBe(201)
    })

    it('exhausts retries and throws last error', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(textResponse('Bad Gateway', 502))
        .mockResolvedValueOnce(textResponse('Service Unavailable', 503))

      await expect(ApiClient.get('/products', true, { retries: 1, retryDelay: 1 }))
        .rejects.toMatchObject({ status: 503, type: 'server' })
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('does NOT retry 400 client errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Validation failed', 400))

      await expect(ApiClient.get('/products', true, { retries: 3, retryDelay: 1 }))
        .rejects.toMatchObject({ status: 400 })
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry 401 auth errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Unauthorized', 401))

      await expect(ApiClient.get('/products', true, { retries: 3, retryDelay: 1 }))
        .rejects.toMatchObject({ status: 401 })
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })

  // ── Rare Edge Cases ─────────────────────────────────────────

  describe('Rare Edge Cases', () => {
    it('retries=0 means single attempt, no retries', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Bad Gateway', 502))

      await expect(ApiClient.get('/products', true, { retries: 0 }))
        .rejects.toMatchObject({ status: 502 })
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('backoff delay caps at maxDelay (10s)', () => {
      // Access private method via prototype trick
      const delay = (ApiClient as any).calculateRetryDelay(10, {
        maxRetries: 10,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
      })
      expect(delay).toBe(10000)
    })

    it('FormData body removes Content-Type header', async () => {
      const formData = new FormData()
      formData.append('file', new Blob(['test']), 'test.txt')

      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))

      await ApiClient.request('/upload', { method: 'POST', body: formData, requireAuth: false })
      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['Content-Type']).toBeUndefined()
    })

    it('GET request does not attach body even if provided', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))

      await ApiClient.request('/products', { method: 'GET', body: { x: 1 } })
      expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBeUndefined()
    })

    it('logActivity swallows errors silently', async () => {
      // Return a 400 client error so it doesn't retry
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Bad Request', 400))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Should not throw
      await ApiClient.logActivity('TEST', 'test action')
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('getSettings returns tax settings', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ taxRate: 12 }))

      const data = await ApiClient.getSettings<{ taxRate: number }>('tax')
      expect(data.taxRate).toBe(12)
    })

    it('getSettings rethrows non-404 tax errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Server Error', 500))

      await expect(ApiClient.getSettings('tax')).rejects.toMatchObject({ status: 500 })
    })

    it('getSettings wraps 404 for tax as friendly error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(textResponse('Not Found', 404))

      await expect(ApiClient.getSettings('tax')).rejects.toThrow('Tax settings not configured')
    })

    it('unknown non-Error throw is classified as network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce('string error')

      await expect(ApiClient.get('/products', true, { retries: 0 }))
        .rejects.toMatchObject({ type: 'network', message: 'Unknown error occurred' })
    })

    it('custom headers are merged with defaults', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }))

      await ApiClient.request('/products', {
        headers: { 'X-Idempotency-Key': 'abc-123' },
      })
      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['X-Idempotency-Key']).toBe('abc-123')
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('server error with empty response text uses status code', async () => {
      const resp = new Response('', { status: 503 })
      vi.mocked(fetch).mockResolvedValueOnce(resp)

      await expect(ApiClient.get('/products', true, { retries: 0 }))
        .rejects.toMatchObject({ status: 503, type: 'server' })
    })
  })

  // ── Unauthenticated 401 fallthrough ────────────────────────────────────────

  describe('Unauthenticated 401 Fallthrough', () => {
    beforeEach(() => {
      vi.mocked(SessionManager.clearSession).mockClear()
    })

    it('requireAuth=false with 401 response returns response (does NOT clear session)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, message: 'Wrong credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const resp = await ApiClient.get('/auth/login', false)
      expect(resp.status).toBe(401)
      expect(SessionManager.clearSession).not.toHaveBeenCalled()
    })

    it('postJson with requireAuth=false and 401 parses JSON body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, message: 'Invalid PIN' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const result = await ApiClient.postJson<{ success: boolean; message: string }>(
        '/auth/login', { employeeId: 'E01', pin: 'wrong' }, false
      )
      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid PIN')
    })
  })

  // ── getJson non-ok response ─────────────────────────────────────────────────

  describe('getJson non-ok response', () => {
    it('getJson throws server error when response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Service Unavailable', { status: 503 })
      )

      await expect(ApiClient.getJson('/products', true, { retries: 0 }))
        .rejects.toMatchObject({ status: 503, type: 'server' })
    })

    it('getJson throws with correct status for 422', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unprocessable Entity', { status: 422 })
      )

      await expect(ApiClient.getJson('/products', true, { retries: 0 }))
        .rejects.toMatchObject({ status: 422 })
    })
  })

  // ── postJson error paths ───────────────────────────────────────────────────

  describe('postJson Error Paths', () => {
    it('postJson throws when response is not ok and not 401', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Internal Server Error', { status: 500 })
      )

      await expect(ApiClient.postJson('/sales', {}))
        .rejects.toMatchObject({ status: 500 })
    })

    it('postJson throws on 400 bad request', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Bad request body', { status: 400 })
      )

      await expect(ApiClient.postJson('/sales', { invalid: true }))
        .rejects.toMatchObject({ status: 400 })
    })
  })

  // ── putJson ────────────────────────────────────────────────────────────────

  describe('putJson', () => {
    it('putJson returns parsed JSON on success', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, name: 'Updated' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const result = await ApiClient.putJson<{ id: number; name: string }>('/products/1', { name: 'Updated' })
      expect(result.id).toBe(1)
      expect(result.name).toBe('Updated')
    })

    it('putJson throws when response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Conflict', { status: 409 })
      )

      await expect(ApiClient.putJson('/products/1', { name: 'x' }))
        .rejects.toMatchObject({ status: 409 })
    })

    it('putJson throws on 422', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Validation failed', { status: 422 })
      )

      await expect(ApiClient.putJson('/products/1', {}))
        .rejects.toMatchObject({ status: 422 })
    })
  })

  // ── uploadFile ─────────────────────────────────────────────────────────────

  describe('uploadFile', () => {
    it('uploadFile sends multipart POST request', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ uploaded: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const file = new File(['backup data'], 'backup.sql', { type: 'application/octet-stream' })
      const resp = await ApiClient.uploadFile('/AdminSettings/backup/restore', file)
      expect(resp.status).toBe(200)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[1]?.method).toBe('POST')
      expect(call[1]?.body).toBeInstanceOf(FormData)
    })

    it('uploadFile uses custom field name when provided', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const file = new File(['data'], 'file.csv', { type: 'text/csv' })
      await ApiClient.uploadFile('/import', file, undefined, 'csvFile')

      const formData = vi.mocked(fetch).mock.calls[0][1]?.body as FormData
      expect(formData.get('csvFile')).toBeTruthy()
    })

    it('uploadFile includes additionalData in FormData', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const file = new File(['data'], 'file.sql', { type: 'text/plain' })
      await ApiClient.uploadFile('/upload', file, { connectionString: 'postgres://...' })

      const formData = vi.mocked(fetch).mock.calls[0][1]?.body as FormData
      expect(formData.get('connectionString')).toBe('postgres://...')
    })

    it('uploadFile attaches auth headers when session is valid', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      vi.mocked(SessionManager.isSessionValid).mockReturnValue(true)
      const file = new File(['data'], 'file.sql')
      await ApiClient.uploadFile('/upload', file)

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer test-jwt-token')
    })

    it('uploadFile does not attach auth headers when session invalid', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      vi.mocked(SessionManager.isSessionValid).mockReturnValue(false)
      const file = new File(['data'], 'file.sql')
      await ApiClient.uploadFile('/upload', file)

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBeUndefined()
    })
  })

  // ── Non-Error throws (line 220 in request) ────────────────────────────────

  describe('Non-Error object throw from fetch', () => {
    it('non-fetch Error (no .message.includes fetch) is classified as network', async () => {
      // An Error object that is not an AbortError and whose message doesn't include 'fetch'
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection reset by peer'))

      await expect(ApiClient.get('/products', true, { retries: 0 }))
        .rejects.toMatchObject({ type: 'network' })
    })
  })
})
