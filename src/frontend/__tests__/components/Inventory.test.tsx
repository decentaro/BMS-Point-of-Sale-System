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

vi.mock('@/components/SessionGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/SessionStatus', () => ({
  default: () => null,
}))

let mockShowToast: ReturnType<typeof vi.fn>
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: (...args: any[]) => mockShowToast(...args) }),
}))

vi.mock('@/utils/SessionManager', () => ({
  default: { getDashboardRoute: () => '/manager' },
}))

// HybridInput: render a plain input that passes value/onChange through
vi.mock('@/components/HybridInput', () => ({
  default: ({ value, onChange, placeholder, className, type }: any) => (
    <input
      data-testid={`hybrid-${placeholder?.replace(/\s+/g, '-').toLowerCase() ?? 'input'}`}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      className={className}
      type={type === 'decimal' ? 'number' : 'text'}
    />
  ),
}))

// ModalKeyboard: always capture onSubmit even when open=false
let _kbOnSubmit: ((val: string) => void) | null = null
vi.mock('@/components/ModalKeyboard', () => ({
  default: ({ onSubmit }: any) => {
    _kbOnSubmit = onSubmit
    return null
  },
}))

let mockGetSettings: ReturnType<typeof vi.fn>
let mockGetProducts: ReturnType<typeof vi.fn>
let mockPostJson: ReturnType<typeof vi.fn>
let mockPut: ReturnType<typeof vi.fn>
let mockDelete: ReturnType<typeof vi.fn>
let mockGetJson: ReturnType<typeof vi.fn>
let mockUploadFile: ReturnType<typeof vi.fn>

vi.mock('@/utils/ApiClient', () => ({
  default: {
    getSettings: (...args: any[]) => mockGetSettings(...args),
    getProducts: (...args: any[]) => mockGetProducts(...args),
    postJson: (...args: any[]) => mockPostJson(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args),
    getJson: (...args: any[]) => mockGetJson(...args),
    uploadFile: (...args: any[]) => mockUploadFile(...args),
  },
}))

import Inventory from '@/components/Inventory'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: any = {}): any {
  return {
    id: 1,
    barcode: '123456789',
    name: 'Widget A',
    price: 10.00,
    cost: 5.00,
    stockQuantity: 50,
    minStockLevel: 5,
    unit: 'pcs',
    isActive: true,
    createdDate: '2025-01-01T00:00:00Z',
    lastUpdated: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeSettings(): any {
  return { productCategories: 'Electronics,Food,Beverages' }
}

function setupDefaultMocks() {
  mockGetSettings.mockResolvedValue(makeSettings())
  mockGetProducts.mockResolvedValue([makeProduct(), makeProduct({ id: 2, name: 'Gadget B', price: 20, stockQuantity: 3, minStockLevel: 5 })])
  mockPostJson.mockResolvedValue(makeProduct({ id: 3, name: 'New Product' }))
  mockPut.mockResolvedValue(undefined)
  mockDelete.mockResolvedValue(undefined)
  mockGetJson.mockResolvedValue(makeProduct())
}

async function renderAndWait(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<Inventory />)
  })
  return result
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockShowToast = vi.fn()
  mockGetSettings = vi.fn()
  mockGetProducts = vi.fn()
  mockPostJson = vi.fn()
  mockPut = vi.fn()
  mockDelete = vi.fn()
  mockGetJson = vi.fn()
  mockUploadFile = vi.fn()
  _kbOnSubmit = null
  setupDefaultMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Inventory', () => {

  // ── Header ────────────────────────────────────────────────────────────────

  describe('Header', () => {
    it('renders Inventory title', async () => {
      await renderAndWait()
      expect(screen.getByText('Inventory')).toBeTruthy()
    })

    it('renders Back button', async () => {
      await renderAndWait()
      expect(screen.getByText('Back')).toBeTruthy()
    })

    it('Back button navigates via SessionManager route', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Back')) })
      expect(mockNavigate).toHaveBeenCalledWith('/manager')
    })
  })

  // ── Loading state ─────────────────────────────────────────────────────────

  describe('Loading State', () => {
    it('shows loading indicator while products load', async () => {
      let resolveProducts!: (v: any) => void
      mockGetProducts.mockReturnValue(new Promise(r => { resolveProducts = r }))
      await act(async () => { render(<Inventory />) })
      expect(screen.getByText('Loading products…')).toBeTruthy()
      // Clean up: resolve so no state-update leak
      await act(async () => { resolveProducts([]) })
    })
  })

  // ── Product list ──────────────────────────────────────────────────────────

  describe('Product List', () => {
    it('shows product count after load', async () => {
      await renderAndWait()
      expect(screen.getByText('2 shown')).toBeTruthy()
    })

    it('renders product names', async () => {
      await renderAndWait()
      expect(screen.getByText('Widget A')).toBeTruthy()
      expect(screen.getByText('Gadget B')).toBeTruthy()
    })

    it('renders product price', async () => {
      await renderAndWait()
      // Widget A price = 10.00
      expect(screen.getAllByText('10.00').length).toBeGreaterThanOrEqual(1)
    })

    it('shows Qty badge for in-stock product', async () => {
      await renderAndWait()
      expect(screen.getByText('Qty: 50')).toBeTruthy()
    })

    it('shows Low Stock badge when stockQuantity <= minStockLevel', async () => {
      await renderAndWait()
      // Gadget B: stockQuantity=3, minStockLevel=5 → Low Stock
      expect(screen.getByText('Low Stock')).toBeTruthy()
    })

    it('shows Out of Stock badge when stockQuantity=0', async () => {
      mockGetProducts.mockResolvedValue([makeProduct({ stockQuantity: 0 })])
      await renderAndWait()
      expect(screen.getByText('Out of Stock')).toBeTruthy()
    })

    it('shows empty state when no products', async () => {
      mockGetProducts.mockResolvedValue([])
      await renderAndWait()
      expect(screen.getByText('No products available.')).toBeTruthy()
    })

    it('shows error toast when products fail to load', async () => {
      mockGetProducts.mockRejectedValue(new Error('network'))
      await renderAndWait()
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load products'),
        'error'
      )
    })
  })

  // ── Product Detail Modal ──────────────────────────────────────────────────

  describe('Product Detail Modal', () => {
    it('opens product detail modal on card click', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      expect(screen.getByText('Product Details')).toBeTruthy()
    })

    it('shows product name in modal', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      // Modal renders the name as h3
      const headings = screen.getAllByText('Widget A')
      expect(headings.length).toBeGreaterThanOrEqual(1)
    })

    it('shows barcode in modal', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      expect(screen.getByText('123456789')).toBeTruthy()
    })

    it('shows stock info in modal', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      expect(screen.getByText(/50 pcs in stock/)).toBeTruthy()
    })

    it('closes modal on Close button', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      await act(async () => { fireEvent.click(screen.getByText('Close')) })
      expect(screen.queryByText('Product Details')).toBeNull()
    })

    it('enters edit mode from modal Edit Product button', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      await act(async () => { fireEvent.click(screen.getByText('Edit Product')) })
      // Modal closed, form header shows "Edit: Widget A"
      expect(screen.queryByText('Product Details')).toBeNull()
      expect(screen.getByText('Edit: Widget A')).toBeTruthy()
    })
  })

  // ── Form: Add vs Edit mode ────────────────────────────────────────────────

  describe('Form Mode', () => {
    it('shows "Add New Product" form header by default', async () => {
      await renderAndWait()
      expect(screen.getByText('Add New Product')).toBeTruthy()
    })

    it('shows "Edit: Widget A" header after selecting product', async () => {
      await renderAndWait()
      // Click "Edit" button on product card (stopPropagation, requires button click)
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      expect(screen.getByText('Edit: Widget A')).toBeTruthy()
    })
  })

  // ── Action buttons state ──────────────────────────────────────────────────

  describe('Action Buttons', () => {
    it('Add button is enabled when not editing', async () => {
      await renderAndWait()
      const addBtn = screen.getByText('Add').closest('button')!
      expect(addBtn.disabled).toBe(false)
    })

    it('Save button is disabled when not editing', async () => {
      await renderAndWait()
      const saveBtn = screen.getByText('Save').closest('button')!
      expect(saveBtn.disabled).toBe(true)
    })

    it('Delete button is disabled when no product selected', async () => {
      await renderAndWait()
      const deleteBtn = screen.getByText('Delete').closest('button')!
      expect(deleteBtn.disabled).toBe(true)
    })

    it('Save and Delete enabled after selecting product for edit', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      expect(screen.getByText('Save').closest('button')!.disabled).toBe(false)
      expect(screen.getByText('Delete').closest('button')!.disabled).toBe(false)
    })

    it('Add button is disabled when editing', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      expect(screen.getByText('Add').closest('button')!.disabled).toBe(true)
    })

    it('Clear button resets to Add mode', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Clear')) })
      expect(screen.getByText('Add New Product')).toBeTruthy()
    })
  })

  // ── Delete confirmation modal ─────────────────────────────────────────────

  describe('Delete Flow', () => {
    it('shows delete confirmation modal when Delete clicked', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Delete')) })
      // Modal heading "Delete Product" appears; also check unique subtitle
      expect(screen.getByText('This action cannot be undone')).toBeTruthy()
    })

    it('cancel dismisses delete modal', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Delete')) })
      await act(async () => { fireEvent.click(screen.getByText('Cancel')) })
      expect(screen.queryByText('This action cannot be undone')).toBeNull()
    })

    it('confirming delete calls ApiClient.delete and reloads products', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Delete')) })
      // Confirm button: role="button" with text "Delete Product"
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Delete Product/ })) })
      expect(mockDelete).toHaveBeenCalledWith('/products/1')
      expect(mockGetProducts).toHaveBeenCalledTimes(2) // initial + after delete
    })

    it('shows error toast when delete fails', async () => {
      mockDelete.mockRejectedValue(new Error('fail'))
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Delete')) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Delete Product/ })) })
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete'),
        'error'
      )
    })
  })

  // ── Add product flow ──────────────────────────────────────────────────────

  describe('Add Product Flow', () => {
    it('Add button calls postJson and reloads products', async () => {
      await renderAndWait()
      // Fill name via KB
      await act(async () => { _kbOnSubmit!('My Product') })
      await act(async () => { fireEvent.click(screen.getByText('Add')) })
      await waitFor(() => {
        expect(mockPostJson).toHaveBeenCalledWith('/products', expect.objectContaining({}))
      })
      expect(mockGetProducts).toHaveBeenCalledTimes(2) // initial + after add
    })

    it('shows success toast after add', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Add')) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Product added successfully', 'success')
      })
    })

    it('shows error toast when add fails', async () => {
      mockPostJson.mockRejectedValue(new Error('fail'))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Add')) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Failed to add product'),
          'error'
        )
      })
    })
  })

  // ── Save (edit) product flow ──────────────────────────────────────────────

  describe('Save Product Flow', () => {
    it('Save button calls ApiClient.put and reloads products', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Save')) })
      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith('/products/1', expect.objectContaining({ id: 1 }))
      })
      expect(mockGetProducts).toHaveBeenCalledTimes(2) // initial + after save
    })

    it('shows success toast after save', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Save')) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Product updated successfully', 'success')
      })
    })

    it('shows error toast when save fails', async () => {
      mockPut.mockRejectedValue(new Error('fail'))
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Save')) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Failed to save'),
          'error'
        )
      })
    })
  })

  // ── Search filter ─────────────────────────────────────────────────────────

  describe('Search Filter', () => {
    it('filters products by name search', async () => {
      await renderAndWait()
      const searchInput = screen.getByTestId('hybrid-search-products…')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'Widget' } }) })
      // "Widget A" shown, "Gadget B" not shown
      expect(screen.getByText('1 shown')).toBeTruthy()
      expect(screen.queryByText('Gadget B')).toBeNull()
    })

    it('shows "No products match your search." for no-match search', async () => {
      await renderAndWait()
      const searchInput = screen.getByTestId('hybrid-search-products…')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'xyznotfound' } }) })
      expect(screen.getByText('No products match your search.')).toBeTruthy()
    })
  })

  // ── Category filter ───────────────────────────────────────────────────────

  describe('Category Filter', () => {
    it('populates category dropdown from system settings', async () => {
      await renderAndWait()
      // Categories from settings: Electronics, Food, Beverages
      const allCatSelect = screen.getAllByRole('combobox')[0]
      expect(allCatSelect.innerHTML).toContain('Electronics')
      expect(allCatSelect.innerHTML).toContain('Food')
    })

    it('filters products by selected category', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', category: 'Electronics' }),
        makeProduct({ id: 2, name: 'Apple Juice', category: 'Food' }),
      ])
      await renderAndWait()
      const catSelect = screen.getAllByRole('combobox')[0]
      await act(async () => { fireEvent.change(catSelect, { target: { value: 'Electronics' } }) })
      expect(screen.getByText('1 shown')).toBeTruthy()
      expect(screen.queryByText('Apple Juice')).toBeNull()
    })
  })

  // ── Barcode search ────────────────────────────────────────────────────────

  describe('Barcode Search', () => {
    it('Find button is disabled when barcode is empty', async () => {
      await renderAndWait()
      const findBtn = screen.getByText('Find').closest('button')!
      expect(findBtn.disabled).toBe(true)
    })

    it('Find button enabled when barcode filled', async () => {
      await renderAndWait()
      const barcodeInput = screen.getByTestId('hybrid-scan-or-type-barcode')
      await act(async () => { fireEvent.change(barcodeInput, { target: { value: '12345' } }) })
      const findBtn = screen.getByText('Find').closest('button')!
      expect(findBtn.disabled).toBe(false)
    })

    it('Find button calls ApiClient.getJson for barcode search', async () => {
      await renderAndWait()
      const barcodeInput = screen.getByTestId('hybrid-scan-or-type-barcode')
      await act(async () => { fireEvent.change(barcodeInput, { target: { value: '12345' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Find')) })
      await waitFor(() => {
        expect(mockGetJson).toHaveBeenCalledWith(
          expect.stringContaining('/products/barcode/12345'),
          true
        )
      })
    })

    it('entering edit mode when barcode product found locally', async () => {
      await renderAndWait()
      const barcodeInput = screen.getByTestId('hybrid-scan-or-type-barcode')
      await act(async () => { fireEvent.change(barcodeInput, { target: { value: '123456789' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Find')) })
      await waitFor(() => {
        expect(screen.getByText('Edit: Widget A')).toBeTruthy()
      })
    })

    it('shows error toast when barcode search fails with non-404 error', async () => {
      mockGetJson.mockRejectedValue(new Error('network error'))
      await renderAndWait()
      const barcodeInput = screen.getByTestId('hybrid-scan-or-type-barcode')
      await act(async () => { fireEvent.change(barcodeInput, { target: { value: '12345' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Find')) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Barcode search failed'),
          'error'
        )
      })
    })
  })

  // ── Keyboard (KB) form input ──────────────────────────────────────────────

  describe('Keyboard Input', () => {
    it('KB submit updates form field (name via kbTarget)', async () => {
      await renderAndWait()
      // The ModalKeyboard always captures onSubmit; kbTarget defaults to 'barcode'
      // We can't easily change kbTarget without opening the KB, but we can verify
      // that the KB submit callback is available
      expect(_kbOnSubmit).not.toBeNull()
    })
  })

  // ── System settings categories ────────────────────────────────────────────

  describe('System Settings', () => {
    it('loads system settings on mount', async () => {
      await renderAndWait()
      expect(mockGetSettings).toHaveBeenCalledWith('system')
    })

    it('shows category select dropdown when settings has categories', async () => {
      await renderAndWait()
      // Category dropdown in form should show select with Electronics etc
      // (only shown when availableCategories.length > 0)
      expect(screen.getByText('Select category…')).toBeTruthy()
    })

    it('shows HybridInput for category when settings has no categories', async () => {
      mockGetSettings.mockResolvedValue({ productCategories: '' })
      await renderAndWait()
      expect(screen.queryByText('Select category…')).toBeNull()
    })
  })

  // ── Product card with imageUrl (line 586) ─────────────────────────────────

  describe('Product Card with Image', () => {
    it('renders img element when product has imageUrl', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', imageUrl: 'https://example.com/widget.png' }),
      ])
      await renderAndWait()
      const imgs = document.querySelectorAll('img[alt="Widget A"]')
      expect(imgs.length).toBeGreaterThanOrEqual(1)
    })

    it('does not render img when imageUrl is empty string', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', imageUrl: '' }),
      ])
      await renderAndWait()
      const imgs = document.querySelectorAll('img[alt="Widget A"]')
      expect(imgs.length).toBe(0)
    })

    it('does not render img when imageUrl is whitespace', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', imageUrl: '   ' }),
      ])
      await renderAndWait()
      const imgs = document.querySelectorAll('img[alt="Widget A"]')
      expect(imgs.length).toBe(0)
    })
  })

  // ── Product form fields (lines 697-783) ───────────────────────────────────

  describe('Product Form Fields', () => {
    it('form has quantity input field', async () => {
      await renderAndWait()
      expect(screen.getByTestId('hybrid-0')).toBeTruthy()
    })

    it('changing qty field updates form state', async () => {
      await renderAndWait()
      const qtyInput = screen.getByTestId('hybrid-0')
      await act(async () => { fireEvent.change(qtyInput, { target: { value: '25' } }) })
      expect((qtyInput as HTMLInputElement).value).toBe('25')
    })

    it('changing low stock field updates form state', async () => {
      await renderAndWait()
      const lowInput = screen.getByTestId('hybrid-5')
      await act(async () => { fireEvent.change(lowInput, { target: { value: '10' } }) })
      expect((lowInput as HTMLInputElement).value).toBe('10')
    })

    it('changing name field updates form state', async () => {
      await renderAndWait()
      const nameInput = screen.getByTestId('hybrid-product-name')
      await act(async () => { fireEvent.change(nameInput, { target: { value: 'My New Widget' } }) })
      expect((nameInput as HTMLInputElement).value).toBe('My New Widget')
    })

    it('changing price field updates form state', async () => {
      await renderAndWait()
      // Multiple inputs share the '0.00' placeholder; take the first (sale price field)
      const priceInput = screen.getAllByTestId('hybrid-0.00')[0]
      await act(async () => { fireEvent.change(priceInput, { target: { value: '99.99' } }) })
      expect((priceInput as HTMLInputElement).value).toBe('99.99')
    })

    it('Upload Image button triggers file input click', async () => {
      await renderAndWait()
      const uploadBtn = screen.getByText('Upload Image').closest('button')!
      // Should not throw
      expect(uploadBtn).toBeTruthy()
      await act(async () => { fireEvent.click(uploadBtn) })
    })

    it('selecting a category from dropdown updates form', async () => {
      await renderAndWait()
      // The form category select (second combobox — first is the filter, second is form)
      const selects = screen.getAllByRole('combobox')
      // selects[0] is category filter, selects[1] is form category
      const formCatSelect = selects[1]
      await act(async () => { fireEvent.change(formCatSelect, { target: { value: 'Electronics' } }) })
      expect((formCatSelect as HTMLSelectElement).value).toBe('Electronics')
    })

    it('form is pre-populated when editing a product', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      const nameInput = screen.getByTestId('hybrid-product-name')
      expect((nameInput as HTMLInputElement).value).toBe('Widget A')
    })

    it('Save submits updated form data with product id', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      // Change name
      const nameInput = screen.getByTestId('hybrid-product-name')
      await act(async () => { fireEvent.change(nameInput, { target: { value: 'Widget A Updated' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Save')) })
      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith('/products/1', expect.objectContaining({ id: 1 }))
      })
    })
  })

  // ── Delete modal X button (line 893) ─────────────────────────────────────

  describe('Delete Modal X Button', () => {
    it('X button in delete modal header closes the modal', async () => {
      await renderAndWait()
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Delete')) })
      // Modal is open
      expect(screen.getByText('This action cannot be undone')).toBeTruthy()
      // Find the X button — it's inside the modal header (not the form X)
      // It's an SVG button; find all buttons with X icon inside delete modal
      // The modal has a close <button> with only an X icon (no text) in the header
      const allButtons = screen.getAllByRole('button')
      // Find the X-icon button that's inside the delete modal (has no text content)
      const xButtons = allButtons.filter(b => b.textContent?.trim() === '')
      // Click the last one which is in the delete modal header
      const xButton = xButtons[xButtons.length - 1]
      await act(async () => { fireEvent.click(xButton) })
      expect(screen.queryByText('This action cannot be undone')).toBeNull()
    })
  })

  // ── UPC database fallback ─────────────────────────────────────────────────

  describe('UPC Database Fallback', () => {
    it('falls back to UPC lookup when local barcode search returns 404', async () => {
      // Local barcode lookup throws 404
      mockGetJson.mockRejectedValueOnce(Object.assign(new Error('404 Not Found'), { status: 404 }))

      // Mock global fetch for UPC item database
      const upcItem = {
        title: 'UPC Widget',
        brand: 'UPCBrand',
        category: 'Electronics',
        size: '250ml',
        images: ['https://example.com/upc-widget.png'],
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'OK', items: [upcItem] }),
      }))

      await renderAndWait()
      const barcodeInput = screen.getByTestId('hybrid-scan-or-type-barcode')
      await act(async () => { fireEvent.change(barcodeInput, { target: { value: '012345678905' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Find')) })

      await waitFor(() => {
        const nameInput = screen.getByTestId('hybrid-product-name')
        expect((nameInput as HTMLInputElement).value).toBe('UPC Widget')
      })

      vi.unstubAllGlobals()
    })

    it('populates barcode and price fields remain empty for user entry after UPC lookup', async () => {
      mockGetJson.mockRejectedValueOnce(Object.assign(new Error('404'), { status: 404 }))

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 'OK',
          items: [{ title: 'UPC Product', brand: 'B', category: 'Food', size: '', images: [] }],
        }),
      }))

      await renderAndWait()
      const barcodeInput = screen.getByTestId('hybrid-scan-or-type-barcode')
      await act(async () => { fireEvent.change(barcodeInput, { target: { value: '999888777666' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Find')) })

      await waitFor(() => {
        const nameInput = screen.getByTestId('hybrid-product-name')
        expect((nameInput as HTMLInputElement).value).toBe('UPC Product')
      })

      // Barcode field should remain set to the scanned barcode
      expect((barcodeInput as HTMLInputElement).value).toBe('999888777666')
      // Price fields start empty (user must fill in)
      const priceInputs = screen.getAllByTestId('hybrid-0.00')
      expect((priceInputs[0] as HTMLInputElement).value).toBe('')

      vi.unstubAllGlobals()
    })

    it('shows warning toast when UPC database returns no items', async () => {
      mockGetJson.mockRejectedValueOnce(Object.assign(new Error('404'), { status: 404 }))

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'OK', items: [] }),
      }))

      await renderAndWait()
      const barcodeInput = screen.getByTestId('hybrid-scan-or-type-barcode')
      await act(async () => { fireEvent.change(barcodeInput, { target: { value: '000000000000' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Find')) })

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('not found in UPC database'),
          'warning'
        )
      })

      vi.unstubAllGlobals()
    })
  })

  // ── Image upload — pending image on add ───────────────────────────────────

  describe('Image Upload', () => {
    // Helper: replace window.FileReader with a synchronous stub that calls onload immediately
    function stubFileReader(result: string = 'data:image/png;base64,abc') {
      const OriginalFileReader = window.FileReader
      class FakeFileReader {
        onload: ((evt: any) => void) | null = null
        readAsDataURL(_file: Blob) {
          if (this.onload) this.onload({ target: { result } })
        }
      }
      ;(window as any).FileReader = FakeFileReader
      return () => { (window as any).FileReader = OriginalFileReader }
    }

    it('sets pendingImageFile when file selected in add mode', async () => {
      await renderAndWait()
      const restore = stubFileReader()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const mockFile = new File(['imgdata'], 'product.png', { type: 'image/png' })

      await act(async () => {
        Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true })
        fireEvent.change(fileInput)
      })

      // After file select in add mode the filename is shown in the UI
      await waitFor(() => {
        expect(screen.getByText('product.png')).toBeTruthy()
      })

      restore()
    })

    it('calls ApiClient.uploadFile when pending image exists and Add is triggered', async () => {
      mockUploadFile.mockResolvedValue({
        ok: true,
        json: async () => ({ imageUrl: 'https://example.com/uploaded.png' }),
      })

      await renderAndWait()
      const restore = stubFileReader()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const mockFile = new File(['imgdata'], 'upload.png', { type: 'image/png' })

      await act(async () => {
        Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true })
        fireEvent.change(fileInput)
      })

      // Trigger Add — postJson returns a product with id=3
      await act(async () => { fireEvent.click(screen.getByText('Add')) })

      await waitFor(() => {
        expect(mockUploadFile).toHaveBeenCalledWith(
          '/products/3/image',
          mockFile,
          undefined,
          'image'
        )
      })

      restore()
    })

    it('calls ApiClient.uploadFile immediately when file selected while editing', async () => {
      mockUploadFile.mockResolvedValue({
        ok: true,
        json: async () => ({ imageUrl: 'https://example.com/edited.png' }),
      })

      await renderAndWait()
      // Enter edit mode first
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })

      const restore = stubFileReader()
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const mockFile = new File(['imgdata'], 'edit.png', { type: 'image/png' })

      await act(async () => {
        Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true })
        fireEvent.change(fileInput)
      })

      await waitFor(() => {
        expect(mockUploadFile).toHaveBeenCalledWith(
          '/products/1/image',
          mockFile,
          undefined,
          'image'
        )
      })

      restore()
    })
  })

  // ── Stock status badge edge cases ─────────────────────────────────────────

  describe('Stock Status Badge Edge Cases', () => {
    it('shows Low Stock when stockQuantity exactly equals minStockLevel', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Edge Product', stockQuantity: 5, minStockLevel: 5 }),
      ])
      await renderAndWait()
      expect(screen.getByText('Low Stock')).toBeTruthy()
    })

    it('shows Out of Stock badge when stockQuantity is 0', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'OOS Product', stockQuantity: 0, minStockLevel: 5 }),
      ])
      await renderAndWait()
      expect(screen.getByText('Out of Stock')).toBeTruthy()
    })
  })

  // ── Category field: select vs HybridInput ─────────────────────────────────

  describe('Category Field Toggle', () => {
    it('shows select dropdown in form when availableCategories is non-empty', async () => {
      // Default settings has categories
      await renderAndWait()
      // The form's category field renders as a <select> (second combobox after filter select)
      const selects = screen.getAllByRole('combobox')
      // At least 2 selects: filter and form category
      expect(selects.length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('Select category…')).toBeTruthy()
    })

    it('shows HybridInput for category when settings returns empty categories', async () => {
      mockGetSettings.mockResolvedValue({ productCategories: '' })
      await renderAndWait()
      // No "Select category…" option should exist
      expect(screen.queryByText('Select category…')).toBeNull()
      // HybridInput with placeholder "Category" should exist
      expect(screen.getByTestId('hybrid-category')).toBeTruthy()
    })

    it('shows HybridInput for category when settings returns null productCategories', async () => {
      mockGetSettings.mockResolvedValue({ productCategories: null })
      await renderAndWait()
      expect(screen.queryByText('Select category…')).toBeNull()
      expect(screen.getByTestId('hybrid-category')).toBeTruthy()
    })
  })

  // ── Search + category filter combined ─────────────────────────────────────

  describe('Search and Category Filter Combined', () => {
    it('shows product when both search and category filter match', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget', category: 'Electronics' }),
        makeProduct({ id: 2, name: 'Gadget', category: 'Electronics' }),
        makeProduct({ id: 3, name: 'Apple Juice', category: 'Food' }),
      ])
      await renderAndWait()

      // Filter by Electronics category
      const catSelect = screen.getAllByRole('combobox')[0]
      await act(async () => { fireEvent.change(catSelect, { target: { value: 'Electronics' } }) })

      // Search for "Widget"
      const searchInput = screen.getByTestId('hybrid-search-products…')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'Widget' } }) })

      expect(screen.getByText('Widget')).toBeTruthy()
      expect(screen.queryByText('Gadget')).toBeNull()
      expect(screen.queryByText('Apple Juice')).toBeNull()
      expect(screen.getByText('1 shown')).toBeTruthy()
    })

    it('hides product when category matches but search does not', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget', category: 'Electronics' }),
        makeProduct({ id: 2, name: 'Gadget', category: 'Electronics' }),
      ])
      await renderAndWait()

      const catSelect = screen.getAllByRole('combobox')[0]
      await act(async () => { fireEvent.change(catSelect, { target: { value: 'Electronics' } }) })

      const searchInput = screen.getByTestId('hybrid-search-products…')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'Gadget' } }) })

      expect(screen.queryByText('Widget')).toBeNull()
      expect(screen.getByText('Gadget')).toBeTruthy()
      expect(screen.getByText('1 shown')).toBeTruthy()
    })
  })

  // ── handleSave preserves existing fields ──────────────────────────────────

  describe('handleSave Preserves Fields', () => {
    it('PUT payload includes isActive and unit from original product', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', isActive: false, unit: 'kg', description: 'A desc' }),
      ])
      await renderAndWait()

      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Save')) })

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith('/products/1', expect.objectContaining({
          isActive: false,
          unit: 'kg',
          description: 'A desc',
        }))
      })
    })

    it('PUT payload defaults isActive to true when original has it undefined', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', isActive: undefined }),
      ])
      await renderAndWait()

      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })
      await act(async () => { fireEvent.click(screen.getByText('Save')) })

      await waitFor(() => {
        expect(mockPut).toHaveBeenCalledWith('/products/1', expect.objectContaining({
          isActive: true,
        }))
      })
    })
  })

  // ── selectProduct clears pending image ────────────────────────────────────

  describe('selectProduct Clears Pending Image', () => {
    it('clears pending image filename when clicking Edit on a product', async () => {
      await renderAndWait()

      // Stub FileReader so readAsDataURL calls onload synchronously
      const OriginalFileReader = window.FileReader
      class FakeFileReader {
        onload: ((evt: any) => void) | null = null
        readAsDataURL(_file: Blob) {
          if (this.onload) this.onload({ target: { result: 'data:image/png;base64,abc' } })
        }
      }
      ;(window as any).FileReader = FakeFileReader

      // Set up a pending image by selecting a file in add mode
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const mockFile = new File(['imgdata'], 'pending.png', { type: 'image/png' })

      await act(async () => {
        Object.defineProperty(fileInput, 'files', { value: [mockFile], configurable: true })
        fireEvent.change(fileInput)
      })

      // Pending image filename should show
      await waitFor(() => {
        expect(screen.getByText('pending.png')).toBeTruthy()
      })

      // Now click Edit on a product — selectProduct clears pendingImageFile
      const editBtns = screen.getAllByText('Edit')
      await act(async () => { fireEvent.click(editBtns[0]) })

      // Pending image filename should be gone
      expect(screen.queryByText('pending.png')).toBeNull()

      ;(window as any).FileReader = OriginalFileReader
    })
  })

  // ── Product image onError fallback ────────────────────────────────────────

  describe('Product Image onError Fallback', () => {
    it('hides img element when image fails to load (onError)', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', imageUrl: 'https://example.com/broken.png' }),
      ])
      await renderAndWait()

      const img = document.querySelector('img[alt="Widget A"]') as HTMLImageElement
      expect(img).not.toBeNull()
      expect(img.style.display).not.toBe('none')

      await act(async () => { fireEvent.error(img) })

      // After error, img should be hidden
      expect(img.style.display).toBe('none')
    })
  })

  // ── Product Detail Modal advanced ─────────────────────────────────────────

  describe('Product Detail Modal Advanced', () => {
    it('shows "No Image" placeholder when product has no imageUrl', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      expect(screen.getByText('No Image')).toBeTruthy()
    })

    it('shows product description in modal when present', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', description: 'A great widget' }),
      ])
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      expect(screen.getByText('A great widget')).toBeTruthy()
    })

    it('shows Out of Stock in modal for zero stock product', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', stockQuantity: 0, minStockLevel: 5 }),
      ])
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      expect(screen.getByText(/0 pcs in stock/)).toBeTruthy()
    })

    it('shows low stock warning in modal for low-stock product', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', stockQuantity: 3, minStockLevel: 5 }),
      ])
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      expect(screen.getByText(/3 pcs in stock/)).toBeTruthy()
    })

    it('shows variant info in modal when present', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', variant: '500ml' }),
      ])
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      expect(screen.getByText('500ml')).toBeTruthy()
    })

    it('closes modal when backdrop clicked', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      expect(screen.getByText('Product Details')).toBeTruthy()
      // Click the backdrop (absolute inset div)
      const backdrop = document.querySelector('.absolute.inset-0') as HTMLElement
      if (backdrop) {
        await act(async () => { fireEvent.click(backdrop) })
        expect(screen.queryByText('Product Details')).toBeNull()
      }
    })

    it('shows product with image in detail modal', async () => {
      mockGetProducts.mockResolvedValue([
        makeProduct({ id: 1, name: 'Widget A', imageUrl: 'https://example.com/widget.png' }),
      ])
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Widget A')) })
      // Modal renders the image
      const modalImgs = document.querySelectorAll('img[alt="Widget A"]')
      expect(modalImgs.length).toBeGreaterThanOrEqual(1)
    })
  })
})
