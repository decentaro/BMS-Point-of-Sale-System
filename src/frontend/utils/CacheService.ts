import SessionManager from './SessionManager'

const PREFIX = 'bms_cache:'

/**
 * Pre-warm lists are tiered to the API's RBAC gates — calling a manager-only
 * endpoint with a cashier token would 403, which is harmless (swallowed below)
 * but spams logs and burns rate-limit budget. Keep each tier in sync with the
 * [Authorize(Roles = "...")] attributes on the matching controllers.
 */
const COMMON_WARM = [
  '/employees',
  '/employees?includeInactive=true',
  '/products',
  '/products/low-stock',
  '/products/expiring?days=365',
  '/returns',
  '/sales',
  '/system-settings',
  '/tax-settings',
]

// Accessible to Manager OR Inventory role
const INVENTORY_WARM = [
  '/stockadjustments',
  '/stockadjustments/pending-approval',
]

// Manager-only — reports dashboards and admin panel
const MANAGER_WARM = [
  '/sales/today',
  '/sales/this-week',
  '/sales/this-month',
  '/sales/employee-performance?period=month',
  '/sales/payment-breakdown?period=month',
  '/sales/tax-summary?period=month',
  '/AdminSettings',
  '/AdminSettings/backup/capabilities',
  '/AdminSettings/logs/folder',
  '/AdminSettings/logs/latest',
]

function getWarmEndpointsForSession(): string[] {
  const session = SessionManager.getCurrentSession()
  if (!session) return []
  const roles = (session.role || '').split(',').map(r => r.trim())
  const isManager = roles.includes('Manager')
  const hasInventory = isManager || roles.includes('Inventory')
  return [
    ...COMMON_WARM,
    ...(hasInventory ? INVENTORY_WARM : []),
    ...(isManager ? MANAGER_WARM : []),
  ]
}

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

    const endpoints = getWarmEndpointsForSession()
    await Promise.allSettled(
      endpoints.map(ep =>
        ApiClient.getJson(ep)
          .then(data => CacheService.set(ep, data))
          .catch(() => {})
      )
    )
  }
}

export default CacheService
