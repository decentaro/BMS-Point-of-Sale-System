/**
 * global-teardown.ts
 * Runs once after all E2E tests complete.
 *
 * Responsibilities:
 *  - Reset lockout state for E2E employees so the next test run starts clean.
 *    (The lockout reset in global-setup handles this too, but teardown ensures
 *     the DB is left in a clean state even if the next run starts immediately.)
 *  - Non-fatal: failures here do not fail the suite.
 */

import { Client } from 'pg'
import { E2E_EMPLOYEE_ID, E2E_CASHIER_ID, E2E_INVENTORY_ID } from './global-setup'

async function teardown() {
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

    // Reset lockout so the next test run's global-setup can always log in
    await db.query(
      `UPDATE employees
          SET failed_login_attempts = 0, locked_until = NULL
        WHERE employee_id = ANY($1)`,
      [[E2E_EMPLOYEE_ID, E2E_CASHIER_ID, E2E_INVENTORY_ID]]
    )

    await db.end()
    console.log('[E2E teardown] Lockout state reset for E2E employees.')
  } catch (err) {
    // Never fail the suite over teardown
    console.warn('[E2E teardown] Could not reset lockout (non-fatal):', err)
  }
}

export default teardown
