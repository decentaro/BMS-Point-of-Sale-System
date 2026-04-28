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

vi.mock('@/components/Reconciliation', () => ({
  default: () => <div data-testid="reconciliation">Reconciliation</div>,
}))

vi.mock('@/components/ui/LoadingSpinner', () => ({
  SectionLoader: ({ message }: { message: string }) => (
    <div data-testid="section-loader">{message}</div>
  ),
}))

vi.mock('@/utils/dateFormat', () => ({
  formatDateForFile: () => '2026-04-13',
}))

let mockGetJson: ReturnType<typeof vi.fn>
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getJson: (...args: any[]) => mockGetJson(...args),
  },
}))

import Reports from '@/components/Reports'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTodaySummary(overrides: any = {}): any {
  return {
    period: 'Today',
    totalSales: 12,
    totalRevenue: 1500,
    totalTax: 150,
    totalDiscounts: 30,
    ...overrides,
  }
}

function makeWeekSummary(overrides: any = {}): any {
  return {
    period: 'This Week',
    totalSales: 50,
    totalRevenue: 6500,
    totalTax: 650,
    totalDiscounts: 100,
    ...overrides,
  }
}

function makeMonthSummary(overrides: any = {}): any {
  return {
    period: 'This Month',
    totalSales: 200,
    totalRevenue: 28000,
    totalTax: 2800,
    totalDiscounts: 400,
    ...overrides,
  }
}

function makePaymentBreakdown(overrides: any = {}): any {
  return {
    period: 'This Month',
    paymentMethods: [
      { paymentMethod: 'Cash', totalSales: 120, totalRevenue: 15000 },
      { paymentMethod: 'Card', totalSales: 80, totalRevenue: 13000 },
    ],
    ...overrides,
  }
}

function makeTaxSummary(overrides: any = {}): any {
  return {
    period: 'This Month',
    totalSales: 200,
    totalRevenue: 28000,
    totalTaxCollected: 2800,
    averageTaxRate: 10.0,
    ...overrides,
  }
}

function makeEmployeePerformance(): any {
  return [
    { employeeName: 'Alice', totalSales: 120, totalRevenue: 15000, averageTransactionValue: 125 },
    { employeeName: 'Bob', totalSales: 80, totalRevenue: 13000, averageTransactionValue: 162.5 },
  ]
}

function makeReturnsSummary(overrides: any = {}): any {
  return {
    period: 'Today',
    totalReturns: 2,
    totalRefundAmount: 100,
    totalItemsReturned: 3,
    returnsByReason: [
      { reason: 'Defective', count: 1, totalRefund: 50 },
      { reason: 'Wrong Size', count: 1, totalRefund: 50 },
    ],
    topReturnedProducts: [
      { productName: 'Widget A', returnQuantity: 2, totalRefund: 80 },
    ],
    ...overrides,
  }
}

function makeTopProducts(): any {
  return [
    { productName: 'Widget A', totalQuantitySold: 50, totalRevenue: 500, transactionCount: 30 },
    { productName: 'Gadget B', totalQuantitySold: 30, totalRevenue: 300, transactionCount: 20 },
  ]
}

function setupDefaultMocks() {
  mockGetJson.mockImplementation((url: string) => {
    if (url === '/sales/today') return Promise.resolve(makeTodaySummary())
    if (url === '/sales/this-week') return Promise.resolve(makeWeekSummary())
    if (url === '/sales/this-month') return Promise.resolve(makeMonthSummary())
    if (url.includes('/sales/top-products')) return Promise.resolve(makeTopProducts())
    if (url.includes('/sales/payment-breakdown')) return Promise.resolve(makePaymentBreakdown())
    if (url.includes('/sales/tax-summary')) return Promise.resolve(makeTaxSummary())
    if (url.includes('/sales/employee-performance')) return Promise.resolve(makeEmployeePerformance())
    if (url.includes('/returns/summary')) return Promise.resolve(makeReturnsSummary())
    return Promise.resolve(null)
  })
}

async function renderAndWait(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<Reports />)
  })
  return result
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetJson = vi.fn()
  setupDefaultMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Reports', () => {

  // ── Header ────────────────────────────────────────────────────────────────

  describe('Header', () => {
    it('renders "Sales Reports" title', async () => {
      await renderAndWait()
      // "Sales Reports" appears both in header AND in the tab
      expect(screen.getAllByText('Sales Reports').length).toBeGreaterThanOrEqual(1)
    })

    it('renders Back button', async () => {
      await renderAndWait()
      expect(screen.getByText('Back')).toBeTruthy()
    })

    it('Back button navigates to /manager', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Back')) })
      expect(mockNavigate).toHaveBeenCalledWith('/manager')
    })
  })

  // ── Tabs ──────────────────────────────────────────────────────────────────

  describe('Tabs', () => {
    it('renders Sales Reports tab', async () => {
      await renderAndWait()
      expect(screen.getAllByText('Sales Reports').length).toBeGreaterThanOrEqual(1)
    })

    it('renders Z-Report / Reconciliation tab', async () => {
      await renderAndWait()
      expect(screen.getByText('Z-Report / Reconciliation')).toBeTruthy()
    })

    it('defaults to sales tab (shows Today\'s Performance)', async () => {
      await renderAndWait()
      expect(screen.getByText("Today's Performance")).toBeTruthy()
    })

    it('clicking Reconciliation tab shows Reconciliation component', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Z-Report / Reconciliation')) })
      expect(screen.getByTestId('reconciliation')).toBeTruthy()
    })

    it('switching back to Sales tab shows sales content', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Z-Report / Reconciliation')) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Sales Reports/ })) })
      expect(screen.getByText("Today's Performance")).toBeTruthy()
    })
  })

  // ── Loading State ─────────────────────────────────────────────────────────

  describe('Loading State', () => {
    it('shows SectionLoader while loading', async () => {
      let reject!: (e: any) => void
      mockGetJson.mockReturnValue(new Promise((_res, rej) => { reject = rej }))
      await act(async () => { render(<Reports />) })
      expect(screen.getByTestId('section-loader')).toBeTruthy()
      expect(screen.getByText('Loading reports...')).toBeTruthy()
      // Reject promises so all loaders fail silently (each has try/catch) — avoids
      // formatCurrency(undefined) crash that would happen if we resolved with []
      await act(async () => { reject(new Error('cleanup')) })
    })
  })

  // ── Today's Performance ───────────────────────────────────────────────────

  describe("Today's Performance", () => {
    it('shows "Today\'s Performance" section header', async () => {
      await renderAndWait()
      expect(screen.getByText("Today's Performance")).toBeTruthy()
    })

    it('shows Total Sales count from today summary', async () => {
      await renderAndWait()
      // StatTile with value=12
      expect(screen.getByText('12')).toBeTruthy()
    })

    it('shows Total Sales label', async () => {
      await renderAndWait()
      expect(screen.getByText('Total Sales')).toBeTruthy()
    })

    it('shows Revenue label', async () => {
      await renderAndWait()
      expect(screen.getAllByText('Revenue').length).toBeGreaterThanOrEqual(1)
    })

    it('shows empty state when todaySummary is null', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales/today') return Promise.reject(new Error('fail'))
        if (url === '/sales/this-week') return Promise.resolve(makeWeekSummary())
        if (url === '/sales/this-month') return Promise.resolve(makeMonthSummary())
        if (url.includes('/sales/top-products')) return Promise.resolve([])
        if (url.includes('/sales/payment-breakdown')) return Promise.resolve(makePaymentBreakdown())
        if (url.includes('/sales/tax-summary')) return Promise.resolve(makeTaxSummary())
        if (url.includes('/sales/employee-performance')) return Promise.resolve([])
        if (url.includes('/returns/summary')) return Promise.resolve(makeReturnsSummary())
        return Promise.resolve(null)
      })
      await renderAndWait()
      expect(screen.getByText('No sales data for today')).toBeTruthy()
    })
  })

  // ── This Week & This Month ────────────────────────────────────────────────

  describe('Week & Month summaries', () => {
    it('shows "This Week" section', async () => {
      await renderAndWait()
      // "This Week" appears in both the section header and weekSummary.period text
      expect(screen.getAllByText('This Week').length).toBeGreaterThanOrEqual(1)
    })

    it('shows "This Month" section', async () => {
      await renderAndWait()
      // "This Month" appears in both the section header and monthSummary.period text
      expect(screen.getAllByText('This Month').length).toBeGreaterThanOrEqual(1)
    })

    it('shows empty state for week when data unavailable', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url === '/sales/today') return Promise.resolve(makeTodaySummary())
        if (url === '/sales/this-week') return Promise.reject(new Error('fail'))
        if (url === '/sales/this-month') return Promise.resolve(makeMonthSummary())
        if (url.includes('/sales/top-products')) return Promise.resolve([])
        if (url.includes('/sales/payment-breakdown')) return Promise.resolve(makePaymentBreakdown())
        if (url.includes('/sales/tax-summary')) return Promise.resolve(makeTaxSummary())
        if (url.includes('/sales/employee-performance')) return Promise.resolve([])
        if (url.includes('/returns/summary')) return Promise.resolve(makeReturnsSummary())
        return Promise.resolve(null)
      })
      await renderAndWait()
      expect(screen.getByText('No weekly data')).toBeTruthy()
    })
  })

  // ── Returns & Refunds ─────────────────────────────────────────────────────

  describe('Returns & Refunds', () => {
    it('shows "RETURNS & REFUNDS" section header', async () => {
      await renderAndWait()
      expect(screen.getByText('Returns & Refunds')).toBeTruthy()
    })

    it('shows Return Transactions count', async () => {
      await renderAndWait()
      expect(screen.getByText('Return Transactions')).toBeTruthy()
    })

    it('shows Total Refunded label', async () => {
      await renderAndWait()
      expect(screen.getByText('Total Refunded')).toBeTruthy()
    })

    it('shows Items Returned label', async () => {
      await renderAndWait()
      expect(screen.getByText('Items Returned')).toBeTruthy()
    })

    it('shows returns by reason', async () => {
      await renderAndWait()
      expect(screen.getByText('Defective')).toBeTruthy()
      expect(screen.getByText('Wrong Size')).toBeTruthy()
    })

    it('shows most returned products', async () => {
      await renderAndWait()
      expect(screen.getAllByText('Widget A').length).toBeGreaterThanOrEqual(1)
    })

    it('shows "No returns data" when returnsSummary is null', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/returns/summary')) return Promise.reject(new Error('fail'))
        if (url === '/sales/today') return Promise.resolve(makeTodaySummary())
        if (url === '/sales/this-week') return Promise.resolve(makeWeekSummary())
        if (url === '/sales/this-month') return Promise.resolve(makeMonthSummary())
        if (url.includes('/sales/top-products')) return Promise.resolve([])
        if (url.includes('/sales/payment-breakdown')) return Promise.resolve(makePaymentBreakdown())
        if (url.includes('/sales/tax-summary')) return Promise.resolve(makeTaxSummary())
        if (url.includes('/sales/employee-performance')) return Promise.resolve([])
        return Promise.resolve(null)
      })
      await renderAndWait()
      expect(screen.getByText('No returns data')).toBeTruthy()
    })

    it('shows "No returns for this period" when totalReturns=0', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/returns/summary')) return Promise.resolve(makeReturnsSummary({
          totalReturns: 0, totalRefundAmount: 0, totalItemsReturned: 0,
          returnsByReason: [], topReturnedProducts: [],
        }))
        if (url === '/sales/today') return Promise.resolve(makeTodaySummary())
        if (url === '/sales/this-week') return Promise.resolve(makeWeekSummary())
        if (url === '/sales/this-month') return Promise.resolve(makeMonthSummary())
        if (url.includes('/sales/top-products')) return Promise.resolve([])
        if (url.includes('/sales/payment-breakdown')) return Promise.resolve(makePaymentBreakdown())
        if (url.includes('/sales/tax-summary')) return Promise.resolve(makeTaxSummary())
        if (url.includes('/sales/employee-performance')) return Promise.resolve([])
        return Promise.resolve(null)
      })
      await renderAndWait()
      expect(screen.getByText('No returns for this period')).toBeTruthy()
    })

    it('changing period select calls loadReturnsSummary with new period', async () => {
      await renderAndWait()
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/returns/summary')) return Promise.resolve(makeReturnsSummary({ period: 'week' }))
        return Promise.resolve(null)
      })
      // First combobox is the returns period select; second is the top-products days select
      const periodSelect = screen.getAllByRole('combobox')[0]
      await act(async () => { fireEvent.change(periodSelect, { target: { value: 'week' } }) })
      await waitFor(() => {
        expect(mockGetJson).toHaveBeenCalledWith(expect.stringContaining('/returns/summary?period=week'))
      })
    })
  })

  // ── Top Selling Products ──────────────────────────────────────────────────

  describe('Top Selling Products', () => {
    it('shows "TOP SELLING PRODUCTS" section header', async () => {
      await renderAndWait()
      expect(screen.getByText('Top Selling Products')).toBeTruthy()
    })

    it('shows product name in list', async () => {
      await renderAndWait()
      expect(screen.getAllByText('Widget A').length).toBeGreaterThanOrEqual(1)
    })

    it('shows Gadget B in top products', async () => {
      await renderAndWait()
      expect(screen.getByText('Gadget B')).toBeTruthy()
    })
  })

  // ── Payment Breakdown ─────────────────────────────────────────────────────

  describe('Payment Breakdown', () => {
    it('shows "PAYMENT BREAKDOWN" section', async () => {
      await renderAndWait()
      // Section header label is "Payment Methods"
      expect(screen.getByText('Payment Methods')).toBeTruthy()
    })
  })

  // ── Employee Performance ──────────────────────────────────────────────────

  describe('Employee Performance', () => {
    it('shows "EMPLOYEE PERFORMANCE" section', async () => {
      await renderAndWait()
      // Section header label is "Employee Performance — This Month"
      expect(screen.getByText(/Employee Performance/)).toBeTruthy()
    })

    it('shows employee name', async () => {
      await renderAndWait()
      expect(screen.getByText('Alice')).toBeTruthy()
    })
  })

  // ── Tax Summary ───────────────────────────────────────────────────────────

  describe('Tax Summary', () => {
    it('shows "TAX SUMMARY" section', async () => {
      await renderAndWait()
      expect(screen.getByText('Tax Summary')).toBeTruthy()
    })
  })

  // ── Toolbar: Refresh & Export CSV ─────────────────────────────────────────

  describe('Toolbar', () => {
    it('renders Refresh button', async () => {
      await renderAndWait()
      expect(screen.getByText('Refresh')).toBeTruthy()
    })

    it('clicking Refresh triggers data reload', async () => {
      await renderAndWait()
      const callsBefore = mockGetJson.mock.calls.length
      await act(async () => { fireEvent.click(screen.getByText('Refresh')) })
      await waitFor(() => {
        expect(mockGetJson.mock.calls.length).toBeGreaterThan(callsBefore)
      })
    })

    it('renders Export CSV button', async () => {
      await renderAndWait()
      expect(screen.getByText('Export CSV')).toBeTruthy()
    })

    it('clicking Export CSV does not throw', async () => {
      await renderAndWait()
      // Mock document.createElement and related DOM methods
      const link = document.createElement('a')
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue(link)
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(link)
      ;(global as any).URL.createObjectURL = vi.fn().mockReturnValue('blob:test')

      await act(async () => { fireEvent.click(screen.getByText('Export CSV')) })
      // Just verify no error thrown and link was created
      expect(appendSpy).toHaveBeenCalled()
      appendSpy.mockRestore()
      removeSpy.mockRestore()
    })
  })

  // ── Error Resilience ──────────────────────────────────────────────────────

  describe('Error Resilience', () => {
    it('renders without crash when all endpoints fail', async () => {
      mockGetJson.mockRejectedValue(new Error('network error'))
      const { container } = await renderAndWait()
      expect(container).toBeTruthy()
    })

    it('shows empty states when APIs fail individually', async () => {
      mockGetJson.mockImplementation((url: string) => {
        // All fail except today
        if (url === '/sales/today') return Promise.resolve(makeTodaySummary())
        return Promise.reject(new Error('fail'))
      })
      await renderAndWait()
      // Today should render, others show empty states
      expect(screen.getByText('Total Sales')).toBeTruthy()
    })
  })
})
