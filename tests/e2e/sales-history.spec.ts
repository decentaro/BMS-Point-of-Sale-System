/**
 * sales-history.spec.ts
 * E2E: Sales History view
 *
 * Covers:
 *  - Page loads with correct heading and KPI cards
 *  - Time-period filter buttons are present
 *  - Table column headers are visible
 *  - Search input is present
 *  - At least one completed sale appears (from the sale spec seed data)
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login } from './helpers'

test.describe('Sales History', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
    await page.goto('/#/sales-history')
    await page.waitForSelector('text=Sales History', { timeout: 10_000 })
  })

  test('page loads with heading and KPI cards', async ({ page }) => {
    await expect(page.getByText('Sales History')).toBeVisible()
    await expect(page.getByText('Total Revenue')).toBeVisible()
    await expect(page.getByText('Transactions')).toBeVisible()
  })

  test('time-period filter is present', async ({ page }) => {
    // SalesHistory uses a <select> for time-period filtering (not buttons)
    const filterSelect = page.locator('select').first()
    await expect(filterSelect).toBeVisible()
    // Verify the expected options exist
    await expect(page.locator('select option[value="today"]')).toHaveCount(1)
    await expect(page.locator('select option[value="all"]')).toHaveCount(1)
  })

  test('table column headers are rendered', async ({ page }) => {
    // Use role=columnheader to avoid strict-mode conflict with the 'Transactions' KPI card
    await expect(page.getByRole('columnheader', { name: 'Transaction' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Cashier' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Payment' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Total' })).toBeVisible()
  })

  test('search input accepts text', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Transaction ID" i]').first()
    await expect(searchInput).toBeVisible()
    await searchInput.fill('TXN-')
    await expect(searchInput).toHaveValue('TXN-')
  })

  test('switching to All time shows at least one sale', async ({ page }) => {
    await page.locator('select').first().selectOption('all')
    // The E2E sale test creates at least one sale — it should appear in "All time"
    await expect(page.getByText('Completed').first()).toBeVisible({ timeout: 10_000 })
  })

  test('Reprint button triggers receipt print', async ({ page }) => {
    // Switch to All time to ensure there's at least one sale
    await page.locator('select').first().selectOption('all')
    await expect(page.getByText('Completed').first()).toBeVisible({ timeout: 10_000 })

    // Click the first Reprint button in the table
    await page.getByRole('button', { name: 'Reprint' }).first().click()

    // A "Reprint Warning" modal may appear if the sale has returns — dismiss it
    const warningModal = page.getByText('Reprint Warning')
    if (await warningModal.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.getByRole('button', { name: 'Reprint Anyway' }).click()
    }

    // Success toast or silent success (printReceipt stub returns { success: true })
    // The component shows a toast on success: "Receipt reprinted successfully."
    await expect(
      page.getByText(/reprinted successfully|Receipt reprinted/i)
    ).toBeVisible({ timeout: 10_000 })
  })
})
