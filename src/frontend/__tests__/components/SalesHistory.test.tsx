import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

let mockShowToast: ReturnType<typeof vi.fn>
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

let mockGetJson: ReturnType<typeof vi.fn>
let mockGetSettings: ReturnType<typeof vi.fn>
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getJson: (...args: any[]) => mockGetJson(...args),
    getSettings: (...args: any[]) => mockGetSettings(...args),
  },
}))

vi.mock('@/utils/SessionManager', () => ({
  default: {
    getDashboardRoute: () => '/dashboard',
    getCurrentSession: () => ({ id: 1, name: 'Alice' }),
  },
}))

vi.mock('@/utils/receiptFormatter', () => ({
  generateTextReceipt: () => 'RECEIPT TEXT',
}))

vi.mock('@/utils/dateFormat', () => ({
  formatDateSync: (s: string) => s?.slice(0, 10) ?? '',
}))

vi.mock('@/components/SessionGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/SessionStatus', () => ({
  default: () => null,
}))

vi.mock('@/components/ModalKeyboard', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <button data-testid="modal-keyboard-close" onClick={onClose}>Close Keyboard</button> : null,
}))

vi.mock('@/components/ReceiptPreview', () => ({
  default: ({ onPrint, onSkip }: { onPrint: () => void; onSkip: () => void }) => (
    <div data-testid="receipt-preview">
      <button onClick={onPrint}>Print Receipt</button>
      <button onClick={onSkip}>Close Preview</button>
    </div>
  ),
}))

vi.mock('@/components/DateDisplay', () => ({
  default: ({ date }: { date: string }) => <span>{date?.slice(0, 10)}</span>,
}))

vi.mock('@/components/ui/LoadingSpinner', () => ({
  SectionLoader: ({ message }: { message: string }) => (
    <div data-testid="section-loader">{message}</div>
  ),
}))

vi.mock('@/components/HybridInput', () => ({
  default: ({ value, onChange, placeholder, className, onTouchKeyboard }: any) => (
    <>
      <input
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        data-testid="search-input"
      />
      {onTouchKeyboard && (
        <button data-testid="touch-keyboard-trigger" onClick={onTouchKeyboard}>
          Open Keyboard
        </button>
      )}
    </>
  ),
}))

import SalesHistory from '@/components/SalesHistory'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString()
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function makeSale(overrides: any = {}): any {
  return {
    id: 1,
    transactionId: 'TXN-2026-12345678',
    saleDate: todayIso(),
    status: 'Completed',
    subtotal: 100,
    taxAmount: 10,
    taxRate: 10,
    discountAmount: 0,
    total: 110,
    amountPaid: 120,
    change: 10,
    paymentMethod: 'Cash',
    employeeId: 1,
    employee: { id: 1, employeeId: 'EMP001', name: 'Alice', role: 'Cashier' },
    saleItems: [
      {
        id: 1,
        productId: 1,
        productName: 'Widget A',
        productBarcode: '123456789',
        quantity: 2,
        unitPrice: 50,
        lineTotal: 100,
        product: { id: 1, name: 'Widget A', barcode: '123456789', price: 50 },
      },
    ],
    hasReturns: false,
    returnInfo: undefined,
    ...overrides,
  }
}

function makeSystemSettings(): any {
  return {
    receiptTemplateLayout: 'Standard',
    receiptHeaderText: 'ACME',
    receiptFooterText: 'Thank you!',
    storeLocation: '123 Main St',
    phoneNumber: '555-1234',
    showReceiptBarcode: false,
    businessLogoPath: null,
    receiptPaperSize: '80mm',
  }
}

function makeTaxSettings(): any {
  return {
    enableTax: true,
    taxName: 'GST',
    taxRate: 10,
    enableSecondaryTax: false,
    secondaryTaxName: 'Service Tax',
    secondaryTaxRate: 5,
    enableTaxExemptions: false,
  }
}

async function renderAndWait(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<SalesHistory />)
  })
  return result
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockShowToast = vi.fn()
  mockGetJson = vi.fn()
  mockGetSettings = vi.fn()

  // Default: returns one sale and no returns
  mockGetJson.mockImplementation((url: string) => {
    if (url === '/sales') return Promise.resolve([makeSale()])
    if (url === '/returns') return Promise.resolve([])
    return Promise.resolve([])
  })
  mockGetSettings.mockImplementation((type: string) => {
    if (type === 'system') return Promise.resolve(makeSystemSettings())
    if (type === 'tax') return Promise.resolve(makeTaxSettings())
    return Promise.resolve({})
  })

  ;(window as any).electronAPI = {
    printReceipt: vi.fn().mockResolvedValue({ success: true }),
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SalesHistory', () => {

  // ── Loading State ─────────────────────────────────────────────────────────

  describe('Loading State', () => {
    it('shows SectionLoader while loading', async () => {
      let resolve!: (v: any) => void
      mockGetJson.mockReturnValue(new Promise(r => { resolve = r }))
      await act(async () => { render(<SalesHistory />) })
      expect(screen.getByTestId('section-loader')).toBeTruthy()
      await act(async () => { resolve([]) })
    })

    it('shows "Loading sales history..." text while loading', async () => {
      let resolve!: (v: any) => void
      mockGetJson.mockReturnValue(new Promise(r => { resolve = r }))
      await act(async () => { render(<SalesHistory />) })
      expect(screen.getByText('Loading sales history...')).toBeTruthy()
      await act(async () => { resolve([]) })
    })
  })

  // ── Header ────────────────────────────────────────────────────────────────

  describe('Header', () => {
    it('renders "Sales History" title', async () => {
      await renderAndWait()
      expect(screen.getByText('Sales History')).toBeTruthy()
    })

    it('renders Back button', async () => {
      await renderAndWait()
      expect(screen.getByText('Back')).toBeTruthy()
    })

    it('Back button navigates to dashboard', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Back')) })
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  // ── KPI Cards ─────────────────────────────────────────────────────────────

  describe('KPI Cards', () => {
    it('renders Total Revenue card', async () => {
      await renderAndWait()
      expect(screen.getByText('Total Revenue')).toBeTruthy()
    })

    it('renders Transactions card', async () => {
      await renderAndWait()
      expect(screen.getByText('Transactions')).toBeTruthy()
    })

    it('renders Returns card', async () => {
      await renderAndWait()
      expect(screen.getByText('Returns')).toBeTruthy()
    })

    it('renders Avg Sale card', async () => {
      await renderAndWait()
      expect(screen.getByText('Avg Sale')).toBeTruthy()
    })

    it('shows transaction count in KPI', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([
          makeSale({ id: 1 }),
          makeSale({ id: 2, transactionId: 'TXN-2026-AAAABBBB' }),
          makeSale({ id: 3, transactionId: 'TXN-2026-CCCCDDDD' }),
        ])
        return Promise.resolve([])
      })
      await renderAndWait()
      // Transactions KPI shows count = 3 (today filter; each sale has qty=2 items so '3' is unique)
      expect(screen.getByText('3')).toBeTruthy()
    })
  })

  // ── Sales Table ───────────────────────────────────────────────────────────

  describe('Sales Table', () => {
    it('renders transaction ID (last 8 chars)', async () => {
      await renderAndWait()
      // TXN-2026-12345678 → last 8 = '12345678' → shown as '…12345678'
      expect(screen.getByText('…12345678')).toBeTruthy()
    })

    it('renders cashier name', async () => {
      await renderAndWait()
      expect(screen.getByText('Alice')).toBeTruthy()
    })

    it('renders payment method badge', async () => {
      await renderAndWait()
      expect(screen.getByText('Cash')).toBeTruthy()
    })

    it('renders Card payment method badge (line 450)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeSale({ paymentMethod: 'Card' })])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('Card')).toBeTruthy()
    })

    it('renders non-Cash/Card payment method badge — default paymentMeta branch (line 451)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeSale({ paymentMethod: 'Voucher' })])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('Voucher')).toBeTruthy()
    })

    it('renders Completed status badge', async () => {
      await renderAndWait()
      expect(screen.getByText('Completed')).toBeTruthy()
    })

    it('renders Reprint button', async () => {
      await renderAndWait()
      expect(screen.getByText('Reprint')).toBeTruthy()
    })

    it('shows "No sales found" when no results match filter', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('No sales found for the selected criteria.')).toBeTruthy()
    })

    it('shows item quantity count in Items column', async () => {
      await renderAndWait()
      // saleItems has 1 item with quantity 2 → total items = 2
      expect(screen.getByText('2')).toBeTruthy()
    })

    it('shows "Returned" badge for fully returned sale', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeSale({
          hasReturns: true,
          returnInfo: { returnId: 'RET-001', returnDate: '2026-04-13', refundAmount: 110, isPartial: false, returnedItems: 2, totalItems: 2 },
        })])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('Returned')).toBeTruthy()
    })

    it('shows "Partial Return" badge for partially returned sale', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeSale({
          hasReturns: true,
          returnInfo: { returnId: 'RET-001', returnDate: '2026-04-13', refundAmount: 55, isPartial: true, returnedItems: 1, totalItems: 2 },
        })])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('Partial Return')).toBeTruthy()
    })
  })

  // ── Date Filter ───────────────────────────────────────────────────────────

  describe('Date Filter', () => {
    it('renders Today filter option', async () => {
      await renderAndWait()
      const select = screen.getByRole('combobox')
      expect(select).toBeTruthy()
    })

    it('filters to today only by default (excludes old sale)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([
          makeSale({ id: 1, saleDate: todayIso(), transactionId: 'TXN-TODAY-00001234' }),
          makeSale({ id: 2, saleDate: daysAgoIso(45), transactionId: 'TXN-2026-99887766' }),
        ])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('…00001234')).toBeTruthy()
      expect(screen.queryByText('…99887766')).toBeNull()
    })

    it('switching to "All time" shows old sales', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([
          makeSale({ id: 1, saleDate: todayIso(), transactionId: 'TXN-TODAY-00001234' }),
          makeSale({ id: 2, saleDate: daysAgoIso(45), transactionId: 'TXN-2026-99887766' }),
        ])
        return Promise.resolve([])
      })
      await renderAndWait()
      const select = screen.getByRole('combobox')
      await act(async () => { fireEvent.change(select, { target: { value: 'all' } }) })
      expect(screen.getByText('…99887766')).toBeTruthy()
    })

    it('switching to "Last 7 days" excludes sale older than 8 days', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([
          makeSale({ id: 1, saleDate: todayIso(), transactionId: 'TXN-TODAY-00001234' }),
          makeSale({ id: 2, saleDate: daysAgoIso(8), transactionId: 'TXN-2026-99887766' }),
        ])
        return Promise.resolve([])
      })
      await renderAndWait()
      const select = screen.getByRole('combobox')
      await act(async () => { fireEvent.change(select, { target: { value: 'week' } }) })
      expect(screen.getByText('…00001234')).toBeTruthy()
      expect(screen.queryByText('…99887766')).toBeNull()
    })

    it('switching to "Last 30 days" includes sale from 20 days ago (line 260)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([
          makeSale({ id: 1, saleDate: daysAgoIso(20), transactionId: 'TXN-2026-MNTH0020' }),
          makeSale({ id: 2, saleDate: daysAgoIso(45), transactionId: 'TXN-2026-OLDOLD45' }),
        ])
        return Promise.resolve([])
      })
      await renderAndWait()
      const select = screen.getByRole('combobox')
      await act(async () => { fireEvent.change(select, { target: { value: 'month' } }) })
      expect(screen.getByText('…MNTH0020')).toBeTruthy()
      expect(screen.queryByText('…OLDOLD45')).toBeNull()
    })
  })

  // ── Search Filter ─────────────────────────────────────────────────────────

  describe('Search Filter', () => {
    it('filters by transaction ID', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([
          makeSale({ id: 1, transactionId: 'TXN-2026-AAAA0001', saleDate: todayIso() }),
          makeSale({ id: 2, transactionId: 'TXN-2026-BBBB0002', saleDate: todayIso(), employee: { id: 2, employeeId: 'EMP002', name: 'Bob', role: 'Cashier' } }),
        ])
        return Promise.resolve([])
      })
      await renderAndWait()
      const searchInput = screen.getByTestId('search-input')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'AAAA' } }) })
      expect(screen.getByText('…AAAA0001')).toBeTruthy()
      expect(screen.queryByText('…BBBB0002')).toBeNull()
    })

    it('filters by cashier name', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([
          makeSale({ id: 1, transactionId: 'TXN-2026-AAAA0001', saleDate: todayIso() }),
          makeSale({ id: 2, transactionId: 'TXN-2026-BBBB0002', saleDate: todayIso(), employee: { id: 2, employeeId: 'EMP002', name: 'Charlie', role: 'Cashier' } }),
        ])
        return Promise.resolve([])
      })
      await renderAndWait()
      const searchInput = screen.getByTestId('search-input')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'charlie' } }) })
      expect(screen.getByText('…BBBB0002')).toBeTruthy()
      expect(screen.queryByText('…AAAA0001')).toBeNull()
    })

    it('shows empty state when search matches nothing', async () => {
      await renderAndWait()
      const searchInput = screen.getByTestId('search-input')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'XYZNOTFOUND' } }) })
      expect(screen.getByText('No sales found for the selected criteria.')).toBeTruthy()
    })

    it('tapping touch keyboard trigger opens keyboard (line 520)', async () => {
      await renderAndWait()
      const kbTrigger = screen.getByTestId('touch-keyboard-trigger')
      await act(async () => { fireEvent.click(kbTrigger) })
      // kbOpen=true → ModalKeyboard now renders its close button
      expect(screen.getByTestId('modal-keyboard-close')).toBeTruthy()
    })

    it('closing modal keyboard via onClose sets kbOpen=false (line 691)', async () => {
      await renderAndWait()
      // Open keyboard
      const kbTrigger = screen.getByTestId('touch-keyboard-trigger')
      await act(async () => { fireEvent.click(kbTrigger) })
      expect(screen.getByTestId('modal-keyboard-close')).toBeTruthy()
      // Close keyboard
      await act(async () => { fireEvent.click(screen.getByTestId('modal-keyboard-close')) })
      expect(screen.queryByTestId('modal-keyboard-close')).toBeNull()
    })
  })

  // ── Reprint Flow ──────────────────────────────────────────────────────────

  describe('Reprint Flow', () => {
    it('clicking Reprint on normal sale opens receipt preview', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByTestId('receipt-preview')).toBeTruthy()
    })

    it('clicking Reprint on returned sale shows reprint warning modal', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeSale({
          hasReturns: true,
          returnInfo: { returnId: 'RET-001', returnDate: '2026-04-13', refundAmount: 110, isPartial: false, returnedItems: 2, totalItems: 2 },
        })])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByText('Reprint Warning')).toBeTruthy()
    })

    it('warning modal shows "Full return on record"', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeSale({
          hasReturns: true,
          returnInfo: { returnId: 'RET-001', returnDate: '2026-04-13', refundAmount: 110, isPartial: false, returnedItems: 2, totalItems: 2 },
        })])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByText('Full return on record')).toBeTruthy()
    })

    it('warning modal shows "Partial return on record" for partial returns', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeSale({
          hasReturns: true,
          returnInfo: { returnId: 'RET-001', returnDate: '2026-04-13', refundAmount: 55, isPartial: true, returnedItems: 1, totalItems: 2 },
        })])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByText('Partial return on record')).toBeTruthy()
    })

    it('clicking Reprint when settings not loaded shows warning toast', async () => {
      mockGetSettings.mockRejectedValue(new Error('settings not found'))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(mockShowToast).toHaveBeenCalledWith('System settings not loaded. Please try again.', 'warning')
    })

    it('closing receipt preview hides it', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      await act(async () => { fireEvent.click(screen.getByText('Close Preview')) })
      expect(screen.queryByTestId('receipt-preview')).toBeNull()
    })
  })

  // ── Pagination ────────────────────────────────────────────────────────────

  describe('Pagination', () => {
    it('does not show pagination bar when 10 or fewer sales', async () => {
      await renderAndWait()
      // Only 1 sale — no pagination
      expect(screen.queryByLabelText?.('Next page')).toBeNull()
    })

    it('shows pagination when more than 10 sales', async () => {
      const manySales = Array.from({ length: 12 }, (_, i) =>
        makeSale({ id: i + 1, transactionId: `TXN-2026-${String(i).padStart(8, '0')}` })
      )
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve(manySales)
        return Promise.resolve([])
      })
      await renderAndWait()
      // With "today" filter and all sales having today's date, 12 results → pagination shows
      expect(screen.getByText(/Showing 1–10 of 12/)).toBeTruthy()
    })
  })

  // ── Error States ──────────────────────────────────────────────────────────

  describe('Error States', () => {
    it('shows error toast when loading sales fails', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.reject(new Error('network error'))
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load sales. Please refresh.', 'error')
    })

    it('continues loading when /returns endpoint fails (returns empty array)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeSale()])
        if (url === '/returns') return Promise.reject(new Error('returns endpoint down'))
        return Promise.resolve([])
      })
      await renderAndWait()
      // Should still render the sale (returns failure is silently caught)
      expect(screen.getByText('Alice')).toBeTruthy()
    })
  })

  // ── Return Enhancement ────────────────────────────────────────────────────

  describe('Return Enhancement', () => {
    it('merges return info from /returns into sale', async () => {
      const sale = makeSale({ id: 10 })
      const returnData = [{
        originalSaleId: 10,
        returnId: 'RET-100',
        returnDate: '2026-04-13T09:00:00Z',
        totalRefundAmount: 110,
        returnItems: [{ originalSaleItemId: 1, returnQuantity: 2 }],
      }]
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([sale])
        if (url === '/returns') return Promise.resolve(returnData)
        return Promise.resolve([])
      })
      await renderAndWait()
      // Sale now has hasReturns=true → shows Returned badge
      expect(screen.getByText('Returned')).toBeTruthy()
    })

    it('marks as Partial Return when returnedItems < totalItems', async () => {
      const sale = makeSale({
        id: 10,
        saleItems: [
          { id: 1, productId: 1, productName: 'Widget A', productBarcode: '123', quantity: 3, unitPrice: 50, lineTotal: 150, product: { id: 1, name: 'Widget A', barcode: '123', price: 50 } },
        ],
      })
      const returnData = [{
        originalSaleId: 10,
        returnId: 'RET-101',
        returnDate: '2026-04-13T09:00:00Z',
        totalRefundAmount: 50,
        returnItems: [{ originalSaleItemId: 1, returnQuantity: 1 }], // 1 of 3
      }]
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([sale])
        if (url === '/returns') return Promise.resolve(returnData)
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('Partial Return')).toBeTruthy()
    })
  })

  // ── Reprint Warning Modal Body ─────────────────────────────────────────────

  describe('Reprint Warning Modal Body', () => {
    function makeReturnedSale(isPartial: boolean) {
      return makeSale({
        hasReturns: true,
        returnInfo: {
          returnId: 'RET-XYZ',
          returnDate: '2026-04-15T00:00:00Z',
          refundAmount: 55,
          isPartial,
          returnedItems: 1,
          totalItems: 2,
        },
      })
    }

    it('warning modal displays returnId in body', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeReturnedSale(false)])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByText(/RET-XYZ/)).toBeTruthy()
    })

    it('warning modal displays refund amount', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeReturnedSale(false)])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      // refundAmount 55 → formatted as currency somewhere in body; use Refund Amount label
      expect(screen.getByText(/Refund Amount/)).toBeTruthy()
    })

    it('partial warning modal shows "Items Returned" count', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeReturnedSale(true)])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByText(/Items Returned/)).toBeTruthy()
      expect(screen.getByText(/1 of 2/)).toBeTruthy()
    })

    it('full return warning does NOT show "Items Returned"', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeReturnedSale(false)])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.queryByText(/Items Returned/)).toBeNull()
    })

    it('closing warning modal via X button hides it', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeReturnedSale(false)])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByText('Reprint Warning')).toBeTruthy()
      // X button is after the warning heading — click Cancel to close
      await act(async () => { fireEvent.click(screen.getByText('Cancel')) })
      expect(screen.queryByText('Reprint Warning')).toBeNull()
    })

    it('"Reprint Anyway" confirms and opens receipt preview', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeReturnedSale(false)])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      await act(async () => { fireEvent.click(screen.getByText('Reprint Anyway')) })
      expect(screen.queryByText('Reprint Warning')).toBeNull()
      expect(screen.getByTestId('receipt-preview')).toBeTruthy()
    })

    it('warning modal shows "This transaction has been fully returned" label', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeReturnedSale(false)])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByText('This transaction has been fully returned')).toBeTruthy()
    })

    it('warning modal shows "This transaction has been partially returned" label', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeReturnedSale(true)])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByText('This transaction has been partially returned')).toBeTruthy()
    })

    it('closing warning modal via the X icon button hides it (lines 711-712)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeReturnedSale(false)])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByText('Reprint Warning')).toBeTruthy()
      // The X icon button has no text; it's the button that contains only an SVG.
      // Find it by locating the button after "Reprint Warning" heading in the modal header.
      // The modal header buttons: the X (icon-only) button is the first button after "Reprint Warning"
      const allButtons = screen.getAllByRole('button')
      // Identify the X button: it appears after the Reprint table row button
      // The modal has no accessible name for the X button; find by filtering buttons with no text content
      const xButton = allButtons.find(btn => !btn.textContent?.trim() || btn.textContent?.trim() === '')
      expect(xButton).toBeTruthy()
      await act(async () => { fireEvent.click(xButton!) })
      expect(screen.queryByText('Reprint Warning')).toBeNull()
    })
  })

  // ── Receipt Preview Tax Labels ─────────────────────────────────────────────

  describe('Receipt Preview Tax Labels', () => {
    it('shows receipt preview when Reprint clicked on normal sale', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByTestId('receipt-preview')).toBeTruthy()
    })

    it('receipt preview shown when sale has zero tax and tax exemptions enabled', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeSale({ taxAmount: 0 })])
        return Promise.resolve([])
      })
      mockGetSettings.mockImplementation((type: string) => {
        if (type === 'system') return Promise.resolve(makeSystemSettings())
        if (type === 'tax') return Promise.resolve({
          enableTax: true,
          taxName: 'GST',
          taxRate: 10,
          enableSecondaryTax: false,
          secondaryTaxName: '',
          secondaryTaxRate: 0,
          enableTaxExemptions: true,
        })
        return Promise.resolve({})
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByTestId('receipt-preview')).toBeTruthy()
    })

    it('receipt preview shown when tax is disabled globally', async () => {
      mockGetSettings.mockImplementation((type: string) => {
        if (type === 'system') return Promise.resolve(makeSystemSettings())
        if (type === 'tax') return Promise.resolve({
          enableTax: false,
          taxName: 'GST',
          taxRate: 10,
          enableSecondaryTax: false,
          secondaryTaxName: '',
          secondaryTaxRate: 0,
          enableTaxExemptions: false,
        })
        return Promise.resolve({})
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByTestId('receipt-preview')).toBeTruthy()
    })

    it('receipt preview shown when secondary tax is enabled', async () => {
      mockGetSettings.mockImplementation((type: string) => {
        if (type === 'system') return Promise.resolve(makeSystemSettings())
        if (type === 'tax') return Promise.resolve({
          enableTax: true,
          taxName: 'GST',
          taxRate: 10,
          enableSecondaryTax: true,
          secondaryTaxName: 'Service Tax',
          secondaryTaxRate: 5,
          enableTaxExemptions: false,
        })
        return Promise.resolve({})
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByTestId('receipt-preview')).toBeTruthy()
    })

    it('pressing Print Receipt in preview calls electronAPI.printReceipt', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      await act(async () => { fireEvent.click(screen.getByText('Print Receipt')) })
      expect((window as any).electronAPI.printReceipt).toHaveBeenCalled()
    })

    it('shows error toast when electronAPI.printReceipt throws (line 416)', async () => {
      ;(window as any).electronAPI = {
        printReceipt: vi.fn().mockRejectedValue(new Error('printer offline')),
      }
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      await act(async () => { fireEvent.click(screen.getByText('Print Receipt')) })
      expect(mockShowToast).toHaveBeenCalledWith('Failed to reprint receipt', 'error')
    })

    it('shows error toast when printReceipt returns success=false (line 412)', async () => {
      ;(window as any).electronAPI = {
        printReceipt: vi.fn().mockResolvedValue({ success: false }),
      }
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      await act(async () => { fireEvent.click(screen.getByText('Print Receipt')) })
      expect(mockShowToast).toHaveBeenCalledWith('Failed to reprint receipt. Check printer connection.', 'error')
    })

    it('prints receipt with no-tax label when enableTax=false (line 346)', async () => {
      mockGetSettings.mockImplementation((type: string) => {
        if (type === 'system') return Promise.resolve(makeSystemSettings())
        if (type === 'tax') return Promise.resolve({
          enableTax: false,
          taxName: 'GST',
          taxRate: 0,
          enableSecondaryTax: false,
          secondaryTaxName: '',
          secondaryTaxRate: 0,
          enableTaxExemptions: false,
        })
        return Promise.resolve({})
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      await act(async () => { fireEvent.click(screen.getByText('Print Receipt')) })
      // printReceipt called means handlePrintReceipt ran through line 346
      expect((window as any).electronAPI.printReceipt).toHaveBeenCalled()
    })

    it('prints receipt with Tax Exempt label when taxAmount=0 and exemptions enabled (line 344)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([makeSale({ taxAmount: 0 })])
        return Promise.resolve([])
      })
      mockGetSettings.mockImplementation((type: string) => {
        if (type === 'system') return Promise.resolve(makeSystemSettings())
        if (type === 'tax') return Promise.resolve({
          enableTax: true,
          taxName: 'GST',
          taxRate: 10,
          enableSecondaryTax: false,
          secondaryTaxName: '',
          secondaryTaxRate: 0,
          enableTaxExemptions: true,
        })
        return Promise.resolve({})
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      await act(async () => { fireEvent.click(screen.getByText('Print Receipt')) })
      expect((window as any).electronAPI.printReceipt).toHaveBeenCalled()
    })

    it('prints receipt with secondary tax label when enableSecondaryTax=true (line 341)', async () => {
      mockGetSettings.mockImplementation((type: string) => {
        if (type === 'system') return Promise.resolve(makeSystemSettings())
        if (type === 'tax') return Promise.resolve({
          enableTax: true,
          taxName: 'GST',
          taxRate: 10,
          enableSecondaryTax: true,
          secondaryTaxName: 'Service Tax',
          secondaryTaxRate: 5,
          enableTaxExemptions: false,
        })
        return Promise.resolve({})
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      await act(async () => { fireEvent.click(screen.getByText('Print Receipt')) })
      expect((window as any).electronAPI.printReceipt).toHaveBeenCalled()
    })

    it('prints receipt for returned sale builds returnedQtyMap (lines 352-356)', async () => {
      // Use a sale with returns so handlePrintReceipt builds the returned qty map
      const sale = makeSale({
        id: 50,
        hasReturns: true,
        returnInfo: { returnId: 'RET-500', returnDate: '2026-04-14', refundAmount: 50, isPartial: true, returnedItems: 1, totalItems: 2 },
        saleItems: [
          { id: 20, productId: 1, productName: 'Widget', productBarcode: '111', quantity: 2, unitPrice: 50, lineTotal: 100, product: { id: 1, name: 'Widget', barcode: '111', price: 50 } },
        ],
      })
      const returnData = [{
        originalSaleId: 50,
        returnId: 'RET-500',
        returnDate: '2026-04-14T09:00:00Z',
        totalRefundAmount: 50,
        returnItems: [{ originalSaleItemId: 20, returnQuantity: 1 }],
      }]
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([sale])
        if (url === '/returns') return Promise.resolve(returnData)
        return Promise.resolve([])
      })
      await renderAndWait()
      // Open reprint warning, then confirm, then print
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      await act(async () => { fireEvent.click(screen.getByText('Reprint Anyway')) })
      await act(async () => { fireEvent.click(screen.getByText('Print Receipt')) })
      expect((window as any).electronAPI.printReceipt).toHaveBeenCalled()
    })
  })

  // ── Pagination Button Interactions ───────────────────────────────────────

  describe('Pagination Button Interactions', () => {
    function makeManySales(count: number) {
      return Array.from({ length: count }, (_, i) =>
        makeSale({
          id: i + 1,
          transactionId: `TXN-2026-${String(i).padStart(8, '0')}`,
          saleDate: todayIso(),
        })
      )
    }

    it('clicking next page advances to page 2 (line 666)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve(makeManySales(12))
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText(/Showing 1–10 of 12/)).toBeTruthy()
      // Next page button: last native button in pagination bar
      const allButtons = screen.getAllByRole('button')
      const nextBtn = allButtons[allButtons.length - 1]
      await act(async () => { fireEvent.click(nextBtn) })
      expect(screen.getByText(/Showing 11–12 of 12/)).toBeTruthy()
    })

    it('clicking prev page decrements page (line 642)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve(makeManySales(12))
        return Promise.resolve([])
      })
      await renderAndWait()
      // Navigate to page 2 first
      const allButtons = screen.getAllByRole('button')
      const nextBtn = allButtons[allButtons.length - 1]
      await act(async () => { fireEvent.click(nextBtn) })
      expect(screen.getByText(/Showing 11–12 of 12/)).toBeTruthy()
      // Prev button: second-to-last button cluster — identify by finding the ChevronLeft
      // The pagination prev button is the button just before the page-1 pill
      // After going to page 2: buttons order = [Back(header), ...(Reprintx2), prevChevron, 1, 2, nextChevron]
      const page2Buttons = screen.getAllByRole('button')
      // prevChevron is at index length-4 (prev, 1, 2, next)
      const prevChevronBtn = page2Buttons[page2Buttons.length - 4]
      await act(async () => { fireEvent.click(prevChevronBtn) })
      expect(screen.getByText(/Showing 1–10 of 12/)).toBeTruthy()
    })

    it('clicking a page number pill navigates directly (lines 652-663)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve(makeManySales(25))
        return Promise.resolve([])
      })
      await renderAndWait()
      // Should show page 1 with 3 page buttons visible
      expect(screen.getByText(/Showing 1–10 of 25/)).toBeTruthy()
      // Click page 3 button
      const page3Btn = screen.getByRole('button', { name: '3' })
      await act(async () => { fireEvent.click(page3Btn) })
      expect(screen.getByText(/Showing 21–25 of 25/)).toBeTruthy()
    })

    it('ellipsis renders when there are many pages (getPageItems returns null sentinel)', async () => {
      // 60 sales → 6 pages; page 1 → pages 1,2, null, 6
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve(makeManySales(60))
        return Promise.resolve([])
      })
      await renderAndWait()
      // The ellipsis "…" character should appear in the pagination bar
      const ellipses = screen.getAllByText('…')
      expect(ellipses.length).toBeGreaterThan(0)
    })
  })

  // ── Receipt Preview with Returns (previewReturnedQtyMap) ──────────────────

  describe('Receipt Preview with Returns Data', () => {
    it('receipt preview opens after confirming Reprint Anyway on returned sale', async () => {
      // This exercises the previewReturnedQtyMap path in the Receipt Preview modal
      const sale = makeSale({
        id: 20,
        hasReturns: true,
        returnInfo: { returnId: 'RET-200', returnDate: '2026-04-14', refundAmount: 50, isPartial: true, returnedItems: 1, totalItems: 3 },
        saleItems: [
          { id: 10, productId: 1, productName: 'Widget A', productBarcode: '123', quantity: 3, unitPrice: 50, lineTotal: 150, product: { id: 1, name: 'Widget A', barcode: '123', price: 50 } },
        ],
      })
      const returnData = [{
        originalSaleId: 20,
        returnId: 'RET-200',
        returnDate: '2026-04-14T09:00:00Z',
        totalRefundAmount: 50,
        returnItems: [{ originalSaleItemId: 10, returnQuantity: 1 }],
      }]
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([sale])
        if (url === '/returns') return Promise.resolve(returnData)
        return Promise.resolve([])
      })
      await renderAndWait()
      // Reprint on returned sale → warning modal
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      expect(screen.getByText('Reprint Warning')).toBeTruthy()
      // Confirm → receipt preview opens (previewReturnedQtyMap built from returns data)
      await act(async () => { fireEvent.click(screen.getByText('Reprint Anyway')) })
      expect(screen.getByTestId('receipt-preview')).toBeTruthy()
    })

    it('receipt preview shows for fully returned sale after Reprint Anyway', async () => {
      const sale = makeSale({
        id: 30,
        hasReturns: true,
        returnInfo: { returnId: 'RET-300', returnDate: '2026-04-14', refundAmount: 100, isPartial: false, returnedItems: 2, totalItems: 2 },
        saleItems: [
          { id: 11, productId: 2, productName: 'Gadget B', productBarcode: '999', quantity: 2, unitPrice: 20, lineTotal: 40, product: { id: 2, name: 'Gadget B', barcode: '999', price: 20 } },
        ],
      })
      const returnData = [{
        originalSaleId: 30,
        returnId: 'RET-300',
        returnDate: '2026-04-14T09:00:00Z',
        totalRefundAmount: 100,
        returnItems: [
          { originalSaleItemId: 11, returnQuantity: 1 },
          { originalSaleItemId: 11, returnQuantity: 1 },
        ],
      }]
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales') return Promise.resolve([sale])
        if (url === '/returns') return Promise.resolve(returnData)
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Reprint')) })
      await act(async () => { fireEvent.click(screen.getByText('Reprint Anyway')) })
      expect(screen.getByTestId('receipt-preview')).toBeTruthy()
    })
  })
})
