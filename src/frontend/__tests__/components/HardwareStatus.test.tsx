import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'

let mockShowToast: ReturnType<typeof vi.fn>
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: (...args: any[]) => mockShowToast(...args) }),
}))

// electronAPI mock — set on window
function makeElectronAPI(overrides: any = {}) {
  return {
    checkBarcodeScanner: vi.fn().mockResolvedValue({ active: true, description: 'USB HID Scanner - Working' }),
    checkPrinter: vi.fn().mockResolvedValue({ connected: true, model: 'Epson TM-T88', description: 'Printer ready' }),
    checkDatabase: vi.fn().mockResolvedValue({ connected: true, latency: 5, description: 'DB connected' }),
    openCashDrawer: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  }
}

import HardwareStatus from '@/components/HardwareStatus'

beforeEach(() => {
  mockShowToast = vi.fn()
  ;(window as any).electronAPI = makeElectronAPI()
})

async function renderAndWait(props: any = {}) {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<HardwareStatus {...props} />)
  })
  return result
}

describe('HardwareStatus', () => {

  // ── Full view (default) ───────────────────────────────────────────────────

  describe('Full View', () => {
    it('renders Hardware Status header', async () => {
      await renderAndWait()
      expect(screen.getByText('Hardware Status')).toBeTruthy()
    })

    it('renders Refresh button', async () => {
      await renderAndWait()
      expect(screen.getByText('Refresh')).toBeTruthy()
    })

    it('shows Barcode Scanner row', async () => {
      await renderAndWait()
      expect(screen.getByText('Barcode Scanner')).toBeTruthy()
    })

    it('shows Receipt Printer row', async () => {
      await renderAndWait()
      expect(screen.getByText('Receipt Printer')).toBeTruthy()
    })

    it('shows Cash Drawer row', async () => {
      await renderAndWait()
      expect(screen.getByText('Cash Drawer')).toBeTruthy()
    })

    it('shows Database row', async () => {
      await renderAndWait()
      expect(screen.getByText('Database')).toBeTruthy()
    })

    it('shows Network row', async () => {
      await renderAndWait()
      expect(screen.getByText('Network')).toBeTruthy()
    })

    it('calls checkBarcodeScanner, checkPrinter, checkDatabase on mount', async () => {
      const api = makeElectronAPI()
      ;(window as any).electronAPI = api
      await renderAndWait()
      expect(api.checkBarcodeScanner).toHaveBeenCalledTimes(1)
      expect(api.checkPrinter).toHaveBeenCalledTimes(1)
      expect(api.checkDatabase).toHaveBeenCalledTimes(1)
    })

    it('shows "active" status badge when scanner active', async () => {
      await renderAndWait()
      // StatusBadge renders status.replace(/_/g,' ') — lowercase, CSS uppercase is visual only
      expect(screen.getByText('active')).toBeTruthy()
    })

    it('shows "connected" status badge when printer connected', async () => {
      await renderAndWait()
      expect(screen.getAllByText('connected').length).toBeGreaterThanOrEqual(1)
    })

    it('shows scanner description from API', async () => {
      await renderAndWait()
      expect(screen.getByText('USB HID Scanner - Working')).toBeTruthy()
    })

    it('shows database latency when connected', async () => {
      await renderAndWait()
      expect(screen.getByText('Latency: 5ms')).toBeTruthy()
    })

    it('shows "Test Open" button when cash drawer is ready', async () => {
      await renderAndWait()
      expect(screen.getByText('Test Open')).toBeTruthy()
    })

    it('shows Notes section by default (showDetails=true)', async () => {
      await renderAndWait()
      expect(screen.getByText('Notes')).toBeTruthy()
    })

    it('hides Notes section when showDetails=false', async () => {
      await renderAndWait({ showDetails: false })
      expect(screen.queryByText('Notes')).toBeNull()
    })

    it('clicking Refresh re-checks hardware', async () => {
      const api = makeElectronAPI()
      ;(window as any).electronAPI = api
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Refresh')) })
      expect(api.checkBarcodeScanner).toHaveBeenCalledTimes(2)
    })

    it('clicking Test Open calls openCashDrawer', async () => {
      const api = makeElectronAPI()
      ;(window as any).electronAPI = api
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Test Open')) })
      expect(api.openCashDrawer).toHaveBeenCalledTimes(1)
    })

    it('shows success toast when cash drawer opens', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Test Open')) })
      expect(mockShowToast).toHaveBeenCalledWith('Cash drawer opened successfully', 'success')
    })

    it('shows error toast when cash drawer fails to open', async () => {
      ;(window as any).electronAPI = makeElectronAPI({
        openCashDrawer: vi.fn().mockResolvedValue({ success: false }),
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Test Open')) })
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to open cash drawer'),
        'error'
      )
    })
  })

  // ── Status when devices offline ───────────────────────────────────────────

  describe('Disconnected status', () => {
    beforeEach(() => {
      ;(window as any).electronAPI = makeElectronAPI({
        checkBarcodeScanner: vi.fn().mockResolvedValue({ active: false, description: 'No scanner detected' }),
        checkPrinter: vi.fn().mockResolvedValue({ connected: false, description: 'No printer found' }),
        checkDatabase: vi.fn().mockResolvedValue({ connected: false, description: 'DB error' }),
      })
    })

    it('shows "inactive" badge for scanner', async () => {
      await renderAndWait()
      expect(screen.getByText('inactive')).toBeTruthy()
    })

    it('shows "not found" badge for printer', async () => {
      await renderAndWait()
      expect(screen.getByText('not found')).toBeTruthy()
    })

    it('shows "error" badge for database', async () => {
      await renderAndWait()
      expect(screen.getByText('error')).toBeTruthy()
    })

    it('does not show Test Open when drawer not ready', async () => {
      await renderAndWait()
      expect(screen.queryByText('Test Open')).toBeNull()
    })
  })

  // ── Compact view ──────────────────────────────────────────────────────────

  describe('Compact View', () => {
    it('renders compact status bar (no Hardware Status heading)', async () => {
      await renderAndWait({ compact: true })
      expect(screen.queryByText('Hardware Status')).toBeNull()
    })

    it('compact view has a refresh button', async () => {
      await renderAndWait({ compact: true })
      // The compact refresh button has title="Refresh hardware status"
      const btn = document.querySelector('button[title="Refresh hardware status"]')
      expect(btn).toBeTruthy()
    })

    it('compact still calls hardware checks on mount', async () => {
      const api = makeElectronAPI()
      ;(window as any).electronAPI = api
      await renderAndWait({ compact: true })
      expect(api.checkBarcodeScanner).toHaveBeenCalled()
    })
  })
})
