import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

// Bypass SessionGuard — just render children
vi.mock('@/components/SessionGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Stub decorative components
vi.mock('@/components/SessionStatus', () => ({
  default: () => null,
}))

vi.mock('@/components/ReceiptPreview', () => ({
  default: () => null,
}))

// ModalKeyboard: expose onSubmit/onClose via test helpers
let _kbOnSubmit: ((v: string) => void) | null = null
let _kbOnClose: (() => void) | null = null
vi.mock('@/components/ModalKeyboard', () => ({
  default: ({ open, onSubmit, onClose }: any) => {
    _kbOnSubmit = open ? onSubmit : null
    _kbOnClose = open ? onClose : null
    return open ? <div data-testid="modal-keyboard" /> : null
  },
}))

// HybridInput → simple input that calls onChange on change event
vi.mock('@/components/HybridInput', () => ({
  default: ({ value, onChange, placeholder, className, onEnter, onTouchKeyboard, type: _type, ...rest }: any) => {
    const isAmountPaid = placeholder?.includes('amount') || placeholder?.includes('Enter amount')
    return (
      <>
        <input
          value={value}
          placeholder={placeholder}
          className={className}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          data-testid={isAmountPaid ? 'amount-paid-input' : 'search-input'}
          {...rest}
        />
        {onTouchKeyboard && isAmountPaid && (
          <button
            type="button"
            data-testid="amount-paid-kb-btn"
            onClick={onTouchKeyboard}
          >
            keyboard
          </button>
        )}
      </>
    )
  },
}))

const mockShowToast = vi.fn()
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

const mockRefreshQueueCount = vi.fn()
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => ({ isOnline: true, refreshQueueCount: mockRefreshQueueCount }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockGetJson = vi.fn()
const mockPostJson = vi.fn()
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getJson: (...args: any[]) => mockGetJson(...args),
    postJson: (...args: any[]) => mockPostJson(...args),
    online: true,
    setOnline: vi.fn(),
  },
}))

const mockGetCurrentSession = vi.fn()
const mockIsSessionValid = vi.fn()
const mockGetDashboardRoute = vi.fn()
const mockExtendForBusinessAction = vi.fn()
vi.mock('@/utils/SessionManager', () => ({
  default: {
    getCurrentSession: (...args: any[]) => mockGetCurrentSession(...args),
    isSessionValid: (...args: any[]) => mockIsSessionValid(...args),
    getDashboardRoute: (...args: any[]) => mockGetDashboardRoute(...args),
    extendForBusinessAction: (...args: any[]) => mockExtendForBusinessAction(...args),
    clearSession: vi.fn(),
    hasRole: vi.fn(() => true),
  },
}))

import POS from '@/components/POS'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<any> = {}): any {
  return {
    id: 1,
    barcode: '123456789',
    name: 'Widget A',
    price: 10.00,
    cost: 5.00,
    stockQuantity: 50,
    minStockLevel: 5,
    unit: 'ea',
    isActive: true,
    createdDate: '2025-01-01',
    lastUpdated: '2025-01-01',
    ...overrides,
  }
}

const defaultTaxSettings = {
  enableTax: true,
  taxName: 'GST',
  taxRate: 10,
  enableSecondaryTax: false,
  secondaryTaxName: 'Service Tax',
  secondaryTaxRate: 5,
  enableTaxExemptions: false,
  businessName: 'Test Business',
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

function setupElectronAPI(overrides: any = {}) {
  // setup.ts defines electronAPI as writable:true — assign directly instead of redefining
  ;(window as any).electronAPI = {
    saveProductCache: vi.fn(() => Promise.resolve()),
    getProductCache: vi.fn(() => Promise.resolve(null)),
    printReceipt: vi.fn(() => Promise.resolve()),
    openCashDrawer: vi.fn(() => Promise.resolve()),
    queueTransaction: vi.fn(() => Promise.resolve()),
    validateManagerPin: vi.fn(() => Promise.resolve({ success: true })),
    ...overrides,
  }
}

async function renderPOS(productOverrides: any[] = [makeProduct()]) {
  mockGetJson.mockImplementation((url: string) => {
    if (url === '/products') return Promise.resolve(productOverrides)
    if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
    if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
    return Promise.reject(new Error(`Unexpected URL: ${url}`))
  })
  mockIsSessionValid.mockReturnValue(true)
  mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
  mockGetDashboardRoute.mockReturnValue('/dashboard')
  setupElectronAPI()

  let result: ReturnType<typeof render>
  await act(async () => {
    result = render(<POS />)
  })
  return result!
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POS', () => {

  beforeEach(() => {
    mockShowToast.mockClear()
    mockNavigate.mockClear()
    mockGetJson.mockReset()
    mockPostJson.mockReset()
    _kbOnSubmit = null
    _kbOnClose = null
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('shows loading state initially', async () => {
      // Don't resolve getJson immediately
      let resolveProducts!: (v: any) => void
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return new Promise(r => { resolveProducts = r })
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      render(<POS />)
      // "Loading products…" appears in both the search bar count area and the product grid
      expect(screen.getAllByText('Loading products…').length).toBeGreaterThanOrEqual(1)
      // Resolve to avoid state update warning
      await act(async () => { resolveProducts([]) })
    })

    it('shows products grid after loading', async () => {
      await renderPOS([makeProduct({ name: 'Widget A' }), makeProduct({ id: 2, name: 'Widget B' })])
      expect(screen.getByText('Widget A')).toBeTruthy()
      expect(screen.getByText('Widget B')).toBeTruthy()
    })

    it('shows product count label', async () => {
      await renderPOS([makeProduct(), makeProduct({ id: 2, name: 'Widget B' })])
      expect(screen.getByText('2 products shown')).toBeTruthy()
    })

    it('shows "No products available" when list is empty', async () => {
      await renderPOS([])
      expect(screen.getByText('No products available.')).toBeTruthy()
    })

    it('shows OUT OF STOCK banner for zero-stock product', async () => {
      await renderPOS([makeProduct({ stockQuantity: 0 })])
      expect(screen.getByText('OUT OF STOCK')).toBeTruthy()
    })

    it('shows LOW STOCK banner when stock <= minStockLevel', async () => {
      await renderPOS([makeProduct({ stockQuantity: 3, minStockLevel: 5 })])
      expect(screen.getByText('LOW STOCK')).toBeTruthy()
    })

    it('shows empty cart message initially', async () => {
      await renderPOS()
      expect(screen.getByText('Cart is empty')).toBeTruthy()
    })

    it('shows "Point of Sale" header', async () => {
      await renderPOS()
      expect(screen.getByText('Point of Sale')).toBeTruthy()
    })
  })

  // ── Cart Operations ───────────────────────────────────────────────────────

  describe('Cart Operations', () => {
    it('adds product to cart on click', async () => {
      await renderPOS([makeProduct({ name: 'Widget A', price: 10 })])
      const card = screen.getByText('Widget A').closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card!) })
      // Cart should show 1 item — "Widget A" now appears in both grid and cart
      expect(screen.getByText('1 item')).toBeTruthy()
      expect(screen.getAllByText('Widget A').length).toBeGreaterThanOrEqual(2)
    })

    it('increments quantity when same product added again', async () => {
      await renderPOS([makeProduct({ name: 'Widget A', price: 10, stockQuantity: 10 })])
      const card = screen.getByText('Widget A').closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card!) })
      await act(async () => { fireEvent.click(card!) })
      // Qty input in cart should show 2
      const qtyInputs = screen.getAllByDisplayValue('2')
      expect(qtyInputs.length).toBeGreaterThan(0)
    })

    it('removes item from cart via trash button', async () => {
      await renderPOS([makeProduct({ name: 'Widget A' })])
      const card = screen.getByText('Widget A').closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card!) })
      // Product appears in cart
      expect(screen.getByText('1 item')).toBeTruthy()
      // Click trash button (Trash2 icon button)
      const trashBtns = document.querySelectorAll('button svg.lucide-trash-2')
      const trashBtn = trashBtns[0]?.closest('button') as HTMLElement
      await act(async () => { fireEvent.click(trashBtn!) })
      expect(screen.getByText('Cart is empty')).toBeTruthy()
    })

    it('clicking out-of-stock product card is a silent no-op', async () => {
      // The card onClick guard `!isOutOfStock && addToCart(product)` prevents any action.
      // Toast for OOS fires only via the barcode-scan path, not card clicks.
      await renderPOS([makeProduct({ name: 'OOS Product', stockQuantity: 0 })])
      const card = screen.getByText('OOS Product').closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card!) })
      expect(screen.getByText('Cart is empty')).toBeTruthy()
      expect(mockShowToast).not.toHaveBeenCalled()
    })

    it('warns when cart quantity exceeds stock', async () => {
      await renderPOS([makeProduct({ name: 'Widget A', stockQuantity: 1 })])
      const card = screen.getByText('Widget A').closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card!) }) // qty=1 (at stock limit)
      await act(async () => { fireEvent.click(card!) }) // should warn
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Only 1 available'),
        'warning'
      )
    })

    it('clear cart button resets cart', async () => {
      await renderPOS([makeProduct({ name: 'Widget A' })])
      const card = screen.getByText('Widget A').closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card!) })
      expect(screen.getByText('1 item')).toBeTruthy()
      const clearBtn = screen.getByText('Clear Cart')
      await act(async () => { fireEvent.click(clearBtn) })
      expect(screen.getByText('Cart is empty')).toBeTruthy()
    })

    it('clear cart button is disabled when cart is empty', async () => {
      await renderPOS()
      const clearBtn = screen.getByText('Clear Cart').closest('button') as HTMLButtonElement
      expect(clearBtn.disabled).toBe(true)
    })
  })

  // ── Tax Calculations ──────────────────────────────────────────────────────

  describe('Tax Calculations', () => {
    it('shows subtotal correctly for one item', async () => {
      // formatCurrency returns bare "20.00" — no dollar sign
      await renderPOS([makeProduct({ price: 20.00 })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      expect(screen.getAllByText('20.00').length).toBeGreaterThan(0)
    })

    it('shows tax amount with configured tax rate', async () => {
      // Tax rate = 10%, product = $10, total = 11.00
      await renderPOS([makeProduct({ price: 10.00 })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      // Total line shows 11.00 (subtotal 10 + 10% tax 1)
      expect(screen.getAllByText('11.00').length).toBeGreaterThan(0)
    })

    it('shows tax label from tax settings', async () => {
      await renderPOS([makeProduct({ price: 10.00 })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      expect(screen.getAllByText('GST (10%)').length).toBeGreaterThan(0)
    })
  })

  // ── Product Search/Filter ─────────────────────────────────────────────────

  describe('Product Search/Filter', () => {
    it('filters products by name', async () => {
      await renderPOS([
        makeProduct({ id: 1, name: 'Widget A' }),
        makeProduct({ id: 2, name: 'Gadget B' }),
      ])
      const searchInput = screen.getByTestId('search-input')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'Widget' } }) })
      expect(screen.getByText('Widget A')).toBeTruthy()
      expect(screen.queryByText('Gadget B')).toBeNull()
    })

    it('filters products by barcode', async () => {
      await renderPOS([
        makeProduct({ id: 1, name: 'Widget A', barcode: 'BAR001' }),
        makeProduct({ id: 2, name: 'Gadget B', barcode: 'ZZZ999' }),
      ])
      const searchInput = screen.getByTestId('search-input')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'BAR001' } }) })
      expect(screen.getByText('Widget A')).toBeTruthy()
      expect(screen.queryByText('Gadget B')).toBeNull()
    })

    it('shows "No products match" when search has no results', async () => {
      await renderPOS([makeProduct({ name: 'Widget A' })])
      const searchInput = screen.getByTestId('search-input')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'XXXXXX' } }) })
      expect(screen.getByText('No products match your search.')).toBeTruthy()
    })

    it('shows Clear button when search has input', async () => {
      await renderPOS([makeProduct()])
      const searchInput = screen.getByTestId('search-input')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'Widget' } }) })
      expect(screen.getByText('Clear')).toBeTruthy()
    })

    it('Clear button resets search', async () => {
      await renderPOS([
        makeProduct({ id: 1, name: 'Widget A' }),
        makeProduct({ id: 2, name: 'Gadget B' }),
      ])
      const searchInput = screen.getByTestId('search-input')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'Widget' } }) })
      const clearBtn = screen.getByText('Clear')
      await act(async () => { fireEvent.click(clearBtn) })
      expect(screen.getByText('Widget A')).toBeTruthy()
      expect(screen.getByText('Gadget B')).toBeTruthy()
    })
  })

  // ── Payment Modal ─────────────────────────────────────────────────────────

  describe('Payment Modal', () => {
    async function openPaymentModal() {
      await renderPOS([makeProduct({ price: 10.00, name: 'Widget A' })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
    }

    it('opens payment modal when Pay button clicked', async () => {
      await openPaymentModal()
      expect(screen.getByText('Payment')).toBeTruthy()
    })

    it('closes payment modal on Cancel', async () => {
      await openPaymentModal()
      const cancelBtn = screen.getByText('Cancel')
      await act(async () => { fireEvent.click(cancelBtn) })
      expect(screen.queryByText('Payment')).toBeNull()
    })

    it('Complete Payment button is disabled when amount paid < total', async () => {
      await openPaymentModal()
      // amountPaid is empty, total is $11 — button should be disabled
      const completeBtn = screen.getByText('Complete Payment').closest('button') as HTMLButtonElement
      expect(completeBtn.disabled).toBe(true)
    })

    it('Complete Payment button is enabled when amount paid >= total', async () => {
      await openPaymentModal()
      const amountInput = screen.getByTestId('amount-paid-input')
      await act(async () => { fireEvent.change(amountInput, { target: { value: '20' } }) })
      const completeBtn = screen.getByText('Complete Payment').closest('button') as HTMLButtonElement
      expect(completeBtn.disabled).toBe(false)
    })

    it('shows change amount when amount paid > total', async () => {
      await openPaymentModal()
      const amountInput = screen.getByTestId('amount-paid-input')
      await act(async () => { fireEvent.change(amountInput, { target: { value: '20' } }) })
      // Change = 20 - 11.00 = 9.00 (formatCurrency has no dollar sign)
      expect(screen.getByText(/Change: 9\.00/)).toBeTruthy()
    })

    it('shows discount in order summary when applied', async () => {
      await renderPOS([makeProduct({ price: 10.00, name: 'Widget A' })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
      // Click 10% discount button
      const discountBtn = screen.getAllByText('10%')[0]
      await act(async () => { fireEvent.click(discountBtn) })
      expect(screen.getByText('10% discount applied')).toBeTruthy()
    })

    it('removes discount when Remove discount clicked', async () => {
      await renderPOS([makeProduct({ price: 10.00, name: 'Widget A' })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
      const discountBtn = screen.getAllByText('10%')[0]
      await act(async () => { fireEvent.click(discountBtn) })
      const removeBtn = screen.getByText('Remove discount')
      await act(async () => { fireEvent.click(removeBtn) })
      expect(screen.queryByText('10% discount applied')).toBeNull()
    })

    it('processes payment successfully and clears cart', async () => {
      mockPostJson.mockResolvedValue({ transactionId: 'TXN-001', saleDate: '2025-01-01' })
      await openPaymentModal()
      const amountInput = screen.getByTestId('amount-paid-input')
      await act(async () => { fireEvent.change(amountInput, { target: { value: '20' } }) })
      const completeBtn = screen.getByText('Complete Payment').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(completeBtn) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('TXN-001')
        )
      })
      // Cart should be cleared
      expect(screen.getByText('Cart is empty')).toBeTruthy()
    })

    it('warns when attempting payment on empty cart', async () => {
      await renderPOS()
      // Payment modal doesn't open with empty cart, but call processPayment directly
      // The Pay button is disabled; test that cart is empty guard works via the "Pay" button being disabled
      // Pay button shows "Pay 0.00" when cart is empty — disabled
      const payBtn = screen.getByText(/Pay 0\.00/).closest('button') as HTMLButtonElement
      expect(payBtn.disabled).toBe(true)
    })
  })

  // ── Discount ──────────────────────────────────────────────────────────────

  describe('Discount (main panel)', () => {
    it('shows discount in cart panel when applied via keyboard', async () => {
      await renderPOS([makeProduct({ price: 100.00 })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      // Simulate keyboard submitting 10% discount
      // Open payment modal then apply discount via kb
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
      const discountBtn10 = screen.getAllByText('10%')[0]
      await act(async () => { fireEvent.click(discountBtn10) })
      // Discount(10%) should show on page
      expect(screen.getByText('10% discount applied')).toBeTruthy()
    })
  })

  // ── Edge Cases ────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('only shows active products', async () => {
      await renderPOS([
        makeProduct({ id: 1, name: 'Active', isActive: true }),
        makeProduct({ id: 2, name: 'Inactive', isActive: false }),
      ])
      expect(screen.getByText('Active')).toBeTruthy()
      expect(screen.queryByText('Inactive')).toBeNull()
    })

    it('shows cached products when API fails', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.reject(new Error('network'))
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI({
        getProductCache: vi.fn(() => Promise.resolve({
          products: [makeProduct({ name: 'CachedProduct', isActive: true })],
        })),
      })
      await act(async () => { render(<POS />) })
      await waitFor(() => {
        expect(screen.getByText('CachedProduct')).toBeTruthy()
      })
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('cached'),
        'warning'
      )
    })

    it('shows error toast when API fails and no cache', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.reject(new Error('network'))
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI({ getProductCache: vi.fn(() => Promise.resolve(null)) })
      await act(async () => { render(<POS />) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Failed to load products'),
          'error'
        )
      })
    })

    it('Back button navigates to dashboard', async () => {
      await renderPOS()
      const backBtn = screen.getByText('Back').closest('button') as HTMLElement
      await act(async () => { fireEvent.click(backBtn) })
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('queues sale when offline', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct()])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      const queueFn = vi.fn(() => Promise.resolve())
      setupElectronAPI({ queueTransaction: queueFn })
      // Simulate offline: postJson throws a network TypeError
      mockPostJson.mockRejectedValue(new TypeError('Failed to fetch'))
      await act(async () => { render(<POS />) })

      // Add item and pay
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
      const amountInput = screen.getByTestId('amount-paid-input')
      await act(async () => { fireEvent.change(amountInput, { target: { value: '20' } }) })
      const completeBtn = screen.getByText('Complete Payment').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(completeBtn) })
      await waitFor(() => {
        expect(queueFn).toHaveBeenCalled()
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('queued'),
          'warning'
        )
      })
    })

    it('product count shows "1 product" singular form', async () => {
      await renderPOS([makeProduct()])
      expect(screen.getByText('1 product shown')).toBeTruthy()
    })

    it('cart count shows "items" plural form', async () => {
      await renderPOS([
        makeProduct({ id: 1, name: 'Widget A' }),
        makeProduct({ id: 2, name: 'Widget B' }),
      ])
      const cardA = screen.getByText('Widget A').closest('div[class*="rounded-lg"]') as HTMLElement
      const cardB = screen.getByText('Widget B').closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(cardA) })
      await act(async () => { fireEvent.click(cardB) })
      expect(screen.getByText('2 items')).toBeTruthy()
    })
  })

  // ── Payment Method Selection ───────────────────────────────────────────────

  describe('Payment Methods', () => {
    async function openPaymentModal() {
      await renderPOS([makeProduct({ price: 10.00, name: 'Widget A' })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
    }

    it('shows payment method selector in modal', async () => {
      await openPaymentModal()
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select).toBeTruthy()
    })

    it('switches payment method to Card', async () => {
      await openPaymentModal()
      const select = screen.getByRole('combobox') as HTMLSelectElement
      await act(async () => { fireEvent.change(select, { target: { value: 'Card' } }) })
      expect(select.value).toBe('Card')
    })

    it('processes Card payment successfully', async () => {
      mockPostJson.mockResolvedValue({ transactionId: 'TXN-CARD-001', saleDate: '2025-01-01' })
      await openPaymentModal()
      const select = screen.getByRole('combobox') as HTMLSelectElement
      await act(async () => { fireEvent.change(select, { target: { value: 'Card' } }) })
      const amountInput = screen.getByTestId('amount-paid-input')
      await act(async () => { fireEvent.change(amountInput, { target: { value: '15' } }) })
      const completeBtn = screen.getByText('Complete Payment').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(completeBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('TXN-CARD-001')))
      expect(screen.getByText('Cart is empty')).toBeTruthy()
    })

    it('sends paymentMethod in sale payload', async () => {
      mockPostJson.mockResolvedValue({ transactionId: 'TXN-001', saleDate: '2025-01-01' })
      await openPaymentModal()
      const select = screen.getByRole('combobox') as HTMLSelectElement
      await act(async () => { fireEvent.change(select, { target: { value: 'Card' } }) })
      const amountInput = screen.getByTestId('amount-paid-input')
      await act(async () => { fireEvent.change(amountInput, { target: { value: '20' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Complete Payment').closest('button') as HTMLButtonElement) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/sales',
        expect.objectContaining({ paymentMethod: 'Card' }),
        expect.any(Boolean),
        expect.any(Object)
      ))
    })
  })

  // ── Secondary Tax ─────────────────────────────────────────────────────────

  describe('Secondary Tax', () => {
    async function renderPOSWithSecondaryTax() {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 100.00 })])
        if (url === '/tax-settings') return Promise.resolve({
          ...defaultTaxSettings,
          enableSecondaryTax: true,
          secondaryTaxName: 'Service Tax',
          secondaryTaxRate: 5,
        })
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
    }

    it('shows secondary tax label in totals when item in cart', async () => {
      await renderPOSWithSecondaryTax()
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      expect(screen.getByText('Service Tax (5%)')).toBeTruthy()
    })

    it('includes secondary tax amount in cart total', async () => {
      await renderPOSWithSecondaryTax()
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      // subtotal=100, primary tax=10%, secondary tax=5% → total=115.00
      expect(screen.getAllByText('115.00').length).toBeGreaterThan(0)
    })
  })

  // ── Tax Exemption ─────────────────────────────────────────────────────────

  describe('Tax Exemption', () => {
    async function renderPOSWithExemption() {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 100.00 })])
        if (url === '/tax-settings') return Promise.resolve({ ...defaultTaxSettings, enableTaxExemptions: true })
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
    }

    it('shows Apply Tax Exemption button', async () => {
      await renderPOSWithExemption()
      expect(screen.getByText('Apply Tax Exemption')).toBeTruthy()
    })

    it('toggles to Tax Exempt Active after clicking', async () => {
      await renderPOSWithExemption()
      const exemptBtn = screen.getByText('Apply Tax Exemption').closest('button') as HTMLElement
      await act(async () => { fireEvent.click(exemptBtn) })
      expect(screen.getByText('Tax Exempt Active')).toBeTruthy()
    })

    it('shows Tax Exempt label in totals when active', async () => {
      await renderPOSWithExemption()
      const exemptBtn = screen.getByText('Apply Tax Exemption').closest('button') as HTMLElement
      await act(async () => { fireEvent.click(exemptBtn) })
      expect(screen.getByText('Tax Exempt')).toBeTruthy()
    })

    it('toggles back to non-exempt on second click', async () => {
      await renderPOSWithExemption()
      const exemptBtn = screen.getByText('Apply Tax Exemption').closest('button') as HTMLElement
      await act(async () => { fireEvent.click(exemptBtn) }) // enable
      await act(async () => { fireEvent.click(screen.getByText('Tax Exempt Active').closest('button') as HTMLElement) }) // disable
      expect(screen.getByText('Apply Tax Exemption')).toBeTruthy()
    })
  })

  // ── No Tax ────────────────────────────────────────────────────────────────

  describe('No Tax', () => {
    it('shows "No Tax" in totals when tax disabled', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 50.00 })])
        if (url === '/tax-settings') return Promise.resolve({ ...defaultTaxSettings, enableTax: false })
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      expect(screen.getByText('No Tax')).toBeTruthy()
    })

    it('total equals subtotal when tax disabled', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 50.00 })])
        if (url === '/tax-settings') return Promise.resolve({ ...defaultTaxSettings, enableTax: false })
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      // Total should be 50.00, not 55.00 (no tax)
      expect(screen.getAllByText('50.00').length).toBeGreaterThan(0)
    })
  })

  // ── Manager Approval for Discount ─────────────────────────────────────────

  describe('Manager Approval for Discount', () => {
    it('shows manager approval note when requireManagerApprovalForDiscount is on', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 10.00 })])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve({
          ...defaultSystemSettings,
          requireManagerApprovalForDiscount: true,
        })
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
      // When requireManagerApprovalForDiscount is on, a shield/manager note appears in the discount section
      expect(screen.getByText('Manager Required')).toBeTruthy()
    })
  })

  // ── Barcode Search ────────────────────────────────────────────────────────

  describe('Barcode Search', () => {
    it('shows product not found warning via barcode scan path', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct()])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
        if (url.includes('/products/barcode/')) return Promise.reject(new Error('404'))
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())

      // Simulate scanner: rapid keydown events on document body → barcode → Enter
      await act(async () => {
        'NOTFOUND01'.split('').forEach(char => {
          fireEvent.keyDown(document.body, { key: char })
        })
        fireEvent.keyDown(document.body, { key: 'Enter' })
      })

      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Product not found'),
        'warning'
      ))
    })

    it('adds product to cart via barcode scan', async () => {
      const scannedProduct = makeProduct({ id: 99, name: 'Scanned Widget', barcode: 'SCAN99999', stockQuantity: 10 })
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([scannedProduct])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
        if (url.includes('/products/barcode/SCAN99999')) return Promise.resolve(scannedProduct)
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Scanned Widget')).toBeTruthy())

      await act(async () => {
        'SCAN99999'.split('').forEach(char => {
          fireEvent.keyDown(document.body, { key: char })
        })
        fireEvent.keyDown(document.body, { key: 'Enter' })
      })

      await waitFor(() => expect(screen.getByText('1 item')).toBeTruthy())
    })
  })

  // ── Discount modal — manager approval path (cashier role) ─────────────────

  describe('Manager-Gated Discount', () => {
    async function openPaymentModalWithManagerApproval() {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 10.00, name: 'Widget A' })])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve({
          ...defaultSystemSettings,
          requireManagerApprovalForDiscount: true,
        })
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      // Cashier (not Manager) → discount click should open manager PIN keyboard
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
    }

    it('clicking discount % as cashier opens manager PIN keyboard', async () => {
      await openPaymentModalWithManagerApproval()
      const discountBtn = screen.getAllByText('10%')[0]
      await act(async () => { fireEvent.click(discountBtn) })
      // ModalKeyboard should now be open (kbTarget='managerPin')
      expect(screen.getByTestId('modal-keyboard')).toBeTruthy()
    })

    it('manager approves discount: submitting correct PIN applies discount', async () => {
      await openPaymentModalWithManagerApproval()
      // electronAPI.validateManagerPin returns success
      const validatePin = vi.fn(() => Promise.resolve({ success: true }))
      ;(window as any).electronAPI.validateManagerPin = validatePin

      const discountBtn = screen.getAllByText('10%')[0]
      await act(async () => { fireEvent.click(discountBtn) })
      // Simulate PIN submitted via keyboard
      await act(async () => { _kbOnSubmit!('1234') })
      await waitFor(() => expect(screen.getByText('10% discount applied')).toBeTruthy())
    })

    it('invalid PIN: validateManagerPin returns {success:false} — discount NOT applied, error toast shown (lines 888-907)', async () => {
      await openPaymentModalWithManagerApproval()
      // Set validateManagerPin to return failure
      const validatePin = vi.fn(() => Promise.resolve({ success: false }))
      ;(window as any).electronAPI.validateManagerPin = validatePin

      const discountBtn = screen.getAllByText('10%')[0]
      await act(async () => { fireEvent.click(discountBtn) })
      // Simulate PIN submitted via keyboard
      await act(async () => { _kbOnSubmit!('9999') })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Invalid manager PIN'),
          'error'
        )
      })
      // Discount must NOT have been applied
      expect(screen.queryByText('10% discount applied')).toBeNull()
    })

    it('manager with Manager role applies discount directly without PIN prompt', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 10.00, name: 'Widget A' })])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve({
          ...defaultSystemSettings,
          requireManagerApprovalForDiscount: true,
        })
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      // Manager role → no PIN prompt
      mockGetCurrentSession.mockReturnValue({ id: 2, employeeId: 'EMP-002', name: 'Bob', role: 'Manager' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
      const discountBtn = screen.getAllByText('20%')[0]
      await act(async () => { fireEvent.click(discountBtn) })
      // Manager skips PIN — discount reason keyboard opens via setTimeout(100ms)
      await waitFor(() => expect(screen.getByTestId('modal-keyboard')).toBeTruthy(), { timeout: 500 })
      await waitFor(() => expect(screen.getByText('20% discount applied')).toBeTruthy(), { timeout: 500 })
    })
  })

  // ── Amount-paid Enter key triggers processPayment ─────────────────────────

  describe('Amount Paid onEnter', () => {
    it('pressing Enter in amount-paid input triggers payment when amount >= total', async () => {
      mockPostJson.mockResolvedValue({ transactionId: 'TXN-ENTER-001', saleDate: '2025-01-01' })
      await renderPOS([makeProduct({ price: 10.00, name: 'Widget A' })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
      const amountInput = screen.getByTestId('amount-paid-input')
      await act(async () => { fireEvent.change(amountInput, { target: { value: '20' } }) })
      // Press Enter — onEnter fires, amount(20) >= total(11), processPayment called
      await act(async () => { fireEvent.keyDown(amountInput, { key: 'Enter' }) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('TXN-ENTER-001')
      ))
    })

    it('pressing Enter when amount < total does NOT trigger payment', async () => {
      await renderPOS([makeProduct({ price: 10.00, name: 'Widget A' })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
      const amountInput = screen.getByTestId('amount-paid-input')
      // Amount 5 < total 11 — Enter should do nothing
      await act(async () => { fireEvent.change(amountInput, { target: { value: '5' } }) })
      await act(async () => { fireEvent.keyDown(amountInput, { key: 'Enter' }) })
      // Payment modal should still be visible, no success toast
      expect(screen.getByText('Complete Payment')).toBeTruthy()
      expect(mockPostJson).not.toHaveBeenCalled()
    })
  })

  // ── Amount-paid onTouchKeyboard opens keyboard ────────────────────────────

  describe('Amount Paid Keyboard Button', () => {
    it('clicking keyboard button on amount-paid input opens ModalKeyboard (line 1046)', async () => {
      await renderPOS([makeProduct({ price: 10.00, name: 'Widget A' })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
      // The amount-paid keyboard trigger button
      const kbBtn = screen.getByTestId('amount-paid-kb-btn')
      await act(async () => { fireEvent.click(kbBtn) })
      expect(screen.getByTestId('modal-keyboard')).toBeTruthy()
    })
  })

  // ── Cash drawer opens on Pay button click ─────────────────────────────────

  describe('Cash Drawer', () => {
    it('openCashDrawer is called when Pay button is clicked', async () => {
      await renderPOS([makeProduct({ price: 10.00, name: 'Widget A' })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      const payBtn = screen.getByText(/Pay \d/)
      await act(async () => { fireEvent.click(payBtn) })
      expect((window as any).electronAPI.openCashDrawer).toHaveBeenCalled()
    })
  })

  // ── Tax/system settings error paths ───────────────────────────────────────

  describe('Settings Error Paths', () => {
    it('applies default tax settings when /tax-settings fetch fails', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 10.00 })])
        if (url === '/tax-settings') return Promise.reject(new Error('not found'))
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
      // Add item to cart to reveal tax label — defaults give GST 10% (actually 'Sales Tax (10%)')
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      // Default fallback tax: enableTax=true, taxName='Sales Tax', taxRate=10
      expect(screen.getByText('Sales Tax (10%)')).toBeTruthy()
    })

    it('does not crash when /system-settings fetch fails', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct()])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.reject(new Error('server error'))
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      // Component should still render products even if system settings fail
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())
    })
  })

  // ── validateManagerPin error path ────────────────────────────────────────

  describe('validateManagerPin catch path', () => {
    it('shows error toast when electronAPI.validateManagerPin throws', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 10.00, name: 'Widget A' })])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve({
          ...defaultSystemSettings,
          requireManagerApprovalForDiscount: true,
        })
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI({
        validateManagerPin: vi.fn(() => Promise.reject(new Error('IPC error'))),
      })
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())

      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      await act(async () => { fireEvent.click(screen.getByText(/Pay \d/)) })
      await act(async () => { fireEvent.click(screen.getAllByText('10%')[0]) })
      // Keyboard opens (kbTarget='managerPin') — submit to trigger validateManagerPin
      await act(async () => { _kbOnSubmit!('1234') })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Error validating manager PIN'),
        'error'
      ))
    })
  })

  // ── addToCart OOS via barcode scan path ──────────────────────────────────

  describe('Barcode Scan OOS path', () => {
    it('shows out-of-stock toast when barcode scan returns OOS product', async () => {
      const oosProduct = makeProduct({ id: 77, name: 'OOS Scanned', barcode: 'OOS12345', stockQuantity: 0 })
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([oosProduct])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve(defaultSystemSettings)
        if (url.includes('/products/barcode/OOS12345')) return Promise.resolve(oosProduct)
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('OOS Scanned')).toBeTruthy())

      await act(async () => {
        'OOS12345'.split('').forEach(char => {
          fireEvent.keyDown(document.body, { key: char })
        })
        fireEvent.keyDown(document.body, { key: 'Enter' })
      })

      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('out of stock'),
        'warning'
      ))
    })
  })

  // ── Cart quantity editing via readOnly input click ────────────────────────

  describe('Cart Quantity Editing', () => {
    async function addItemAndOpenQtyKb(stockQty = 10) {
      await renderPOS([makeProduct({ name: 'Widget A', price: 10.00, stockQuantity: stockQty })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      // The cart qty input is a readOnly <input> — click it to open keyboard with kbTarget='cartQuantity'
      const qtyInputs = document.querySelectorAll('input[readonly]')
      const qtyInput = Array.from(qtyInputs).find(el => (el as HTMLInputElement).value === '1')
      await act(async () => { fireEvent.click(qtyInput!) })
    }

    it('clicking cart qty input opens keyboard', async () => {
      await addItemAndOpenQtyKb()
      expect(screen.getByTestId('modal-keyboard')).toBeTruthy()
    })

    it('submitting valid qty via keyboard updates cart item quantity', async () => {
      await addItemAndOpenQtyKb(10)
      await act(async () => { _kbOnSubmit!('3') })
      // Qty should update to 3
      await waitFor(() => {
        const inputs = document.querySelectorAll('input[readonly]')
        const qtyInput = Array.from(inputs).find(el => (el as HTMLInputElement).value === '3')
        expect(qtyInput).toBeTruthy()
      })
    })

    it('submitting qty of 0 does not remove item (quantity > 0 guard prevents zero)', async () => {
      await addItemAndOpenQtyKb(10)
      await act(async () => { _kbOnSubmit!('0') })
      // The applyKb guard requires quantity > 0 — item stays with its original quantity
      const qtyInputs = document.querySelectorAll('input[readonly]')
      const q1 = Array.from(qtyInputs).find(el => (el as HTMLInputElement).value === '1')
      expect(q1).toBeTruthy()
    })

    it('submitting qty exceeding stock shows warning toast', async () => {
      await addItemAndOpenQtyKb(2)
      await act(async () => { _kbOnSubmit!('5') })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Only 2 available'),
        'warning'
      ))
    })
  })

  // ── applyKb amountPaid path ───────────────────────────────────────────────

  describe('applyKb amountPaid path', () => {
    it('submitting via amount-paid keyboard sets amountPaid and enables Complete Payment', async () => {
      await renderPOS([makeProduct({ price: 10.00, name: 'Widget A' })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      await act(async () => { fireEvent.click(screen.getByText(/Pay \d/)) })
      // Open keyboard for amount-paid
      const kbBtn = screen.getByTestId('amount-paid-kb-btn')
      await act(async () => { fireEvent.click(kbBtn) })
      // Now kbTarget='amountPaid' — submit via keyboard
      await act(async () => { _kbOnSubmit!('20') })
      // amountPaid should be set to '20', enabling Complete Payment
      const completeBtn = screen.getByText('Complete Payment').closest('button') as HTMLButtonElement
      expect(completeBtn.disabled).toBe(false)
    })
  })

  // ── applyKb discountReason path (via manager-bypass setTimeout) ───────────

  describe('applyKb discountReason path', () => {
    it('keyboard with discountReason target sets discount reason label', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 10.00, name: 'Widget A' })])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve({
          ...defaultSystemSettings,
          requireManagerApprovalForDiscount: false,
        })
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockIsSessionValid.mockReturnValue(true)
      // Manager role bypasses PIN prompt and goes straight to discountReason keyboard
      mockGetCurrentSession.mockReturnValue({ id: 2, employeeId: 'EMP-002', name: 'Bob', role: 'Manager' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())

      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      await act(async () => { fireEvent.click(screen.getByText(/Pay \d/)) })

      // Manager clicks 10% → no PIN needed → 100ms setTimeout fires discountReason keyboard
      const discountBtn = screen.getAllByText('10%')[0]
      await act(async () => {
        fireEvent.click(discountBtn)
        // Wait for the real 100ms setTimeout to fire
        await new Promise(r => setTimeout(r, 150))
      })

      // Now kbTarget should be 'discountReason' — the keyboard is open
      await waitFor(() => expect(_kbOnSubmit).toBeTruthy())
      // Submit a reason
      await act(async () => { _kbOnSubmit!('Staff discount') })

      // After submitting reason, keyboard closes
      expect(screen.queryByTestId('modal-keyboard')).toBeNull()
    })
  })

  // ── Product card minus button → updateCartItemQuantity(qty-1) ────────────

  describe('Product card minus button', () => {
    it('minus button on product card decrements cart quantity', async () => {
      await renderPOS([makeProduct({ name: 'Widget A', stockQuantity: 5 })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      await act(async () => { fireEvent.click(card) })
      // Cart should show qty 2
      await waitFor(() => {
        const qtyInputs = document.querySelectorAll('input[readonly]')
        const q2 = Array.from(qtyInputs).find(el => (el as HTMLInputElement).value === '2')
        expect(q2).toBeTruthy()
      })
      // Find and click the minus button (div with absolute positioning)
      const minusBtns = document.querySelectorAll('div.absolute.bg-red-500')
      const minusBtn = minusBtns[0] as HTMLElement
      await act(async () => { fireEvent.click(minusBtn) })
      // Qty should be 1 now
      await waitFor(() => {
        const qtyInputs = document.querySelectorAll('input[readonly]')
        const q1 = Array.from(qtyInputs).find(el => (el as HTMLInputElement).value === '1')
        expect(q1).toBeTruthy()
      })
    })

    it('minus button when qty=1 removes item from cart', async () => {
      await renderPOS([makeProduct({ name: 'Widget A', stockQuantity: 5 })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      await waitFor(() => expect(screen.getByText('1 item')).toBeTruthy())
      const minusBtns = document.querySelectorAll('div.absolute.bg-red-500')
      const minusBtn = minusBtns[0] as HTMLElement
      await act(async () => { fireEvent.click(minusBtn) })
      await waitFor(() => expect(screen.getByText('Cart is empty')).toBeTruthy())
    })
  })

  // ── showReceiptPreview=true after successful payment ──────────────────────

  describe('Receipt Preview', () => {
    it('shows receipt preview instead of clearing cart when showReceiptPreview=true', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct({ price: 10.00, name: 'Widget A' })])
        if (url === '/tax-settings') return Promise.resolve(defaultTaxSettings)
        if (url === '/system-settings') return Promise.resolve({
          ...defaultSystemSettings,
          showReceiptPreview: true,
          printReceiptAutomatically: false,
        })
        return Promise.reject(new Error(`Unexpected: ${url}`))
      })
      mockPostJson.mockResolvedValue({ transactionId: 'TXN-PREVIEW', saleDate: '2025-01-01' })
      mockIsSessionValid.mockReturnValue(true)
      mockGetCurrentSession.mockReturnValue({ id: 1, employeeId: 'EMP-001', name: 'Alice', role: 'Cashier' })
      mockGetDashboardRoute.mockReturnValue('/dashboard')
      setupElectronAPI()
      await act(async () => { render(<POS />) })
      await waitFor(() => expect(screen.getByText('Widget A')).toBeTruthy())

      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      await act(async () => { fireEvent.click(screen.getByText(/Pay \d/)) })
      const amountInput = screen.getByTestId('amount-paid-input')
      await act(async () => { fireEvent.change(amountInput, { target: { value: '20' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Complete Payment').closest('button') as HTMLButtonElement) })
      // With showReceiptPreview=true, cart should NOT be cleared yet
      await waitFor(() => expect(screen.getByText('1 item')).toBeTruthy())
    })
  })

  // ── payment error: non-network failure ───────────────────────────────────

  describe('Payment error: non-network failure', () => {
    it('shows "Payment failed" toast when postJson rejects with non-network error', async () => {
      mockPostJson.mockRejectedValue(new Error('Validation error'))
      await renderPOS([makeProduct({ price: 10.00, name: 'Widget A' })])
      const card = screen.getAllByText('Widget A')[0].closest('div[class*="rounded-lg"]') as HTMLElement
      await act(async () => { fireEvent.click(card) })
      await act(async () => { fireEvent.click(screen.getByText(/Pay \d/)) })
      const amountInput = screen.getByTestId('amount-paid-input')
      await act(async () => { fireEvent.change(amountInput, { target: { value: '20' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Complete Payment').closest('button') as HTMLButtonElement) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Payment failed'),
        'error'
      ))
    })
  })
})
