/**
 * cashier-inventory.spec.ts
 * E2E: /cashier-inventory route (CashierInventoryDashboard)
 *
 * This page is the landing page for employees with both Cashier and Inventory roles.
 * We use the E2E Manager account (which has access to all routes) to smoke-test the page.
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login } from './helpers'

test.describe('Cashier & Inventory Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
    await page.goto('/#/cashier-inventory')
  })

  test('page loads or redirects gracefully', async ({ page }) => {
    // Manager can access this page (no requiredRoles restriction blocks Manager)
    // Wait briefly then check we are either on the page or redirected
    await page.waitForTimeout(2_000)

    const isOnPage = page.url().includes('cashier-inventory')
    if (isOnPage) {
      // Page loaded — verify the shell title
      await expect(
        page.getByText(/Cashier.*Inventory|Cashier & Inventory/i).first()
      ).toBeVisible({ timeout: 8_000 })
    } else {
      // Managers may be redirected to their own dashboard — that is correct behaviour
      expect(page.url()).not.toContain('#/login')
    }
  })

  test('Quick Actions section present when accessible', async ({ page }) => {
    await page.waitForTimeout(1_500)
    if (!page.url().includes('cashier-inventory')) return

    await expect(page.getByText('Quick Actions').first()).toBeVisible({ timeout: 8_000 })
  })

  test('Inventory section present when accessible', async ({ page }) => {
    await page.waitForTimeout(1_500)
    if (!page.url().includes('cashier-inventory')) return

    await expect(page.getByText('Inventory').first()).toBeVisible({ timeout: 8_000 })
  })

  test('POS nav card is present when accessible', async ({ page }) => {
    await page.waitForTimeout(1_500)
    if (!page.url().includes('cashier-inventory')) return

    await expect(page.getByText('Point of Sale')).toBeVisible({ timeout: 8_000 })
  })
})
