import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

vi.mock('@/utils/ApiClient', () => ({
  default: { online: true, setOnline: vi.fn() },
}))

// We mock the context module so we can control the returned state per-test
const mockUseConnection = vi.fn()
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => mockUseConnection(),
}))

import OfflineBanner from '@/components/ui/OfflineBanner'

function defaultCtx(overrides = {}) {
  return {
    isOnline: true,
    queueCount: 0,
    adjustmentQueueCount: 0,
    returnQueueCount: 0,
    isSyncing: false,
    syncProgress: null,
    failedSaleCount: 0,
    failedAdjustmentCount: 0,
    failedReturnCount: 0,
    clearFailedSales: vi.fn(),
    clearFailedAdjustments: vi.fn(),
    clearFailedReturns: vi.fn(),
    ...overrides,
  }
}

describe('OfflineBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when online, idle, no queue, no failures', () => {
    mockUseConnection.mockReturnValue(defaultCtx())
    const { container } = render(<OfflineBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('shows red offline banner with queued count when offline', () => {
    mockUseConnection.mockReturnValue(defaultCtx({
      isOnline: false,
      queueCount: 3,
      returnQueueCount: 1,
    }))
    render(<OfflineBanner />)
    expect(screen.getByText(/Offline/i)).toBeInTheDocument()
    expect(screen.getByText(/3 sales/i)).toBeInTheDocument()
    expect(screen.getByText(/1 return/i)).toBeInTheDocument()
  })

  it('shows amber syncing banner while isSyncing', () => {
    mockUseConnection.mockReturnValue(defaultCtx({
      isSyncing: true,
      syncProgress: { current: 2, total: 5 },
    }))
    render(<OfflineBanner />)
    expect(screen.getByText(/Syncing \(2 of 5\)/i)).toBeInTheDocument()
  })

  it('shows syncing banner without progress when syncProgress is null', () => {
    mockUseConnection.mockReturnValue(defaultCtx({ isSyncing: true, syncProgress: null }))
    render(<OfflineBanner />)
    expect(screen.getByText(/^Syncing…$/i)).toBeInTheDocument()
  })

  it('shows orange failed-sync warning with dismiss button', () => {
    const clearFailedSales = vi.fn()
    const clearFailedAdjustments = vi.fn()
    const clearFailedReturns = vi.fn()
    mockUseConnection.mockReturnValue(defaultCtx({
      failedSaleCount: 2,
      failedReturnCount: 1,
      clearFailedSales,
      clearFailedAdjustments,
      clearFailedReturns,
    }))
    render(<OfflineBanner />)
    expect(screen.getByText(/failed to sync/i)).toBeInTheDocument()
    expect(screen.getByText(/2 sales/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(clearFailedSales).toHaveBeenCalled()
    expect(clearFailedAdjustments).toHaveBeenCalled()
    expect(clearFailedReturns).toHaveBeenCalled()
  })

  it('shows green back-online banner after sync completes, then hides after 3 s', async () => {
    // First render: syncing = true
    mockUseConnection.mockReturnValue(defaultCtx({ isSyncing: true }))
    const { rerender } = render(<OfflineBanner />)
    expect(screen.getByText(/Syncing/i)).toBeInTheDocument()

    // Transition to syncing = false (prevSyncing ref now true → triggers showDone)
    mockUseConnection.mockReturnValue(defaultCtx({ isSyncing: false }))
    await act(async () => { rerender(<OfflineBanner />) })

    expect(screen.getByText(/Back online/i)).toBeInTheDocument()

    // After 3 seconds the banner auto-hides
    await act(async () => { vi.advanceTimersByTime(3001) })
    expect(screen.queryByText(/Back online/i)).toBeNull()
  })

  it('shows offline banner with generic message when no items are queued', () => {
    mockUseConnection.mockReturnValue(defaultCtx({ isOnline: false }))
    render(<OfflineBanner />)
    expect(screen.getByText(/Offline — POS running on cached data/i)).toBeInTheDocument()
  })
})
