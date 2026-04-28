/**
 * admin.spec.ts
 * E2E: Admin Panel (/admin)
 *
 * Covers:
 *  - Page loads for Manager (has admin.view permission)
 *  - Cashier is redirected away (no admin.view permission)
 *  - Clear Database section shows both required fields
 *  - Confirm button is disabled until both fields are filled
 *  - Security settings section is visible
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login } from './helpers'
import { E2E_CASHIER_ID, E2E_CASHIER_PIN } from './helpers'

test.describe('Admin Panel — Manager access', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
    await page.goto('/#/admin')
    await page.waitForURL(/\/admin/, { timeout: 10_000 })
  })

  test('page loads with Admin heading', async ({ page }) => {
    await expect(
      page.getByText(/Admin|Administration|System Administration/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('security settings section is visible', async ({ page }) => {
    await expect(
      page.getByText(/Security|Security Settings|Login Security/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('clear database section shows confirmation phrase field', async ({ page }) => {
    // The danger zone / clear database section should be visible
    await expect(page.locator('input[placeholder="CLEAR DATABASE"]')).toBeVisible({ timeout: 10_000 })
  })

  test('clear database section shows manager PIN field', async ({ page }) => {
    await expect(
      page.getByText(/Manager PIN/i).first()
    ).toBeVisible({ timeout: 10_000 })
  })

  test('confirm clear database button is disabled without both fields', async ({ page }) => {
    // Find the confirm/delete button — it should be disabled when fields are empty
    // The component disables when clearConfirmPhrase !== 'CLEAR DATABASE' || clearManagerPin.length < 4
    const confirmBtn = page.getByRole('button', { name: /Confirm|Clear|Delete/i })
      .filter({ hasText: /Clear|Confirm|Delete Database/i })
      .first()

    // Without filling anything, button must be disabled
    await expect(confirmBtn).toBeDisabled({ timeout: 10_000 })
  })

  test('confirm button stays disabled with only phrase filled', async ({ page }) => {
    const phraseInput = page.locator('input[placeholder="CLEAR DATABASE"]')
    await phraseInput.fill('CLEAR DATABASE')

    const confirmBtn = page.getByRole('button', { name: /Confirm|Clear|Delete/i })
      .filter({ hasText: /Clear|Confirm|Delete Database/i })
      .first()

    // PIN is still empty — button must remain disabled
    await expect(confirmBtn).toBeDisabled({ timeout: 5_000 })
  })
})

test.describe('Admin Panel — Cashier access denied', () => {
  test('Cashier is redirected away from /admin', async ({ page }) => {
    await gotoLogin(page)
    await login(page, E2E_CASHIER_ID, E2E_CASHIER_PIN)

    await page.goto('/#/admin')

    // Should be redirected — not stay on /admin
    await page.waitForTimeout(2_000)
    await expect(page).not.toHaveURL(/\/admin/)
  })
})
