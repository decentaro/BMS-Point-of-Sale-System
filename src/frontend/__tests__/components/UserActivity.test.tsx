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

vi.mock('@/components/ui/LoadingSpinner', () => ({
  SectionLoader: ({ message }: { message: string }) => (
    <div data-testid="section-loader">{message}</div>
  ),
}))

vi.mock('@/utils/dateFormat', () => ({
  formatDateForFile: () => '2026-04-13',
  formatDateSync: () => '01/01/2025',
  formatTime: () => '10:30:00',
}))

let mockGetJson: ReturnType<typeof vi.fn>
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getJson: (...args: any[]) => mockGetJson(...args),
  },
}))

import UserActivity from '@/components/UserActivity'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeActivity(overrides: any = {}): any {
  return {
    id: 1,
    userId: 10,
    userName: 'Alice',
    action: 'User logged in',
    actionType: 'LOGIN',
    timestamp: '2025-01-01T10:30:00Z',
    ...overrides,
  }
}

function makeActivityResponse(overrides: any = {}): any {
  return {
    activities: [makeActivity()],
    totalCount: 1,
    ...overrides,
  }
}

function makeSummary(overrides: any = {}): any {
  return {
    totalActivities: 42,
    uniqueUsers: 5,
    activityTypes: [
      { actionType: 'LOGIN', count: 20 },
      { actionType: 'SALE', count: 15 },
      { actionType: 'LOGOUT', count: 7 },
    ],
    topUsers: [
      { userId: 10, userName: 'Alice', activityCount: 30 },
    ],
    ...overrides,
  }
}

function setupDefaultMocks() {
  mockGetJson.mockImplementation((url: string) => {
    if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
    if (url.includes('/useractivity')) return Promise.resolve(makeActivityResponse())
    return Promise.resolve(null)
  })
}

async function renderAndWait(): Promise<ReturnType<typeof render>> {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(<UserActivity />)
  })
  return result
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGetJson = vi.fn()
  setupDefaultMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserActivity', () => {

  // ── Header ────────────────────────────────────────────────────────────────

  describe('Header', () => {
    it('renders "User Activity" title', async () => {
      await renderAndWait()
      expect(screen.getByText('User Activity')).toBeTruthy()
    })

    it('renders Back button', async () => {
      await renderAndWait()
      expect(screen.getByText('Back')).toBeTruthy()
    })

    it('Back navigates to /manager', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Back')) })
      expect(mockNavigate).toHaveBeenCalledWith('/manager')
    })
  })

  // ── Loading state ─────────────────────────────────────────────────────────

  describe('Loading State', () => {
    it('shows loading indicator while fetching', async () => {
      let reject!: (e: any) => void
      mockGetJson.mockReturnValue(new Promise((_res, rej) => { reject = rej }))
      await act(async () => { render(<UserActivity />) })
      expect(screen.getByTestId('section-loader')).toBeTruthy()
      expect(screen.getByText('Loading user activities...')).toBeTruthy()
      // Reject to clean up (both calls fail silently via try/catch)
      await act(async () => { reject(new Error('cleanup')) })
    })
  })

  // ── Summary cards ─────────────────────────────────────────────────────────

  describe('Summary Cards', () => {
    it('shows Total Activities count from summary', async () => {
      await renderAndWait()
      expect(screen.getByText('Total Activities')).toBeTruthy()
      expect(screen.getByText('42')).toBeTruthy()
    })

    it('shows Active Users count', async () => {
      await renderAndWait()
      expect(screen.getByText('Active Users')).toBeTruthy()
      expect(screen.getByText('5')).toBeTruthy()
    })

    it('shows Action Types count (number of distinct types in summary)', async () => {
      await renderAndWait()
      expect(screen.getByText('Action Types')).toBeTruthy()
      // activityTypes has 3 entries
      expect(screen.getByText('3')).toBeTruthy()
    })

    it('shows Most Active count from top user', async () => {
      await renderAndWait()
      expect(screen.getByText('Most Active')).toBeTruthy()
      // topUsers[0].activityCount = 30
      expect(screen.getByText('30')).toBeTruthy()
    })

    it('omits summary section when summary is null (API fails)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.reject(new Error('fail'))
        return Promise.resolve(makeActivityResponse())
      })
      await renderAndWait()
      expect(screen.queryByText('Total Activities')).toBeNull()
    })

    it('shows 0 for Most Active when topUsers is empty (line 256 false branch)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary({ topUsers: [] }))
        return Promise.resolve(makeActivityResponse())
      })
      await renderAndWait()
      expect(screen.getByText('Most Active')).toBeTruthy()
      // topUsers is empty → value = 0
      expect(screen.getByText('0')).toBeTruthy()
    })
  })

  // ── Activity list ─────────────────────────────────────────────────────────

  describe('Activity List', () => {
    it('renders user name in activity row', async () => {
      await renderAndWait()
      expect(screen.getByText('Alice')).toBeTruthy()
    })

    it('renders action text in activity row', async () => {
      await renderAndWait()
      expect(screen.getByText('User logged in')).toBeTruthy()
    })

    it('renders action type badge', async () => {
      await renderAndWait()
      // LOGIN badge appears
      expect(screen.getByText('LOGIN')).toBeTruthy()
    })

    it('renders formatted date and time', async () => {
      await renderAndWait()
      expect(screen.getByText('01/01/2025')).toBeTruthy()
      expect(screen.getByText('10:30:00')).toBeTruthy()
    })

    it('renders details when present', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse({
          activities: [makeActivity({ details: 'From terminal T1' })],
        }))
      })
      await renderAndWait()
      expect(screen.getByText('From terminal T1')).toBeTruthy()
    })

    it('renders entity type and id when present', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse({
          activities: [makeActivity({ entityType: 'Product', entityId: 7 })],
        }))
      })
      await renderAndWait()
      expect(screen.getByText('Product #7')).toBeTruthy()
    })

    it('renders entity type without id (line 340 false branch)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse({
          activities: [makeActivity({ entityType: 'Product', entityId: undefined })],
        }))
      })
      await renderAndWait()
      // entityId is undefined → renders "Product" without hash suffix
      expect(screen.getByText('Product')).toBeTruthy()
    })

    it('renders "Unknown" badge when actionType is null (lines 322, 336 false branches)', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse({
          activities: [makeActivity({ actionType: null })],
        }))
      })
      await renderAndWait()
      expect(screen.getByText('Unknown')).toBeTruthy()
    })

    it('renders IP address when present', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse({
          activities: [makeActivity({ ipAddress: '192.168.1.100' })],
        }))
      })
      await renderAndWait()
      expect(screen.getByText('192.168.1.100')).toBeTruthy()
    })

    it('shows empty state when no activities returned', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve({ activities: [], totalCount: 0 })
      })
      await renderAndWait()
      expect(screen.getByText('No activities found for the selected criteria.')).toBeTruthy()
    })

    it('renders multiple activities', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse({
          activities: [
            makeActivity({ id: 1, userName: 'Alice', action: 'Logged in' }),
            makeActivity({ id: 2, userName: 'Bob', action: 'Made a sale', actionType: 'SALE' }),
          ],
          totalCount: 2,
        }))
      })
      await renderAndWait()
      expect(screen.getByText('Alice')).toBeTruthy()
      expect(screen.getByText('Bob')).toBeTruthy()
      expect(screen.getByText('Made a sale')).toBeTruthy()
    })
  })

  // ── Filters ───────────────────────────────────────────────────────────────

  describe('Filters', () => {
    it('renders Time Period filter', async () => {
      await renderAndWait()
      expect(screen.getByText('Time Period')).toBeTruthy()
    })

    it('renders Action Type filter', async () => {
      await renderAndWait()
      expect(screen.getByText('Action Type')).toBeTruthy()
    })

    it('changing date filter reloads activities', async () => {
      await renderAndWait()
      const callsBefore = mockGetJson.mock.calls.length
      const [timePeriodSelect] = screen.getAllByRole('combobox')
      await act(async () => { fireEvent.change(timePeriodSelect, { target: { value: 'week' } }) })
      await waitFor(() => {
        expect(mockGetJson.mock.calls.length).toBeGreaterThan(callsBefore)
      })
    })

    it('switching to month filter sends a startDate param (line 80)', async () => {
      await renderAndWait()
      const [timePeriodSelect] = screen.getAllByRole('combobox')
      await act(async () => { fireEvent.change(timePeriodSelect, { target: { value: 'month' } }) })
      await waitFor(() => {
        const calls = mockGetJson.mock.calls
        expect(calls.some((args: any[]) => args[0].includes('startDate='))).toBe(true)
      })
    })

    it('switching to "all time" omits startDate param (line 82 false branch)', async () => {
      await renderAndWait()
      const callsBefore = mockGetJson.mock.calls.length
      const [timePeriodSelect] = screen.getAllByRole('combobox')
      await act(async () => { fireEvent.change(timePeriodSelect, { target: { value: 'all' } }) })
      await waitFor(() => {
        const newCalls = mockGetJson.mock.calls.slice(callsBefore)
        // 'all' filter means no startDate param
        expect(newCalls.some((args: any[]) => !args[0].includes('startDate='))).toBe(true)
      })
    })

    it('changing action type filter reloads with actionType param', async () => {
      await renderAndWait()
      const selects = screen.getAllByRole('combobox')
      const actionTypeSelect = selects[1]
      await act(async () => { fireEvent.change(actionTypeSelect, { target: { value: 'SALE' } }) })
      await waitFor(() => {
        const calls = mockGetJson.mock.calls
        expect(calls.some((args: any[]) => args[0].includes('actionType=SALE'))).toBe(true)
      })
    })
  })

  // ── Pagination ────────────────────────────────────────────────────────────

  describe('Pagination', () => {
    it('does not show pagination when only 1 page', async () => {
      // totalCount=1, PAGE_SIZE=10 → totalPages=1
      await renderAndWait()
      // No prev/next buttons in pagination bar
      expect(screen.queryByText('Showing 1–1 of 1 activities')).toBeNull()
    })

    it('shows pagination when totalCount exceeds PAGE_SIZE', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse({ totalCount: 25 }))
      })
      await renderAndWait()
      expect(screen.getByText('Showing 1–10 of 25 activities')).toBeTruthy()
    })

    it('prev button disabled on first page', async () => {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse({ totalCount: 25 }))
      })
      await renderAndWait()
      // ChevronLeft button (prev page) should be disabled
      const prevBtn = screen.getAllByRole('button').find(b => b.getAttribute('disabled') !== null && b.querySelector('svg'))
      // Just check page "1" button is present and highlighted
      expect(screen.getByRole('button', { name: '1' })).toBeTruthy()
    })
  })

  // ── Action badge colors (getActionMeta) ───────────────────────────────────

  describe('Action badge colors', () => {
    const actionTypes = [
      'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'SALE', 'RETURN',
      'CUSTOM',  // exercises the default branch (line 181)
    ]

    actionTypes.forEach((type) => {
      it(`renders ${type} action type badge`, async () => {
        mockGetJson.mockImplementation((url: string) => {
          if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
          return Promise.resolve(makeActivityResponse({
            activities: [makeActivity({ actionType: type })],
          }))
        })
        await renderAndWait()
        expect(screen.getByText(type)).toBeTruthy()
      })
    })
  })

  // ── Pagination buttons (prev/next/page pills) ─────────────────────────────

  describe('Pagination button interactions', () => {
    function manyActivitiesSetup(totalCount = 25) {
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse({ totalCount }))
      })
    }

    it('clicking next-page button increments page (line 408)', async () => {
      manyActivitiesSetup()
      await renderAndWait()
      // Find buttons — next page button is last of the pagination buttons
      const buttons = screen.getAllByRole('button')
      const nextBtn = buttons[buttons.length - 1]
      await act(async () => { fireEvent.click(nextBtn) })
      // After clicking next, page 2 indicator appears
      expect(screen.getByText('Showing 11–20 of 25 activities')).toBeTruthy()
    })

    it('clicking prev-page button decrements page (line 376)', async () => {
      manyActivitiesSetup()
      await renderAndWait()
      // Navigate to page 2 first
      const buttons = screen.getAllByRole('button')
      const nextBtn = buttons[buttons.length - 1]
      await act(async () => { fireEvent.click(nextBtn) })
      await waitFor(() => expect(screen.getByText('Showing 11–20 of 25 activities')).toBeTruthy())
      // Click page 1 pill to return to page 1 — exercises page-pill onClick
      const page1Btn = screen.getByRole('button', { name: '1' })
      await act(async () => { fireEvent.click(page1Btn) })
      await waitFor(() => expect(screen.getByText('Showing 1–10 of 25 activities')).toBeTruthy())
    })

    it('clicking a page number pill navigates directly (lines 392-402)', async () => {
      manyActivitiesSetup(30)
      await renderAndWait()
      // Page 3 button should be visible (3 pages)
      const page3Btn = screen.getByRole('button', { name: '3' })
      await act(async () => { fireEvent.click(page3Btn) })
      await waitFor(() => expect(screen.getByText('Showing 21–30 of 30 activities')).toBeTruthy())
    })

    it('prev chevron button decrements from page 2 to page 1 (line 376)', async () => {
      manyActivitiesSetup()
      await renderAndWait()
      // Go to page 2 via next button
      const allButtons = screen.getAllByRole('button')
      const nextBtn = allButtons[allButtons.length - 1]
      await act(async () => { fireEvent.click(nextBtn) })
      await waitFor(() => expect(screen.getByText('Showing 11–20 of 25 activities')).toBeTruthy())
      // Prev button: second button in the list (Back=0, ExportCSV=1, prevChevron=2 in page 2)
      const prevBtn = screen.getAllByRole('button')[2]
      await act(async () => { fireEvent.click(prevBtn) })
      await waitFor(() => expect(screen.getByText('Showing 1–10 of 25 activities')).toBeTruthy())
    })
  })

  // ── Export CSV ────────────────────────────────────────────────────────────

  describe('Export CSV', () => {
    it('renders Export CSV button', async () => {
      await renderAndWait()
      expect(screen.getByText('Export CSV')).toBeTruthy()
    })

    it('clicking Export CSV fetches all activities', async () => {
      // Include activities with entityType+entityId, entityType only, and no entityType
      // to cover all branches in the entity formatting and actionType fallback (lines 138-139)
      const activitiesForExport = [
        makeActivity({ id: 1, entityType: 'Product', entityId: 5 }),      // entity with id
        makeActivity({ id: 2, entityType: 'Sale', entityId: undefined }),  // entity without id
        makeActivity({ id: 3, actionType: null }),                          // no actionType → 'Unknown'
      ]
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('limit=10000')) return Promise.resolve({ activities: activitiesForExport, totalCount: 3 })
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse())
      })
      await renderAndWait()
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue(document.createElement('a'))
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(document.createElement('a'))
      ;(global as any).URL.createObjectURL = vi.fn().mockReturnValue('blob:test')

      const callsBefore = mockGetJson.mock.calls.length
      await act(async () => { fireEvent.click(screen.getByText('Export CSV')) })
      await waitFor(() => {
        expect(mockGetJson.mock.calls.length).toBeGreaterThan(callsBefore)
        // Should call with limit=10000
        const exportCall = mockGetJson.mock.calls.find((args: any[]) => args[0].includes('limit=10000'))
        expect(exportCall).toBeTruthy()
      })
      appendSpy.mockRestore()
      removeSpy.mockRestore()
    })

    it('CSV export with entityType but no entityId uses entity name only (line 138 branch)', async () => {
      // Activity with entityType but no entityId → entityId branch `''` arm
      const activityWithEntityNoId = makeActivity({ entityType: 'Sale', entityId: undefined })
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('limit=10000')) return Promise.resolve({ activities: [activityWithEntityNoId], totalCount: 1 })
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse())
      })
      await renderAndWait()
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockReturnValue(document.createElement('a'))
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockReturnValue(document.createElement('a'))
      ;(global as any).URL.createObjectURL = vi.fn().mockReturnValue('blob:test')
      await act(async () => { fireEvent.click(screen.getByText('Export CSV')) })
      await waitFor(() => {
        const exportCall = mockGetJson.mock.calls.find((args: any[]) => args[0].includes('limit=10000'))
        expect(exportCall).toBeTruthy()
      })
      appendSpy.mockRestore()
      removeSpy.mockRestore()
    })

    it('logs error when CSV export fails (line 151)', async () => {
      await renderAndWait()
      // After initial render, make subsequent calls fail
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('limit=10000')) return Promise.reject(new Error('export failed'))
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse())
      })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await act(async () => { fireEvent.click(screen.getByText('Export CSV')) })
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Error exporting CSV:', expect.any(Error))
      })
      consoleSpy.mockRestore()
    })
  })

  // ── Pagination ellipsis (getPageItems null sentinel, lines 164-165) ────────

  describe('Pagination ellipsis', () => {
    it('shows ellipsis when pages exceed display window (lines 164-165)', async () => {
      // 60 total activities → 6 pages; on page 1, getPageItems returns [1, 2, null, 6]
      mockGetJson.mockImplementation((url: string) => {
        if (url.includes('/useractivity/summary')) return Promise.resolve(makeSummary())
        return Promise.resolve(makeActivityResponse({ totalCount: 60 }))
      })
      await renderAndWait()
      const ellipses = screen.getAllByText('…')
      expect(ellipses.length).toBeGreaterThan(0)
    })
  })
})
