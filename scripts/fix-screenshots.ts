/**
 * Targeted screenshot fix:
 *  - 07-basic-inventory      /inventory          (Manager)
 *  - 08-advanced-inventory   /inventory-management (Manager)
 *  - 15-cash-session         /reports → Reconciliation tab (Manager)
 *  - 16-hardware-status      /admin (Manager)
 *  - 18-manager-page         /manager (Manager)
 *  - 19-inventory-dashboard  /inventory-dashboard (Marc 0002, Cashier+Inventory)
 *  - 20-cashier-dashboard    /cashier-dashboard   (Nina 0003, Cashier)
 *  - 21-cashier-inventory    /cashier-inventory   (Marc 0002, Cashier+Inventory)
 */

import { chromium, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../docs/screenshots')
const BASE = 'http://localhost:3001'
const VIEWPORT = { width: 1366, height: 768 }

function electronStub() {
  const _l: any[] = []
  ;(window as any).electronAPI = {
    checkBarcodeScanner: async () => ({ active: false, description: 'No scanner' }),
    checkPrinter:        async () => ({ connected: false, description: 'No printer' }),
    checkDatabase:       async () => ({ connected: true, latency: 4, description: 'OK' }),
    openCashDrawer:      async () => ({ success: true }),
    getTerminalConfig:   async () => ({ terminalId: 'T1', terminalName: 'Terminal 1' }),
    setTerminalConfig:   async () => ({}),
    printReceipt:        async () => ({ success: true }),
    validateManagerPin:  async () => ({ success: true }),
    setAuthToken:        () => {},
    clearAuthToken:      () => {},
    getConnectivity:     async () => ({ online: true }),
    onConnectivityChange: (cb: any) => { _l.push(cb); return () => {} },
    getQueue: async () => [], getAdjustmentQueue: async () => [], getReturnQueue: async () => [],
    removeFromQueue: async () => {}, removeFromAdjustmentQueue: async () => {}, removeFromReturnQueue: async () => {},
    queueTransaction: async () => {}, queueAdjustment: async () => {}, queueReturn: async () => {},
    getFailedSales: async () => [], getFailedAdjustments: async () => [], getFailedReturns: async () => [],
    clearFailedSales: async () => {}, clearFailedAdjustments: async () => {}, clearFailedReturns: async () => {},
  }
}

async function typeDigits(page: Page, value: string) {
  for (const ch of value) {
    await page.getByRole('button', { name: ch, exact: true }).first().click()
    await page.waitForTimeout(60)
  }
}

async function loginAs(page: Page, id: string, pin: string, role = 'Manager') {
  await page.goto(`${BASE}/#/`)
  await page.waitForTimeout(300)
  await page.addInitScript(electronStub)
  await page.goto(`${BASE}/#/login`)
  await page.waitForSelector('text=Sign In', { timeout: 15000 })
  await typeDigits(page, id)
  await page.getByRole('button', { name: 'PIN' }).click()
  await typeDigits(page, pin)
  await page.getByRole('button', { name: /Sign In/ }).click()
  await page.waitForTimeout(4000)
}

async function shot(page: Page, name: string, extra = 0) {
  await page.waitForTimeout(600 + extra)
  await page.evaluate(() => {
    document.querySelectorAll('[class*="spinner"],[class*="loading"],[class*="skeleton"]')
      .forEach(el => (el as HTMLElement).style.visibility = 'hidden')
  })
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  console.log(`  ✓  ${name}.png`)
}

async function nav(page: Page, hash: string) {
  await page.goto(`${BASE}/#${hash}`)
  await page.waitForTimeout(1200)
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })

  // ── Manager screenshots ────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: VIEWPORT })
    const page = await ctx.newPage()
    await page.addInitScript(electronStub)

    console.log('\n── Manager role ──────────────────────────────────────────')
    await loginAs(page, '0001', '1111')

    await nav(page, '/manager')
    await shot(page, '18-manager-page', 500)

    await nav(page, '/inventory')
    await shot(page, '07-basic-inventory', 500)

    await nav(page, '/inventory-management')
    await shot(page, '08-advanced-inventory', 800)

    // Cash Session = Reconciliation tab inside /reports
    await nav(page, '/reports')
    await page.waitForTimeout(500)
    const reconTab = page.getByRole('button', { name: /Reconciliation|Z-Report/i })
    if (await reconTab.isVisible()) {
      await reconTab.click()
      await page.waitForTimeout(1000)
    }
    await shot(page, '15-cash-session', 400)

    // Hardware Status = section inside /admin
    await nav(page, '/admin')
    await shot(page, '16-hardware-status', 600)

    await ctx.close()
  }

  // ── Marc (Cashier + Inventory) ────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: VIEWPORT })
    const page = await ctx.newPage()
    await page.addInitScript(electronStub)

    console.log('\n── Marc (Cashier+Inventory) ──────────────────────────────')
    await loginAs(page, '0002', '1111', 'Cashier')

    await nav(page, '/cashier-dashboard')
    await shot(page, '20-cashier-dashboard', 500)

    await nav(page, '/inventory-dashboard')
    await shot(page, '19-inventory-dashboard', 500)

    await nav(page, '/cashier-inventory')
    await shot(page, '21-cashier-inventory', 500)

    await ctx.close()
  }

  await browser.close()
  console.log('\n✅  Done\n')
}

main().catch(err => { console.error(err); process.exit(1) })
