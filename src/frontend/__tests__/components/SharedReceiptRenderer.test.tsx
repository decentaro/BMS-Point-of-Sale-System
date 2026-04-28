import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

vi.mock('@/components/Barcode', () => ({
  default: ({ value }: { value: string }) => <div data-testid="barcode">{value}</div>,
}))

vi.mock('@/utils/dateFormat', () => ({
  formatDateSync: () => '01/01/2025',
  formatTime: () => '10:30:00',
}))

import SharedReceiptRenderer, { StandardReceiptData } from '@/components/SharedReceiptRenderer'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeReceipt(overrides: Partial<StandardReceiptData> = {}): StandardReceiptData {
  return {
    transactionId: 'TXN-2025-12345678',
    saleDate: '2025-01-01T10:30:00Z',
    cashierName: 'Alice',
    paymentMethod: 'Cash',
    cart: [
      {
        product: { id: 1, name: 'Widget A', price: 10.00, barcode: '123456789' },
        quantity: 2,
        total: 20.00,
      },
    ],
    subtotal: 20.00,
    discountAmount: 0,
    discountPercent: 0,
    taxAmount: 2.00,
    taxLabel: 'GST (10%)',
    finalTotal: 22.00,
    amountPaid: 30.00,
    changeAmount: 8.00,
    ...overrides,
  }
}

function makeSettings(overrides: Partial<any> = {}): any {
  return {
    receiptTemplateLayout: 'Standard',
    receiptHeaderText: 'ACME STORE',
    receiptFooterText: 'Thank you!',
    storeLocation: '123 Main St',
    phoneNumber: '555-1234',
    showReceiptBarcode: false,
    businessLogoPath: null,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SharedReceiptRenderer', () => {

  // ── Standard Template ─────────────────────────────────────────────────────

  describe('Standard Template', () => {
    it('renders store header text', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings()} />)
      expect(screen.getByText('ACME STORE')).toBeTruthy()
    })

    it('renders store location', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings()} />)
      expect(screen.getByText('123 Main St')).toBeTruthy()
    })

    it('renders phone number', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings()} />)
      expect(screen.getByText('555-1234')).toBeTruthy()
    })

    it('renders transaction ID', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings()} />)
      expect(screen.getByText('TXN-2025-12345678')).toBeTruthy()
    })

    it('renders payment method', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings()} />)
      expect(screen.getByText('Cash')).toBeTruthy()
    })

    it('renders cashier name when provided', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt({ cashierName: 'Bob' })} systemSettings={makeSettings()} />)
      expect(screen.getByText('Bob')).toBeTruthy()
    })

    it('does not show Cashier line when cashierName absent', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt({ cashierName: undefined })} systemSettings={makeSettings()} />)
      expect(screen.queryByText('Cashier:')).toBeNull()
    })

    it('renders product name in cart', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings()} />)
      expect(screen.getByText(/Widget A/)).toBeTruthy()
    })

    it('renders last 5 chars of barcode as item prefix (#56789)', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings()} />)
      // barcode '123456789' last 5 = '56789' → shown as '#56789 Widget A'
      expect(screen.getByText(/#56789/)).toBeTruthy()
    })

    it('renders subtotal', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings()} />)
      expect(screen.getByText('Subtotal:')).toBeTruthy()
    })

    it('renders tax line when taxAmount > 0', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt({ taxAmount: 2.00, taxLabel: 'GST (10%)' })} systemSettings={makeSettings()} />)
      expect(screen.getByText('GST (10%):').textContent).toBeTruthy()
    })

    it('does not render tax line when taxAmount = 0', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt({ taxAmount: 0, taxLabel: '' })} systemSettings={makeSettings()} />)
      expect(screen.queryByText(/GST/)).toBeNull()
    })

    it('renders secondary tax when secondaryTaxAmount > 0', () => {
      render(<SharedReceiptRenderer
        receiptData={makeReceipt({ secondaryTaxAmount: 1.00, secondaryTaxLabel: 'Service Tax (5%)' })}
        systemSettings={makeSettings()}
      />)
      expect(screen.getByText('Service Tax (5%):')).toBeTruthy()
    })

    it('omits secondary tax line when secondaryTaxAmount = 0', () => {
      render(<SharedReceiptRenderer
        receiptData={makeReceipt({ secondaryTaxAmount: 0, secondaryTaxLabel: 'Service Tax' })}
        systemSettings={makeSettings()}
      />)
      expect(screen.queryByText('Service Tax:')).toBeNull()
    })

    it('renders TOTAL', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings()} />)
      expect(screen.getByText('TOTAL:')).toBeTruthy()
    })

    it('renders change when changeAmount > 0', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt({ changeAmount: 8.00 })} systemSettings={makeSettings()} />)
      expect(screen.getAllByText('Change:').length).toBeGreaterThan(0)
    })

    it('omits change line when changeAmount = 0', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt({ changeAmount: 0 })} systemSettings={makeSettings()} />)
      expect(screen.queryByText('Change:')).toBeNull()
    })

    it('renders discount line when discountAmount > 0', () => {
      render(<SharedReceiptRenderer
        receiptData={makeReceipt({ discountAmount: 2.00, discountPercent: 10 })}
        systemSettings={makeSettings()}
      />)
      expect(screen.getByText(/Discount \(10%\):/)).toBeTruthy()
    })

    it('omits discount line when discountAmount = 0', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt({ discountAmount: 0, discountPercent: 0 })} systemSettings={makeSettings()} />)
      expect(screen.queryByText(/Discount/)).toBeNull()
    })

    it('renders footer text', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings({ receiptFooterText: 'Thank you!' })} />)
      expect(screen.getByText('Thank you!')).toBeTruthy()
    })

    it('falls back to default footer when receiptFooterText absent', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings({ receiptFooterText: '' })} />)
      expect(screen.getByText('Thank you for your business!')).toBeTruthy()
    })

    it('renders barcode when showReceiptBarcode=true', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings({ showReceiptBarcode: true })} />)
      expect(screen.getByTestId('barcode')).toBeTruthy()
    })

    it('omits barcode when showReceiptBarcode=false', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings({ showReceiptBarcode: false })} />)
      expect(screen.queryByTestId('barcode')).toBeNull()
    })

    it('omits header section when receiptHeaderText absent', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings({ receiptHeaderText: '' })} />)
      expect(screen.queryByText('ACME STORE')).toBeNull()
    })

    it('renders date and time from saleDate', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings()} />)
      expect(screen.getByText('01/01/2025')).toBeTruthy()
      expect(screen.getByText('10:30:00')).toBeTruthy()
    })
  })

  // ── Return Receipt ────────────────────────────────────────────────────────

  describe('Return Receipt', () => {
    it('shows RETURN/REPRINT banner when isReturn=true', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt({ isReturn: true })} systemSettings={makeSettings()} />)
      expect(screen.getByText(/RETURN\/REPRINT RECEIPT/)).toBeTruthy()
    })

    it('does not show RETURN banner when isReturn=false', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt({ isReturn: false })} systemSettings={makeSettings()} />)
      expect(screen.queryByText(/RETURN\/REPRINT/)).toBeNull()
    })

    it('shows FULLY RETURNED marker for fully returned item', () => {
      const receipt = makeReceipt({
        cart: [{
          product: { id: 1, name: 'Widget A', price: 10.00, barcode: '123456789' },
          quantity: 2,
          total: 20.00,
          returnedQuantity: 2,
        }],
      })
      render(<SharedReceiptRenderer receiptData={receipt} systemSettings={makeSettings()} />)
      expect(screen.getByText(/FULLY RETURNED/)).toBeTruthy()
    })

    it('shows partial RETURNED marker for partially returned item', () => {
      const receipt = makeReceipt({
        cart: [{
          product: { id: 1, name: 'Widget A', price: 10.00, barcode: '123456789' },
          quantity: 3,
          total: 30.00,
          returnedQuantity: 1,
        }],
      })
      render(<SharedReceiptRenderer receiptData={receipt} systemSettings={makeSettings()} />)
      expect(screen.getByText(/RETURNED: 1 of 3/)).toBeTruthy()
    })

    it('does not show RETURNED marker when returnedQuantity=0', () => {
      const receipt = makeReceipt({
        cart: [{
          product: { id: 1, name: 'Widget A', price: 10.00, barcode: '123456789' },
          quantity: 2,
          total: 20.00,
          returnedQuantity: 0,
        }],
      })
      render(<SharedReceiptRenderer receiptData={receipt} systemSettings={makeSettings()} />)
      expect(screen.queryByText(/RETURNED/)).toBeNull()
    })
  })

  // ── Compact Template ──────────────────────────────────────────────────────

  describe('Compact Template', () => {
    const compactSettings = makeSettings({ receiptTemplateLayout: 'Compact' })

    it('renders product name in compact layout', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={compactSettings} />)
      expect(screen.getByText(/Widget A/)).toBeTruthy()
    })

    it('renders TOTAL in compact layout', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={compactSettings} />)
      expect(screen.getByText('TOTAL:')).toBeTruthy()
    })

    it('shows discount in compact layout when discountAmount > 0', () => {
      render(<SharedReceiptRenderer
        receiptData={makeReceipt({ discountAmount: 2.00, discountPercent: 10 })}
        systemSettings={compactSettings}
      />)
      expect(screen.getByText(/Discount \(10%\):/)).toBeTruthy()
    })

    it('shows RETURN banner in compact layout', () => {
      render(<SharedReceiptRenderer receiptData={makeReceipt({ isReturn: true })} systemSettings={compactSettings} />)
      expect(screen.getByText(/RETURN\/REPRINT RECEIPT/)).toBeTruthy()
    })
  })

  // ── Multiple items ────────────────────────────────────────────────────────

  describe('Multiple items', () => {
    it('renders all cart items', () => {
      const receipt = makeReceipt({
        cart: [
          { product: { id: 1, name: 'Widget A', price: 10.00, barcode: '111' }, quantity: 1, total: 10.00 },
          { product: { id: 2, name: 'Gadget B', price: 5.00, barcode: '222' }, quantity: 2, total: 10.00 },
        ],
      })
      render(<SharedReceiptRenderer receiptData={receipt} systemSettings={makeSettings()} />)
      expect(screen.getByText(/Widget A/)).toBeTruthy()
      expect(screen.getByText(/Gadget B/)).toBeTruthy()
    })
  })

  // ── Edge Cases ────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('renders with empty cart without crash', () => {
      const receipt = makeReceipt({ cart: [] })
      const { container } = render(<SharedReceiptRenderer receiptData={receipt} systemSettings={makeSettings()} />)
      expect(container).toBeTruthy()
    })

    it('short barcode (≤5 chars) shows barcode as-is', () => {
      const receipt = makeReceipt({
        cart: [{ product: { id: 1, name: 'Tiny', price: 5.00, barcode: 'ABC' }, quantity: 1, total: 5.00 }],
      })
      render(<SharedReceiptRenderer receiptData={receipt} systemSettings={makeSettings()} />)
      // barcode 'ABC' is ≤5 chars — shown as-is → #ABC Tiny
      expect(screen.getByText(/#ABC/)).toBeTruthy()
    })

    it('renders Detailed template without crash', () => {
      const { container } = render(
        <SharedReceiptRenderer receiptData={makeReceipt()} systemSettings={makeSettings({ receiptTemplateLayout: 'Detailed' })} />
      )
      expect(container).toBeTruthy()
    })
  })
})
