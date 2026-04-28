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

let mockIsOnline = true
let mockRefreshAdjustmentQueueCount: ReturnType<typeof vi.fn>
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => ({
    isOnline: mockIsOnline,
    refreshAdjustmentQueueCount: mockRefreshAdjustmentQueueCount,
  }),
}))

vi.mock('@/contexts/SettingsContext', () => ({
  useBusinessSettings: () => ({}),
}))

let mockGetJson: ReturnType<typeof vi.fn>
let mockPost: ReturnType<typeof vi.fn>
let mockPut: ReturnType<typeof vi.fn>
let mockLogActivity: ReturnType<typeof vi.fn>
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getJson: (...args: any[]) => mockGetJson(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
    logActivity: (...args: any[]) => mockLogActivity(...args),
  },
}))

vi.mock('@/utils/SessionManager', () => ({
  default: {
    getDashboardRoute: () => '/dashboard',
  },
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

// ModalKeyboard: always captures onSubmit (even when closed) so tests can call it directly
let _kbOnSubmit: ((val: string) => void) | null = null
vi.mock('@/components/ModalKeyboard', () => ({
  default: ({ onSubmit }: any) => {
    _kbOnSubmit = onSubmit  // always capture — kbTarget is already set before open=true
    return null
  },
}))

// HybridInput: simple input with testId derived from placeholder
vi.mock('@/components/HybridInput', () => ({
  default: ({ value, onChange, placeholder, className }: any) => {
    const key = placeholder?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) ?? 'input'
    return (
      <input
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        data-testid={`hi-${key}`}
      />
    )
  },
}))

import InventoryManagement from '@/components/InventoryManagement'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: any = {}): any {
  return {
    id: 1,
    name: 'Widget A',
    barcode: '123456789',
    stockQuantity: 50,
    cost: 5,
    price: 10,
    ...overrides,
  }
}

function makeAdjustment(overrides: any = {}): any {
  return {
    id: 1,
    product: makeProduct(),
    adjustmentType: 'DAMAGE',
    quantityChange: -5,
    quantityBefore: 50,
    quantityAfter: 45,
    reason: 'Water damage',
    notes: null,
    adjustedByEmployee: { name: 'Alice' },
    costImpact: -25,
    adjustmentDate: '2026-04-13T08:00:00Z',
    requiresApproval: false,
    isApproved: false,
    approvedByEmployee: null,
    ...overrides,
  }
}

function makeBatch(overrides: any = {}): any {
  return {
    id: 1,
    product: makeProduct(),
    batchNumber: 'BATCH-001',
    quantity: 10,
    expirationDate: '2026-06-01',
    manufacturingDate: '2026-01-01',
    supplier: 'ACME Supplies',
    expiryStatus: 'GOOD',
    daysUntilExpiry: 49,
    ...overrides,
  }
}

async function renderAndWait(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<InventoryManagement />)
  })
  return result
}

// Helper: simulate selecting a product via keyboard flow.
// kbTarget starts as 'productSearch' by default, so calling _kbOnSubmit directly
// triggers applyKb → sets productSearch AND showProductDropdown=true.
async function selectProductViaKb(productName: string) {
  // _kbOnSubmit = applyKb is always captured by the mock (even when keyboard is closed)
  // kbTarget defaults to 'productSearch' from useState
  await act(async () => { _kbOnSubmit!(productName) })
  // Product appears in dropdown (showProductDropdown=true). The dropdown item uses
  // class "text-sm font-medium" while the adjustment list uses "font-semibold".
  // Dropdown comes first in DOM order, so getAllByText[0] is the dropdown item.
  const matches = screen.getAllByText(productName)
  await act(async () => { fireEvent.click(matches[0]) })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockShowToast = vi.fn()
  mockRefreshAdjustmentQueueCount = vi.fn().mockResolvedValue(undefined)
  mockIsOnline = true
  _kbOnSubmit = null

  mockGetJson = vi.fn().mockImplementation((url: string) => {
    if (url === '/products') return Promise.resolve([makeProduct()])
    if (url === '/stockadjustments') return Promise.resolve([makeAdjustment()])
    if (url === '/stockadjustments/pending-approval') return Promise.resolve([])
    if (url.includes('/products/expiring')) return Promise.resolve([])
    return Promise.resolve([])
  })
  mockPost = vi.fn().mockResolvedValue({ id: 1 })
  mockPut = vi.fn().mockResolvedValue({ id: 1 })
  mockLogActivity = vi.fn().mockResolvedValue(undefined)

  ;(window as any).electronAPI = {
    queueAdjustment: vi.fn().mockResolvedValue(undefined),
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InventoryManagement', () => {

  // ── Header & Tabs ─────────────────────────────────────────────────────────

  describe('Header & Tabs', () => {
    it('renders "Advanced Inventory" title', async () => {
      await renderAndWait()
      expect(screen.getByText('Advanced Inventory')).toBeTruthy()
    })

    it('renders Back button', async () => {
      await renderAndWait()
      expect(screen.getByText('Back')).toBeTruthy()
    })

    it('Back navigates to dashboard', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Back')) })
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('renders Stock Adjustments tab', async () => {
      await renderAndWait()
      expect(screen.getByText('Stock Adjustments')).toBeTruthy()
    })

    it('renders Expiring Products tab', async () => {
      await renderAndWait()
      expect(screen.getByText('Expiring Products')).toBeTruthy()
    })

    it('renders Physical Counting tab', async () => {
      await renderAndWait()
      expect(screen.getByText('Physical Counting')).toBeTruthy()
    })

    it('defaults to Stock Adjustments tab', async () => {
      await renderAndWait()
      expect(screen.getByText('Create Stock Adjustment')).toBeTruthy()
    })

    it('clicking Expiring Products tab shows that content', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Expiring Products')) })
      expect(screen.getByText('Add Product Batch')).toBeTruthy()
    })

    it('clicking Physical Counting tab shows that content', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Physical Counting')) })
      expect(screen.getByText('Physical Inventory Count')).toBeTruthy()
    })
  })

  // ── Stock Adjustments Tab ─────────────────────────────────────────────────

  describe('Stock Adjustments Tab', () => {
    it('renders Product search field', async () => {
      await renderAndWait()
      expect(screen.getByPlaceholderText('Search by name or barcode...')).toBeTruthy()
    })

    it('renders Adjustment Type select', async () => {
      await renderAndWait()
      expect(screen.getByText('Select adjustment type')).toBeTruthy()
    })

    it('renders Quantity Change field', async () => {
      await renderAndWait()
      expect(screen.getByPlaceholderText('Enter positive or negative number')).toBeTruthy()
    })

    it('renders Reason field', async () => {
      await renderAndWait()
      expect(screen.getByPlaceholderText('Required: explain the adjustment')).toBeTruthy()
    })

    it('renders Create Adjustment button', async () => {
      await renderAndWait()
      expect(screen.getByText('Create Adjustment')).toBeTruthy()
    })

    it('renders Clear button', async () => {
      await renderAndWait()
      expect(screen.getAllByText('Clear').length).toBeGreaterThan(0)
    })

    it('shows warning toast when submitting with no product selected', async () => {
      await renderAndWait()
      const submitBtn = screen.getByText('Create Adjustment').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.submit(submitBtn.closest('form')!) })
      expect(mockShowToast).toHaveBeenCalledWith('Please select a valid product', 'warning')
    })

    it('shows "No adjustments found" when adjustment list is empty', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([])
        if (url === '/stockadjustments') return Promise.resolve([])
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([])
        if (url.includes('/products/expiring')) return Promise.resolve([])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('No adjustments found')).toBeTruthy()
    })

    it('shows adjustment list when data present', async () => {
      await renderAndWait()
      expect(screen.getByText('Widget A')).toBeTruthy()
      expect(screen.getByText('Water damage')).toBeTruthy()
    })

    it('shows adjustment type display label', async () => {
      await renderAndWait()
      // DAMAGE → 'Damage' via getAdjustmentTypeDisplay
      expect(screen.getByText(/Damage:/)).toBeTruthy()
    })

    it('does NOT show pending approvals section when no pending adjustments', async () => {
      await renderAndWait()
      expect(screen.queryByText('Pending Approvals')).toBeNull()
    })

    it('shows pending approvals section when pending adjustments exist', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct()])
        if (url === '/stockadjustments') return Promise.resolve([])
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([makeAdjustment({ id: 99, requiresApproval: true, isApproved: false })])
        if (url.includes('/products/expiring')) return Promise.resolve([])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('Pending Approvals')).toBeTruthy()
    })

    it('shows Approve button for pending adjustments', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct()])
        if (url === '/stockadjustments') return Promise.resolve([])
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([makeAdjustment({ id: 99 })])
        if (url.includes('/products/expiring')) return Promise.resolve([])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('Approve')).toBeTruthy()
    })

    it('Approve button calls ApiClient.put with correct endpoint', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct()])
        if (url === '/stockadjustments') return Promise.resolve([])
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([makeAdjustment({ id: 99 })])
        if (url.includes('/products/expiring')) return Promise.resolve([])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Approve')) })
      expect(mockPut).toHaveBeenCalledWith('/stockadjustments/99/approve', {})
    })

    it('approve success shows success toast', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([makeAdjustment({ id: 99 })])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Approve')) })
      expect(mockShowToast).toHaveBeenCalledWith('Stock adjustment approved and applied', 'success')
    })

    it('approve failure shows error toast', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([makeAdjustment({ id: 99 })])
        return Promise.resolve([])
      })
      mockPut.mockRejectedValue(new Error('server error'))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Approve')) })
      expect(mockShowToast).toHaveBeenCalledWith('Failed to approve adjustment. Please try again.', 'error')
    })

    it('product appears in dropdown after KB search (kbTarget=productSearch by default)', async () => {
      await renderAndWait()
      // Calling _kbOnSubmit directly triggers applyKb with kbTarget='productSearch' (initial state)
      // This sets productSearch AND showProductDropdown=true
      await act(async () => { _kbOnSubmit!('Widget') })
      // Widget A should appear in dropdown (and also in the adjustments list) — use getAllByText
      expect(screen.getAllByText('Widget A').length).toBeGreaterThanOrEqual(2)
    })

    it('selecting product from dropdown shows selected product badge', async () => {
      await renderAndWait()
      await selectProductViaKb('Widget A')
      // Confirmation badge appears — "Stock: 50" may appear in multiple elements
      // (badge + adjustment list), so we verify at least one is present
      expect(screen.getAllByText(/Stock: 50/).length).toBeGreaterThanOrEqual(1)
    })

    it('creates adjustment online when product is selected', async () => {
      await renderAndWait()
      await selectProductViaKb('Widget A')

      // Select adjustment type
      const typeSelect = screen.getAllByRole('combobox')[0]
      await act(async () => { fireEvent.change(typeSelect, { target: { value: 'DAMAGE' } }) })

      // Enter quantity: type directly into HybridInput (it's not readOnly in the form)
      const qtyInput = screen.getByPlaceholderText('Enter positive or negative number')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '-5' } }) })

      // Enter reason
      const reasonInput = screen.getByPlaceholderText('Required: explain the adjustment')
      await act(async () => { fireEvent.change(reasonInput, { target: { value: 'Water damage' } }) })

      // Submit form
      const form = screen.getByText('Create Adjustment').closest('form') as HTMLFormElement
      await act(async () => { fireEvent.submit(form) })

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith('/stockadjustments', expect.objectContaining({
          productId: 1,
          adjustmentType: 'DAMAGE',
          quantityChange: -5,
          reason: 'Water damage',
        }))
      })
    })

    it('shows success toast after creating adjustment', async () => {
      await renderAndWait()
      await selectProductViaKb('Widget A')

      const typeSelect = screen.getAllByRole('combobox')[0]
      await act(async () => { fireEvent.change(typeSelect, { target: { value: 'CORRECTION' } }) })

      const qtyInput = screen.getByPlaceholderText('Enter positive or negative number')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '10' } }) })

      const reasonInput = screen.getByPlaceholderText('Required: explain the adjustment')
      await act(async () => { fireEvent.change(reasonInput, { target: { value: 'Found items' } }) })

      const form = screen.getByText('Create Adjustment').closest('form') as HTMLFormElement
      await act(async () => { fireEvent.submit(form) })

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Stock adjustment created successfully', 'success')
      })
    })

    it('shows error toast when create adjustment fails', async () => {
      mockPost.mockRejectedValue(new Error('server error'))
      await renderAndWait()
      await selectProductViaKb('Widget A')

      const typeSelect = screen.getAllByRole('combobox')[0]
      await act(async () => { fireEvent.change(typeSelect, { target: { value: 'DAMAGE' } }) })

      const qtyInput = screen.getByPlaceholderText('Enter positive or negative number')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '5' } }) })

      const reasonInput = screen.getByPlaceholderText('Required: explain the adjustment')
      await act(async () => { fireEvent.change(reasonInput, { target: { value: 'Some reason' } }) })

      const form = screen.getByText('Create Adjustment').closest('form') as HTMLFormElement
      await act(async () => { fireEvent.submit(form) })

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to create adjustment. Please try again.', 'error')
      })
    })

    it('queues adjustment offline when isOnline=false: correct data shape and refreshes count', async () => {
      mockIsOnline = false
      await renderAndWait()
      await selectProductViaKb('Widget A')

      const typeSelect = screen.getAllByRole('combobox')[0]
      await act(async () => { fireEvent.change(typeSelect, { target: { value: 'DAMAGE' } }) })

      const qtyInput = screen.getByPlaceholderText('Enter positive or negative number')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '5' } }) })

      const reasonInput = screen.getByPlaceholderText('Required: explain the adjustment')
      await act(async () => { fireEvent.change(reasonInput, { target: { value: 'Offline damage' } }) })

      const form = screen.getByText('Create Adjustment').closest('form') as HTMLFormElement
      await act(async () => { fireEvent.submit(form) })

      await waitFor(() => {
        expect((window as any).electronAPI.queueAdjustment).toHaveBeenCalled()
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Offline'), 'warning')
      })

      const queued = (window as any).electronAPI.queueAdjustment.mock.calls[0][0]
      expect(queued.id).toMatch(/^ADJ-OFFLINE-/)
      expect(queued.productName).toBe('Widget A')
      expect(queued.adjustmentData).toBeDefined()
      expect(queued.adjustmentData.productId).toBe(1)
      expect(queued.adjustmentData.adjustmentType).toBe('DAMAGE')
      expect(queued.adjustmentData.quantityChange).toBe(5)
      expect(queued.adjustmentData.reason).toBe('Offline damage')
      expect(mockRefreshAdjustmentQueueCount).toHaveBeenCalled()
    })

    it('online API failure shows error toast and does NOT queue the adjustment', async () => {
      mockIsOnline = true
      mockPost.mockRejectedValue(new Error('server error'))
      await renderAndWait()
      await selectProductViaKb('Widget A')

      const typeSelect = screen.getAllByRole('combobox')[0]
      await act(async () => { fireEvent.change(typeSelect, { target: { value: 'DAMAGE' } }) })

      const qtyInput = screen.getByPlaceholderText('Enter positive or negative number')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '5' } }) })

      const reasonInput = screen.getByPlaceholderText('Required: explain the adjustment')
      await act(async () => { fireEvent.change(reasonInput, { target: { value: 'Some reason' } }) })

      const form = screen.getByText('Create Adjustment').closest('form') as HTMLFormElement
      await act(async () => { fireEvent.submit(form) })

      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create'), 'error'
      ))
      expect((window as any).electronAPI.queueAdjustment).not.toHaveBeenCalled()
    })

    it('shows "Approved" badge when requiresApproval and isApproved', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/stockadjustments') return Promise.resolve([makeAdjustment({ requiresApproval: true, isApproved: true })])
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('Approved')).toBeTruthy()
    })

    it('shows "Pending" badge when requiresApproval and not approved', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/stockadjustments') return Promise.resolve([makeAdjustment({ requiresApproval: true, isApproved: false })])
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([])
        return Promise.resolve([])
      })
      await renderAndWait()
      expect(screen.getByText('Pending')).toBeTruthy()
    })
  })

  // ── Expiring Products Tab ─────────────────────────────────────────────────

  describe('Expiring Products Tab', () => {
    it('shows "No product batches found" when no batches', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Expiring Products')) })
      expect(screen.getByText('No product batches found')).toBeTruthy()
    })

    it('shows batch list when batches present', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct()])
        if (url === '/stockadjustments') return Promise.resolve([])
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([])
        if (url.includes('/products/expiring')) return Promise.resolve([makeBatch()])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Expiring Products')) })
      expect(screen.getByText('BATCH-001')).toBeTruthy()
    })

    it('shows expiry status badge', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/products/expiring')) return Promise.resolve([makeBatch({ expiryStatus: 'GOOD' })])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Expiring Products')) })
      expect(screen.getByText('GOOD')).toBeTruthy()
    })

    it('shows "Mark Expired" button for CRITICAL status', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/products/expiring')) return Promise.resolve([makeBatch({ expiryStatus: 'CRITICAL' })])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Expiring Products')) })
      expect(screen.getByText('Mark Expired')).toBeTruthy()
    })

    it('"Mark Expired" switches to adjustments tab', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/products/expiring')) return Promise.resolve([makeBatch({ expiryStatus: 'CRITICAL' })])
        return Promise.resolve([])
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Expiring Products')) })
      await act(async () => { fireEvent.click(screen.getByText('Mark Expired')) })
      // Should switch to adjustments tab
      expect(screen.getByText('Create Stock Adjustment')).toBeTruthy()
    })

    it('shows Add Product Batch section', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Expiring Products')) })
      expect(screen.getByText('Add Product Batch')).toBeTruthy()
    })

    it('shows Add Batch button', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Expiring Products')) })
      expect(screen.getByText('Add Batch')).toBeTruthy()
    })
  })

  // ── Physical Counting Tab ─────────────────────────────────────────────────

  describe('Physical Counting Tab', () => {
    it('shows Physical Inventory Count section', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Physical Counting')) })
      expect(screen.getByText('Physical Inventory Count')).toBeTruthy()
    })

    it('shows Apply Count button when product is selected', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Physical Counting')) })
      // Select product via KB (kbTarget='productSearch' by default)
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      // Apply Count button appears once selectedProductObj is set
      expect(screen.getByText('Apply Count')).toBeTruthy()
    })

    it('shows System Stock label when product selected', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Physical Counting')) })
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      expect(screen.getByText('System Stock')).toBeTruthy()
    })

    it('shows "no adjustment needed" when counts match', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Physical Counting')) })
      // Select product (kbTarget defaults to 'productSearch')
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })

      // Click the "Enter actual count" plain input (it sets kbTarget='quantityChange' via onClick)
      const countInput = screen.getByPlaceholderText('Enter actual count')
      await act(async () => { fireEvent.click(countInput) })
      // Now kbTarget='quantityChange' → call _kbOnSubmit to set quantityChange
      await act(async () => { _kbOnSubmit!('50') })  // 50 matches stockQuantity=50

      await act(async () => { fireEvent.click(screen.getByText('Apply Count')) })
      expect(mockShowToast).toHaveBeenCalledWith('No adjustment needed — counts match', 'info')
    })
  })

  // ── Error Handling ────────────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('continues loading when products endpoint fails (no crash)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.reject(new Error('network error'))
        if (url === '/stockadjustments') return Promise.resolve([])
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([])
        if (url.includes('/products/expiring')) return Promise.resolve([])
        return Promise.resolve([])
      })
      const { container } = await renderAndWait()
      expect(container).toBeTruthy()
    })

    it('continues when adjustments endpoint fails (no crash)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/products') return Promise.resolve([makeProduct()])
        if (url === '/stockadjustments') return Promise.reject(new Error('fail'))
        if (url === '/stockadjustments/pending-approval') return Promise.resolve([])
        if (url.includes('/products/expiring')) return Promise.resolve([])
        return Promise.resolve([])
      })
      const { container } = await renderAndWait()
      expect(container).toBeTruthy()
    })
  })

  // ── Expiring Products Tab — Add Batch ──────────────────────────────────────

  describe('Add Batch Form', () => {
    async function goToExpiringTab() {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Expiring Products')) })
    }

    it('shows warning when submitting with no product or quantity', async () => {
      await goToExpiringTab()
      const addBatchBtn = screen.getByText('Add Batch').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(addBatchBtn) })
      expect(mockShowToast).toHaveBeenCalledWith(
        'Please select a product and enter quantity',
        'warning'
      )
    })

    it('shows warning when product selected but no quantity', async () => {
      await goToExpiringTab()
      // Select product via KB
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getAllByText('Widget A')[0]) })
      // No quantityChange — should warn
      const addBatchBtn = screen.getByText('Add Batch').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(addBatchBtn) })
      expect(mockShowToast).toHaveBeenCalledWith(
        'Please select a product and enter quantity',
        'warning'
      )
    })

    it('adds batch successfully with product + quantity', async () => {
      await goToExpiringTab()
      // Select product
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getAllByText('Widget A')[0]) })
      // Set quantity via KB: click the "Supplier Lot Number" input sets kbTarget='notes',
      // but clicking the Quantity input sets kbTarget='quantityChange'.
      const qtyInput = screen.getByPlaceholderText('Enter quantity')
      await act(async () => { fireEvent.click(qtyInput) })
      // Now kbTarget='quantityChange' → submit via KB
      await act(async () => { _kbOnSubmit!('10') })

      // Click Add Batch
      const addBatchBtn = screen.getByText('Add Batch').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(addBatchBtn) })

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          `/products/1/batches`,
          expect.objectContaining({
            quantity: 10,
            costPerUnit: 5,
          })
        )
      })
    })

    it('shows success toast after adding batch', async () => {
      await goToExpiringTab()
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getAllByText('Widget A')[0]) })
      const qtyInput = screen.getByPlaceholderText('Enter quantity')
      await act(async () => { fireEvent.click(qtyInput) })
      await act(async () => { _kbOnSubmit!('5') })

      const addBatchBtn = screen.getByText('Add Batch').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(addBatchBtn) })

      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Batch added successfully'),
        'success'
      ))
    })

    it('shows error toast when add batch API fails', async () => {
      mockPost.mockRejectedValue(new Error('server error'))
      await goToExpiringTab()
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getAllByText('Widget A')[0]) })
      const qtyInput = screen.getByPlaceholderText('Enter quantity')
      await act(async () => { fireEvent.click(qtyInput) })
      await act(async () => { _kbOnSubmit!('5') })

      const addBatchBtn = screen.getByText('Add Batch').closest('button') as HTMLButtonElement
      await act(async () => { fireEvent.click(addBatchBtn) })

      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'Failed to add batch. Please try again.',
        'error'
      ))
    })

    it('Clear button resets fields on Expiring Products tab', async () => {
      await goToExpiringTab()
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getAllByText('Widget A')[0]) })
      // Click Clear button in the expiring tab (all Clear buttons)
      const clearBtns = screen.getAllByText('Clear')
      await act(async () => { fireEvent.click(clearBtns[clearBtns.length - 1]) })
      // Product selection should be cleared — no badge visible
      expect(screen.queryByText(/Stock: 50/)).toBeNull()
    })
  })

  // ── Physical Counting Tab — Apply Count (online diff) ────────────────────

  describe('Physical Counting Tab — Apply Count', () => {
    async function setupPhysicalCount(actualCount: string) {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Physical Counting')) })
      // Select product
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      // Enter actual count via KB
      const countInput = screen.getByPlaceholderText('Enter actual count')
      await act(async () => { fireEvent.click(countInput) })
      await act(async () => { _kbOnSubmit!(actualCount) })
    }

    it('shows positive difference when actual count > system stock', async () => {
      await setupPhysicalCount('60')
      // diff = 60 - 50 = +10
      expect(screen.getByText('+10')).toBeTruthy()
    })

    it('shows negative difference when actual count < system stock', async () => {
      await setupPhysicalCount('40')
      // diff = 40 - 50 = -10
      expect(screen.getByText('-10')).toBeTruthy()
    })

    it('Apply Count online: posts CORRECTION adjustment with correct diff', async () => {
      await setupPhysicalCount('55')
      await act(async () => { fireEvent.click(screen.getByText('Apply Count')) })
      await waitFor(() => expect(mockPost).toHaveBeenCalledWith(
        '/stockadjustments',
        expect.objectContaining({
          productId: 1,
          adjustmentType: 'CORRECTION',
          quantityChange: 5,
          reason: 'Physical count adjustment',
        })
      ))
    })

    it('Apply Count online: shows success toast', async () => {
      await setupPhysicalCount('55')
      await act(async () => { fireEvent.click(screen.getByText('Apply Count')) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'Stock adjusted based on physical count',
        'success'
      ))
    })

    it('Apply Count offline: queues adjustment and shows warning toast', async () => {
      mockIsOnline = false
      await setupPhysicalCount('45')
      await act(async () => { fireEvent.click(screen.getByText('Apply Count')) })
      await waitFor(() => {
        expect((window as any).electronAPI.queueAdjustment).toHaveBeenCalled()
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Offline'),
          'warning'
        )
      })
      const queued = (window as any).electronAPI.queueAdjustment.mock.calls[0][0]
      expect(queued.id).toMatch(/^ADJ-OFFLINE-/)
      expect(queued.adjustmentData.adjustmentType).toBe('CORRECTION')
      expect(queued.adjustmentData.quantityChange).toBe(-5)
    })

    it('Apply Count online API failure shows error toast', async () => {
      mockPost.mockRejectedValue(new Error('server error'))
      await setupPhysicalCount('55')
      await act(async () => { fireEvent.click(screen.getByText('Apply Count')) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'Failed to create adjustment. Please try again.',
        'error'
      ))
    })

    it('Clear button on physical count tab resets fields', async () => {
      await setupPhysicalCount('55')
      const clearBtns = screen.getAllByText('Clear')
      await act(async () => { fireEvent.click(clearBtns[clearBtns.length - 1]) })
      // After clear, selectedProductObj is null so the product card disappears entirely
      expect(screen.queryByText('System Stock')).toBeNull()
    })

    it('Apply Count when quantityChange is empty: does nothing', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Physical Counting')) })
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      // quantityChange is empty — clicking Apply Count should be a no-op
      await act(async () => { fireEvent.click(screen.getByText('Apply Count')) })
      expect(mockPost).not.toHaveBeenCalled()
      expect(mockShowToast).not.toHaveBeenCalled()
    })

    it('ModalKeyboard initialValue uses quantityChange for quantityChange target', async () => {
      // This validates the kbTarget='quantityChange' branch in ModalKeyboard initialValue expression
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Physical Counting')) })
      await act(async () => { _kbOnSubmit!('Widget') })
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      const countInput = screen.getByPlaceholderText('Enter actual count')
      await act(async () => { fireEvent.click(countInput) })
      // kbTarget is now 'quantityChange'; applyKb sets quantityChange state
      await act(async () => { _kbOnSubmit!('30') })
      expect(screen.getByText('30')).toBeTruthy()
    })
  })
})
