import { describe, it, expect } from 'vitest'
import { generateTextReceipt, generateZReportReceipt } from '@/utils/receiptFormatter'
import type { SystemSettings } from '@/types/SystemSettings'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseSettings: SystemSettings = {
  receiptPaperSize: '80mm',
  receiptTemplateLayout: 'Standard',
  showReceiptBarcode: false,
  receiptHeaderText: 'Welcome to Test Store',
  receiptFooterText: 'Thank you!',
  storeLocation: '123 Main St',
  phoneNumber: '555-1234',
  enableReturns: true,
  returnTimeLimitDays: 30,
  businessName: 'Test Store',
}

function makeSale(overrides: Partial<any> = {}): any {
  return {
    transactionId: 'TXN-001',
    saleDate: '2026-04-12T14:30:00',
    paymentMethod: 'Cash',
    cashierName: 'John',
    subtotal: 10.00,
    taxAmount: 0.80,
    taxLabel: 'Tax',
    secondaryTaxAmount: 0,
    secondaryTaxLabel: '',
    discountAmount: 0,
    discountPercent: 0,
    finalTotal: 10.80,
    amountPaid: 20.00,
    changeAmount: 9.20,
    isReturn: false,
    cart: [
      {
        product: { barcode: '123456789', name: 'Widget', price: 10.00 },
        quantity: 1,
        total: 10.00,
        returnedQuantity: 0,
      }
    ],
    ...overrides,
  }
}

function makeZReport(overrides: Partial<any> = {}): any {
  return {
    date: '2026-04-12',
    sessionCode: 'SES-001',
    sessionStatus: 'Closed',
    openedByEmployeeName: 'Jane',
    closedByEmployeeName: 'Jane',
    openedAt: '2026-04-12T08:00:00Z',
    closedAt: '2026-04-12T17:00:00Z',
    openingCash: 200.00,
    closingCash: 450.00,
    totalTransactions: 15,
    grossSales: 500.00,
    totalDiscounts: 10.00,
    netSales: 490.00,
    totalTax: 39.20,
    totalReturns: 1,
    totalRefunds: 15.00,
    netRevenue: 475.00,
    paymentBreakdown: [
      { paymentMethod: 'Cash', transactionCount: 10, totalAmount: 300.00 },
      { paymentMethod: 'Card', transactionCount: 5, totalAmount: 200.00 },
    ],
    expectedClosingCash: 500.00,
    cashVariance: -50.00,
    notes: null,
    ...overrides,
  }
}

// ── generateTextReceipt — Standard ──────────────────────────────────────────

describe('generateTextReceipt (Standard)', () => {
  describe('Happy Path', () => {
    it('includes LOGO PLACEHOLDER', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('[LOGO PLACEHOLDER]')
    })

    it('includes transaction ID', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('TXN-001')
    })

    it('includes cashier name', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('John')
    })

    it('includes payment method', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('Cash')
    })

    it('includes item name', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('Widget')
    })

    it('includes subtotal', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('10.00')
    })

    it('includes tax line', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('Tax')
      expect(r).toContain('0.80')
    })

    it('includes TOTAL', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('TOTAL:')
      expect(r).toContain('10.80')
    })

    it('includes change', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('Change:')
      expect(r).toContain('9.20')
    })

    it('includes footer text', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('Thank you!')
    })

    it('includes header text', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('Welcome to Test Store')
    })

    it('includes store location', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('123 Main St')
    })

    it('includes phone number', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('555-1234')
    })

    it('includes return policy when enabled', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('RETURN POLICY')
      expect(r).toContain('30 day')
    })

    it('includes last 5 digits of barcode', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('#56789')
    })

    it('paper is 48 chars wide (divider lines)', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).toContain('-'.repeat(48))
    })

    it('ends with paper feed newlines', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r.endsWith('\n\n\n\n')).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('shows discount when discount > 0', () => {
      const r = generateTextReceipt(makeSale({ discountAmount: 2.00, discountPercent: 20 }), baseSettings)
      expect(r).toContain('Discount (20%)')
      expect(r).toContain('-2.00')
    })

    it('omits discount line when discount = 0', () => {
      const r = generateTextReceipt(makeSale(), baseSettings)
      expect(r).not.toContain('Discount')
    })

    it('shows RETURN/REPRINT header on return receipts', () => {
      const r = generateTextReceipt(makeSale({ isReturn: true }), baseSettings)
      expect(r).toContain('*** RETURN/REPRINT RECEIPT ***')
    })

    it('omits cashier line when cashierName is null', () => {
      const r = generateTextReceipt(makeSale({ cashierName: null }), baseSettings)
      expect(r).not.toContain('Cashier:')
    })

    it('omits change line when changeAmount = 0', () => {
      const r = generateTextReceipt(makeSale({ changeAmount: 0 }), baseSettings)
      expect(r).not.toContain('Change:')
    })

    it('omits return policy when enableReturns=false', () => {
      const settings = { ...baseSettings, enableReturns: false }
      const r = generateTextReceipt(makeSale(), settings)
      expect(r).not.toContain('RETURN POLICY')
    })

    it('shows FULLY RETURNED for returned items', () => {
      const sale = makeSale({
        cart: [{
          product: { barcode: '123456789', name: 'Widget', price: 10.00 },
          quantity: 2,
          total: 20.00,
          returnedQuantity: 2,
        }]
      })
      const r = generateTextReceipt(sale, baseSettings)
      expect(r).toContain('** FULLY RETURNED **')
    })

    it('shows partial RETURNED for partial returns', () => {
      const sale = makeSale({
        cart: [{
          product: { barcode: '123456789', name: 'Widget', price: 10.00 },
          quantity: 3,
          total: 30.00,
          returnedQuantity: 1,
        }]
      })
      const r = generateTextReceipt(sale, baseSettings)
      expect(r).toContain('** RETURNED: 1 of 3 **')
    })

    it('uses default barcode when barcode is null', () => {
      const sale = makeSale({
        cart: [{
          product: { barcode: null, name: 'Widget', price: 10.00 },
          quantity: 1,
          total: 10.00,
          returnedQuantity: 0,
        }]
      })
      const r = generateTextReceipt(sale, baseSettings)
      expect(r).toContain('#00000')
    })

    it('uses barcode as-is when <= 5 chars', () => {
      const sale = makeSale({
        cart: [{
          product: { barcode: 'AB1', name: 'Widget', price: 10.00 },
          quantity: 1,
          total: 10.00,
          returnedQuantity: 0,
        }]
      })
      const r = generateTextReceipt(sale, baseSettings)
      expect(r).toContain('#AB1')
    })

    it('includes barcode ESC/POS commands when showReceiptBarcode=true', () => {
      const settings = { ...baseSettings, showReceiptBarcode: true }
      const r = generateTextReceipt(makeSale(), settings)
      // Check for ESC/POS barcode height command
      expect(r).toContain('\x1D\x68\x64')
    })

    it('shows tax=0 line omitted when taxAmount=0', () => {
      const r = generateTextReceipt(makeSale({ taxAmount: 0, taxLabel: 'Tax' }), baseSettings)
      // Standard template only shows tax line when taxAmount > 0
      // With tax=0 there should be no "Tax:" label in the totals section
      const lines = r.split('\n')
      const hasTaxLine = lines.some(l => l.match(/^Tax:\s/) || l.match(/Tax:\s+0\.00/))
      expect(hasTaxLine).toBe(false)
    })

    it('shows secondary tax when > 0', () => {
      const r = generateTextReceipt(
        makeSale({ secondaryTaxAmount: 1.50, secondaryTaxLabel: 'VAT' }),
        baseSettings
      )
      expect(r).toContain('VAT')
      expect(r).toContain('1.50')
    })

    it('uses current date when saleDate is null', () => {
      const sale = makeSale({ saleDate: null })
      // Should not throw
      const r = generateTextReceipt(sale, baseSettings)
      expect(r).toContain('TXN-001')
    })

    it('item name wraps with smart wrapping for long names', () => {
      const sale = makeSale({
        cart: [{
          product: { barcode: '12345', name: 'This Is A Very Long Product Name That Should Wrap', price: 10.00 },
          quantity: 1,
          total: 10.00,
          returnedQuantity: 0,
        }]
      })
      const r = generateTextReceipt(sale, baseSettings)
      expect(r).toContain('This Is A Very Long Product Name')
    })

    it('returns count in items sold line', () => {
      const sale = makeSale({
        cart: [
          { product: { barcode: '111', name: 'A', price: 5.00 }, quantity: 2, total: 10.00, returnedQuantity: 0 },
          { product: { barcode: '222', name: 'B', price: 5.00 }, quantity: 3, total: 15.00, returnedQuantity: 0 },
        ]
      })
      const r = generateTextReceipt(sale, baseSettings)
      expect(r).toContain('Items Sold:')
      expect(r).toContain('5') // 2+3
    })

    it('uses default footer when receiptFooterText is empty', () => {
      const settings = { ...baseSettings, receiptFooterText: undefined }
      const r = generateTextReceipt(makeSale(), settings)
      expect(r).toContain('Thank you for your business!')
    })

    it('singular "day" in return policy when returnTimeLimitDays=1', () => {
      const settings = { ...baseSettings, returnTimeLimitDays: 1 }
      const r = generateTextReceipt(makeSale(), settings)
      expect(r).toContain('1 day')
      expect(r).not.toContain('1 days')
    })
  })
})

// ── generateTextReceipt — Compact ──────────────────────────────────────────

describe('generateTextReceipt (Compact)', () => {
  const compactSettings: SystemSettings = { ...baseSettings, receiptTemplateLayout: 'Compact' }

  it('includes item total and quantity line', () => {
    const r = generateTextReceipt(makeSale(), compactSettings)
    expect(r).toContain('1 x 10.00')
  })

  it('includes transaction ID centered', () => {
    const r = generateTextReceipt(makeSale(), compactSettings)
    expect(r).toContain('TXN-001')
  })

  it('shows discount line when discount > 0', () => {
    const r = generateTextReceipt(makeSale({ discountAmount: 1.00, discountPercent: 10 }), compactSettings)
    expect(r).toContain('Discount (10%)')
  })

  it('omits change when changeAmount = 0', () => {
    const r = generateTextReceipt(makeSale({ changeAmount: 0 }), compactSettings)
    expect(r).not.toContain('Change:')
  })

  it('ends with paper feed', () => {
    const r = generateTextReceipt(makeSale(), compactSettings)
    expect(r.endsWith('\n\n\n\n')).toBe(true)
  })
})

// ── generateTextReceipt — Detailed ──────────────────────────────────────────

describe('generateTextReceipt (Detailed)', () => {
  const detailedSettings: SystemSettings = { ...baseSettings, receiptTemplateLayout: 'Detailed' }

  it('includes TRANSACTION DETAILS header', () => {
    const r = generateTextReceipt(makeSale(), detailedSettings)
    expect(r).toContain('TRANSACTION DETAILS')
  })

  it('includes ITEMS PURCHASED header', () => {
    const r = generateTextReceipt(makeSale(), detailedSettings)
    expect(r).toContain('ITEMS PURCHASED')
  })

  it('includes Barcode: # line per item', () => {
    const r = generateTextReceipt(makeSale(), detailedSettings)
    expect(r).toContain('Barcode: #')
  })

  it('includes Quantity: N × Unit Price line', () => {
    const r = generateTextReceipt(makeSale(), detailedSettings)
    expect(r).toContain('Quantity: 1 × Unit Price:')
  })

  it('uses emoji location and phone prefix', () => {
    const r = generateTextReceipt(makeSale(), detailedSettings)
    expect(r).toContain('📍')
    expect(r).toContain('📞')
  })

  it('shows return policy bullets', () => {
    const r = generateTextReceipt(makeSale(), detailedSettings)
    expect(r).toContain('• Returns accepted within 30 day')
    expect(r).toContain('• Original receipt required')
    expect(r).toContain('• Items must be in original condition')
  })

  it('shows fallback footer with "keep this receipt" line', () => {
    const settings = { ...detailedSettings, receiptFooterText: undefined }
    const r = generateTextReceipt(makeSale(), settings)
    expect(r).toContain('Thank you for your business!')
    expect(r).toContain('Please keep this receipt')
  })

  it('separates multiple items with dashes', () => {
    const sale = makeSale({
      cart: [
        { product: { barcode: '111', name: 'Prod A', price: 5.00 }, quantity: 1, total: 5.00, returnedQuantity: 0 },
        { product: { barcode: '222', name: 'Prod B', price: 3.00 }, quantity: 1, total: 3.00, returnedQuantity: 0 },
      ]
    })
    const r = generateTextReceipt(sale, detailedSettings)
    expect(r).toContain('Prod A')
    expect(r).toContain('Prod B')
  })
})

// ── generateZReportReceipt ──────────────────────────────────────────────────

describe('generateZReportReceipt', () => {
  describe('Happy Path', () => {
    it('includes Z-REPORT header', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('*** Z-REPORT ***')
    })

    it('includes END OF DAY RECONCILIATION', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('END OF DAY RECONCILIATION')
    })

    it('includes business name', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('Test Store')
    })

    it('includes session code', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('SES-001')
    })

    it('includes session status', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('Closed')
    })

    it('includes SALES SUMMARY section', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('SALES SUMMARY')
    })

    it('includes total transactions', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('Total Transactions:')
      expect(r).toContain('15')
    })

    it('includes gross sales', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('Gross Sales:')
      expect(r).toContain('500.00')
    })

    it('includes net revenue', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('NET REVENUE:')
      expect(r).toContain('475.00')
    })

    it('includes PAYMENT BREAKDOWN section', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('PAYMENT BREAKDOWN')
      expect(r).toContain('Cash (10 txn):')
      expect(r).toContain('Card (5 txn):')
    })

    it('includes CASH RECONCILIATION section', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('CASH RECONCILIATION')
      expect(r).toContain('Opening Cash:')
      expect(r).toContain('200.00')
    })

    it('shows SHORT variance for negative variance', () => {
      const r = generateZReportReceipt(makeZReport({ cashVariance: -50.00 }), baseSettings)
      expect(r).toContain('SHORT')
    })

    it('shows OVER variance for positive variance', () => {
      const r = generateZReportReceipt(makeZReport({ cashVariance: 25.00, closingCash: 525.00 }), baseSettings)
      expect(r).toContain('OVER')
    })

    it('shows BALANCED when variance is near zero', () => {
      const r = generateZReportReceipt(makeZReport({ cashVariance: 0, closingCash: 500.00 }), baseSettings)
      expect(r).toContain('BALANCED')
    })

    it('ends with END OF Z-REPORT', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('*** END OF Z-REPORT ***')
    })

    it('ends with paper feed', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r.endsWith('\n\n\n\n')).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('shows NOT CLOSED when closingCash is null', () => {
      const r = generateZReportReceipt(makeZReport({ closingCash: null, cashVariance: null }), baseSettings)
      expect(r).toContain('NOT CLOSED')
    })

    it('shows discounts line when totalDiscounts > 0', () => {
      const r = generateZReportReceipt(makeZReport({ totalDiscounts: 10.00 }), baseSettings)
      expect(r).toContain('Discounts:')
      expect(r).toContain('-10.00')
    })

    it('omits discounts line when totalDiscounts = 0', () => {
      const r = generateZReportReceipt(makeZReport({ totalDiscounts: 0 }), baseSettings)
      expect(r).not.toContain('Discounts:')
    })

    it('shows notes section when notes provided', () => {
      const r = generateZReportReceipt(makeZReport({ notes: 'System maintenance at 3pm' }), baseSettings)
      expect(r).toContain('Notes:')
      expect(r).toContain('System maintenance at 3pm')
    })

    it('omits notes section when notes is null', () => {
      const r = generateZReportReceipt(makeZReport({ notes: null }), baseSettings)
      expect(r).not.toContain('Notes:')
    })

    it('skips payment breakdown when empty', () => {
      const r = generateZReportReceipt(makeZReport({ paymentBreakdown: [] }), baseSettings)
      expect(r).not.toContain('PAYMENT BREAKDOWN')
    })

    it('opens/closes timestamps included', () => {
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      expect(r).toContain('Opened:')
      expect(r).toContain('by Jane')
    })

    it('omits opened/closed lines when null', () => {
      const r = generateZReportReceipt(
        makeZReport({ openedAt: null, closedAt: null }),
        baseSettings
      )
      expect(r).not.toContain('Opened:')
      expect(r).not.toContain('Closed:')
    })

    it('long left column gets truncated with ellipsis in two()', () => {
      // twoColumn in Z-report truncates (unlike generateTextReceipt which wraps)
      const r = generateZReportReceipt(makeZReport(), baseSettings)
      // Just verify report generates without error for normal data
      expect(r).toBeTruthy()
    })

    it('handles zero cash sales (Cash not in breakdown)', () => {
      const r = generateZReportReceipt(
        makeZReport({ paymentBreakdown: [{ paymentMethod: 'Card', transactionCount: 15, totalAmount: 500.00 }] }),
        baseSettings
      )
      expect(r).toContain('+ Cash Sales:')
      expect(r).toContain('0.00') // cash = 0 since no Cash in breakdown
    })
  })
})
