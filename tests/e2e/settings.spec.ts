/**
 * settings.spec.ts
 * E2E: System Settings and Tax Settings
 *
 * Covers:
 *  - System Settings page loads with all major sections
 *  - Settings can be saved (round-trip)
 *  - Tax Settings page loads
 *  - Tax settings can be saved
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login } from './helpers'

test.describe('System Settings', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
    await page.goto('/#/system-settings')
    await page.waitForSelector('text=System Settings', { timeout: 10_000 })
  })

  test('page loads with all major section headers', async ({ page }) => {
    await expect(page.getByText('System Settings')).toBeVisible()
    await expect(page.getByText('Regional Settings')).toBeVisible()
    await expect(page.getByText('POS Behavior')).toBeVisible()
    await expect(page.getByText('Receipt & Printing')).toBeVisible()
    await expect(page.getByText('Returns Policy')).toBeVisible()
  })

  test('Save Settings button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Save Settings' })).toBeVisible()
  })

  test('saving settings shows success message', async ({ page }) => {
    // Click save without changing anything — should still succeed (round-trip)
    await page.getByRole('button', { name: 'Save Settings' }).click()
    await expect(
      page.getByText(/Settings saved|saved successfully/i)
    ).toBeVisible({ timeout: 10_000 })
  })

  test('date format selector is present', async ({ page }) => {
    // Date format is a select with options like "MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"
    await expect(page.locator('select').first()).toBeVisible()
  })

  test('auto-logout minutes input is present', async ({ page }) => {
    await expect(
      page.locator('input[type="number"]').first()
    ).toBeVisible()
  })
})

test.describe('Tax Settings', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
    await page.goto('/#/tax-settings')
    await page.waitForSelector('text=Tax Settings', { timeout: 10_000 })
  })

  test('page loads with heading and sections', async ({ page }) => {
    await expect(page.getByText('Tax Settings')).toBeVisible()
    await expect(page.getByText('Business Information')).toBeVisible()
    await expect(page.getByText('Tax Configuration')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Tax Settings' })).toBeVisible()
  })

  test('business name field is editable', async ({ page }) => {
    const businessNameInput = page.locator('input[placeholder*="business name" i]').first()
    await expect(businessNameInput).toBeVisible()
    // Verify it's not disabled
    await expect(businessNameInput).toBeEnabled()
  })

  test('saving tax settings shows success message', async ({ page }) => {
    await page.getByRole('button', { name: 'Save Tax Settings' }).click()
    await expect(
      page.getByText(/Tax settings saved|saved successfully/i)
    ).toBeVisible({ timeout: 10_000 })
  })
})
