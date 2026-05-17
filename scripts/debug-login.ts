import { chromium } from '@playwright/test'

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await ctx.newPage()

  await page.addInitScript(() => {
    try { localStorage.clear() } catch {}
    const _l: any[] = []
    ;(window as any).electronAPI = {
      checkBarcodeScanner: async () => ({ active: false }),
      checkPrinter:        async () => ({ connected: false }),
      checkDatabase:       async () => ({ connected: true, latency: 0 }),
      openCashDrawer:      async () => ({ success: true }),
      getTerminalConfig:   async () => ({ terminalId: 'T1', terminalName: 'Terminal 1' }),
      setTerminalConfig:   async () => ({}),
      printReceipt:        async () => ({ success: true }),
      validateManagerPin:  async () => ({ success: true }),
      setAuthToken:        () => {}, clearAuthToken: () => {},
      getConnectivity:     async () => ({ online: true }),
      onConnectivityChange: (cb: any) => { _l.push(cb); return () => {} },
      getQueue: async () => [], getAdjustmentQueue: async () => [], getReturnQueue: async () => [],
      removeFromQueue: async () => {}, removeFromAdjustmentQueue: async () => {}, removeFromReturnQueue: async () => {},
      queueTransaction: async () => {}, queueAdjustment: async () => {}, queueReturn: async () => {},
      getFailedSales: async () => [], getFailedAdjustments: async () => [], getFailedReturns: async () => [],
      clearFailedSales: async () => {}, clearFailedAdjustments: async () => {}, clearFailedReturns: async () => {},
    }
  })

  await page.goto('http://localhost:3001/#/login')
  await page.waitForTimeout(2000)
  console.log('URL after goto:', page.url())
  await page.screenshot({ path: '/tmp/debug-1-loaded.png' })

  // Check what's on screen
  const bodyText = await page.locator('body').innerText()
  console.log('Page text (first 300):', bodyText.slice(0, 300))

  // Look for buttons
  const buttons = await page.getByRole('button').allInnerTexts()
  console.log('Buttons found:', buttons)

  // Type employee ID
  for (const ch of '0001') {
    const btn = page.getByRole('button', { name: ch, exact: true }).first()
    const visible = await btn.isVisible()
    console.log(`Button '${ch}' visible:`, visible)
    if (visible) await btn.click()
    await page.waitForTimeout(100)
  }
  await page.screenshot({ path: '/tmp/debug-2-id-typed.png' })

  // Click PIN tab
  const pinBtn = page.getByRole('button', { name: 'PIN' })
  console.log('PIN button visible:', await pinBtn.isVisible())
  await pinBtn.click()
  await page.waitForTimeout(300)

  // Type PIN
  for (const ch of '1111') {
    await page.getByRole('button', { name: ch, exact: true }).first().click()
    await page.waitForTimeout(100)
  }
  await page.screenshot({ path: '/tmp/debug-3-pin-typed.png' })

  // Click Sign In
  const signIn = page.getByRole('button', { name: /Sign In/ })
  console.log('Sign In visible:', await signIn.isVisible())
  await signIn.click()
  await page.waitForTimeout(5000)

  console.log('URL after sign in:', page.url())
  const afterText = await page.locator('body').innerText()
  console.log('Page text after login (first 400):', afterText.slice(0, 400))
  await page.screenshot({ path: '/tmp/debug-4-after-login.png' })

  await browser.close()
}

main().catch(console.error)
