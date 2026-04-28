/**
 * auth.spec.ts
 * E2E: Login / session flow
 *
 * Covers:
 *  - Successful login navigates away from /login
 *  - Invalid PIN shows error toast
 *  - Back button / Logout returns to login
 *  - mustChangePinOnNextLogin: PIN change screen appears and completes
 */

import { test, expect, request as playwrightRequest } from '@playwright/test'
import { gotoLogin, login, API_ORIGIN } from './helpers'

test.describe('Authentication', () => {

  test('logout button returns to login page', async ({ page }) => {
    await gotoLogin(page)
    await login(page)

    // Look for a logout / sign-out button or link (various labels used across dashboards)
    const logoutBtn = page
      .getByRole('button', { name: /Logout|Log out|Sign out/i })
      .or(page.getByRole('link', { name: /Logout|Log out|Sign out/i }))
      .first()

    // If the button is not immediately visible, try the top-right menu / hamburger
    if (!(await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      const menu = page.getByRole('button', { name: /menu|account|user/i }).first()
      if (await menu.isVisible({ timeout: 2_000 }).catch(() => false)) await menu.click()
    }

    await logoutBtn.click()

    // Should redirect back to login
    await page.waitForURL(/login/, { timeout: 10_000 })
    await expect(page.getByRole('button', { name: /Sign In/ })).toBeVisible()
  })

  test('login page shows Sign In button', async ({ page }) => {
    await gotoLogin(page)
    await expect(page.getByRole('button', { name: /Sign In/ })).toBeVisible()
  })

  test('wrong PIN shows error message', async ({ page }) => {
    await gotoLogin(page)

    // Use a non-existent employee ID so we don't accumulate failed attempts
    // on the real E2E account (which would trigger lockout across test runs)
    for (const ch of '9999') {
      await page.getByRole('button', { name: ch, exact: true }).first().click()
    }

    // Switch to PIN and type a wrong PIN
    await page.getByRole('button', { name: 'PIN' }).click()
    for (const ch of '0000') {
      await page.getByRole('button', { name: ch, exact: true }).first().click()
    }

    await page.getByRole('button', { name: /Sign In/ }).click()

    // Error toast should appear (Login component shows "Invalid Employee ID or PIN")
    await expect(page.getByText(/Invalid Employee ID or PIN|Login failed/i)).toBeVisible({ timeout: 5000 })
  })

  test('successful login navigates to dashboard or POS', async ({ page }) => {
    await gotoLogin(page)
    await login(page)

    // Should land somewhere other than login
    await expect(page).not.toHaveURL(/login/)
  })

  test('CLR button clears the entered digits', async ({ page }) => {
    await gotoLogin(page)

    // Enter some digits
    await page.getByRole('button', { name: '1', exact: true }).first().click()
    await page.getByRole('button', { name: '2', exact: true }).first().click()

    // Clear
    await page.getByRole('button', { name: 'CLR' }).click()

    // The display should be back to blank/dash
    await expect(page.locator('text=—').or(page.locator('text=Enter ID'))).toBeVisible()
  })
})

test.describe('PIN change on first login', () => {
  // Seed a temporary employee with mustChangePinOnNextLogin via the API before each test,
  // then clean up after. We use a unique ID per test to avoid cross-test contamination.
  const TEMP_EMPLOYEE_ID = '9901'
  const TEMP_EMPLOYEE_PIN = '1111'
  const NEW_PIN = '5678'

  test.beforeEach(async ({ request }) => {
    // Log in as manager to get a token
    const loginRes = await request.post(`${API_ORIGIN}/api/auth/login`, {
      data: { employeeId: '2001', pin: '1234', selectedRole: 'Manager' },
    })
    const loginBody = await loginRes.json()
    const token: string = loginBody?.data?.token ?? loginBody?.token

    // Delete the temp employee if it already exists (idempotent cleanup from prior run)
    const listRes = await request.get(`${API_ORIGIN}/api/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const listBody = await listRes.json()
    const employees: any[] = Array.isArray(listBody) ? listBody : (listBody?.data ?? [])
    const existing = employees.find((e: any) => e.employeeId === TEMP_EMPLOYEE_ID)
    if (existing) {
      await request.put(`${API_ORIGIN}/api/employees/${existing.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { ...existing, isActive: false },
      })
    }

    // Create the temp employee with mustChangePinOnNextLogin: true
    await request.post(`${API_ORIGIN}/api/employees`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        employeeId: TEMP_EMPLOYEE_ID,
        pin: TEMP_EMPLOYEE_PIN,
        name: 'E2E PIN Change Employee',
        role: 'Cashier',
        isManager: false,
        isActive: true,
        mustChangePinOnNextLogin: true,
      },
    })
  })

  test('shows PIN change screen when mustChangePinOnNextLogin is true', async ({ page }) => {
    await gotoLogin(page)

    // Log in as the temp employee
    for (const ch of TEMP_EMPLOYEE_ID) {
      await page.getByRole('button', { name: ch, exact: true }).first().click()
    }
    await page.getByRole('button', { name: 'PIN' }).click()
    for (const ch of TEMP_EMPLOYEE_PIN) {
      await page.getByRole('button', { name: ch, exact: true }).first().click()
    }
    await page.getByRole('button', { name: /Sign In/ }).click()

    // The PIN change screen should appear instead of navigating to dashboard
    await expect(page.getByText(/Set a New PIN|Change.*PIN|must be changed/i)).toBeVisible({ timeout: 10_000 })
    // Should NOT have navigated away from login
    await expect(page).not.toHaveURL(/\/(manager|cashier-dashboard|pos|inventory-dashboard)/)
  })

  test('completing PIN change navigates to dashboard', async ({ page }) => {
    await gotoLogin(page)

    // Log in as the temp employee
    for (const ch of TEMP_EMPLOYEE_ID) {
      await page.getByRole('button', { name: ch, exact: true }).first().click()
    }
    await page.getByRole('button', { name: 'PIN' }).click()
    for (const ch of TEMP_EMPLOYEE_PIN) {
      await page.getByRole('button', { name: ch, exact: true }).first().click()
    }
    await page.getByRole('button', { name: /Sign In/ }).click()

    // Wait for PIN change screen
    await expect(page.getByText(/Set a New PIN|must be changed/i)).toBeVisible({ timeout: 10_000 })

    // Enter new PIN (first step)
    for (const ch of NEW_PIN) {
      await page.getByRole('button', { name: ch, exact: true }).first().click()
    }
    await page.getByRole('button', { name: /Next|→/i }).click()

    // Confirm PIN (second step)
    await expect(page.getByText(/Confirm new PIN/i)).toBeVisible({ timeout: 5_000 })
    for (const ch of NEW_PIN) {
      await page.getByRole('button', { name: ch, exact: true }).first().click()
    }
    await page.getByRole('button', { name: /Set PIN/i }).click()

    // Should navigate away from login to a dashboard
    await page.waitForURL(
      /\/(manager|cashier-dashboard|pos|inventory-dashboard|cashier-inventory)/,
      { timeout: 15_000 }
    )
  })
})
