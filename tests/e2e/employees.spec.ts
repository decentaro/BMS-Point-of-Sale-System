/**
 * employees.spec.ts
 * E2E: Employee management
 *
 * Covers:
 *  - Employees page loads with heading and list
 *  - E2E seed employee appears in the list
 *  - Add employee form renders correctly
 *  - Creating a new employee succeeds
 *  - The new employee can be deactivated
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login, API_ORIGIN } from './helpers'

// Fixed test employee — same ID each run so we can check for it idempotently
const TEST_EMP_ID = '8801'
const TEST_EMP_NAME = 'E2E Temp Employee'
const TEST_EMP_PIN = '5678'

test.describe('Employees', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
    await page.goto('/#/employees')
    await page.waitForSelector('text=Employees', { timeout: 10_000 })
  })

  test('page loads with heading and employee list', async ({ page }) => {
    await expect(page.getByText('Employees')).toBeVisible()
    await expect(page.locator('input[placeholder*="Search employees" i]')).toBeVisible()
  })

  test('E2E seed employee appears in the list', async ({ page }) => {
    // The seed employee (ID 2001) should be visible in the list
    const searchInput = page.locator('input[placeholder*="Search employees" i]').first()
    await searchInput.fill('2001')
    await expect(page.getByText('2001')).toBeVisible({ timeout: 8_000 })
  })

  test('add employee form renders all required fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.locator('input[placeholder*="John Smith" i]')).toBeVisible()
    await expect(page.locator('input[placeholder*="0004" i]')).toBeVisible()
    // PIN field (masked)
    await expect(page.locator('input[placeholder="••••"]')).toBeVisible()
  })

  test('creating a new employee succeeds (idempotent)', async ({ page }) => {
    // Check if the test employee already exists; if so, skip creation
    const searchInput = page.locator('input[placeholder*="Search employees" i]').first()
    await searchInput.fill(TEST_EMP_ID)
    await page.waitForTimeout(500)

    const existingEmployee = page.getByText(TEST_EMP_NAME)
    if (await existingEmployee.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Already exists from a previous run — test passes (idempotent)
      return
    }

    // Clear search and open the Add form
    await searchInput.fill('')
    await page.getByRole('button', { name: 'Add' }).click()

    // Fill in the form
    await page.locator('input[placeholder*="John Smith" i]').fill(TEST_EMP_NAME)
    await page.locator('input[placeholder*="0004" i]').fill(TEST_EMP_ID)
    await page.locator('input[placeholder="••••"]').fill(TEST_EMP_PIN)

    // Select role: Cashier
    const cashierCheckbox = page.getByLabel('Cashier')
    if (await cashierCheckbox.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await cashierCheckbox.check()
    } else {
      // Role might be a select or radio — try clicking the label text
      await page.getByText('Cashier').first().click()
    }

    // Submit
    await page.getByRole('button', { name: 'Save' }).click()

    // Success message
    await expect(
      page.getByText(/Employee created|created successfully/i)
    ).toBeVisible({ timeout: 10_000 })
  })

  test('created employee can log in — PIN was correctly hashed', async ({ request }) => {
    // This test guards against PIN hashing regressions in the create-employee flow.
    // If the API stores a plaintext or incorrectly hashed PIN, this login will return 401.
    const res = await request.post(`${API_ORIGIN}/api/auth/login`, {
      data: { employeeId: TEST_EMP_ID, pin: TEST_EMP_PIN, selectedRole: 'Cashier' },
    })
    // 200 = PIN was hashed correctly and validates; 401 = hashing regression
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body?.data?.token ?? body?.token).toBeTruthy()
  })

  test('deactivating an employee shows confirmation and succeeds', async ({ page }) => {
    // Find the test employee created above
    const searchInput = page.locator('input[placeholder*="Search employees" i]').first()
    await searchInput.fill(TEST_EMP_ID)

    // Wait for the employee card to appear
    const employeeCard = page.getByText(TEST_EMP_NAME)
    if (!(await employeeCard.isVisible({ timeout: 4_000 }).catch(() => false))) {
      // Test employee doesn't exist yet (maybe run alone without the create test)
      test.skip()
      return
    }

    await employeeCard.click()

    // Click Deactivate
    await page.getByRole('button', { name: 'Deactivate' }).click()

    // Confirmation modal should appear
    await expect(page.getByText(/Deactivate Employee/i)).toBeVisible({ timeout: 5_000 })

    // Confirm deactivation
    await page.getByRole('button', { name: /Confirm|Yes|Deactivate/i }).last().click()

    await expect(
      page.getByText(/deactivated successfully/i)
    ).toBeVisible({ timeout: 10_000 })
  })
})
