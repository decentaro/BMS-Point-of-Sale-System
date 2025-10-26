
import { API_BASE_URL } from '../config/api'
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
  
  private static activityTimer: NodeJS.Timeout | null = null
  private static lastActivityTime: number = Date.now()
  private static cachedTimeout: number | null = null
  private static warningShown: boolean = false

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
      this.lastActivityTime = now
      sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session))
      
      console.log(`Session timeout updated: ${newTimeout / (60 * 1000)} minutes from now`)
      console.log(`Current time: ${new Date(now).toLocaleTimeString()}`)
      console.log(`Expires at: ${new Date(session.expiresAt).toLocaleTimeString()}`)
      
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
    this.lastActivityTime = now
    this.warningShown = false // Reset warning flag for new session
    
    console.log(`New session created: ${timeout / (60 * 1000)} minutes`)
    console.log(`Session expires at: ${new Date(session.expiresAt).toLocaleTimeString()}`)
    
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
    this.lastActivityTime = now
    this.warningShown = false // Reset warning when session is extended
    
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session))
    console.log(`Session manually extended: ${timeout / (60 * 1000)} minutes from now`)
    console.log(`New expiry time: ${new Date(session.expiresAt).toLocaleTimeString()}`)
    return true
  }

  /**
   * Extend session for business actions (completing sales, saving data, etc.)
   * Use this for important business operations that should extend the session
   */
  static async extendForBusinessAction(action: string): Promise<boolean> {
    const session = this.getCurrentSession()
    if (!session) return false
    
    const now = Date.now()
    const timeout = await this.getSessionTimeout()
    session.lastActivity = now
    session.expiresAt = now + timeout
    this.lastActivityTime = now
    this.warningShown = false // Reset warning when session is extended
    
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session))
    console.log(`Session extended for business action: ${action}`)
    console.log(`New expiry time: ${new Date(session.expiresAt).toLocaleTimeString()}`)
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
   * Clear current session
   */
  static clearSession(): void {
    sessionStorage.removeItem(this.SESSION_KEY)
    sessionStorage.removeItem(this.SESSION_TOKEN_KEY)
    
    if (this.activityTimer) {
      clearInterval(this.activityTimer)
      this.activityTimer = null
    }
  }

  /**
   * Get current user for API headers
   */
  static getUserHeaders(): Record<string, string> {
    const session = this.getCurrentSession()
    if (!session) {
      return {
        'X-User-Id': '0',
        'X-User-Name': 'Unknown'
      }
    }
    
    return {
      'X-User-Id': session.id.toString(),
      'X-User-Name': session.name || session.employeeId,
      'X-Session-Token': session.sessionToken
    }
  }

  /**
   * Check if user has specific permission
   */
  static hasPermission(permission: string): boolean {
    const session = this.getCurrentSession()
    if (!session) return false
    
    // Basic role-based permissions for now
    switch (session.role.toLowerCase()) {
      case 'manager':
        return true // Managers have all permissions
      case 'cashier':
        return ['pos.sale', 'pos.return', 'inventory.view'].includes(permission)
      case 'inventory':
        return ['inventory.view', 'inventory.add', 'inventory.edit', 'inventory.adjust'].includes(permission)
      default:
        return false
    }
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
    const totalTimeout = await this.getSessionTimeout()
    const totalMinutes = totalTimeout / (60 * 1000)
    
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
      const timeSinceActivity = now - this.lastActivityTime
      const sessionTimeLeft = session.expiresAt - now
      const warningThreshold = await this.getWarningThreshold()
      
      console.log(`Session check: ${Math.floor(sessionTimeLeft / 1000)}s left, warning at ${Math.floor(warningThreshold / 1000)}s`)
      
      // SessionStatus component handles warnings - don't show here
      // if (sessionTimeLeft <= warningThreshold && !this.warningShown) {
      //   console.log('Showing expiry warning')
      //   this.warningShown = true
      //   this.showExpiryWarning()
      // }
      
      // Auto-logout if session expired
      if (sessionTimeLeft <= 0) {
        console.log('Session expired - logging out')
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
    this.lastActivityTime = Date.now()
    // Note: Sessions now only extend when user explicitly chooses via warning popup
  }

  // Removed automatic activity tracking for fixed-duration sessions
  // Sessions now only extend when user explicitly chooses via warning popup

  private static async showExpiryWarning(): Promise<void> {
    const timeLeft = this.getTimeUntilExpiry()
    if (timeLeft > 0) {
      const extend = confirm(`Your session will expire in ${timeLeft} minutes. Do you want to extend it?`)
      if (extend) {
        await this.extendSession()
      }
    }
  }

  private static handleSessionExpiry(): void {
    this.clearSession()
    alert('Your session has expired. Please log in again.')
    window.location.href = '#/login'
  }
}

export default SessionManager