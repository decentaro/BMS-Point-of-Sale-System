/**
 * cash-session.spec.ts
 * E2E: Cash session open / close lifecycle
 *
 * These tests exercise the session management UI embedded in the
 * Z-Report / Reconciliation tab.  Because a cash session is a daily
 * singleton, some tests are state-conditional:
 *
 *   - "No Session"  → Open Session flow is tested
 *   - "Open"        → Close Session flow is tested
 *   - "Closed"      → read-only state is verified
 *
 * The suite always starts by reading the current session state and then
 * exercises whichever paths are available.  Non-applicable paths are
 * skipped rather than failed.
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login } from './helpers'

/** Navigate to Reports and switch to the Z-Report / Reconciliation tab. */
async function gotoReconciliation(page: any) {
  await gotoLogin(page)
  await login(page)
  await page.goto('/#/reports')
  await page.getByRole('button', { name: 'Z-Report / Reconciliation' }).click()
  // Wait for the reconciliation card to appear
  await page.waitForSelector('text=Session Status', { timeout: 12_000 })
}

test.describe('Cash Session Lifecycle', () => {
  test('Reconciliation tab shows session status', async ({ page }) => {
    await gotoReconciliation(page)
    // There is always a session status badge (No Session / Open / Closed)
    await expect(
      page.getByText('No Session')
        .or(page.getByText('Open'))
        .or(page.getByText('Closed'))
        .first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test('opening a cash session (when no session exists today)', async ({ page }) => {
    await gotoReconciliation(page)

    // This test only runs when "Open Session" button is visible
    const openBtn = page.getByRole('button', { name: 'Open Session' })
    if (!(await openBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip()
      return
    }

    await openBtn.click()
    // Opening cash form appears
    await expect(page.getByText('Open New Session')).toBeVisible({ timeout: 5_000 })

    // Fill in opening cash amount
    const openingCashInput = page.locator('input[placeholder="0.00"]').first()
    await openingCashInput.fill('500.00')

    // Confirm
    await page.getByRole('button', { name: 'Confirm Open' }).click()

    // Toast: "Cash session opened"
    await expect(
      page.getByText(/Cash session opened|session opened|Session opened/i)
    ).toBeVisible({ timeout: 10_000 })
  })

  test('closing a cash session (when a session is open)', async ({ page }) => {
    await gotoReconciliation(page)

    // Check if the session is currently Open — two entry points to the close form
    const closeSessionBtn = page.getByRole('button', { name: 'Close Session' })
    const enterCashCountBtn = page.getByRole('button', { name: 'Enter Cash Count' })

    const canClose =
      (await closeSessionBtn.isVisible({ timeout: 3_000 }).catch(() => false)) ||
      (await enterCashCountBtn.isVisible({ timeout: 1_000 }).catch(() => false))

    if (!canClose) {
      test.skip()
      return
    }

    // Open the close form
    if (await closeSessionBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await closeSessionBtn.click()
    } else {
      await enterCashCountBtn.click()
    }

    await expect(page.getByText('Close Session')).toBeVisible({ timeout: 5_000 })

    // Fill actual cash count
    const closingCashInput = page.locator('input[placeholder="0.00"]').first()
    await closingCashInput.fill('500.00')

    // Confirm close
    await page.getByRole('button', { name: 'Confirm Close' }).click()

    // Toast: "Session closed successfully"
    await expect(
      page.getByText(/Session closed|closed successfully|session closed/i)
    ).toBeVisible({ timeout: 10_000 })
  })

  test('closed session shows expected closing cash and variance', async ({ page }) => {
    await gotoReconciliation(page)

    // Read whichever status is shown; if Closed, check the Z-report summary
    const isClosed = await page.getByText('Closed').isVisible({ timeout: 4_000 }).catch(() => false)
    if (!isClosed) {
      test.skip()
      return
    }

    await expect(page.getByText('Expected Closing Cash')).toBeVisible({ timeout: 5_000 })
  })

  test('Export CSV button is available on the Z-report', async ({ page }) => {
    await gotoReconciliation(page)
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible({ timeout: 8_000 })
  })
})
