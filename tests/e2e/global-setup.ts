/**
 * global-setup.ts
 * Runs once before all E2E tests.
 *
 * Verifies the API is reachable and seeds the E2E test employee + product
 * via the API so tests are self-contained.
 */

import { request } from '@playwright/test'
import { Client } from 'pg'

const API_ORIGIN = process.env.E2E_API_ORIGIN ?? 'http://localhost:5002'

// Credentials used by every E2E test — seeded below if absent
export const E2E_EMPLOYEE_ID = '2001'
export const E2E_PIN = '1234'
export const E2E_PRODUCT_BARCODE = 'E2EPROD1'

// Cashier employee — seeded in global-setup, used by RBAC tests
export const E2E_CASHIER_ID = '3001'
export const E2E_CASHIER_PIN = '4321'

// Inventory employee — seeded in global-setup, used by /inventory-dashboard tests
export const E2E_INVENTORY_ID = '3002'
export const E2E_INVENTORY_PIN = '8765'

async function setup() {
  // Use the bare origin as baseURL so that absolute paths like /health/live
  // and /api/auth/login resolve correctly via the URL() constructor.
  const ctx = await request.newContext({ baseURL: API_ORIGIN })

  // ── 1. Verify API is up ───────────────────────────────────────────────────
  let healthy = false
  for (let i = 0; i < 10; i++) {
    try {
      const res = await ctx.get('/health/live')
      if (res.ok()) { healthy = true; break }
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  if (!healthy) throw new Error(`E2E setup: API not reachable at ${API_ORIGIN}`)

  // ── 2. Clear any lockout on E2E employees before attempting login ─────────
  //    The wrong-PIN auth test and repeated runs can accumulate failed attempts.
  //    Reset them directly so global-setup is never blocked by lockout.
  try {
    const db = new Client({
      user:     process.env.BMS_DB_USER,
      password: process.env.BMS_DB_PASSWORD,
      host:     process.env.BMS_DB_SERVER,
      port:     parseInt(process.env.BMS_DB_PORT ?? '5432'),
      database: process.env.BMS_DB_NAME,
      ssl:      { rejectUnauthorized: false },
    })
    await db.connect()
    await db.query(
      `UPDATE employees
          SET failed_login_attempts = 0, locked_until = NULL
        WHERE employee_id = ANY($1)`,
      [[E2E_EMPLOYEE_ID, E2E_CASHIER_ID, E2E_INVENTORY_ID]]
    )
    await db.end()
  } catch (err) {
    // Non-fatal — warn but proceed; the login below will expose any real lock.
    console.warn('[E2E setup] Could not reset employee lockout (non-fatal):', err)
  }

  // ── 3. Seed test employee (idempotent via upsert in the API) ─────────────
  //    We bootstrap with a known plaintext PIN (integration test pattern).
  //    If the employee already exists the PUT below is a no-op for these fields.
  const loginRes = await ctx.post('/api/auth/login', {
    data: { employeeId: E2E_EMPLOYEE_ID, pin: E2E_PIN },
  })

  const loginStatus = loginRes.status()
  const loginText = await loginRes.text()

  if (!loginRes.ok()) {
    throw new Error(
      `E2E setup: Could not log in as ${E2E_EMPLOYEE_ID}.\n` +
      `Seed the employee first: npm run test:e2e:seed\n` +
      `HTTP ${loginStatus}: ${loginText}`
    )
  }

  const body = JSON.parse(loginText)
  // API wraps the response: { success, data: { token, employee } }
  const token: string = body?.data?.token ?? body?.token

  // ── 4. Ensure test product exists ─────────────────────────────────────────
  const productsRes = await ctx.get('/api/products', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const productsBody = productsRes.ok() ? await productsRes.json() : { data: [] }
  // API may return { data: [...] } or [...] directly
  const products: any[] = Array.isArray(productsBody) ? productsBody : (productsBody?.data ?? [])
  const exists = products.some((p: any) => p.barcode === E2E_PRODUCT_BARCODE)

  if (!exists) {
    await ctx.post('/api/products', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        barcode: E2E_PRODUCT_BARCODE,
        name: 'E2E Test Product',
        price: 9.99,
        cost: 5.00,
        stockQuantity: 500,
        minStockLevel: 5,
        unit: 'pcs',
        isActive: true,
      },
    })
  }

  // ── 5. Ensure Cashier test employee exists (used by RBAC tests) ───────────
  //    Seeded via the API so the PIN is properly BCrypt-hashed.
  const cashierLoginRes = await ctx.post('/api/auth/login', {
    data: { employeeId: E2E_CASHIER_ID, pin: E2E_CASHIER_PIN },
  })
  if (!cashierLoginRes.ok()) {
    // Doesn't exist yet — create via the Manager token
    const createRes = await ctx.post('/api/employees', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        employeeId: E2E_CASHIER_ID,
        pin: E2E_CASHIER_PIN,
        name: 'E2E Cashier',
        role: 'Cashier',
        isManager: false,
        isActive: true,
      },
    })
    if (!createRes.ok()) {
      const errText = await createRes.text()
      // "Employee ID already exists" is fine (created in a prior run, now inactive)
      if (!errText.includes('already exists')) {
        console.warn(`[E2E setup] Could not create Cashier employee: ${errText}`)
      }
    }
  }

  // ── 6. Ensure Inventory test employee exists (used by /inventory-dashboard tests) ──
  const inventoryLoginRes = await ctx.post('/api/auth/login', {
    data: { employeeId: E2E_INVENTORY_ID, pin: E2E_INVENTORY_PIN },
  })
  if (!inventoryLoginRes.ok()) {
    const createRes = await ctx.post('/api/employees', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        employeeId: E2E_INVENTORY_ID,
        pin: E2E_INVENTORY_PIN,
        name: 'E2E Inventory',
        role: 'Inventory',
        isManager: false,
        isActive: true,
      },
    })
    if (!createRes.ok()) {
      const errText = await createRes.text()
      if (!errText.includes('already exists')) {
        console.warn(`[E2E setup] Could not create Inventory employee: ${errText}`)
      }
    }
  }

  await ctx.dispose()
  console.log('[E2E setup] API healthy, seed data verified.')
}

export default setup
