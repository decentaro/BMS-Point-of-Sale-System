import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Stub the underlying dateFormat module so the hook is tested in isolation
vi.mock('@/utils/dateFormat', () => ({
  formatDate: vi.fn(async (d: Date | string) => `formatted-date(${d})`),
  formatDateTime: vi.fn(async (d: Date | string) => `formatted-datetime(${d})`),
  formatTime: vi.fn((d: Date | string) => `formatted-time(${d})`),
  formatDateSync: vi.fn((d: Date | string) => `formatted-sync(${d})`),
  clearDateFormatCache: vi.fn(),
}))

import { useDateFormat, useFormattedDate } from '@/hooks/useDateFormat'
import * as dateFormatModule from '@/utils/dateFormat'

const mockFormatDate = vi.mocked(dateFormatModule.formatDate)
const mockFormatDateTime = vi.mocked(dateFormatModule.formatDateTime)
const mockFormatTime = vi.mocked(dateFormatModule.formatTime)
const mockFormatDateSync = vi.mocked(dateFormatModule.formatDateSync)
const mockClearCache = vi.mocked(dateFormatModule.clearDateFormatCache)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDateFormat', () => {
  it('returns formatDate function that delegates to dateFormat util', async () => {
    const { result } = renderHook(() => useDateFormat())
    const formatted = await result.current.formatDate('2024-01-15')
    expect(mockFormatDate).toHaveBeenCalledWith('2024-01-15')
    expect(formatted).toBe('formatted-date(2024-01-15)')
  })

  it('returns formatDateTime function that delegates to dateFormat util', async () => {
    const { result } = renderHook(() => useDateFormat())
    const formatted = await result.current.formatDateTime('2024-01-15T10:30:00Z')
    expect(mockFormatDateTime).toHaveBeenCalledWith('2024-01-15T10:30:00Z')
    expect(formatted).toBe('formatted-datetime(2024-01-15T10:30:00Z)')
  })

  it('returns formatTime that delegates synchronously', () => {
    const { result } = renderHook(() => useDateFormat())
    const formatted = result.current.formatTime('2024-01-15T10:30:00Z')
    expect(mockFormatTime).toHaveBeenCalledWith('2024-01-15T10:30:00Z')
    expect(formatted).toBe('formatted-time(2024-01-15T10:30:00Z)')
  })

  it('returns formatDateSync that delegates synchronously', () => {
    const { result } = renderHook(() => useDateFormat())
    const formatted = result.current.formatDateSync('2024-01-15')
    expect(mockFormatDateSync).toHaveBeenCalledWith('2024-01-15')
    expect(formatted).toBe('formatted-sync(2024-01-15)')
  })

  it('refreshFormat calls clearDateFormatCache', () => {
    const { result } = renderHook(() => useDateFormat())
    act(() => result.current.refreshFormat())
    expect(mockClearCache).toHaveBeenCalledTimes(1)
  })

  it('isLoading is false initially', () => {
    const { result } = renderHook(() => useDateFormat())
    expect(result.current.isLoading).toBe(false)
  })

  it('isLoading becomes true during async formatDate call', async () => {
    let resolveFormat!: (v: string) => void
    mockFormatDate.mockReturnValueOnce(new Promise(res => { resolveFormat = res }))

    const { result } = renderHook(() => useDateFormat())

    let formatPromise: Promise<string>
    act(() => { formatPromise = result.current.formatDate('2024-01-15') })

    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      resolveFormat('01/15/2024')
      await formatPromise!
    })

    expect(result.current.isLoading).toBe(false)
  })
})

describe('useFormattedDate', () => {
  it('formats date and dateTime on mount', async () => {
    const { result } = renderHook(() => useFormattedDate('2024-06-01'))

    await waitFor(() => expect(result.current.formattedDate).not.toBe(''))
    expect(result.current.formattedDate).toBe('formatted-date(2024-06-01)')
    expect(result.current.formattedDateTime).toBe('formatted-datetime(2024-06-01)')
  })

  it('returns empty strings when date is null', async () => {
    const { result } = renderHook(() => useFormattedDate(null))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.formattedDate).toBe('')
    expect(result.current.formattedDateTime).toBe('')
  })

  it('refresh re-fetches formats', async () => {
    const { result } = renderHook(() => useFormattedDate('2024-06-01'))
    await waitFor(() => expect(result.current.formattedDate).not.toBe(''))

    mockFormatDate.mockResolvedValueOnce('refreshed-date')
    await act(async () => result.current.refresh())

    expect(result.current.formattedDate).toBe('refreshed-date')
  })
})
