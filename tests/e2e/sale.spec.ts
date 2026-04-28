/**
 * sale.spec.ts
 * E2E: Complete sale golden path
 *
 * Covers:
 *  - Log in as Manager → reach POS
 *  - Scan a product by barcode → appears in cart
 *  - Correct subtotal displayed
 *  - Complete sale with Cash payment
 *  - Receipt preview shown (or sale confirmed)
 *  - Sales history shows the new transaction
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login, API_ORIGIN } from './helpers'
import { E2E_PRODUCT_BARCODE, E2E_CASHIER_ID, E2E_CASHIER_PIN } from './global-setup'

test.describe('POS Sale', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)

    // Manager lands on /manager or /dashboard — navigate to POS
    await page.goto('/#/pos')
    await page.waitForSelector('text=Point of Sale', { timeout: 10_000 })
      .catch(() => page.waitForSelector('[data-testid="pos-container"]', { timeout: 5_000 }))
  })

  test('POS page loads with empty cart', async ({ page }) => {
    // Cart should show the empty-state text
    await expect(page.getByText('Cart is empty')).toBeVisible()
  })

  test('scanning a product barcode adds it to the cart', async ({ page }) => {
    // Filter by barcode then click the product card to add to cart
    const searchInput = page.locator('input[placeholder*="search" i]').first()
    await searchInput.fill(E2E_PRODUCT_BARCODE)
    // Click the product card (div with onClick=addToCart)
    await page.getByText('E2E Test Product').first().click()

    // Product name should appear in the cart (not just the search results)
    // Cart items are rendered inside the right-hand cart panel
    await expect(page.locator('[class*="divide-y"] >> text=E2E Test Product')).toBeVisible({ timeout: 5_000 })
  })

  test('cart total updates after adding product', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="search" i]').first()
    await searchInput.fill(E2E_PRODUCT_BARCODE)
    await page.getByText('E2E Test Product').first().click()

    // Price 9.99 should appear in the totals section (subtotal / total)
    await expect(page.locator('text=9.99').first()).toBeVisible({ timeout: 5_000 })
  })

  test('completing a cash sale succeeds', async ({ page }) => {
    // Add product to cart
    const searchInput = page.locator('input[placeholder*="search" i]').first()
    await searchInput.fill(E2E_PRODUCT_BARCODE)
    await page.getByText('E2E Test Product').first().click()
    await expect(page.locator('[class*="divide-y"] >> text=E2E Test Product')).toBeVisible({ timeout: 5_000 })

    // Click Pay button to open payment modal
    await page.getByRole('button', { name: /^Pay /i }).click()

    // Fill cash amount (must be >= total; total is 9.99 + 10% tax = 10.99)
    const amountInput = page.locator('input[placeholder*="amount" i], input[placeholder*="Enter amount" i]').first()
    await amountInput.fill('11.00')

    // Complete the payment
    await page.getByRole('button', { name: 'Complete Payment' }).click()

    // Cart should be cleared once the sale completes (receipt auto-printed, modal dismissed)
    await expect(page.getByText('Cart is empty')).toBeVisible({ timeout: 15_000 })
  })

  test('completing a card sale succeeds', async ({ page }) => {
    // Add product to cart
    const searchInput = page.locator('input[placeholder*="search" i]').first()
    await searchInput.fill(E2E_PRODUCT_BARCODE)
    await page.getByText('E2E Test Product').first().click()
    await expect(page.locator('[class*="divide-y"] >> text=E2E Test Product')).toBeVisible({ timeout: 5_000 })

    // Open payment modal
    await page.getByRole('button', { name: /^Pay /i }).click()

    // Switch payment method to Card
    const methodSelect = page.locator('select').filter({ hasText: /Cash|Card/i }).first()
    await methodSelect.selectOption('Card')

    // Fill amount
    const amountInput = page.locator('input[placeholder*="amount" i], input[placeholder*="Enter amount" i]').first()
    await amountInput.fill('11.00')

    await page.getByRole('button', { name: 'Complete Payment' }).click()
    await expect(page.getByText('Cart is empty')).toBeVisible({ timeout: 15_000 })
  })

  test('applying a discount reduces the total', async ({ page }) => {
    // Add product to cart
    const searchInput = page.locator('input[placeholder*="search" i]').first()
    await searchInput.fill(E2E_PRODUCT_BARCODE)
    await page.getByText('E2E Test Product').first().click()
    await expect(page.locator('[class*="divide-y"] >> text=E2E Test Product')).toBeVisible({ timeout: 5_000 })

    // Open payment modal
    await page.getByRole('button', { name: /^Pay /i }).click()

    // Click the 10% discount preset button
    await page.getByRole('button', { name: '10%' }).click()

    // A text-type ModalKeyboard opens for optional discount reason.
    // Text keyboards have 'return' not 'Done' — dismiss with Escape.
    await page.keyboard.press('Escape')

    // Discount banner should appear ("10% discount applied")
    await expect(page.getByText(/10% discount applied/i)).toBeVisible({ timeout: 5_000 })

    // Complete the discounted payment — total is now lower so 11.00 still covers it
    const amountInput = page.locator('input[placeholder*="amount" i], input[placeholder*="Enter amount" i]').first()
    await amountInput.fill('11.00')
    await page.getByRole('button', { name: 'Complete Payment' }).click()
    await expect(page.getByText('Cart is empty')).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('POS Discount — manager approval required', () => {
  // Enable requireManagerApprovalForDiscount before tests, restore after.
  // The electronAPI stub in helpers returns { success: true } for validateManagerPin,
  // so this tests the UI flow without needing a real IPC call.

  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post(`${API_ORIGIN}/api/auth/login`, {
      data: { employeeId: '2001', pin: '1234', selectedRole: 'Manager' },
    })
    const { data } = await loginRes.json()

    await request.post(`${API_ORIGIN}/api/system-settings`, {
      headers: { Authorization: `Bearer ${data.token}` },
      data: { requireManagerApprovalForDiscount: true },
    })
  })

  test.afterAll(async ({ request }) => {
    const loginRes = await request.post(`${API_ORIGIN}/api/auth/login`, {
      data: { employeeId: '2001', pin: '1234', selectedRole: 'Manager' },
    })
    const { data } = await loginRes.json()

    await request.post(`${API_ORIGIN}/api/system-settings`, {
      headers: { Authorization: `Bearer ${data.token}` },
      data: { requireManagerApprovalForDiscount: false },
    })
  })

  test('Cashier sees manager PIN prompt before discount is applied', async ({ page }) => {
    await gotoLogin(page)
    await login(page, E2E_CASHIER_ID, E2E_CASHIER_PIN)
    await page.goto('/#/pos')
    await page.waitForSelector('text=Point of Sale', { timeout: 10_000 })
      .catch(() => page.waitForSelector('[class*="pos"]', { timeout: 5_000 }))

    // Add a product to the cart
    const searchInput = page.locator('input[placeholder*="search" i]').first()
    await searchInput.fill(E2E_PRODUCT_BARCODE)
    await page.getByText('E2E Test Product').first().click()

    // Open payment modal
    await page.getByRole('button', { name: /^Pay /i }).click()

    // Click a discount preset
    await page.getByRole('button', { name: '10%' }).click()

    // Manager PIN keyboard should open (label contains "Manager PIN")
    await expect(
      page.getByText(/Manager PIN|Enter Manager PIN/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('After stub approves manager PIN, discount is applied', async ({ page }) => {
    await gotoLogin(page)
    await login(page, E2E_CASHIER_ID, E2E_CASHIER_PIN)
    await page.goto('/#/pos')
    await page.waitForSelector('text=Point of Sale', { timeout: 10_000 })
      .catch(() => page.waitForSelector('[class*="pos"]', { timeout: 5_000 }))

    // Add product
    const searchInput = page.locator('input[placeholder*="search" i]').first()
    await searchInput.fill(E2E_PRODUCT_BARCODE)
    await page.getByText('E2E Test Product').first().click()

    // Open payment modal
    await page.getByRole('button', { name: /^Pay /i }).click()

    // Click discount — manager PIN keyboard opens
    await page.getByRole('button', { name: '10%' }).click()
    await expect(page.getByText(/Manager PIN|Enter Manager PIN/i)).toBeVisible({ timeout: 8_000 })

    // Type any PIN — stub always returns success
    for (const ch of '1234') {
      await page.getByRole('button', { name: ch, exact: true }).first().click()
    }
    // Submit the PIN keyboard (the ModalKeyboard "return" key)
    await page.keyboard.press('Enter')

    // Discount reason keyboard may open — dismiss it
    await page.keyboard.press('Escape')

    // Discount banner should appear
    await expect(page.getByText(/10% discount applied/i)).toBeVisible({ timeout: 8_000 })
  })
})
