/**
 * inventory-basic.spec.ts
 * E2E: Basic Inventory view (/inventory — Inventory.tsx)
 *
 * Covers:
 *  - Page loads and shows product table / list
 *  - Search input is visible
 *  - The E2E seed product appears in the list
 *  - Add product form renders
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login, E2E_PRODUCT_BARCODE } from './helpers'

test.describe('Basic Inventory', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
    await page.goto('/#/inventory')
    await page.waitForSelector('text=Inventory', { timeout: 10_000 })
  })

  test('page loads with Inventory heading', async ({ page }) => {
    await expect(page.getByText('Inventory').first()).toBeVisible()
  })

  test('search input is visible', async ({ page }) => {
    await expect(
      page.locator('input[placeholder*="Search" i], input[placeholder*="barcode" i], input[placeholder*="product" i]').first()
    ).toBeVisible()
  })

  test('E2E seed product appears in the product list', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search" i], input[placeholder*="barcode" i]').first()
    await searchInput.fill(E2E_PRODUCT_BARCODE)
    await expect(page.getByText('E2E Test Product')).toBeVisible({ timeout: 8_000 })
  })

  test('Add button opens the add-product form', async ({ page }) => {
    await page.getByRole('button', { name: /Add/i }).first().click()
    // Form should show a barcode or name field
    await expect(
      page.locator('input[placeholder*="barcode" i], input[placeholder*="name" i]').first()
    ).toBeVisible({ timeout: 5_000 })
  })
})
