import SessionManager from './SessionManager'

const PREFIX = 'bms_cache:'

/**
 * All static GET endpoints pre-warmed on login and refreshed every 30 minutes.
 * Dynamic endpoints (barcode lookups, z-reports, etc.) are NOT pre-warmed but
 * are still cached automatically by ApiClient.getJson on first successful fetch.
 */
const WARM_ENDPOINTS = [
  '/employees',
  '/employees?includeInactive=true',
  '/products',
  '/products/low-stock',
  '/products/expiring?days=365',
  '/returns',
  '/sales',
  '/sales/today',
  '/sales/this-week',
  '/sales/this-month',
  '/sales/employee-performance?period=month',
  '/sales/payment-breakdown?period=month',
  '/sales/tax-summary?period=month',
  '/stockadjustments',
  '/stockadjustments/pending-approval',
  '/system-settings',
  '/tax-settings',
  '/AdminSettings',
  '/AdminSettings/backup/capabilities',
  '/AdminSettings/logs/folder',
  '/AdminSettings/logs/latest',
]

class CacheService {
  static get<T>(endpoint: string): T | null {
    try {
      const raw = localStorage.getItem(PREFIX + endpoint)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  static set(endpoint: string, data: any): void {
    try {
      localStorage.setItem(PREFIX + endpoint, JSON.stringify(data))
    } catch {
      // Ignore storage quota errors — cache is best-effort
    }
  }

  static clear(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX))
    keys.forEach(k => localStorage.removeItem(k))
  }

  /**
   * Pre-fetch all static endpoints in parallel and store in cache.
   * Silently ignores individual failures — partial cache is still useful.
   */
  static async warmAll(): Promise<void> {
    if (!SessionManager.isSessionValid()) return

    // Import lazily to avoid circular dependency
    const { default: ApiClient } = await import('./ApiClient')

    await Promise.allSettled(
      WARM_ENDPOINTS.map(ep =>
        ApiClient.getJson(ep)
          .then(data => CacheService.set(ep, data))
          .catch(() => {})
      )
    )
  }
}

export default CacheService
