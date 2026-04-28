/**
 * rbac.spec.ts
 * E2E: Role-Based Access Control — frontend routing enforcement
 *
 * Verifies that SessionGuard redirects unauthorised roles away from
 * protected routes instead of rendering the page.
 *
 * Routes under test:
 *   requiredRole="Manager"  → /manager, /employees, /reports, /tax-settings,
 *                             /system-settings, /user-activity
 *   requiredRole="Inventory"→ /inventory-dashboard
 *   (no restriction)        → /pos, /sales-history, /returns
 *
 * When a Cashier navigates to a Manager-only route, SessionGuard redirects
 * to getDashboardRoute() = '/cashier-dashboard'.
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login } from './helpers'
import { E2E_CASHIER_ID, E2E_CASHIER_PIN } from './helpers'

/** Log in as the E2E Cashier and navigate to a given hash route. */
async function loginAsCashierAndGoto(page: any, route: string) {
  await gotoLogin(page)
  await login(page, E2E_CASHIER_ID, E2E_CASHIER_PIN)
  await page.goto(`/#${route}`)
  // Give SessionGuard time to check the session and redirect if needed
  await page.waitForTimeout(1500)
}

test.describe('RBAC — Manager-only routes redirect Cashier', () => {
  const managerOnlyRoutes = [
    '/manager',
    '/employees',
    '/reports',
    '/tax-settings',
    '/system-settings',
    '/user-activity',
  ]

  for (const route of managerOnlyRoutes) {
    test(`Cashier cannot access ${route}`, async ({ page }) => {
      await loginAsCashierAndGoto(page, route)

      // SessionGuard redirects to /cashier-dashboard — the Cashier's home
      await expect(page).not.toHaveURL(new RegExp(route.replace('/', '\\/')))
    })
  }
})

test.describe('RBAC — Routes accessible to Cashier', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page, E2E_CASHIER_ID, E2E_CASHIER_PIN)
  })

  test('Cashier can reach the POS', async ({ page }) => {
    await page.goto('/#/pos')
    await expect(page.getByText('Point of Sale').or(page.locator('[data-testid="pos-container"]')).first())
      .toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/pos/)
  })

  test('Cashier is redirected to /cashier-dashboard after login', async ({ page }) => {
    // Dashboard.tsx reads the role and navigates to the role-specific dashboard
    await expect(page).toHaveURL(/\/(cashier-dashboard|pos)/, { timeout: 8_000 })
  })

  test('Cashier can access Sales History', async ({ page }) => {
    await page.goto('/#/sales-history')
    await expect(page.getByText('Sales History')).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/sales-history/)
  })

  test('Cashier can access Returns', async ({ page }) => {
    await page.goto('/#/returns')
    // Returns page loads (or shows "Returns System Disabled" if turned off)
    await expect(
      page.getByText('Returns & Refunds').or(page.getByText('Returns System Disabled'))
    ).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/returns/)
  })
})

test.describe('RBAC — Manager can access all routes', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page) // logs in as Manager (E2E_EMPLOYEE_ID)
  })

  test('Manager can reach /manager', async ({ page }) => {
    await page.goto('/#/manager')
    await expect(page.getByText(/Manager|Management/i).first()).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/manager/)
  })

  test('Manager can reach /employees', async ({ page }) => {
    await page.goto('/#/employees')
    // Use .first() — the heading and a sub-button both contain "Employees"
    await expect(page.getByText('Employees').first()).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/employees/)
  })

  test('Manager can reach /reports', async ({ page }) => {
    await page.goto('/#/reports')
    // Use the banner heading specifically — the tab button also matches "Sales Reports"
    await expect(page.getByRole('banner').getByText('Sales Reports')).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/reports/)
  })
})
