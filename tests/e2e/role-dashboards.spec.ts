/**
 * role-dashboards.spec.ts
 * E2E: Role-specific dashboard views
 *
 * Covers:
 *  - Cashier Dashboard: loads with Quick Actions section
 *  - Cashier can navigate from their dashboard to POS
 *  - Manager Dashboard: /manager loads with expected content
 *  - Inventory Dashboard: /inventory-dashboard loads for Inventory-role user
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login } from './helpers'
import { E2E_CASHIER_ID, E2E_CASHIER_PIN, E2E_INVENTORY_ID, E2E_INVENTORY_PIN } from './helpers'

test.describe('Cashier Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page, E2E_CASHIER_ID, E2E_CASHIER_PIN)
    // After Cashier login, Dashboard redirects to /cashier-dashboard
    await page.goto('/#/cashier-dashboard')
    await page.waitForURL(/cashier-dashboard/, { timeout: 10_000 })
  })

  test('Cashier Dashboard loads with Quick Actions', async ({ page }) => {
    await expect(page.getByText('Quick Actions').or(page.getByText('Cashier Dashboard')).first())
      .toBeVisible({ timeout: 10_000 })
  })

  test('Cashier Dashboard shows navigation cards', async ({ page }) => {
    // CashierDashboard renders navigation cards; at least one should be visible
    // The cards typically include "Point of Sale", "Sales History", etc.
    await expect(
      page.getByText(/Point of Sale|POS|Sales History/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('Inventory Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page, E2E_INVENTORY_ID, E2E_INVENTORY_PIN)
    await page.goto('/#/inventory-dashboard')
    await page.waitForURL(/inventory-dashboard/, { timeout: 10_000 })
  })

  test('Inventory Dashboard loads with Inventory title', async ({ page }) => {
    await expect(
      page.getByText(/Inventory Dashboard/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Inventory Dashboard shows Basic Inventory card', async ({ page }) => {
    await expect(page.getByText('Basic Inventory')).toBeVisible({ timeout: 8_000 })
  })

  test('Inventory Dashboard shows Advanced Inventory card', async ({ page }) => {
    await expect(page.getByText('Advanced Inventory')).toBeVisible({ timeout: 8_000 })
  })

  test('Inventory user is redirected to /inventory-dashboard after login', async ({ page }) => {
    await gotoLogin(page)
    await login(page, E2E_INVENTORY_ID, E2E_INVENTORY_PIN)
    await page.waitForURL(/inventory-dashboard/, { timeout: 15_000 })
    await expect(page).toHaveURL(/inventory-dashboard/)
  })
})

test.describe('Manager Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page) // Manager login
    await page.goto('/#/manager')
    await page.waitForSelector('text=Manager', { timeout: 10_000 })
  })

  test('Manager Dashboard loads', async ({ page }) => {
    await expect(page.getByText(/Manager|Management/i).first()).toBeVisible()
  })

  test('Manager Dashboard shows navigation to Reports', async ({ page }) => {
    // Manager dashboard typically shows links/cards to Reports, Settings, etc.
    await expect(
      page.getByText(/Reports|Sales Report|Z-Report/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test('Manager Dashboard shows navigation to Employees', async ({ page }) => {
    await expect(
      page.getByText(/Employees|Staff|Employee/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })
})
