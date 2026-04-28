/**
 * Shared helpers for E2E tests.
 */
import { Page, APIRequestContext } from '@playwright/test'
import { E2E_EMPLOYEE_ID, E2E_PIN, E2E_PRODUCT_BARCODE, E2E_CASHIER_ID, E2E_CASHIER_PIN } from './global-setup'

// Re-export seed constants so spec files only need to import from helpers
export { E2E_PRODUCT_BARCODE, E2E_CASHIER_ID, E2E_CASHIER_PIN, E2E_INVENTORY_ID, E2E_INVENTORY_PIN }

export const API_ORIGIN = process.env.E2E_API_ORIGIN ?? 'http://localhost:5002'

/**
 * Login via the API and return the Bearer token + numeric employee ID.
 * Used in beforeAll hooks that need to create seed data.
 */
export async function apiLogin(
  request: APIRequestContext
): Promise<{ token: string; employeeId: number }> {
  const res = await request.post(`${API_ORIGIN}/api/auth/login`, {
    data: { employeeId: E2E_EMPLOYEE_ID, pin: E2E_PIN },
  })
  const body = await res.json()
  return {
    token: body?.data?.token ?? body?.token,
    employeeId: body?.data?.employee?.id ?? body?.employee?.id,
  }
}

/**
 * Find the E2E test product's numeric ID via the API.
 */
export async function getE2EProductId(
  request: APIRequestContext,
  token: string
): Promise<number> {
  const res = await request.get(`${API_ORIGIN}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  const products: any[] = Array.isArray(body) ? body : (body?.data ?? [])
  const product = products.find((p: any) => p.barcode === E2E_PRODUCT_BARCODE)
  if (!product) throw new Error(`E2E product "${E2E_PRODUCT_BARCODE}" not found — run the seed script.`)
  return product.id as number
}

/**
 * Create a sale via the API and return its transactionId.
 * Used to create returnable seed data in the returns spec.
 */
export async function createSeedSale(
  request: APIRequestContext,
  token: string,
  employeeId: number,
  productId: number
): Promise<string> {
  const res = await request.post(`${API_ORIGIN}/api/sales`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Terminal-Id': 'E2E',
      'X-Idempotency-Key': `E2E-SEED-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    },
    data: {
      employeeId,
      subtotal: 9.99,
      taxRate: 0,
      taxAmount: 0,
      discountAmount: 0,
      total: 9.99,
      amountPaid: 10.00,
      change: 0.01,
      paymentMethod: 'Cash',
      items: [{ productId, quantity: 1, unitPrice: 9.99, lineTotal: 9.99 }],
    },
  })
  const body = await res.json()
  if (!body.transactionId) throw new Error(`Seed sale creation failed: ${JSON.stringify(body)}`)
  return body.transactionId as string
}

/** Navigate to the login page and inject the electronAPI stub. */
export async function gotoLogin(page: Page) {
  // Run before the app's JS — clear any leftover JWT and inject the electronAPI stub.
  // Clearing localStorage prevents a previous test's session from auto-redirecting
  // the app away from the login page before we can type credentials.
  await page.addInitScript(() => {
    try { localStorage.clear() } catch {}

    const _connectivityListeners: Array<(s: { online: boolean }) => void> = []

    ;(window as any).electronAPI = {
      // ── Hardware ────────────────────────────────────────────────────────────
      checkBarcodeScanner: async () => ({ active: false, description: 'No scanner (E2E)' }),
      checkPrinter:        async () => ({ connected: false, description: 'No printer (E2E)' }),
      checkDatabase:       async () => ({ connected: true,  latency: 0, description: 'E2E' }),
      openCashDrawer:      async () => ({ success: true }),
      getTerminalConfig:   async () => ({ terminalId: 'E2E', terminalName: 'E2E Terminal' }),
      setTerminalConfig:   async () => ({}),
      printReceipt:        async () => ({ success: true }),
      validateManagerPin:  async () => ({ success: true }),
      setAuthToken:        () => {},
      clearAuthToken:      () => {},

      // ── Connectivity (required for ConnectionContext) ────────────────────────
      getConnectivity: async () => ({ online: true }),
      onConnectivityChange: (cb: (s: { online: boolean }) => void) => {
        _connectivityListeners.push(cb)
        return () => {
          const i = _connectivityListeners.indexOf(cb)
          if (i !== -1) _connectivityListeners.splice(i, 1)
        }
      },
      // Test helper — call this from page.evaluate() to simulate going online/offline
      _setOnline: (online: boolean) => {
        _connectivityListeners.forEach(cb => cb({ online }))
      },

      // ── Offline queues (stubs — tests override as needed) ───────────────────
      getQueue:                   async () => [],
      getAdjustmentQueue:         async () => [],
      getReturnQueue:             async () => [],
      removeFromQueue:            async () => {},
      removeFromAdjustmentQueue:  async () => {},
      removeFromReturnQueue:      async () => {},
      queueTransaction:           async () => {},
      queueAdjustment:            async () => {},
      queueReturn:                async () => {},
      getFailedSales:             async () => [],
      getFailedAdjustments:       async () => [],
      getFailedReturns:           async () => [],
      clearFailedSales:           async () => {},
      clearFailedAdjustments:     async () => {},
      clearFailedReturns:         async () => {},
    }
  })
  await page.goto('/#/login')
  await page.waitForSelector('text=Sign In →')
}

/**
 * Type digits on the custom numpad.
 * The Login component shows a digit grid; we click each digit button by text.
 */
async function typeDigits(page: Page, value: string) {
  for (const ch of value) {
    await page.getByRole('button', { name: ch, exact: true }).first().click()
  }
}

/**
 * Log in via the numpad UI.
 * Clicks the Employee ID tab, types the ID, clicks PIN tab, types the PIN,
 * then clicks Sign In.
 */
export async function login(page: Page, employeeId = E2E_EMPLOYEE_ID, pin = E2E_PIN) {
  // Employee ID field is active by default — type the ID
  await typeDigits(page, employeeId)

  // Switch to PIN field
  await page.getByRole('button', { name: 'PIN' }).click()
  await typeDigits(page, pin)

  // Submit
  await page.getByRole('button', { name: /Sign In/ }).click()

  // Wait for navigation away from login.
  // Managers land on /manager, Cashiers on /cashier-dashboard.
  await page.waitForURL(/\/(dashboard|pos|manager|inventory-dashboard|cashier-dashboard)/, { timeout: 50_000 })
}
