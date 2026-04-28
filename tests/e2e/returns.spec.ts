/**
 * returns.spec.ts
 * E2E: Returns & Refunds golden path
 *
 * Covers:
 *  - Returns page loads and shows Step 1 search
 *  - Invalid transaction ID shows error
 *  - Valid transaction ID shows Step 2 (original transaction details)
 *  - Processing a return succeeds (optional manager approval handled)
 *
 * Seed data: beforeAll creates one fresh sale each run so the return test
 * always has a pristine transaction to consume.
 */

import { test, expect, request as playwrightRequest } from '@playwright/test'
import { gotoLogin, login, apiLogin, getE2EProductId, createSeedSale, API_ORIGIN } from './helpers'

test.describe('Returns', () => {
  let transactionId: string

  // Create a fresh returnable sale before any test in this block runs.
  // Each test run gets its own transaction so the "process return" test
  // never hits an already-returned transaction.
  test.beforeAll(async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: API_ORIGIN })
    try {
      const { token, employeeId } = await apiLogin(ctx)
      const productId = await getE2EProductId(ctx, token)
      transactionId = await createSeedSale(ctx, token, employeeId, productId)
      console.log(`[returns spec] seed transactionId: ${transactionId}`)
    } finally {
      await ctx.dispose()
    }
  })

  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
    await page.goto('/#/returns')
    // Wait for either the returns form or "Returns System Disabled" message
    await page.waitForSelector('text=Returns & Refunds, text=Returns System Disabled', { timeout: 10_000 })
  })

  test('returns page loads with search form', async ({ page }) => {
    await expect(page.getByText('Returns & Refunds')).toBeVisible()
    await expect(page.getByText('Find Original Transaction')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Find Transaction' })).toBeVisible()
  })

  test('invalid transaction ID shows not-found error', async ({ page }) => {
    await page.locator('input[placeholder*="digit" i]').fill('BADID0000')
    await page.getByRole('button', { name: 'Find Transaction' }).click()
    // The component shows a toast: "Transaction ID not found" or a warning
    await expect(
      page.getByText(/not found|No transaction|Transaction ID not found/i)
    ).toBeVisible({ timeout: 8_000 })
  })

  test('valid transaction ID shows original transaction details', async ({ page }) => {
    // Use last 8 chars of the transaction ID (the component says "last 8 digits")
    const last8 = transactionId.slice(-8)
    await page.locator('input[placeholder*="digit" i]').fill(last8)
    await page.getByRole('button', { name: 'Find Transaction' }).click()

    await expect(page.getByText('Original Transaction Details')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('E2E Test Product')).toBeVisible()
  })

  test('completing a return succeeds', async ({ page }) => {
    // Search for the seed sale
    const last8 = transactionId.slice(-8)
    await page.locator('input[placeholder*="digit" i]').fill(last8)
    await page.getByRole('button', { name: 'Find Transaction' }).click()
    await expect(page.getByText('Original Transaction Details')).toBeVisible({ timeout: 10_000 })

    // Set return quantity to 1 (defaults to 0)
    // The input is inside a container that has the "Return Qty" label
    const returnQtyInput = page.locator('label:has-text("Return Qty") + input, label:has-text("Return Qty") ~ input').first()
    await returnQtyInput.fill('1')

    // Select first real reason from the reason dropdown (skip the empty placeholder)
    const reasonSelect = page.locator('select').filter({ hasText: 'Select reason' })
    await reasonSelect.selectOption({ index: 1 })

    // The "Process Return" button appears once returnTotal > 0
    await expect(page.getByRole('button', { name: /Process Return/i })).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: /Process Return/i }).click()

    // Handle optional manager approval modal
    const approvalModal = page.getByText('Manager Approval Required')
    if (await approvalModal.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.locator('input[placeholder*="manager pin" i]').fill('1234')
      await page.getByRole('button', { name: 'Approve Return' }).click()
    }

    // Success card: "Return Processed Successfully"
    await expect(page.getByText('Return Processed Successfully')).toBeVisible({ timeout: 15_000 })
  })
})
