
import ApiClient from './ApiClient'

interface UserSession {
  id: number
  employeeId: string
  name: string
  role: string
  isManager: boolean
  loginTime: number
  lastActivity: number
  sessionToken: string
  expiresAt: number
}

class SessionManager {
  private static readonly DEFAULT_SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes in milliseconds (fallback)
  private static readonly SESSION_KEY = 'currentUser'
  private static readonly SESSION_TOKEN_KEY = 'sessionToken'
  private static readonly JWT_TOKEN_KEY = 'jwtToken'

  // In-memory JWT token (also persisted to sessionStorage as backup within the tab)
  private static jwtToken: string | null = null

  private static activityTimer: NodeJS.Timeout | null = null
  private static cachedTimeout: number | null = null

  /**
   * Store the JWT token received from the backend after login
   */
  static setToken(token: string): void {
    this.jwtToken = token
    sessionStorage.setItem(this.JWT_TOKEN_KEY, token)
    // Pass to Electron preload so all apiRequest calls include Authorization header
    if (typeof window !== 'undefined' && window.electronAPI?.setAuthToken) {
      window.electronAPI.setAuthToken(token)
    }
  }

  /**
   * Restore JWT from sessionStorage (e.g. after hot-reload in dev)
   */
  private static restoreToken(): string | null {
    if (this.jwtToken) return this.jwtToken
    const stored = sessionStorage.getItem(this.JWT_TOKEN_KEY)
    if (stored) {
      this.jwtToken = stored
      if (typeof window !== 'undefined' && window.electronAPI?.setAuthToken) {
        window.electronAPI.setAuthToken(stored)
      }
    }
    return this.jwtToken
  }

  /**
   * Get session timeout from system settings
   */
  static async getSessionTimeout(): Promise<number> {
    if (this.cachedTimeout) {
      return this.cachedTimeout
    }

    try {
      const settings = await ApiClient.getSettings<any>('system')
      // Enforce 5-minute minimum
      const minutes = Math.max(5, settings.autoLogoutMinutes || 30)
      this.cachedTimeout = minutes * 60 * 1000
      return this.cachedTimeout
    } catch (error) {
      console.warn('Failed to load session timeout from settings, using default:', error)
    }
    
    // Fallback to default (30 minutes)
    this.cachedTimeout = this.DEFAULT_SESSION_TIMEOUT
    return this.cachedTimeout
  }

  /**
   * Refresh cached timeout and restart session with new timeout (call when settings change)
   */
  static async refreshSessionTimeout(): Promise<void> {
    this.cachedTimeout = null
    
    // Update current session with new timeout - this is a special case
    // where changing timeout settings should reset the timer
    const session = this.getCurrentSession()
    if (session) {
      const newTimeout = await this.getSessionTimeout()
      const now = Date.now()
      
      // Reset timer from now (user just changed timeout settings)
      session.lastActivity = now
      session.expiresAt = now + newTimeout
      sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session))

      // Restart monitoring with new interval
      this.startActivityMonitoring()
    }
  }

  /**
   * Create a new user session
   */
  static async createSession(user: any): Promise<UserSession> {
    // Clear any existing monitoring first
    if (this.activityTimer) {
      clearInterval(this.activityTimer)
      clearTimeout(this.activityTimer)
      this.activityTimer = null
    }
    
    const now = Date.now()
    const sessionToken = this.generateSessionToken()
    const timeout = await this.getSessionTimeout()
    
    const session: UserSession = {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
      isManager: user.isManager || false,
      loginTime: now,
      lastActivity: now,
      sessionToken,
      expiresAt: now + timeout
    }

    // Store session and update activity time
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session))
    sessionStorage.setItem(this.SESSION_TOKEN_KEY, sessionToken)

    // Start fresh activity monitoring
    this.startActivityMonitoring()
    
    return session
  }

  /**
   * Get current session if valid
   */
  static getCurrentSession(): UserSession | null {
    try {
      const sessionData = sessionStorage.getItem(this.SESSION_KEY)
      const storedToken = sessionStorage.getItem(this.SESSION_TOKEN_KEY)
      
      if (!sessionData || !storedToken) return null
      
      const session: UserSession = JSON.parse(sessionData)
      
      // Validate session token
      if (session.sessionToken !== storedToken) {
        this.clearSession()
        return null
      }
      
      // Check if session expired using business time sync
      if (Date.now() > session.expiresAt) {
        this.clearSession()
        return null
      }
      
      return session
    } catch (error) {
      console.error('Error getting session:', error)
      this.clearSession()
      return null
    }
  }

  /**
   * Extend session explicitly (only when user chooses to via popup)
   */
  static async extendSession(): Promise<boolean> {
    const session = this.getCurrentSession()
    if (!session) return false
    
    const now = Date.now()
    const timeout = await this.getSessionTimeout()
    session.lastActivity = now
    session.expiresAt = now + timeout

    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session))
    return true
  }

  /**
   * Extend session for business actions (completing sales, saving data, etc.)
   * Use this for important business operations that should extend the session
   */
  static async extendForBusinessAction(_action: string): Promise<boolean> {
    const session = this.getCurrentSession()
    if (!session) return false

    const now = Date.now()
    const timeout = await this.getSessionTimeout()
    session.lastActivity = now
    session.expiresAt = now + timeout

    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session))
    return true
  }

  /**
   * Check if current session is valid
   */
  static isSessionValid(): boolean {
    return this.getCurrentSession() !== null
  }

  /**
   * Get time until session expires (in minutes)
   */
  static getTimeUntilExpiry(): number {
    const session = this.getCurrentSession()
    if (!session) return 0
    
    const now = Date.now()
    const timeLeft = session.expiresAt - now
    return Math.max(0, Math.floor(timeLeft / (60 * 1000)))
  }

  /**
   * Returns the correct dashboard route for the current session's role.
   * Use this for "back" / "home" navigation so non-manager roles land on
   * their own dashboard instead of /manager.
   */
  static getDashboardRoute(): string {
    const session = this.getCurrentSession()
    if (!session) return '/login'
    const roles = (session.role || '').split(',').map(r => r.trim())
    if (roles.includes('Manager')) return '/manager'
    const hasCashier   = roles.includes('Cashier')
    const hasInventory = roles.includes('Inventory')
    if (hasCashier && hasInventory) return '/cashier-inventory'
    if (hasCashier)   return '/cashier-dashboard'
    if (hasInventory) return '/inventory-dashboard'
    return '/manager'
  }

  /**
   * Clear current session and JWT token
   */
  static clearSession(): void {
    sessionStorage.removeItem(this.SESSION_KEY)
    sessionStorage.removeItem(this.SESSION_TOKEN_KEY)
    sessionStorage.removeItem(this.JWT_TOKEN_KEY)
    this.jwtToken = null

    if (typeof window !== 'undefined' && window.electronAPI?.clearAuthToken) {
      window.electronAPI.clearAuthToken()
    }

    if (this.activityTimer) {
      clearInterval(this.activityTimer)
      this.activityTimer = null
    }
  }

  /**
   * Get current user for API headers (includes JWT Authorization if available)
   */
  static getUserHeaders(): Record<string, string> {
    const session = this.getCurrentSession()
    const token = this.restoreToken()

    if (!session) {
      return { 'X-User-Id': '0', 'X-User-Name': 'Unknown' }
    }

    const headers: Record<string, string> = {
      'X-User-Id': session.id.toString(),
      'X-User-Name': session.name || session.employeeId,
      'X-Session-Token': session.sessionToken
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return headers
  }

  /**
   * Check if the current session has a specific role assigned (supports multi-role)
   */
  static hasRole(role: string): boolean {
    const session = this.getCurrentSession()
    if (!session) return false
    return session.role.split(',').map(r => r.trim().toLowerCase()).includes(role.toLowerCase())
  }

  /**
   * Check if user has specific permission (unions across all assigned roles)
   */
  static hasPermission(permission: string): boolean {
    const session = this.getCurrentSession()
    if (!session) return false

    const ROLE_PERMISSIONS: Record<string, string[]> = {
      manager:   [], // handled below — managers have all permissions
      cashier:   ['pos.sale', 'pos.return', 'inventory.view'],
      inventory: ['inventory.view', 'inventory.add', 'inventory.edit', 'inventory.adjust'],
    }

    const roles = session.role.split(',').map(r => r.trim().toLowerCase())
    if (roles.includes('manager')) return true
    return roles.some(r => (ROLE_PERMISSIONS[r] ?? []).includes(permission))
  }

  /**
   * Require specific permission or throw error
   */
  static requirePermission(permission: string, action: string = 'perform this action'): void {
    if (!this.hasPermission(permission)) {
      throw new Error(`Insufficient permissions to ${action}. Required: ${permission}`)
    }
  }

  private static generateSessionToken(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Get warning threshold - simplified for 5+ minute minimum
   */
  static async getWarningThreshold(): Promise<number> {
    await this.getSessionTimeout()

    // Since minimum is 5 minutes, use consistent 5-minute warning
    return 5 * 60 * 1000 // Always warn 5 minutes before expiry
  }

  /**
   * Get check interval - simplified for 5+ minute minimum
   */
  static async getCheckInterval(): Promise<number> {
    // Since minimum is 5 minutes, check every 30 seconds for good responsiveness
    return 30 * 1000
  }

  private static startActivityMonitoring(): void {
    // Clear any existing timers completely
    if (this.activityTimer) {
      clearInterval(this.activityTimer)
      clearTimeout(this.activityTimer)
      this.activityTimer = null
    }
    
    // Start with immediate check and dynamic interval
    const monitorSession = async () => {
      const session = this.getCurrentSession()
      if (!session) {
        if (this.activityTimer) clearInterval(this.activityTimer)
        return
      }
      
      // Check for inactivity
      const now = Date.now()
      const sessionTimeLeft = session.expiresAt - now
      
      // SessionStatus component handles warnings - don't show here
      // if (sessionTimeLeft <= warningThreshold && !this.warningShown) {
      //   console.log('Showing expiry warning')
      //   this.warningShown = true
      //   this.showExpiryWarning()
      // }
      
      // Auto-logout if session expired
      if (sessionTimeLeft <= 0) {
        this.handleSessionExpiry()
        return
      }
      
      // Restart timer with appropriate interval
      if (this.activityTimer) clearInterval(this.activityTimer)
      const checkInterval = await this.getCheckInterval()
      this.activityTimer = setTimeout(monitorSession, checkInterval)
    }
    
    // Start monitoring
    monitorSession()
    
    // Note: Removed automatic activity tracking for fixed-duration sessions
  }

  /**
   * Update last activity time (for API calls)
   */
  static async updateActivity(): Promise<void> {
    // Note: Sessions now only extend when user explicitly chooses via warning popup
  }

  // Removed automatic activity tracking for fixed-duration sessions
  // Sessions now only extend when user explicitly chooses via warning popup

  private static handleSessionExpiry(): void {
    this.clearSession()
    window.location.href = '#/login?reason=expired'
  }
}

export default SessionManager