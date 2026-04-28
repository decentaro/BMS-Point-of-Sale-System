import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

// Mock SharedReceiptRenderer to avoid its complex dependency chain
vi.mock('@/components/SharedReceiptRenderer', () => ({
  default: ({ receiptData }: { receiptData: any }) => (
    <div data-testid="receipt-renderer">{receiptData.transactionId}</div>
  ),
}))

import ReceiptPreview from '@/components/ReceiptPreview'

function makeSettings(): any {
  return {
    receiptTemplateLayout: 'Standard',
    receiptHeaderText: 'My Store',
    receiptFooterText: 'Thanks!',
    storeLocation: '',
    phoneNumber: '',
    showReceiptBarcode: false,
    businessLogoPath: null,
  }
}

function makeSaleData(overrides: any = {}): any {
  return {
    transactionId: 'TXN-TEST-001',
    subtotal: 10,
    taxAmount: 1,
    taxLabel: 'GST (10%)',
    discountAmount: 0,
    discountPercent: 0,
    finalTotal: 11,
    amountPaid: 20,
    changeAmount: 9,
    paymentMethod: 'Cash',
    cart: [],
    ...overrides,
  }
}

function renderPreview(props: Partial<Parameters<typeof ReceiptPreview>[0]> = {}) {
  const defaults = {
    isOpen: true,
    saleData: makeSaleData(),
    systemSettings: makeSettings(),
    onPrint: vi.fn(),
    onSkip: vi.fn(),
    onBack: vi.fn(),
    ...props,
  }
  return { ...render(<ReceiptPreview {...defaults} />), ...defaults }
}

describe('ReceiptPreview', () => {
  describe('Visibility', () => {
    it('renders modal when isOpen=true', () => {
      renderPreview({ isOpen: true })
      expect(screen.getByText('Receipt Preview')).toBeTruthy()
    })

    it('returns null when isOpen=false', () => {
      const { container } = renderPreview({ isOpen: false })
      expect(container.firstChild).toBeNull()
    })
  })

  describe('Content', () => {
    it('shows "Receipt Preview" header', () => {
      renderPreview()
      expect(screen.getByText('Receipt Preview')).toBeTruthy()
    })

    it('renders SharedReceiptRenderer with transaction ID', () => {
      renderPreview({ saleData: makeSaleData({ transactionId: 'TXN-ABC-999' }) })
      expect(screen.getByTestId('receipt-renderer')).toBeTruthy()
      expect(screen.getByText('TXN-ABC-999')).toBeTruthy()
    })
  })

  describe('Buttons', () => {
    it('renders Back button', () => {
      renderPreview()
      expect(screen.getByText('← Back')).toBeTruthy()
    })

    it('renders Skip Print button', () => {
      renderPreview()
      expect(screen.getByText('Skip Print')).toBeTruthy()
    })

    it('renders Print Receipt button', () => {
      renderPreview()
      expect(screen.getByText('Print Receipt')).toBeTruthy()
    })

    it('calls onBack when Back clicked', () => {
      const onBack = vi.fn()
      renderPreview({ onBack })
      fireEvent.click(screen.getByText('← Back'))
      expect(onBack).toHaveBeenCalledTimes(1)
    })

    it('calls onSkip when Skip Print clicked', () => {
      const onSkip = vi.fn()
      renderPreview({ onSkip })
      fireEvent.click(screen.getByText('Skip Print'))
      expect(onSkip).toHaveBeenCalledTimes(1)
    })

    it('calls onPrint when Print Receipt clicked', () => {
      const onPrint = vi.fn()
      renderPreview({ onPrint })
      fireEvent.click(screen.getByText('Print Receipt'))
      expect(onPrint).toHaveBeenCalledTimes(1)
    })
  })
})
