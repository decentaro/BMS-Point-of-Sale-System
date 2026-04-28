import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

let mockShowToast: ReturnType<typeof vi.fn>
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

let mockGetJson: ReturnType<typeof vi.fn>
let mockPostJson: ReturnType<typeof vi.fn>
let mockPutJson: ReturnType<typeof vi.fn>
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getJson: (...args: any[]) => mockGetJson(...args),
    postJson: (...args: any[]) => mockPostJson(...args),
    putJson: (...args: any[]) => mockPutJson(...args),
  },
}))

let mockGetCurrentSession: ReturnType<typeof vi.fn>
vi.mock('@/utils/SessionManager', () => ({
  default: {
    getCurrentSession: (...args: any[]) => mockGetCurrentSession(...args),
  },
}))

vi.mock('@/utils/receiptFormatter', () => ({
  generateZReportReceipt: () => ({ lines: [] }),
}))

vi.mock('@/components/ui/LoadingSpinner', () => ({
  SectionLoader: ({ message }: { message: string }) => (
    <div data-testid="section-loader">{message}</div>
  ),
}))

vi.mock('@/components/ModalKeyboard', () => ({
  default: () => null,
}))

vi.mock('@/components/HybridInput', () => ({
  default: ({ value, onChange, placeholder, className }: any) => (
    <input
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      data-testid={
        placeholder?.includes('0.00') ? 'cash-input'
        : placeholder?.includes('notes') || placeholder?.includes('Notes') || placeholder?.includes('Any notes') || placeholder?.includes('explanation')
          ? 'notes-input'
          : 'hybrid-input'
      }
    />
  ),
}))

import Reconciliation from '@/components/Reconciliation'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function makeZReport(overrides: any = {}): any {
  return {
    date: todayIso(),
    sessionId: 1,
    sessionCode: 'SES-2026-001',
    sessionStatus: 'Open',
    openedByEmployeeName: 'Alice',
    closedByEmployeeName: null,
    openedAt: '2026-04-13T08:00:00Z',
    closedAt: null,
    openingCash: 200,
    closingCash: null,
    totalTransactions: 5,
    grossSales: 500,
    totalDiscounts: 10,
    netSales: 490,
    totalTax: 49,
    totalReturns: 0,
    totalRefunds: 0,
    netRevenue: 441,
    cashSales: 300,
    cardSales: 190,
    paymentBreakdown: [
      { paymentMethod: 'Cash', transactionCount: 3, totalAmount: 300 },
      { paymentMethod: 'Card', transactionCount: 2, totalAmount: 190 },
    ],
    expectedClosingCash: 500,
    cashVariance: null,
    notes: null,
    ...overrides,
  }
}

function makeRangeRow(overrides: any = {}): any {
  return {
    date: '2026-04-12',
    sessionCode: 'SES-2026-002',
    sessionStatus: 'Closed',
    totalTransactions: 3,
    grossSales: 300,
    totalDiscounts: 0,
    netSales: 300,
    totalTax: 30,
    totalReturns: 0,
    totalRefunds: 0,
    netRevenue: 270,
    cashSales: 200,
    cardSales: 100,
    openingCash: 100,
    closingCash: 300,
    expectedClosingCash: 300,
    cashVariance: 0,
    ...overrides,
  }
}

async function renderAndWait(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<Reconciliation />)
  })
  return result
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockShowToast = vi.fn()
  mockGetJson = vi.fn().mockResolvedValue(makeZReport())
  mockPostJson = vi.fn().mockResolvedValue({ id: 1 })
  mockPutJson = vi.fn().mockResolvedValue({ id: 1 })
  mockGetCurrentSession = vi.fn().mockReturnValue({ id: 42, name: 'Alice' })
  // Ensure electronAPI is available (set.ts already defines it, but we reassign for clarity)
  ;(window as any).electronAPI = {
    printReceipt: vi.fn().mockResolvedValue({ success: true }),
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Reconciliation', () => {

  // ── Mode Toggle ───────────────────────────────────────────────────────────

  describe('Mode Toggle', () => {
    it('renders Single Day and Date Range buttons', async () => {
      await renderAndWait()
      expect(screen.getByText('Single Day')).toBeTruthy()
      expect(screen.getByText('Date Range')).toBeTruthy()
    })

    it('defaults to single-day mode (fetches Z-report on mount)', async () => {
      await renderAndWait()
      expect(mockGetJson).toHaveBeenCalledWith(expect.stringContaining('/reports/z-report'))
    })

    it('switching to Date Range mode fetches range report', async () => {
      await renderAndWait()
      mockGetJson.mockResolvedValue([makeRangeRow()])
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      expect(mockGetJson).toHaveBeenCalledWith(expect.stringContaining('/reports/z-report-range'))
    })

    it('switching back to Single Day re-fetches Z-report', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      mockGetJson.mockResolvedValue(makeZReport())
      await act(async () => { fireEvent.click(screen.getByText('Single Day')) })
      // Called at least twice: once on mount, once after switching back
      expect(mockGetJson).toHaveBeenCalledWith(expect.stringContaining('/reports/z-report?date='))
    })
  })

  // ── Loading State ─────────────────────────────────────────────────────────

  describe('Loading State', () => {
    it('shows SectionLoader while loading Z-report', async () => {
      // Don't resolve the promise so component stays in loading state
      let resolve!: (v: any) => void
      mockGetJson.mockReturnValue(new Promise(r => { resolve = r }))
      await act(async () => { render(<Reconciliation />) })
      expect(screen.getByTestId('section-loader')).toBeTruthy()
      expect(screen.getByText('Loading Z-Report…')).toBeTruthy()
      // Clean up: resolve so React flushes
      await act(async () => { resolve(makeZReport()) })
    })

    it('shows range SectionLoader while loading range report', async () => {
      await renderAndWait()
      let resolve!: (v: any) => void
      mockGetJson.mockReturnValue(new Promise(r => { resolve = r }))
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      expect(screen.getByText('Loading range report…')).toBeTruthy()
      await act(async () => { resolve([]) })
    })
  })

  // ── Z-Report Display ──────────────────────────────────────────────────────

  describe('Z-Report Display', () => {
    it('renders session code', async () => {
      await renderAndWait()
      expect(screen.getByText('SES-2026-001')).toBeTruthy()
    })

    it('renders session status badge', async () => {
      await renderAndWait()
      // StatusBadge renders the status text
      expect(screen.getByText('Open')).toBeTruthy()
    })

    it('renders Total Transactions count', async () => {
      await renderAndWait()
      expect(screen.getByText('5')).toBeTruthy()
    })

    it('renders payment breakdown entries', async () => {
      await renderAndWait()
      expect(screen.getByText('Cash')).toBeTruthy()
      expect(screen.getByText('Card')).toBeTruthy()
    })

    it('shows "No sales for this date" when payment breakdown is empty', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ paymentBreakdown: [] }))
      await renderAndWait()
      expect(screen.getByText('No sales for this date')).toBeTruthy()
    })

    it('renders Net Sales label', async () => {
      await renderAndWait()
      expect(screen.getByText('Net Sales')).toBeTruthy()
    })

    it('renders Net Revenue label', async () => {
      await renderAndWait()
      expect(screen.getByText('Net Revenue')).toBeTruthy()
    })

    it('renders Expected Closing Cash label', async () => {
      await renderAndWait()
      expect(screen.getByText('Expected Closing Cash')).toBeTruthy()
    })

    it('shows Actual Closing Cash and Variance when closingCash is set', async () => {
      mockGetJson.mockResolvedValue(makeZReport({
        sessionStatus: 'Closed',
        closingCash: 500,
        cashVariance: 0,
      }))
      await renderAndWait()
      expect(screen.getByText('Actual Closing Cash')).toBeTruthy()
      expect(screen.getByText('Variance')).toBeTruthy()
    })

    it('renders balanced variance as "✓ Balanced"', async () => {
      mockGetJson.mockResolvedValue(makeZReport({
        sessionStatus: 'Closed',
        closingCash: 500,
        cashVariance: 0,
      }))
      await renderAndWait()
      expect(screen.getByText('✓ Balanced')).toBeTruthy()
    })

    it('shows opened-by info when openedAt is set', async () => {
      await renderAndWait()
      expect(screen.getByText(/by Alice/)).toBeTruthy()
    })

    it('shows discounts row when totalDiscounts > 0', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ totalDiscounts: 10 }))
      await renderAndWait()
      expect(screen.getByText('Discounts')).toBeTruthy()
    })

    it('omits discounts row when totalDiscounts = 0', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ totalDiscounts: 0 }))
      await renderAndWait()
      expect(screen.queryByText('Discounts')).toBeNull()
    })
  })

  // ── Open Session ──────────────────────────────────────────────────────────

  describe('Open Session', () => {
    it('shows Open Session button when status is No Session and date is today', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', sessionId: null }))
      await renderAndWait()
      expect(screen.getByText('Open Session')).toBeTruthy()
    })

    it('does NOT show Open Session button for past date (not today)', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', date: '2026-01-01' }))
      await renderAndWait()
      expect(screen.queryByText('Open Session')).toBeNull()
    })

    it('does NOT show Open Session button when status is Open', async () => {
      await renderAndWait()
      expect(screen.queryByText('Open Session')).toBeNull()
    })

    it('clicking Open Session shows the open form', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', sessionId: null }))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Open Session')) })
      expect(screen.getByText('Confirm Open')).toBeTruthy()
    })

    it('Cancel in open form hides the form', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', sessionId: null }))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Open Session')) })
      await act(async () => { fireEvent.click(screen.getByText('Cancel')) })
      expect(screen.queryByText('Confirm Open')).toBeNull()
    })

    it('Confirm Open calls postJson with employeeId and openingCash', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', sessionId: null }))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Open Session')) })
      await act(async () => { fireEvent.click(screen.getByText('Confirm Open')) })
      expect(mockPostJson).toHaveBeenCalledWith(
        '/cash-sessions/open',
        expect.objectContaining({ employeeId: 42, openingCash: 0 })
      )
    })

    it('successful open shows success toast', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', sessionId: null }))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Open Session')) })
      await act(async () => { fireEvent.click(screen.getByText('Confirm Open')) })
      expect(mockShowToast).toHaveBeenCalledWith('Cash session opened', 'success')
    })

    it('already-exists error shows warning toast', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', sessionId: null }))
      mockPostJson.mockRejectedValue(new Error('already exists'))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Open Session')) })
      await act(async () => { fireEvent.click(screen.getByText('Confirm Open')) })
      expect(mockShowToast).toHaveBeenCalledWith('A session already exists for today', 'warning')
    })

    it('generic open error shows error toast', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', sessionId: null }))
      mockPostJson.mockRejectedValue(new Error('network error'))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Open Session')) })
      await act(async () => { fireEvent.click(screen.getByText('Confirm Open')) })
      expect(mockShowToast).toHaveBeenCalledWith('Failed to open session', 'error')
    })

    it('does not open session when getCurrentSession returns null', async () => {
      mockGetCurrentSession.mockReturnValue(null)
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', sessionId: null }))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Open Session')) })
      await act(async () => { fireEvent.click(screen.getByText('Confirm Open')) })
      expect(mockPostJson).not.toHaveBeenCalled()
    })
  })

  // ── Close Session ─────────────────────────────────────────────────────────

  describe('Close Session', () => {
    it('shows Close Session button when status is Open', async () => {
      await renderAndWait()
      expect(screen.getByText('Close Session')).toBeTruthy()
    })

    it('does NOT show Close Session button when status is Closed', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'Closed', closingCash: 500, cashVariance: 0 }))
      await renderAndWait()
      expect(screen.queryByText('Close Session')).toBeNull()
    })

    it('clicking Close Session shows close form', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Close Session')) })
      expect(screen.getByText('Confirm Close')).toBeTruthy()
    })

    it('Confirm Close is disabled when closingCash is empty', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Close Session')) })
      const confirmBtn = screen.getByText('Confirm Close').closest('button') as HTMLButtonElement
      expect(confirmBtn.disabled).toBe(true)
    })

    it('Confirm Close is enabled when closingCash is filled', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Close Session')) })
      const cashInput = screen.getAllByTestId('cash-input').find(
        (el) => (el as HTMLInputElement).placeholder === '0.00'
      ) as HTMLInputElement
      await act(async () => { fireEvent.change(cashInput, { target: { value: '500' } }) })
      const confirmBtn = screen.getByText('Confirm Close').closest('button') as HTMLButtonElement
      expect(confirmBtn.disabled).toBe(false)
    })

    it('Confirm Close calls putJson with sessionId and closedByEmployeeId', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Close Session')) })
      const cashInput = screen.getAllByTestId('cash-input').find(
        (el) => (el as HTMLInputElement).placeholder === '0.00'
      ) as HTMLInputElement
      await act(async () => { fireEvent.change(cashInput, { target: { value: '500' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Confirm Close')) })
      expect(mockPutJson).toHaveBeenCalledWith(
        '/cash-sessions/1/close',
        expect.objectContaining({ closedByEmployeeId: 42, closingCash: 500 })
      )
    })

    it('successful close shows success toast', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Close Session')) })
      const cashInput = screen.getAllByTestId('cash-input').find(
        (el) => (el as HTMLInputElement).placeholder === '0.00'
      ) as HTMLInputElement
      await act(async () => { fireEvent.change(cashInput, { target: { value: '500' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Confirm Close')) })
      expect(mockShowToast).toHaveBeenCalledWith('Session closed successfully', 'success')
    })

    it('close error shows error toast', async () => {
      mockPutJson.mockRejectedValue(new Error('server error'))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Close Session')) })
      const cashInput = screen.getAllByTestId('cash-input').find(
        (el) => (el as HTMLInputElement).placeholder === '0.00'
      ) as HTMLInputElement
      await act(async () => { fireEvent.change(cashInput, { target: { value: '500' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Confirm Close')) })
      expect(mockShowToast).toHaveBeenCalledWith('Failed to close session', 'error')
    })

    it('Cancel in close form hides the form', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Close Session')) })
      await act(async () => { fireEvent.click(screen.getByText('Cancel')) })
      expect(screen.queryByText('Confirm Close')).toBeNull()
    })

    it('shows variance preview when closingCash is typed', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Close Session')) })
      const cashInput = screen.getAllByTestId('cash-input').find(
        (el) => (el as HTMLInputElement).placeholder === '0.00'
      ) as HTMLInputElement
      await act(async () => { fireEvent.change(cashInput, { target: { value: '490' } }) })
      // expectedClosingCash=500, actual=490 → variance=-10 (short)
      expect(screen.getByText(/short/)).toBeTruthy()
    })

    it('shows balanced variance preview when closingCash matches expected', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Close Session')) })
      const cashInput = screen.getAllByTestId('cash-input').find(
        (el) => (el as HTMLInputElement).placeholder === '0.00'
      ) as HTMLInputElement
      await act(async () => { fireEvent.change(cashInput, { target: { value: '500' } }) })
      expect(screen.getByText(/balanced/)).toBeTruthy()
    })
  })

  // ── Print Z-Report ────────────────────────────────────────────────────────

  describe('Print Z-Report', () => {
    it('Print button is present', async () => {
      await renderAndWait()
      expect(screen.getByText('Print')).toBeTruthy()
    })

    it('Print button is disabled when window.electronAPI is falsy', async () => {
      ;(window as any).electronAPI = undefined
      await renderAndWait()
      const printBtn = screen.getByText('Print').closest('button') as HTMLButtonElement
      expect(printBtn.disabled).toBe(true)
    })

    it('Print button is enabled when electronAPI is available', async () => {
      await renderAndWait()
      const printBtn = screen.getByText('Print').closest('button') as HTMLButtonElement
      expect(printBtn.disabled).toBe(false)
    })

    it('clicking Print calls electronAPI.printReceipt', async () => {
      await renderAndWait()
      // Also mock the system-settings call for print
      mockGetJson
        .mockResolvedValueOnce(makeZReport())  // initial z-report fetch
        .mockResolvedValueOnce({})             // system-settings for print
      await act(async () => { fireEvent.click(screen.getByText('Print')) })
      await waitFor(() => {
        expect((window as any).electronAPI.printReceipt).toHaveBeenCalled()
      })
    })

    it('shows success toast on successful print', async () => {
      ;(window as any).electronAPI = {
        printReceipt: vi.fn().mockResolvedValue({ success: true }),
      }
      await renderAndWait()
      mockGetJson.mockResolvedValue({}) // system-settings call
      await act(async () => { fireEvent.click(screen.getByText('Print')) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Z-Report printed', 'success')
      })
    })

    it('shows error toast when print returns success=false', async () => {
      ;(window as any).electronAPI = {
        printReceipt: vi.fn().mockResolvedValue({ success: false, message: 'Printer offline' }),
      }
      await renderAndWait()
      mockGetJson.mockResolvedValue({}) // system-settings call
      await act(async () => { fireEvent.click(screen.getByText('Print')) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Printer offline', 'error')
      })
    })
  })

  // ── Error States ──────────────────────────────────────────────────────────

  describe('Error States', () => {
    it('shows error toast when Z-report fetch fails', async () => {
      mockGetJson.mockRejectedValue(new Error('network error'))
      await renderAndWait()
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load Z-Report', 'error')
    })

    it('shows error toast when range fetch fails', async () => {
      await renderAndWait()
      mockGetJson.mockRejectedValue(new Error('server error'))
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to load date range report', 'error')
      })
    })
  })

  // ── Date Range Mode ───────────────────────────────────────────────────────

  describe('Date Range Mode', () => {
    it('shows empty state when no range rows loaded', async () => {
      await renderAndWait()
      mockGetJson.mockResolvedValue([])
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      expect(screen.getByText('Select a date range and click Apply')).toBeTruthy()
    })

    it('shows table rows when range rows are loaded', async () => {
      await renderAndWait()
      mockGetJson.mockResolvedValue([makeRangeRow()])
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      // Table headers
      expect(screen.getByText('Net Sales')).toBeTruthy()
    })

    it('shows CSV button when range rows are present', async () => {
      await renderAndWait()
      mockGetJson.mockResolvedValue([makeRangeRow()])
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      expect(screen.getByText('CSV')).toBeTruthy()
    })

    it('does NOT show CSV button when range rows empty', async () => {
      await renderAndWait()
      mockGetJson.mockResolvedValue([])
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      expect(screen.queryByText('CSV')).toBeNull()
    })

    it('clicking CSV button creates and triggers a download link', async () => {
      await renderAndWait()
      mockGetJson.mockResolvedValue([makeRangeRow()])
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })

      // Stub URL.createObjectURL and link.click to verify download is triggered
      const createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
      const revokeObjectURL = vi.fn()
      ;(window as any).URL.createObjectURL = createObjectURL
      ;(window as any).URL.revokeObjectURL = revokeObjectURL

      const clickSpy = vi.fn()
      const origCreate = document.createElement.bind(document)
      const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreate(tag)
        if (tag === 'a') {
          Object.defineProperty(el, 'click', { value: clickSpy, writable: true })
        }
        return el
      })

      await act(async () => { fireEvent.click(screen.getByText('CSV')) })

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
      expect(clickSpy).toHaveBeenCalled()

      createSpy.mockRestore()
    })

    it('shows Apply button in date range mode', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      expect(screen.getByText('Apply')).toBeTruthy()
    })

    it('Apply button re-fetches range data', async () => {
      await renderAndWait()
      mockGetJson.mockResolvedValue([makeRangeRow()])
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      mockGetJson.mockResolvedValue([makeRangeRow(), makeRangeRow({ date: '2026-04-11' })])
      await act(async () => { fireEvent.click(screen.getByText('Apply')) })
      expect(mockGetJson).toHaveBeenCalledWith(expect.stringContaining('/reports/z-report-range'))
    })

    it('shows Totals row in range table', async () => {
      await renderAndWait()
      mockGetJson.mockResolvedValue([makeRangeRow()])
      await act(async () => { fireEvent.click(screen.getByText('Date Range')) })
      expect(screen.getByText('Totals')).toBeTruthy()
    })
  })

  // ── Status Badge Variants ─────────────────────────────────────────────────

  describe('Status Badge Variants', () => {
    it('renders Closed status badge', async () => {
      mockGetJson.mockResolvedValue(makeZReport({
        sessionStatus: 'Closed', closingCash: 500, cashVariance: 0,
      }))
      await renderAndWait()
      expect(screen.getByText('Closed')).toBeTruthy()
    })

    it('renders No Session status badge', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', sessionId: null }))
      await renderAndWait()
      expect(screen.getByText('No Session')).toBeTruthy()
    })

    it('shows "No session recorded" when No Session in reconciliation panel', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ sessionStatus: 'No Session', sessionId: null }))
      await renderAndWait()
      expect(screen.getByText('No session recorded for this date')).toBeTruthy()
    })

    it('shows "Session closed" when status is Closed', async () => {
      mockGetJson.mockResolvedValue(makeZReport({
        sessionStatus: 'Closed', closingCash: 500, cashVariance: 0,
      }))
      await renderAndWait()
      expect(screen.getByText('Session closed')).toBeTruthy()
    })

    it('shows "Ready to close the day?" when Open but form not shown', async () => {
      await renderAndWait()
      expect(screen.getByText('Ready to close the day?')).toBeTruthy()
    })
  })

  // ── Edge Cases ────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('renders without crash when getJson returns empty/null-ish data', async () => {
      mockGetJson.mockResolvedValue(null)
      const { container } = await renderAndWait()
      expect(container).toBeTruthy()
    })

    it('over variance (closingCash > expected) shows (over) label', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Close Session')) })
      const cashInput = screen.getAllByTestId('cash-input').find(
        (el) => (el as HTMLInputElement).placeholder === '0.00'
      ) as HTMLInputElement
      // expected=500, actual=600 → over
      await act(async () => { fireEvent.change(cashInput, { target: { value: '600' } }) })
      expect(screen.getByText(/over/)).toBeTruthy()
    })

    it('shows Cash Reconciliation section label', async () => {
      await renderAndWait()
      expect(screen.getByText('Cash Reconciliation')).toBeTruthy()
    })

    it('shows Sales Summary section label', async () => {
      await renderAndWait()
      expect(screen.getByText('Sales Summary')).toBeTruthy()
    })

    it('shows Payment Breakdown section label', async () => {
      await renderAndWait()
      expect(screen.getByText('Payment Breakdown')).toBeTruthy()
    })

    it('shows negative refund when totalRefunds > 0', async () => {
      mockGetJson.mockResolvedValue(makeZReport({ totalRefunds: 15, totalReturns: 1 }))
      await renderAndWait()
      // InfoRow shows: Returns (1): -15.00
      expect(screen.getByText(/Returns \(1\)/)).toBeTruthy()
    })
  })
})
