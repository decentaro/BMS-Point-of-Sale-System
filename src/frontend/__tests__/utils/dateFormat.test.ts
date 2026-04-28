import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

vi.mock('@/utils/SessionManager', () => ({
  default: {
    isSessionValid: vi.fn(() => true),
    getUserHeaders: vi.fn(() => ({})),
    clearSession: vi.fn(),
  },
}))

vi.mock('@/utils/ApiClient', () => ({
  default: {
    getSettings: vi.fn(() => Promise.resolve({ dateFormat: 'MM/DD/YYYY' })),
    online: true,
    setOnline: vi.fn(),
  },
}))

import {
  formatDate,
  formatDateTime,
  formatDateForFile,
  formatTime,
  formatDateSync,
  clearDateFormatCache,
} from '@/utils/dateFormat'
import ApiClient from '@/utils/ApiClient'

describe('dateFormat utilities', () => {
  beforeEach(() => {
    clearDateFormatCache()
    vi.mocked(ApiClient.getSettings).mockReset()
    vi.mocked(ApiClient.getSettings).mockResolvedValue({ dateFormat: 'MM/DD/YYYY' })
  })

  // ── formatDateForFile (sync, always YYYY-MM-DD) ─────────────

  describe('formatDateForFile', () => {
    it('formats Date object as YYYY-MM-DD', () => {
      expect(formatDateForFile(new Date(2026, 3, 12))).toBe('2026-04-12')
    })

    it('formats string date', () => {
      expect(formatDateForFile('2026-01-05T10:00:00Z')).toMatch(/2026-01-0[45]/)
    })

    it('returns invalid-date for bad input', () => {
      expect(formatDateForFile('garbage')).toBe('invalid-date')
    })

    it('pads single-digit month and day', () => {
      expect(formatDateForFile(new Date(2026, 0, 5))).toBe('2026-01-05')
    })
  })

  // ── formatTime (sync) ──────────────────────────────────────

  describe('formatTime', () => {
    it('formats time in 12-hour format', () => {
      const result = formatTime(new Date(2026, 3, 12, 14, 30))
      expect(result).toMatch(/2:30\s*PM/i)
    })

    it('formats midnight', () => {
      const result = formatTime(new Date(2026, 3, 12, 0, 0))
      expect(result).toMatch(/12:00\s*AM/i)
    })

    it('returns Invalid Time for bad input', () => {
      expect(formatTime('garbage')).toBe('Invalid Time')
    })

    it('accepts string dates', () => {
      const result = formatTime('2026-04-12T09:15:00')
      expect(result).toMatch(/9:15\s*AM/i)
    })
  })

  // ── formatDateSync ─────────────────────────────────────────

  describe('formatDateSync', () => {
    it('defaults to MM/DD/YYYY', () => {
      const result = formatDateSync(new Date(2026, 3, 12))
      expect(result).toBe('04/12/2026')
    })

    it('supports DD/MM/YYYY fallback', () => {
      const result = formatDateSync(new Date(2026, 3, 12), 'DD/MM/YYYY')
      expect(result).toBe('12/04/2026')
    })

    it('supports YYYY-MM-DD fallback', () => {
      const result = formatDateSync(new Date(2026, 3, 12), 'YYYY-MM-DD')
      expect(result).toBe('2026-04-12')
    })

    it('returns Invalid Date for bad input', () => {
      expect(formatDateSync('not-a-date')).toBe('Invalid Date')
    })
  })

  // ── formatDate (async) ─────────────────────────────────────

  describe('formatDate', () => {
    it('fetches format from settings and formats accordingly', async () => {
      vi.mocked(ApiClient.getSettings).mockResolvedValueOnce({ dateFormat: 'YYYY-MM-DD' })
      const result = await formatDate(new Date(2026, 3, 12))
      expect(result).toBe('2026-04-12')
    })

    it('falls back to MM/DD/YYYY on API error', async () => {
      vi.mocked(ApiClient.getSettings).mockRejectedValueOnce(new Error('offline'))
      const result = await formatDate(new Date(2026, 3, 12))
      expect(result).toBe('04/12/2026')
    })

    it('returns Invalid Date for bad input', async () => {
      expect(await formatDate('garbage')).toBe('Invalid Date')
    })

    it('caches format for subsequent calls', async () => {
      vi.mocked(ApiClient.getSettings).mockResolvedValueOnce({ dateFormat: 'DD/MM/YYYY' })

      await formatDate(new Date(2026, 0, 1))
      const result = await formatDate(new Date(2026, 3, 12))

      expect(result).toBe('12/04/2026')
      // Only one API call despite two formatDate calls
      expect(ApiClient.getSettings).toHaveBeenCalledTimes(1)
    })
  })

  // ── formatDateTime (async) ─────────────────────────────────

  describe('formatDateTime', () => {
    it('combines date and time', async () => {
      vi.mocked(ApiClient.getSettings).mockResolvedValueOnce({ dateFormat: 'MM/DD/YYYY' })
      const result = await formatDateTime(new Date(2026, 3, 12, 14, 30))
      expect(result).toMatch(/04\/12\/2026, 2:30\s*PM/i)
    })

    it('returns Invalid Date for bad input', async () => {
      expect(await formatDateTime('garbage')).toBe('Invalid Date')
    })
  })

  // ── clearDateFormatCache ───────────────────────────────────

  describe('clearDateFormatCache', () => {
    it('forces re-fetch on next call', async () => {
      vi.mocked(ApiClient.getSettings).mockResolvedValueOnce({ dateFormat: 'DD/MM/YYYY' })
      await formatDate(new Date())

      clearDateFormatCache()

      vi.mocked(ApiClient.getSettings).mockResolvedValueOnce({ dateFormat: 'YYYY-MM-DD' })
      const result = await formatDate(new Date(2026, 3, 12))
      expect(result).toBe('2026-04-12')
      expect(ApiClient.getSettings).toHaveBeenCalledTimes(2)
    })
  })
})
