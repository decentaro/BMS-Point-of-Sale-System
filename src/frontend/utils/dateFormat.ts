import { getApiBaseUrl } from '../config/runtime-api'
import ApiClient from './ApiClient'

export type DateFormatType = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'

interface SystemSettings {
  dateFormat: DateFormatType
  [key: string]: any
}

class DateFormatManager {
  private static instance: DateFormatManager
  private cachedFormat: DateFormatType | null = null
  private lastFetchTime = 0
  private readonly CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  private constructor() {}

  static getInstance(): DateFormatManager {
    if (!DateFormatManager.instance) {
      DateFormatManager.instance = new DateFormatManager()
    }
    return DateFormatManager.instance
  }

  private async fetchDateFormat(): Promise<DateFormatType> {
    try {
      const settings: SystemSettings = await ApiClient.getSettings<SystemSettings>('system')
      return settings.dateFormat || 'MM/DD/YYYY'
    } catch (error) {
      console.warn('Failed to fetch date format from system settings:', error)
      return 'MM/DD/YYYY' // Default fallback
    }
  }

  async getDateFormat(): Promise<DateFormatType> {
    const now = Date.now()
    
    // Return cached format if still valid
    if (this.cachedFormat && (now - this.lastFetchTime) < this.CACHE_DURATION) {
      return this.cachedFormat
    }
    
    // Fetch fresh format
    this.cachedFormat = await this.fetchDateFormat()
    this.lastFetchTime = now
    
    return this.cachedFormat
  }

  // Clear cache when settings are updated
  clearCache(): void {
    this.cachedFormat = null
    this.lastFetchTime = 0
  }
}

const dateFormatManager = DateFormatManager.getInstance()

/**
 * Format a date according to user's system settings preference
 */
export async function formatDate(date: Date | string): Promise<string> {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date'
  }
  
  const format = await dateFormatManager.getDateFormat()
  
  switch (format) {
    case 'MM/DD/YYYY':
      return dateObj.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      })
      
    case 'DD/MM/YYYY':
      return dateObj.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
      
    case 'YYYY-MM-DD':
      const year = dateObj.getFullYear()
      const month = String(dateObj.getMonth() + 1).padStart(2, '0')
      const day = String(dateObj.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
      
    default:
      return dateObj.toLocaleDateString()
  }
}

/**
 * Format a date with time according to user's system settings preference
 */
export async function formatDateTime(date: Date | string): Promise<string> {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date'
  }
  
  const format = await dateFormatManager.getDateFormat()
  const datePart = await formatDate(dateObj)
  const timePart = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
  
  return `${datePart}, ${timePart}`
}

/**
 * Format date for file names (always uses YYYY-MM-DD regardless of user preference)
 */
export function formatDateForFile(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(dateObj.getTime())) {
    return 'invalid-date'
  }
  
  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const day = String(dateObj.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Format time only (no date)
 */
export function formatTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Time'
  }
  
  return dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * Get a synchronous date format for immediate use (uses cached value or default)
 * Use this when async formatting is not possible
 */
export function formatDateSync(date: Date | string, fallbackFormat: DateFormatType = 'MM/DD/YYYY'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date'
  }
  
  // Use cached format if available, otherwise use fallback
  const format = dateFormatManager['cachedFormat'] || fallbackFormat
  
  switch (format) {
    case 'MM/DD/YYYY':
      return dateObj.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit', 
        year: 'numeric'
      })
      
    case 'DD/MM/YYYY':
      return dateObj.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
      
    case 'YYYY-MM-DD':
      const year = dateObj.getFullYear()
      const month = String(dateObj.getMonth() + 1).padStart(2, '0')
      const day = String(dateObj.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
      
    default:
      return dateObj.toLocaleDateString()
  }
}

/**
 * Clear the date format cache (call when system settings are updated)
 */
export function clearDateFormatCache(): void {
  dateFormatManager.clearCache()
}

export default {
  formatDate,
  formatDateTime,
  formatDateForFile,
  formatTime,
  formatDateSync,
  clearDateFormatCache
}