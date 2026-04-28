/**
 * inventory.spec.ts
 * E2E: Inventory Management (stock adjustments)
 *
 * Covers:
 *  - Advanced Inventory page loads with correct heading
 *  - All three tabs are present
 *  - Create Stock Adjustment form renders
 *  - Can create an adjustment for the E2E product and see success
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login, E2E_PRODUCT_BARCODE } from './helpers'

test.describe('Inventory Management', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
    await page.goto('/#/inventory-management')
    await page.waitForSelector('text=Advanced Inventory', { timeout: 10_000 })
  })

  test('page loads with heading and tabs', async ({ page }) => {
    await expect(page.getByText('Advanced Inventory')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Stock Adjustments' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Expiring Products' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Physical Counting' })).toBeVisible()
  })

  test('Stock Adjustments tab shows create form', async ({ page }) => {
    // Stock Adjustments is the default tab
    await expect(page.getByText('Create Stock Adjustment')).toBeVisible()
    await expect(page.locator('input[placeholder*="name or barcode" i]')).toBeVisible()
  })

  test('can search for the E2E product', async ({ page }) => {
    const productSearch = page.locator('input[placeholder*="name or barcode" i]').first()
    await productSearch.fill(E2E_PRODUCT_BARCODE)
    // Product card or suggestion should appear
    await expect(page.getByText('E2E Test Product')).toBeVisible({ timeout: 8_000 })
  })

  test('can create a stock adjustment for the E2E product', async ({ page }) => {
    // Search for and select the product
    const productSearch = page.locator('input[placeholder*="name or barcode" i]').first()
    await productSearch.fill(E2E_PRODUCT_BARCODE)
    await page.getByText('E2E Test Product').first().click()

    // Select adjustment type (e.g. "Found / Discovered")
    const typeSelect = page.locator('select').first()
    await typeSelect.selectOption({ label: 'Found / Discovered' })

    // Enter quantity change
    const qtyInput = page.locator('input[placeholder*="positive or negative" i]').first()
    await qtyInput.fill('10')

    // Enter reason (required)
    const reasonInput = page.locator('input[placeholder*="explain" i], textarea[placeholder*="explain" i]').first()
    await reasonInput.fill('E2E test adjustment')

    // Submit
    await page.getByRole('button', { name: 'Create Adjustment' }).click()

    // Success toast
    await expect(
      page.getByText(/adjustment created|Stock adjustment created/i)
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Expiring Products tab loads', async ({ page }) => {
    await page.getByRole('button', { name: 'Expiring Products' }).click()
    await expect(page.getByText('Expiring Products')).toBeVisible({ timeout: 5_000 })
  })

  test('Pending Approvals section visible and can approve if any exist', async ({ page }) => {
    // Stay on Stock Adjustments tab — it shows "Pending Approvals"
    await expect(page.getByText('Pending Approvals')).toBeVisible({ timeout: 8_000 })

    // If there are pending adjustments waiting for approval, approve the first one
    const approveBtn = page.getByRole('button', { name: 'Approve' }).first()
    if (await approveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await approveBtn.click()
      await expect(
        page.getByText(/approved|adjustment approved/i)
      ).toBeVisible({ timeout: 10_000 })
    }
    // If no pending adjustments exist, the test passes — section is visible which is what matters
  })

  test('Physical Counting tab loads with start count UI', async ({ page }) => {
    await page.getByRole('button', { name: 'Physical Counting' }).click()
    // The tab header or section heading should be visible
    await expect(
      page.getByText(/Physical Count|Physical Counting|Start.*Count|Count Session/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test('Physical Counting tab shows start count button or active session', async ({ page }) => {
    await page.getByRole('button', { name: 'Physical Counting' }).click()
    await page.waitForTimeout(1_000)

    // Either "Start Count" button (no active session) or an active session indicator
    const startBtn = page.getByRole('button', { name: /Start.*Count|Begin.*Count/i })
    const activeSession = page.getByText(/Active.*Session|Count.*In Progress|ongoing/i)
    const either = startBtn.or(activeSession)
    await expect(either.first()).toBeVisible({ timeout: 8_000 })
  })
})
