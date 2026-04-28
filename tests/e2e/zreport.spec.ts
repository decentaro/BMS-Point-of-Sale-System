/**
 * zreport.spec.ts
 * E2E: Z-report / cash session golden path
 *
 * Covers:
 *  - Manager can open a cash session
 *  - Manager can view Reports page
 *  - Z-report page loads and shows date controls
 *  - Z-report auto-loads and shows summary sections
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login } from './helpers'

test.describe('Z-Report / Cash Session', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
  })

  test('Reports page is accessible to Manager', async ({ page }) => {
    await page.goto('/#/reports')
    // The Reports header always shows "Sales Reports"
    await expect(page.getByRole('banner').getByText('Sales Reports')).toBeVisible({ timeout: 8_000 })
  })

  test('Z-report section shows date selector', async ({ page }) => {
    await page.goto('/#/reports')
    // Switch to the Z-Report / Reconciliation tab
    await page.getByRole('button', { name: 'Z-Report / Reconciliation' }).click()
    // Date controls: "Single Day" and "Date Range" toggle buttons
    await expect(page.getByRole('button', { name: 'Single Day' })).toBeVisible({ timeout: 8_000 })
    // A date input should also be present
    await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 5_000 })
  })

  test('generating a Z-report returns summary data', async ({ page }) => {
    await page.goto('/#/reports')
    // Switch to the Z-Report / Reconciliation tab (auto-loads today's report)
    await page.getByRole('button', { name: 'Z-Report / Reconciliation' }).click()

    // The reconciliation component auto-fetches today's Z-report.
    // The "Sales Summary" section always renders once the report loads.
    await expect(page.getByText('Sales Summary')).toBeVisible({ timeout: 25_000 })
  })

  test('Manager panel is accessible', async ({ page }) => {
    await page.goto('/#/manager')
    await expect(page.getByText(/Manager|Management/i).first()).toBeVisible({ timeout: 8_000 })
  })
})
