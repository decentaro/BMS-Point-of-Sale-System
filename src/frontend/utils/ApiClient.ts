import SessionManager from './SessionManager'
import { API_BASE_URL } from '../config/api'

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  headers?: Record<string, string>
  requireAuth?: boolean
  timeout?: number
  retries?: number
  retryDelay?: number
}

interface ApiError extends Error {
  status?: number
  type: 'network' | 'server' | 'client' | 'timeout' | 'auth'
}

interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

class ApiClient {
  // Set by ConnectionContext — when false, all requests fail immediately (no retries)
  static online: boolean = true
  static setOnline(online: boolean) { ApiClient.online = online }

  // Set once at startup from Electron terminal config — injected on every request
  static terminalId: string | null = null
  static terminalName: string | null = null
  static setTerminalId(id: string | null, name: string | null = null) {
    ApiClient.terminalId = id
    ApiClient.terminalName = name
  }

  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  }

  private static readonly DEFAULT_TIMEOUT = 30000 // 30 seconds

  /**
   * Create an API error with proper typing
   */
  private static createApiError(message: string, status?: number, type: ApiError['type'] = 'client'): ApiError {
    const error = new Error(message) as ApiError
    error.status = status
    error.type = type
    return error
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private static calculateRetryDelay(attempt: number, config: RetryConfig): number {
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1)
    return Math.min(delay, config.maxDelay)
  }

  /**
   * Check if error is retryable.
   * Only infrastructure errors (502/503/504) are safe to retry automatically.
   * A 500 Internal Server Error may indicate a partially committed write, so
   * retrying it on a POST/PUT could submit the same sale or return twice.
   * Network/timeout errors are always retried regardless of method.
   */
  private static isRetryableError(error: ApiError, method: string = 'GET'): boolean {
    if (error.type === 'network' || error.type === 'timeout') return true
    // Only retry infrastructure-level 5xx on idempotent methods
    const safeRetryStatuses = [502, 503, 504]
    const isIdempotent = method === 'GET' || method === 'DELETE'
    return safeRetryStatuses.includes(error.status ?? 0) && isIdempotent
  }

  /**
   * Make an authenticated API request with retry logic
   */
  static async request(endpoint: string, options: ApiRequestOptions = {}): Promise<Response> {
    const {
      method = 'GET',
      body,
      headers = {},
      requireAuth = true,
      timeout = this.DEFAULT_TIMEOUT,
      retries = this.DEFAULT_CONFIG.maxRetries,
      retryDelay = this.DEFAULT_CONFIG.baseDelay
    } = options

    const retryConfig: RetryConfig = {
      maxRetries: retries,
      baseDelay: retryDelay,
      maxDelay: this.DEFAULT_CONFIG.maxDelay,
      backoffMultiplier: this.DEFAULT_CONFIG.backoffMultiplier
    }

    // Prepare headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    }

    // Inject terminal identity so the backend can scope sessions, sales, and reports
    if (ApiClient.terminalId) {
      requestHeaders['X-Terminal-Id'] = ApiClient.terminalId
    }
    if (ApiClient.terminalName) {
      requestHeaders['X-Terminal-Name'] = ApiClient.terminalName
    }

    // Add authentication headers if required
    if (requireAuth) {
      if (!SessionManager.isSessionValid()) {
        throw new Error('Session expired. Please log in again.')
      }
      
      const authHeaders = SessionManager.getUserHeaders()
      Object.assign(requestHeaders, authHeaders)
      
    }

    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers: requestHeaders
    }

    if (body && (method === 'POST' || method === 'PUT')) {
      if (body instanceof FormData) {
        requestOptions.body = body
        // Remove Content-Type for FormData - browser will set it with boundary
        delete requestHeaders['Content-Type']
      } else {
        requestOptions.body = JSON.stringify(body)
      }
    }

    // Fail immediately when offline — don't waste time on retries
    if (!ApiClient.online) {
      throw this.createApiError('Offline', undefined, 'network')
    }

    // Make the request with retry logic
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`

    let lastError!: ApiError
    
    for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
      try {
        // Create abort controller for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)
        
        const requestOptionsWithTimeout: RequestInit = {
          ...requestOptions,
          signal: controller.signal
        }
        
        const response = await fetch(url, requestOptionsWithTimeout)
        clearTimeout(timeoutId)
        
        // Handle authentication errors (don't retry these)
        if (response.status === 401) {
          SessionManager.clearSession()
          window.location.href = '#/login'
          throw this.createApiError('Authentication failed. Please log in again.', 401, 'auth')
        }
        
        // Handle client errors (don't retry these)
        if (response.status >= 400 && response.status < 500 && response.status !== 401) {
          const errorText = await response.text().catch(() => 'Unknown client error')
          throw this.createApiError(errorText || `HTTP ${response.status}`, response.status, 'client')
        }
        
        // Handle server errors — only retry infrastructure errors (502/503/504)
        // on idempotent methods; never retry a 500 on POST/PUT
        if (response.status >= 500) {
          const errorText = await response.text().catch(() => 'Server error')
          lastError = this.createApiError(errorText || `HTTP ${response.status}`, response.status, 'server')

          if (attempt <= retryConfig.maxRetries && this.isRetryableError(lastError, method)) {
            const delay = this.calculateRetryDelay(attempt, retryConfig)
            console.warn(`API request failed (attempt ${attempt}/${retryConfig.maxRetries + 1}), retrying in ${delay}ms:`, lastError.message)
            await this.sleep(delay)
            continue
          }
          throw lastError
        }
        
        return response
        
      } catch (error) {
        // Handle different types of errors
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            lastError = this.createApiError(`Request timeout after ${timeout}ms`, undefined, 'timeout')
          } else if (error.message.includes('fetch')) {
            lastError = this.createApiError('Network connection failed', undefined, 'network')
          } else if ((error as ApiError).type) {
            lastError = error as ApiError
          } else {
            lastError = this.createApiError(error.message, undefined, 'network')
          }
        } else {
          lastError = this.createApiError('Unknown error occurred', undefined, 'network')
        }
        
        // Don't retry auth errors or client errors
        if (!this.isRetryableError(lastError, method)) {
          // Don't log expected 404s for settings endpoints as errors
          const isExpectedSettingsError = url.includes('/tax-settings') && lastError.status === 404
          if (isExpectedSettingsError) {
            console.debug('Tax settings not found (expected for new setup):', lastError.message)
          } else {
            console.error('API request failed (non-retryable):', lastError)
          }
          throw lastError
        }
        
        // Retry if we haven't exhausted attempts
        if (attempt <= retryConfig.maxRetries) {
          const delay = this.calculateRetryDelay(attempt, retryConfig)
          console.warn(`API request failed (attempt ${attempt}/${retryConfig.maxRetries + 1}), retrying in ${delay}ms:`, lastError.message)
          await this.sleep(delay)
          continue
        }
        
        // All retries exhausted
        console.error('API request failed after all retries:', lastError)
        throw lastError
      }
    }
    
    throw lastError
  }

  /**
   * GET request
   */
  static async get(endpoint: string, requireAuth: boolean = true, options?: Partial<ApiRequestOptions>): Promise<Response> {
    return this.request(endpoint, { method: 'GET', requireAuth, ...options })
  }

  /**
   * POST request
   */
  static async post(endpoint: string, data: any, requireAuth: boolean = true, options?: Partial<ApiRequestOptions>): Promise<Response> {
    return this.request(endpoint, { method: 'POST', body: data, requireAuth, ...options })
  }

  /**
   * PUT request
   */
  static async put(endpoint: string, data: any, requireAuth: boolean = true, options?: Partial<ApiRequestOptions>): Promise<Response> {
    return this.request(endpoint, { method: 'PUT', body: data, requireAuth, ...options })
  }

  /**
   * DELETE request
   */
  static async delete(endpoint: string, requireAuth: boolean = true, options?: Partial<ApiRequestOptions>): Promise<Response> {
    return this.request(endpoint, { method: 'DELETE', requireAuth, ...options })
  }

  /**
   * Helper for JSON responses with better error handling.
   * Automatically caches every successful response in localStorage.
   * When offline, serves from cache — throws only if no cache exists.
   */
  static async getJson<T>(endpoint: string, requireAuth: boolean = true, options?: Partial<ApiRequestOptions>): Promise<T> {
    if (!ApiClient.online) {
      const { default: CacheService } = await import('./CacheService')
      const cached = CacheService.get<T>(endpoint)
      if (cached !== null) return cached
      throw this.createApiError('Offline', undefined, 'network')
    }
    const response = await this.get(endpoint, requireAuth, options)
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      throw this.createApiError(errorText || `HTTP ${response.status}`, response.status, 'server')
    }
    const data: T = await response.json()
    // Cache every successful GET response
    const { default: CacheService } = await import('./CacheService')
    CacheService.set(endpoint, data)
    return data
  }

  /**
   * Helper for POST with JSON response
   */
  static async postJson<T>(endpoint: string, data: any, requireAuth: boolean = true, options?: Partial<ApiRequestOptions>): Promise<T> {
    const response = await this.post(endpoint, data, requireAuth, options)
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      throw this.createApiError(errorText || `HTTP ${response.status}`, response.status, 'server')
    }
    return response.json()
  }

  /**
   * Helper for PUT with JSON response
   */
  static async putJson<T>(endpoint: string, data: any, requireAuth: boolean = true, options?: Partial<ApiRequestOptions>): Promise<T> {
    const response = await this.put(endpoint, data, requireAuth, options)
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      throw this.createApiError(errorText || `HTTP ${response.status}`, response.status, 'server')
    }
    return response.json()
  }

  /**
   * Create user activity log entry
   */
  static async logActivity(action: string, details: string, entityType?: string, entityId?: number): Promise<void> {
    try {
      await this.post('/user-activity', {
        action,
        details,
        entityType,
        entityId
      })
    } catch (error) {
      console.error('Failed to log activity:', error)
      // Don't throw - activity logging shouldn't break the application
    }
  }

  /**
   * Specialized method for settings endpoints (commonly used)
   * Handles 404s gracefully for optional settings like tax-settings
   */
  static async getSettings<T>(settingsType: 'system' | 'tax' = 'system'): Promise<T> {
    const endpoint = settingsType === 'system' ? '/system-settings' : '/tax-settings'
    
    try {
      return await this.getJson<T>(endpoint, false) // Settings often don't require auth
    } catch (error: any) {
      // Handle missing tax settings gracefully (they're optional)
      if (settingsType === 'tax' && (error.status === 404 || error.message?.includes('404'))) {
        throw new Error('Tax settings not configured')
      }
      // Re-throw other errors
      throw error
    }
  }

  /**
   * Specialized method for employee operations
   */
  static async getEmployees(includeInactive: boolean = false): Promise<any[]> {
    return this.getJson<any[]>(`/employees?includeInactive=${includeInactive}`)
  }

  /**
   * Specialized method for product operations  
   */
  static async getProducts(): Promise<any[]> {
    return this.getJson<any[]>('/products')
  }

  /**
   * Handle file uploads (common in desktop apps)
   */
  static async uploadFile(endpoint: string, file: File, additionalData?: Record<string, any>, fieldName: string = 'file'): Promise<Response> {
    const formData = new FormData()
    formData.append(fieldName, file)
    
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, String(value))
      })
    }

    // Don't set Content-Type for FormData - let browser set it with boundary
    const headers: Record<string, string> = {}
    
    if (SessionManager.isSessionValid()) {
      Object.assign(headers, SessionManager.getUserHeaders())
    }

    return this.request(endpoint, {
      method: 'POST',
      body: formData,
      headers,
      requireAuth: false // We manually handle auth for file uploads
    })
  }
}

export default ApiClient