import { useState, useEffect, useCallback } from 'react'
import { formatDate, formatDateTime, formatTime, formatDateSync, clearDateFormatCache, type DateFormatType } from '../utils/dateFormat'

interface UseDateFormatReturn {
  formatDate: (date: Date | string) => Promise<string>
  formatDateTime: (date: Date | string) => Promise<string> 
  formatTime: (date: Date | string) => string
  formatDateSync: (date: Date | string, fallback?: DateFormatType) => string
  refreshFormat: () => void
  isLoading: boolean
}

/**
 * Hook for formatting dates according to user's system settings
 */
export function useDateFormat(): UseDateFormatReturn {
  const [isLoading, setIsLoading] = useState(false)
  
  const refreshFormat = useCallback(() => {
    clearDateFormatCache()
  }, [])

  // Async formatters
  const handleFormatDate = useCallback(async (date: Date | string): Promise<string> => {
    setIsLoading(true)
    try {
      return await formatDate(date)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleFormatDateTime = useCallback(async (date: Date | string): Promise<string> => {
    setIsLoading(true)
    try {
      return await formatDateTime(date)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    formatDate: handleFormatDate,
    formatDateTime: handleFormatDateTime,
    formatTime,
    formatDateSync,
    refreshFormat,
    isLoading
  }
}

/**
 * Hook that provides formatted dates as state (useful for immediate rendering)
 */
export function useFormattedDate(date: Date | string | null): {
  formattedDate: string
  formattedDateTime: string
  isLoading: boolean
  refresh: () => void
} {
  const [formattedDate, setFormattedDate] = useState<string>('')
  const [formattedDateTime, setFormattedDateTime] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  
  const refresh = useCallback(async () => {
    if (!date) {
      setFormattedDate('')
      setFormattedDateTime('')
      return
    }

    setIsLoading(true)
    try {
      const [dateResult, dateTimeResult] = await Promise.all([
        formatDate(date),
        formatDateTime(date)
      ])
      setFormattedDate(dateResult)
      setFormattedDateTime(dateTimeResult)
    } catch (error) {
      console.error('Failed to format date:', error)
      setFormattedDate('Invalid Date')
      setFormattedDateTime('Invalid Date')
    } finally {
      setIsLoading(false)
    }
  }, [date])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    formattedDate,
    formattedDateTime, 
    isLoading,
    refresh
  }
}