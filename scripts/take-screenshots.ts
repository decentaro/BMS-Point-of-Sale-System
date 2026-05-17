/**
 * Automated screenshot capture for README documentation.
 * Run with:  npx ts-node --esm scripts/take-screenshots.ts
 * Or:        npx tsx scripts/take-screenshots.ts
 *
 * Requires API (localhost:5002) and Vite (localhost:3001) to be running.
 */

import { chromium, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../docs/screenshots')
fs.mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:3001'
// Matches the 10.1" kiosk target — wide enough to show all nav/content
const VIEWPORT = { width: 1366, height: 768 }

const MANAGER_ID = '0001'
const MANAGER_PIN = '1111'
const CASHIER_ID  = '0001'   // reuse manager for cashier-view shots
const CASHIER_PIN = '1111'

async function injectElectronStub(page: Page) {
  await page.addInitScript(() => {
    try { localStorage.clear() } catch {}
    const _listeners: Array<(s: { online: boolean }) => void> = []
    ;(window as any).electronAPI = {
      checkBarcodeScanner: async () => ({ active: false,  description: 'No scanner' }),
      checkPrinter:        async () => ({ connected: false, description: 'No printer' }),
      checkDatabase:       async () => ({ connected: true,  latency: 4,  description: 'OK' }),
      openCashDrawer:      async () => ({ success: true }),
      getTerminalConfig:   async () => ({ terminalId: 'T1', terminalName: 'Terminal 1' }),
      setTerminalConfig:   async () => ({}),
      printReceipt:        async () => ({ success: true }),
      validateManagerPin:  async () => ({ success: true }),
      setAuthToken:        () => {},
      clearAuthToken:      () => {},
      getConnectivity:     async () => ({ online: true }),
      onConnectivityChange: (cb: any) => { _listeners.push(cb); return () => {} },
      getQueue: async () => [], getAdjustmentQueue: async () => [], getReturnQueue: async () => [],
      removeFromQueue: async () => {}, removeFromAdjustmentQueue: async () => {}, removeFromReturnQueue: async () => {},
      queueTransaction: async () => {}, queueAdjustment: async () => {}, queueReturn: async () => {},
      getFailedSales: async () => [], getFailedAdjustments: async () => [], getFailedReturns: async () => [],
      clearFailedSales: async () => {}, clearFailedAdjustments: async () => {}, clearFailedReturns: async () => {},
    }
  })
}

async function typeDigits(page: Page, value: string) {
  for (const ch of value) {
    await page.getByRole('button', { name: ch, exact: true }).first().click()
    await page.waitForTimeout(60)
  }
}

async function loginAs(page: Page, id: string, pin: string) {
  // Force a full page reload so the React form state is fresh
  await page.goto(`${BASE}/#/`)
  await page.waitForTimeout(300)
  await injectElectronStub(page)
  await page.goto(`${BASE}/#/login`)
  await page.waitForSelector('text=Sign In', { timeout: 15000 })
  await typeDigits(page, id)
  await page.getByRole('button', { name: 'PIN' }).click()
  await typeDigits(page, pin)
  await page.getByRole('button', { name: /Sign In/ }).click()
  // Give the app time to navigate and render after login
  await page.waitForTimeout(4000)
}

async function shot(page: Page, name: string, extra = 0) {
  await page.waitForTimeout(600 + extra)
  // Hide any loading spinners that might still be visible
  await page.evaluate(() => {
    document.querySelectorAll('[class*="spinner"], [class*="loading"], [class*="skeleton"]')
      .forEach(el => (el as HTMLElement).style.visibility = 'hidden')
  })
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  console.log(`  ✓  ${name}.png`)
}

async function nav(page: Page, hash: string) {
  await page.goto(`${BASE}/#${hash}`)
  await page.waitForTimeout(1000)
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: VIEWPORT })
  const page = await ctx.newPage()

  console.log('\n── Login screen ──────────────────────────────────────')
  await injectElectronStub(page)
  await page.goto(`${BASE}/#/login`)
  await page.waitForSelector('text=Sign In', { timeout: 15000 })
  await shot(page, '01-login')

  // Type employee ID on numpad to show it filled
  await typeDigits(page, MANAGER_ID)
  await shot(page, '02-login-id-entered')

  console.log('\n── Manager screens ───────────────────────────────────')
  await loginAs(page, MANAGER_ID, MANAGER_PIN)
  await shot(page, '03-manager-dashboard', 500)

  await nav(page, '/pos')
  await shot(page, '04-pos-empty')

  // Add a product by clicking the first available product card
  try {
    const productCard = page.locator('[class*="product"], [class*="Product"], .cursor-pointer').first()
    const cardVisible = await productCard.isVisible()
    if (cardVisible) {
      await productCard.click()
      await page.waitForTimeout(1000)
    }
    await shot(page, '05-pos-with-item')
  } catch { await shot(page, '05-pos-with-item') }

  await nav(page, '/employees')
  await shot(page, '06-employees', 500)

  await nav(page, '/inventory')
  await shot(page, '07-inventory', 500)

  await nav(page, '/sales-history')
  await shot(page, '08-sales-history', 500)

  await nav(page, '/returns')
  await shot(page, '09-returns')

  await nav(page, '/reports')
  await shot(page, '10-reports', 800)

  await nav(page, '/admin')
  await shot(page, '11-admin-panel', 500)

  await nav(page, '/system-settings')
  await shot(page, '12-system-settings', 400)

  await nav(page, '/tax-settings')
  await shot(page, '13-tax-settings', 400)

  await nav(page, '/user-activity')
  await shot(page, '14-user-activity', 500)

  await nav(page, '/cash-session')
  await shot(page, '15-cash-session', 400)

  await nav(page, '/hardware-status')
  await shot(page, '16-hardware-status', 400)

  console.log('\n── Cashier screens ───────────────────────────────────')
  // Re-navigate to login for cashier
  await page.goto(`${BASE}/#/login`)
  await page.waitForTimeout(500)
  await loginAs(page, CASHIER_ID, CASHIER_PIN)
  await shot(page, '17-cashier-dashboard', 500)

  await browser.close()
  console.log(`\n✅  ${fs.readdirSync(OUT).length} screenshots saved to docs/screenshots/\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
