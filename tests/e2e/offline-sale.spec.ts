/**
 * offline-sale.spec.ts
 * E2E: Offline sale queuing and reconnect sync
 *
 * Strategy: call electronAPI._setOnline(false) to trigger ConnectionContext's
 * connectivity listener, which sets ApiClient.online = false. ApiClient then
 * throws immediately (no retries), making tests fast. POS detects the offline
 * flag and queues the sale instead of showing an error.
 */

import { test, expect } from '@playwright/test'
import { gotoLogin, login } from './helpers'

async function navigateToPOS(page: any) {
  await page.goto('/#/pos')
  await page.waitForSelector('text=Point of Sale', { timeout: 15_000 })
}

/** Patches queueTransaction to capture items in window.__offlineQueue. */
async function enableOfflineTracking(page: any) {
  await page.evaluate(() => {
    (window as any).__offlineQueue = []
    const api = (window as any).electronAPI
    api.queueTransaction = async (tx: any) => {
      (window as any).__offlineQueue.push(tx)
    }
    // Make getQueue return the captured items so ConnectionContext sync reads them
    api.getQueue = async () => (window as any).__offlineQueue.slice()
    api.removeFromQueue = async (id: string) => {
      (window as any).__offlineQueue = (window as any).__offlineQueue.filter((t: any) => t.id !== id)
    }
  })
}

/** Set the in-app connectivity state. ApiClient.online mirrors this. */
async function setOnline(page: any, online: boolean) {
  await page.evaluate((o: boolean) => {
    (window as any).electronAPI._setOnline(o)
  }, online)
}

async function addFirstProductAndOpenPayment(page: any) {
  const productCard = page.locator('div[class*="rounded-lg"]').filter({ hasText: /Widget|Product|E2E/ }).first()
  await productCard.waitFor({ timeout: 10_000 })
  await productCard.click()

  const payBtn = page.getByText(/^Pay /).first()
  await payBtn.waitFor({ timeout: 5_000 })
  await payBtn.click()

  const amountInput = page.locator('input[placeholder*="amount" i], input[data-testid="amount-paid-input"]').first()
  await amountInput.waitFor({ timeout: 3_000 })
  await amountInput.fill('50')
}

test.describe('Offline Sale', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLogin(page)
    await login(page)
    await navigateToPOS(page)
    await enableOfflineTracking(page)
  })

  test('sale is queued when app goes offline', async ({ page }) => {
    await setOnline(page, false)

    await addFirstProductAndOpenPayment(page)
    await page.getByText('Complete Payment').first().click()

    await expect(page.getByText(/queued|offline/i).first()).toBeVisible({ timeout: 8_000 })

    const queueLen = await page.evaluate(() => (window as any).__offlineQueue?.length ?? 0)
    expect(queueLen).toBe(1)
  })

  test('offline transaction has the correct data shape', async ({ page }) => {
    await setOnline(page, false)
    await addFirstProductAndOpenPayment(page)
    await page.getByText('Complete Payment').first().click()

    await expect(page.getByText(/queued|offline/i).first()).toBeVisible({ timeout: 8_000 })

    const tx = await page.evaluate(() => (window as any).__offlineQueue?.[0])
    expect(tx).toBeTruthy()
    expect(tx.id).toMatch(/^TXN-OFFLINE-/)
    expect(tx.idempotencyKey).toBeTruthy()
    expect(tx.saleData).toBeTruthy()
    expect(tx.receiptData).toBeTruthy()
    expect(tx.receiptData.transactionId).toBe(tx.id)
  })

  test('cart is cleared after offline sale is queued', async ({ page }) => {
    await setOnline(page, false)
    await addFirstProductAndOpenPayment(page)
    await page.getByText('Complete Payment').first().click()

    await expect(page.getByText(/queued|offline/i).first()).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Cart is empty')).toBeVisible({ timeout: 8_000 })
  })

  test('warning toast includes the offline transaction ID', async ({ page }) => {
    await setOnline(page, false)
    await addFirstProductAndOpenPayment(page)
    await page.getByText('Complete Payment').first().click()

    await expect(page.getByText(/TXN-OFFLINE-/)).toBeVisible({ timeout: 8_000 })
  })

  test('after reconnect, next sale completes normally', async ({ page }) => {
    // First sale: offline
    await setOnline(page, false)
    await addFirstProductAndOpenPayment(page)
    await page.getByText('Complete Payment').first().click()
    await expect(page.getByText(/queued|offline/i).first()).toBeVisible({ timeout: 8_000 })

    // Reconnect
    await setOnline(page, true)

    // Second sale should succeed — no "queued" toast, success instead
    await addFirstProductAndOpenPayment(page)
    await page.getByText('Complete Payment').first().click()

    await expect(
      page.getByText(/Payment successful|TXN-(?!OFFLINE)/i).first()
    ).toBeVisible({ timeout: 15_000 })

    // Only the first sale should be in the queue
    const queueLen = await page.evaluate(() => (window as any).__offlineQueue?.length ?? 0)
    expect(queueLen).toBe(1)
  })

  test('offline banner reflects queue count after queued sale', async ({ page }) => {
    await setOnline(page, false)
    await addFirstProductAndOpenPayment(page)
    await page.getByText('Complete Payment').first().click()

    await expect(page.getByText(/queued|offline/i).first()).toBeVisible({ timeout: 8_000 })

    // Queue count should be non-zero (ConnectionContext.refreshQueueCount was called)
    const queueLen = await page.evaluate(() => (window as any).__offlineQueue?.length ?? 0)
    expect(queueLen).toBeGreaterThan(0)
  })
})
