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
vi.mock('@/components/DateDisplay', () => ({ default: ({ date }: { date: string }) => <span>{date}</span> }))
vi.mock('@/components/ui/LoadingSpinner', () => ({
  SectionLoader: ({ message }: { message: string }) => <div data-testid="section-loader">{message}</div>,
}))

vi.mock('@/components/HybridInput', () => ({
  default: ({ value, onChange, placeholder, onEnter, className, ...rest }: any) => (
    <input
      value={value}
      placeholder={placeholder}
      className={className}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      // Distinguish search input (has barcode/last 8 placeholder) from qty inputs (no placeholder)
      data-testid={placeholder ? 'transaction-search-input' : 'qty-input'}
      {...rest}
    />
  ),
}))

vi.mock('@/components/ModalKeyboard', () => ({
  default: () => null,
}))

const mockShowToast = vi.fn()
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

const mockRefreshReturnQueueCount = vi.fn()
let mockIsOnline = true
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => ({ isOnline: mockIsOnline, refreshReturnQueueCount: mockRefreshReturnQueueCount }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockGetJson = vi.fn()
const mockGetSettings = vi.fn()
const mockPostJson = vi.fn()
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getJson: (...args: any[]) => mockGetJson(...args),
    getSettings: (...args: any[]) => mockGetSettings(...args),
    postJson: (...args: any[]) => mockPostJson(...args),
    online: true,
    setOnline: vi.fn(),
  },
}))

const mockGetCurrentSession = vi.fn()
const mockIsSessionValid = vi.fn()
const mockGetDashboardRoute = vi.fn()
vi.mock('@/utils/SessionManager', () => ({
  default: {
    getCurrentSession: (...args: any[]) => mockGetCurrentSession(...args),
    isSessionValid: (...args: any[]) => mockIsSessionValid(...args),
    getDashboardRoute: (...args: any[]) => mockGetDashboardRoute(...args),
    clearSession: vi.fn(),
    hasRole: vi.fn(() => true),
  },
}))

vi.mock('@/utils/dateFormat', () => ({
  formatDateSync: (d: Date) => d.toLocaleDateString(),
}))

import Returns from '@/components/Returns'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const defaultSystemSettings = {
  enableReturns: true,
  requireManagerApprovalForReturns: false,
  restockReturnedItems: true,
  allowDefectiveItemReturns: true,
  returnTimeLimitDays: 30,
  returnManagerApprovalAmount: 0,
  returnReasons: 'Defective,Wrong item,Changed mind',
}

function makeSale(overrides: Partial<any> = {}): any {
  return {
    id: 100,
    transactionId: 'TXN-2025-12345678',
    saleDate: new Date().toISOString(),
    status: 'completed',
    subtotal: 20.00,
    taxAmount: 2.00,
    taxRate: 10,
    discountAmount: 0,
    total: 22.00,
    amountPaid: 22.00,
    change: 0,
    paymentMethod: 'Cash',
    employeeId: 1,
    employee: { id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' },
    saleItems: [
      {
        id: 1,
        productId: 1,
        productName: 'Widget A',
        productBarcode: 'BAR001',
        quantity: 2,
        unitPrice: 10.00,
        lineTotal: 20.00,
        returnedQuantity: 0,
        product: { id: 1, name: 'Widget A', barcode: 'BAR001', price: 10.00 },
      },
    ],
    ...overrides,
  }
}

function setupElectronAPI(overrides: any = {}) {
  ;(window as any).electronAPI = {
    printReceipt: vi.fn(() => Promise.resolve({ success: true })),
    queueReturn: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
}

async function renderReturns() {
  mockIsSessionValid.mockReturnValue(true)
  mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
  mockGetDashboardRoute.mockReturnValue('/dashboard')
  mockGetSettings.mockResolvedValue(defaultSystemSettings)
  setupElectronAPI()

  await act(async () => { render(<Returns />) })
  // Wait for initial settings load
  await waitFor(() => expect(screen.queryByTestId('section-loader')).toBeNull())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Returns', () => {
  beforeEach(() => {
    mockShowToast.mockClear()
    mockNavigate.mockClear()
    mockGetJson.mockReset()
    mockGetSettings.mockReset()
    mockPostJson.mockReset()
    mockRefreshReturnQueueCount.mockClear()
    mockIsOnline = true
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('shows loading spinner initially', async () => {
      let resolveSettings!: (v: any) => void
      mockGetSettings.mockReturnValue(new Promise(r => { resolveSettings = r }))
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      render(<Returns />)
      expect(screen.getByTestId('section-loader')).toBeTruthy()
      await act(async () => { resolveSettings(defaultSystemSettings) })
    })

    it('shows "Returns & Refunds" header', async () => {
      await renderReturns()
      expect(screen.getByText('Returns & Refunds')).toBeTruthy()
    })

    it('shows "Find Transaction" step when returns enabled', async () => {
      await renderReturns()
      expect(screen.getByText('Find Transaction')).toBeTruthy()
    })

    it('shows disabled message when returns are disabled', async () => {
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      mockGetSettings.mockResolvedValue({ ...defaultSystemSettings, enableReturns: false })
      setupElectronAPI()
      await act(async () => { render(<Returns />) })
      await waitFor(() => expect(screen.getByText('Returns System Disabled')).toBeTruthy())
    })

    it('toasts warning when returns are disabled on load', async () => {
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      mockGetSettings.mockResolvedValue({ ...defaultSystemSettings, enableReturns: false })
      setupElectronAPI()
      await act(async () => { render(<Returns />) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('disabled'),
        'warning'
      ))
    })

    it('shows settings load error toast on failure', async () => {
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      mockGetSettings.mockRejectedValue(new Error('network'))
      setupElectronAPI()
      await act(async () => { render(<Returns />) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load'),
        'error'
      ))
    })
  })

  // ── Transaction Search ────────────────────────────────────────────────────

  describe('Transaction Search', () => {
    it('warns when searching with empty transaction ID', async () => {
      await renderReturns()
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      // Button is disabled when empty (searchTransactionId is empty)
      expect(findBtn.disabled).toBe(true)
    })

    it('Find Transaction button enabled when input has value', async () => {
      await renderReturns()
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      expect(findBtn.disabled).toBe(false)
    })

    it('shows error when transaction not found', async () => {
      await renderReturns()
      mockGetJson.mockRejectedValue(new Error('404'))
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(findBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
        'error'
      ))
    })

    it('shows transaction details after successful search', async () => {
      await renderReturns()
      const sale = makeSale()
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        if (url.includes('/returns')) return Promise.resolve([])
        return Promise.reject(new Error('unexpected'))
      })
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(findBtn) })
      await waitFor(() => expect(screen.getByText('Original Transaction Details')).toBeTruthy())
    })

    it('shows sale items after successful search', async () => {
      await renderReturns()
      const sale = makeSale()
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        if (url.includes('/returns')) return Promise.resolve([])
        return Promise.reject(new Error('unexpected'))
      })
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(findBtn) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
    })

    it('shows warning when return time limit exceeded', async () => {
      await renderReturns()
      // Create a sale that's 60 days old (exceeds 30-day limit)
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 60)
      const sale = makeSale({ saleDate: oldDate.toISOString() })
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        return Promise.resolve([])
      })
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(findBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Return window expired'),
        'warning'
      ))
    })

    it('shows info toast when transaction partially returned', async () => {
      await renderReturns()
      const sale = makeSale()
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        if (url.includes('/returns')) return Promise.resolve([
          { returnItems: [{ originalSaleItemId: 1, returnQuantity: 1 }] },
        ])
        return Promise.reject(new Error('unexpected'))
      })
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(findBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('partially returned'),
        'info'
      ))
    })

    it('shows info toast and clears when transaction fully returned', async () => {
      await renderReturns()
      const sale = makeSale() // sale has 2 qty of item id=1
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        if (url.includes('/returns')) return Promise.resolve([
          { returnItems: [{ originalSaleItemId: 1, returnQuantity: 2 }] },
        ])
        return Promise.reject(new Error('unexpected'))
      })
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(findBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('fully returned'),
        'info'
      ))
      // Sale details should NOT be shown
      expect(screen.queryByText('Original Transaction Details')).toBeNull()
    })
  })

  // ── Return Processing ─────────────────────────────────────────────────────

  describe('Return Processing', () => {
    async function findAndLoadSale() {
      const sale = makeSale()
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        if (url.includes('/returns')) return Promise.resolve([])
        return Promise.reject(new Error('unexpected'))
      })
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(findBtn) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      return sale
    }

    it('Process Return button is hidden when no return qty set', async () => {
      // The button is wrapped in {returnTotal > 0 && (...)} — hidden when all qtys are 0
      await renderReturns()
      await findAndLoadSale()
      // All qty inputs start at 0, so returnTotal=0 and button is absent
      expect(screen.queryByText(/Process Return/)).toBeNull()
    })

    it('warns when item has no return reason', async () => {
      await renderReturns()
      await findAndLoadSale()
      // Set quantity to 1 to show the Process Return button
      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      // Now Process Return button is visible (returnTotal > 0)
      const processBtn = screen.getByText(/Process Return/).closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(processBtn) })
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('return reason'),
        'warning'
      )
    })

    it('processes return successfully', async () => {
      await renderReturns()
      await findAndLoadSale()
      mockPostJson.mockResolvedValue({ returnId: 'RET-001', totalRefundAmount: 22.00 })

      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })

      // Select reason (last combobox is reason, first is condition)
      const reasonSelects = screen.getAllByRole('combobox')
      const reasonSelect = reasonSelects[reasonSelects.length - 1]
      await act(async () => { fireEvent.change(reasonSelect, { target: { value: 'Defective' } }) })

      const processBtn = screen.getByText(/Process Return/).closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(processBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('RET-001'),
        'success'
      ))
    })

    it('resets form after successful return', async () => {
      await renderReturns()
      await findAndLoadSale()
      mockPostJson.mockResolvedValue({ returnId: 'RET-001', totalRefundAmount: 22.00 })

      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      const reasonSelects = screen.getAllByRole('combobox')
      await act(async () => { fireEvent.change(reasonSelects[reasonSelects.length - 1], { target: { value: 'Defective' } }) })

      const processBtn = screen.getByText(/Process Return/).closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(processBtn) })
      await waitFor(() => {
        expect(screen.queryByText('Original Transaction Details')).toBeNull()
      })
    })

    it('condition select changes item condition', async () => {
      await renderReturns()
      await findAndLoadSale()
      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      // Both condition and reason selects appear; condition is the first combobox
      const selects = screen.getAllByRole('combobox')
      const conditionSelect = selects[0]
      await act(async () => { fireEvent.change(conditionSelect, { target: { value: 'defective' } }) })
      expect((conditionSelect as HTMLSelectElement).value).toBe('defective')
    })

    it('shows error toast when return API fails', async () => {
      await renderReturns()
      await findAndLoadSale()
      mockPostJson.mockRejectedValue(new Error('server error'))

      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      const reasonSelects = screen.getAllByRole('combobox')
      await act(async () => { fireEvent.change(reasonSelects[reasonSelects.length - 1], { target: { value: 'Defective' } }) })

      const processBtn = screen.getByText(/Process Return/).closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(processBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process'),
        'error'
      ))
    })

    it('queues return when offline: calls queueReturn with correct data shape', async () => {
      mockIsOnline = false
      await renderReturns()  // sets up window.electronAPI internally
      await findAndLoadSale()

      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      const reasonSelects = screen.getAllByRole('combobox')
      await act(async () => {
        fireEvent.change(reasonSelects[reasonSelects.length - 1], { target: { value: 'Defective' } })
      })

      const processBtn = screen.getByText(/Process Return/).closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(processBtn) })

      const queueReturn = (window as any).electronAPI.queueReturn
      await waitFor(() => expect(queueReturn).toHaveBeenCalled())

      const queued = queueReturn.mock.calls[0][0]
      expect(queued.id).toMatch(/^RET-OFFLINE-/)
      expect(queued.idempotencyKey).toBeTruthy()
      expect(queued.transactionId).toBe('TXN-2025-12345678')
      expect(queued.returnData).toBeDefined()
      expect(queued.returnData.returnItems).toHaveLength(1)
      expect(mockRefreshReturnQueueCount).toHaveBeenCalled()
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('queued'), 'warning')
    })

    it('online API failure shows error toast and does NOT queue the return', async () => {
      mockIsOnline = true
      await renderReturns()
      mockPostJson.mockRejectedValue(new Error('server error'))
      await findAndLoadSale()

      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      const reasonSelects = screen.getAllByRole('combobox')
      await act(async () => {
        fireEvent.change(reasonSelects[reasonSelects.length - 1], { target: { value: 'Defective' } })
      })

      const processBtn = screen.getByText(/Process Return/).closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(processBtn) })

      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process'), 'error'
      ))
      expect((window as any).electronAPI.queueReturn).not.toHaveBeenCalled()
    })
  })

  // ── Return Total Calculation ──────────────────────────────────────────────

  describe('Return Total', () => {
    async function findAndLoadSale() {
      const sale = makeSale()
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        if (url.includes('/returns')) return Promise.resolve([])
        return Promise.reject(new Error('unexpected'))
      })
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(findBtn) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
    }

    it('shows refund total section when return quantity set', async () => {
      await renderReturns()
      await findAndLoadSale()
      // Set qty to 1 — makes returnTotal > 0 which shows the summary section
      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      await waitFor(() => {
        expect(screen.getByText('Total Refund Amount')).toBeTruthy()
      })
    })
  })

  // ── Edge Cases ────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('Back button navigates to dashboard', async () => {
      await renderReturns()
      const backBtn = screen.getByText('Back').closest('button') as HTMLElement
      await act(async () => { fireEvent.click(backBtn) })
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('network error during sale search shows "not found" (inner catch swallows rejection)', async () => {
      // The inner try/catch catches all getJson errors (including network timeouts) and
      // leaves foundSale=null — the "not found" path fires, not the outer catch.
      await renderReturns()
      mockGetJson.mockImplementation(() => Promise.reject(new Error('timeout')))
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(findBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('not found'),
        'error'
      ))
    })

    it('return quantity is capped at original quantity', async () => {
      await renderReturns()
      const sale = makeSale() // item has qty=2
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        if (url.includes('/returns')) return Promise.resolve([])
        return Promise.reject(new Error('unexpected'))
      })
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      const findBtn = screen.getByText('Find Transaction').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(findBtn) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      // Try to enter qty=99, updateReturnQuantity caps it to 2 (original qty)
      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '99' } }) })
      const displayedQty = parseInt((qtyInput as HTMLInputElement).value)
      expect(displayedQty).toBeLessThanOrEqual(2)
    })
  })

  // ── Manager Approval ──────────────────────────────────────────────────────

  describe('Manager Approval', () => {
    async function setupWithManagerApproval(approvalOverrides: any = {}) {
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      mockGetSettings.mockResolvedValue({
        ...defaultSystemSettings,
        requireManagerApprovalForReturns: true,
        ...approvalOverrides,
      })
      setupElectronAPI()
      await act(async () => { render(<Returns />) })
      await waitFor(() => expect(screen.queryByTestId('section-loader')).toBeNull())

      // Load a sale
      const sale = makeSale()
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        if (url.includes('/returns')) return Promise.resolve([])
        return Promise.reject(new Error('unexpected'))
      })
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Find Transaction').closest('button') as HTMLButtonElement) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
    }

    it('shows manager approval required message when requireManagerApprovalForReturns is true', async () => {
      await setupWithManagerApproval()
      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      expect(screen.getByText('Manager approval required for this return')).toBeTruthy()
    })

    it('clicking Process Return opens manager approval modal when PIN is empty', async () => {
      await setupWithManagerApproval()
      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      // Must also select a reason — processReturn validates reasons before checking manager approval
      const reasonSelects = screen.getAllByRole('combobox')
      await act(async () => { fireEvent.change(reasonSelects[reasonSelects.length - 1], { target: { value: 'Defective' } }) })
      const processBtn = screen.getByText(/Process Return/).closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(processBtn) })
      await waitFor(() => expect(screen.getByText('Manager Approval Required')).toBeTruthy())
    })

    it('shows manager approval when refund exceeds approval amount threshold', async () => {
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      // Set approval amount below the $10 unit price so any qty > 0 triggers it
      mockGetSettings.mockResolvedValue({
        ...defaultSystemSettings,
        requireManagerApprovalForReturns: false,
        returnManagerApprovalAmount: 5,
      })
      setupElectronAPI()
      await act(async () => { render(<Returns />) })
      await waitFor(() => expect(screen.queryByTestId('section-loader')).toBeNull())

      const sale = makeSale()
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        if (url.includes('/returns')) return Promise.resolve([])
        return Promise.reject(new Error('unexpected'))
      })
      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Find Transaction').closest('button') as HTMLButtonElement) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      // Set qty to 1 → refund = $10 > $5 threshold → manager approval required
      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      expect(screen.getByText('Manager approval required for this return')).toBeTruthy()
    })

    it('manager approval modal: Approve Return button calls processReturn', async () => {
      await setupWithManagerApproval()
      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      const reasonSelects = screen.getAllByRole('combobox')
      await act(async () => {
        fireEvent.change(reasonSelects[reasonSelects.length - 1], { target: { value: 'Defective' } })
      })

      mockPostJson.mockResolvedValue({ returnId: 'RET-MGR-001', totalRefundAmount: 10.00, returnItems: [] })

      // Open manager approval modal
      const processBtn = screen.getByText(/Process Return/).closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(processBtn) })
      await waitFor(() => expect(screen.getByText('Manager Approval Required')).toBeTruthy())

      // The manager PIN input has type="number" (role=spinbutton); query by placeholder directly
      const pinInput = screen.getByPlaceholderText('Enter manager PIN')
      await act(async () => { fireEvent.change(pinInput, { target: { value: '9999' } }) })

      const approveBtn = screen.getByText('Approve Return').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(approveBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('RET-MGR-001'),
        'success'
      ))
    })

    it('manager approval modal: Cancel closes modal without processing', async () => {
      await setupWithManagerApproval()
      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      const reasonSelects = screen.getAllByRole('combobox')
      await act(async () => {
        fireEvent.change(reasonSelects[reasonSelects.length - 1], { target: { value: 'Defective' } })
      })

      const processBtn = screen.getByText(/Process Return/).closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(processBtn) })
      await waitFor(() => expect(screen.getByText('Manager Approval Required')).toBeTruthy())

      const cancelBtn = screen.getAllByText('Cancel').find(
        el => el.closest('button')
      )!.closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(cancelBtn) })
      expect(screen.queryByText('Manager Approval Required')).toBeNull()
      expect(mockPostJson).not.toHaveBeenCalled()
    })
  })

  // ── Print Return Receipt ──────────────────────────────────────────────────

  describe('Print Return Receipt', () => {
    async function processReturnAndShowCard() {
      await renderReturns()
      const sale = makeSale()
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/sales/search')) return Promise.resolve(sale)
        if (url.includes('/returns')) return Promise.resolve([])
        return Promise.reject(new Error('unexpected'))
      })
      mockPostJson.mockResolvedValue({
        returnId: 'RET-PRINT-001',
        returnDate: new Date().toISOString(),
        totalRefundAmount: 10.00,
        returnItems: [{ productName: 'Widget A', returnQuantity: 1, unitPrice: 10.00, lineTotal: 10.00, reason: 'Defective' }],
        originalSale: { transactionId: 'TXN-2025-12345678' },
      })

      const input = screen.getByTestId('transaction-search-input')
      await act(async () => { fireEvent.change(input, { target: { value: '12345678' } }) })
      await act(async () => {
        fireEvent.click(screen.getByText('Find Transaction').closest('button') as HTMLButtonElement)
      })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())

      const qtyInput = screen.getByTestId('qty-input')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '1' } }) })
      const reasonSelects = screen.getAllByRole('combobox')
      await act(async () => {
        fireEvent.change(reasonSelects[reasonSelects.length - 1], { target: { value: 'Defective' } })
      })
      const processBtn = screen.getByText(/Process Return/).closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(processBtn) })
      await waitFor(() => expect(screen.getByText('RET-PRINT-001')).toBeTruthy())
    }

    it('shows Print Return Receipt button after successful return', async () => {
      await processReturnAndShowCard()
      expect(screen.getByText('Print Return Receipt')).toBeTruthy()
    })

    it('clicking Print Return Receipt calls electronAPI.printReceipt', async () => {
      await processReturnAndShowCard()
      const printBtn = screen.getByText('Print Return Receipt').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(printBtn) })
      await waitFor(() =>
        expect((window as any).electronAPI.printReceipt).toHaveBeenCalled()
      )
    })

    it('shows error toast when printReceipt returns success=false', async () => {
      await processReturnAndShowCard()
      // Override AFTER render — processReturnAndShowCard calls renderReturns which resets electronAPI
      ;(window as any).electronAPI.printReceipt = vi.fn(() => Promise.resolve({ success: false }))
      const printBtn = screen.getByText('Print Return Receipt').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(printBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to print'),
        'error'
      ))
    })

    it('Dismiss button hides the return success card', async () => {
      await processReturnAndShowCard()
      const dismissBtn = screen.getByText('Dismiss').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(dismissBtn) })
      expect(screen.queryByText('RET-PRINT-001')).toBeNull()
    })
  })
})
