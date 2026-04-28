/**
 * POS.offline.test.tsx
 *
 * Tests the offline sale queuing path in POS.tsx:
 *  - Network TypeError triggers queue
 *  - Error message strings ('network', 'Failed to fetch') trigger queue
 *  - isOnline=false triggers queue even on non-network errors
 *  - Offline transaction data structure is correct (offlineId, idempotencyKey, receiptData)
 *  - Multiple offline sales can be queued independently
 *  - printReceipt is still called when offline (receipt always prints)
 *  - Warning toast always includes the offline transaction ID
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

vi.mock('@/components/SessionGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/SessionStatus', () => ({ default: () => null }))
vi.mock('@/components/ReceiptPreview',  () => ({ default: () => null }))

let _kbOnSubmit: ((v: string) => void) | null = null
vi.mock('@/components/ModalKeyboard', () => ({
  default: ({ open, onSubmit }: any) => {
    _kbOnSubmit = open ? onSubmit : null
    return open ? <div data-testid="modal-keyboard" /> : null
  },
}))

vi.mock('@/components/HybridInput', () => ({
  default: ({ value, onChange, placeholder, onEnter, ...rest }: any) => (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      data-testid={
        placeholder?.includes('amount') || placeholder?.includes('Enter amount')
          ? 'amount-paid-input'
          : 'search-input'
      }
      {...rest}
    />
  ),
}))

const mockShowToast = vi.fn()
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

// Configurable per-test — default to offline
let mockIsOnline = false
const mockRefreshQueueCount = vi.fn()
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => ({ isOnline: mockIsOnline, refreshQueueCount: mockRefreshQueueCount }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

const mockGetJson  = vi.fn()
const mockPostJson = vi.fn()
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getJson:  (...args: any[]) => mockGetJson(...args),
    postJson: (...args: any[]) => mockPostJson(...args),
    online: false,
    setOnline: vi.fn(),
  },
}))

vi.mock('@/utils/SessionManager', () => ({
  default: {
    getCurrentSession: vi.fn(() => ({
      id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier',
    })),
    isSessionValid: vi.fn(() => true),
    getDashboardRoute: vi.fn(() => '/dashboard'),
    extendForBusinessAction: vi.fn(),
    clearSession: vi.fn(),
    hasRole: vi.fn(() => true),
  },
}))

import POS from '@/components/POS'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: any = {}): any {
  return {
    id: 1, barcode: 'TEST-1', name: 'Widget A',
    price: 10.00, cost: 5.00, stockQuantity: 50,
    minStockLevel: 5, unit: 'ea', isActive: true,
    createdDate: '2025-01-01', lastUpdated: '2025-01-01',
    ...overrides,
  }
}

const defaultTaxSettings = {
  enableTax: true, taxName: 'GST', taxRate: 10,
  enableSecondaryTax: false, secondaryTaxName: '', secondaryTaxRate: 0,
  enableTaxExemptions: false, businessName: 'Test Business',
}

const defaultSystemSettings = {
  showReceiptPreview: false,
  printReceiptAutomatically: false,
  defaultPaymentMethod: 'Cash',
  requireManagerApprovalForDiscount: false,
  availablePaymentMethods: 'Cash,Card',
  businessLogoPath: null,
  receiptCopies: 1,
}

let capturedTransactions: any[] = []
const mockQueueTransaction = vi.fn(async (tx: any) => { capturedTransactions.push(tx) })
const mockPrintReceipt = vi.fn(async () => {})

function setupElectronAPI(overrides: any = {}) {
  ;(window as any).electronAPI = {
    saveProductCache: vi.fn(() => Promise.resolve()),
    getProductCache: vi.fn(() => Promise.resolve(null)),
    printReceipt: mockPrintReceipt,
    openCashDrawer: vi.fn(() => Promise.resolve()),
    queueTransaction: mockQueueTransaction,
    validateManagerPin: vi.fn(() => Promise.resolve({ success: true })),
    ...overrides,
  }
}

async function renderPOS(productOverrides: any[] = [makeProduct()]) {
  mockGetJson.mockImplementation((url: string) => {
    if (url === '/products')      return Promise.resolve(productOverrides)
    if (url === '/tax-settings')  return Promise.resolve(defaultTaxSettings)
    if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
    return Promise.reject(new Error(`Unexpected URL: ${url}`))
  })
  setupElectronAPI()
  await act(async () => { render(<POS />) })
}

/** Helper: add product to cart and open the payment modal */
async function addAndOpenPayment() {
  await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
  const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
  await act(async () => { fireEvent.click(card) })
  const payBtn = screen.getByText(/Pay \d/)
  await act(async () => { fireEvent.click(payBtn) })
  const amountInput = screen.getByTestId('amount-paid-input')
  await act(async () => { fireEvent.change(amountInput, { target: { value: '15' } }) })
}

async function completePayment() {
  const btn = screen.getByText('Complete Payment').closest('button') as HTMLButtonElement
  await act(async () => { fireEvent.click(btn) })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POS — Offline Sale Queuing', () => {
  beforeEach(() => {
    mockShowToast.mockClear()
    mockRefreshQueueCount.mockClear()
    mockQueueTransaction.mockClear()
    mockPrintReceipt.mockClear()
    capturedTransactions = []
    mockIsOnline = false
    mockGetJson.mockReset()
    mockPostJson.mockReset()
    _kbOnSubmit = null
  })

  // ── Error detection ──────────────────────────────────────────────────────

  describe('Network error detection', () => {
    it('TypeError ("Failed to fetch") → queues the sale', async () => {
      mockIsOnline = true  // frontend thinks it's online but fetch throws TypeError
      mockPostJson.mockRejectedValue(new TypeError('Failed to fetch'))
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(mockQueueTransaction).toHaveBeenCalled())
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('queued'), 'warning'
      )
    })

    it('Error with "network" in message → queues the sale', async () => {
      mockIsOnline = true
      const err = new Error('Network connection failed')
      mockPostJson.mockRejectedValue(err)
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(mockQueueTransaction).toHaveBeenCalled())
    })

    it('isOnline=false flag alone → queues even on generic API error', async () => {
      mockIsOnline = false
      mockPostJson.mockRejectedValue(new Error('Offline'))
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(mockQueueTransaction).toHaveBeenCalled())
    })

    it('online API error (4xx, not a network error) → shows error toast, does NOT queue', async () => {
      mockIsOnline = true
      const err = new Error('Insufficient stock') as any
      err.status = 422
      mockPostJson.mockRejectedValue(err)
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() =>
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Payment failed'), 'error'
        )
      )
      expect(mockQueueTransaction).not.toHaveBeenCalled()
    })
  })

  // ── Transaction data structure ───────────────────────────────────────────

  describe('Offline transaction data structure', () => {
    beforeEach(() => {
      mockPostJson.mockRejectedValue(new TypeError('Failed to fetch'))
      mockIsOnline = false
    })

    it('offline transaction ID matches TXN-OFFLINE-* format', async () => {
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(capturedTransactions.length).toBeGreaterThan(0))
      expect(capturedTransactions[0].id).toMatch(/^TXN-OFFLINE-\d+-[A-Z0-9]+$/)
    })

    it('offline transaction preserves the original idempotency key', async () => {
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(capturedTransactions.length).toBeGreaterThan(0))
      // The idempotencyKey should be present (generated before the API call)
      expect(capturedTransactions[0].idempotencyKey).toBeTruthy()
    })

    it('offline transaction receiptData contains required fields', async () => {
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(capturedTransactions.length).toBeGreaterThan(0))
      const { receiptData } = capturedTransactions[0]
      expect(receiptData).toBeDefined()
      expect(receiptData.transactionId).toMatch(/^TXN-OFFLINE-/)
      expect(receiptData.subtotal).toBeDefined()
      expect(receiptData.finalTotal).toBeDefined()
      expect(receiptData.paymentMethod).toBeDefined()
      expect(receiptData.cart).toBeDefined()
      expect(receiptData.cashierName).toBeDefined()
      expect(receiptData.saleDate).toBeDefined()
    })

    it('offline transaction receiptData.transactionId matches the top-level id', async () => {
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(capturedTransactions.length).toBeGreaterThan(0))
      const tx = capturedTransactions[0]
      expect(tx.receiptData.transactionId).toBe(tx.id)
    })

    it('offline transaction saleData is present', async () => {
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(capturedTransactions.length).toBeGreaterThan(0))
      expect(capturedTransactions[0].saleData).toBeDefined()
    })
  })

  // ── Multiple sales / UX ──────────────────────────────────────────────────

  describe('Multiple offline sales and UX', () => {
    beforeEach(() => {
      mockPostJson.mockRejectedValue(new TypeError('Failed to fetch'))
      mockIsOnline = false
    })

    it('two successive offline sales each get unique transaction IDs', async () => {
      await renderPOS()

      // First sale
      await addAndOpenPayment()
      await completePayment()
      await waitFor(() => expect(capturedTransactions.length).toBe(1))

      // Second sale
      await addAndOpenPayment()
      await completePayment()
      await waitFor(() => expect(capturedTransactions.length).toBe(2))

      expect(capturedTransactions[0].id).not.toBe(capturedTransactions[1].id)
    })

    it('refreshQueueCount is called after queuing so the banner updates', async () => {
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(mockRefreshQueueCount).toHaveBeenCalled())
    })

    it('warning toast includes the offline transaction ID', async () => {
      await renderPOS()
      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(capturedTransactions.length).toBeGreaterThan(0))
      const offlineId = capturedTransactions[0].id
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining(offlineId), 'warning'
      )
    })
  })

  // ── Receipt still prints when offline ───────────────────────────────────

  describe('Receipt printing when offline', () => {
    it('printReceipt is called even for offline-queued sales', async () => {
      mockPostJson.mockRejectedValue(new TypeError('Failed to fetch'))
      mockIsOnline = false
      // Auto-print enabled
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products')      return Promise.resolve([makeProduct()])
        if (url === '/tax-settings')  return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve({
          ...defaultSystemSettings, printReceiptAutomatically: true,
        })
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })
      setupElectronAPI()
      await act(async () => { render(<POS />) })

      await addAndOpenPayment()
      await completePayment()

      await waitFor(() => expect(mockQueueTransaction).toHaveBeenCalled())
      expect(mockPrintReceipt).toHaveBeenCalled()
    })
  })
})
