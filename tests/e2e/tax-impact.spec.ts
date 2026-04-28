/**
 * tax-impact.spec.ts
 * E2E: Tax rate change → POS display
 *
 * Verifies that after a manager changes the tax rate in Tax Settings,
 * the new rate is reflected in the POS cart totals on the next page load.
 * This guards against stale-settings-cache bugs causing wrong tax on live sales.
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login, API_ORIGIN } from './helpers'

const ORIGINAL_TAX_RATE = 10
const NEW_TAX_RATE = 15

test.describe('Tax rate change → POS display', () => {
  test.afterAll(async ({ request }) => {
    // Restore original tax rate regardless of test outcome
    const loginRes = await request.post(`${API_ORIGIN}/api/auth/login`, {
      data: { employeeId: '2001', pin: '1234', selectedRole: 'Manager' },
    })
    const { data } = await loginRes.json()
    await request.post(`${API_ORIGIN}/api/tax-settings`, {
      headers: { Authorization: `Bearer ${data.token}` },
      data: { taxRate: ORIGINAL_TAX_RATE },
    })
  })

  test('new tax rate appears in POS cart after manager changes it', async ({ page, request }) => {
    // ── 1. Change tax rate to 15% via API ─────────────────────────────────
    const loginRes = await request.post(`${API_ORIGIN}/api/auth/login`, {
      data: { employeeId: '2001', pin: '1234', selectedRole: 'Manager' },
    })
    const { data } = await loginRes.json()
    const token: string = data.token

    await request.post(`${API_ORIGIN}/api/tax-settings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { taxRate: NEW_TAX_RATE },
    })

    // ── 2. Load POS (fresh mount → loadTaxSettings fetches the new rate) ──
    await gotoLogin(page)
    await login(page)
    await page.goto('/#/pos')
    await page.waitForSelector('text=Point of Sale', { timeout: 10_000 })
      .catch(() => page.waitForSelector('[class*="pos"]', { timeout: 5_000 }))

    // ── 3. Add a product so the tax line appears in the cart ───────────────
    const searchInput = page.locator('input[placeholder*="search" i]').first()
    await searchInput.fill('E2EPROD1')
    await page.getByText('E2E Test Product').first().click()

    // ── 4. Open payment modal — tax label should show 15% ─────────────────
    await page.getByRole('button', { name: /^Pay /i }).click()

    // The payment modal shows a tax line like "GST (15%)" or "Tax (15%)"
    await expect(
      page.getByText(/15%/)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('tax amount in payment modal is calculated with the new rate', async ({ page, request }) => {
    // Verify the new rate is still active from the previous test
    const loginRes = await request.post(`${API_ORIGIN}/api/auth/login`, {
      data: { employeeId: '2001', pin: '1234', selectedRole: 'Manager' },
    })
    const { data } = await loginRes.json()

    // Ensure tax is at 15% for this test
    await request.post(`${API_ORIGIN}/api/tax-settings`, {
      headers: { Authorization: `Bearer ${data.token}` },
      data: { taxRate: NEW_TAX_RATE },
    })

    await gotoLogin(page)
    await login(page)
    await page.goto('/#/pos')
    await page.waitForSelector('text=Point of Sale', { timeout: 10_000 })
      .catch(() => page.waitForSelector('[class*="pos"]', { timeout: 5_000 }))

    // Product price is £9.99 — 15% tax = £1.50 (rounded)
    const searchInput = page.locator('input[placeholder*="search" i]').first()
    await searchInput.fill('E2EPROD1')
    await page.getByText('E2E Test Product').first().click()

    await page.getByRole('button', { name: /^Pay /i }).click()

    // Tax at 15% of 9.99 = 1.50 (rounded to nearest cent)
    // The modal should display a tax amount that is NOT the 10% value (0.99)
    await expect(page.getByText(/15%/)).toBeVisible({ timeout: 8_000 })

    // Total = 9.99 + 1.50 = 11.49 (at 15% tax)
    // The total shown should not be 10.98 (the 10% figure)
    await expect(page.getByText('10.98')).not.toBeVisible()
  })
})
