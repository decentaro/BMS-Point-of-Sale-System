interface ApiConfig {
  baseUrl: string
  timeout?: number
}

class RuntimeApiConfig {
  private static instance: RuntimeApiConfig
  private config: ApiConfig | null = null
  
  private constructor() {}
  
  static getInstance(): RuntimeApiConfig {
    if (!RuntimeApiConfig.instance) {
      RuntimeApiConfig.instance = new RuntimeApiConfig()
    }
    return RuntimeApiConfig.instance
  }
  
  async getConfig(): Promise<ApiConfig> {
    if (this.config) {
      return this.config
    }
    
    // Try to get config from Electron main process
    if (window.electronAPI?.getApiConfig) {
      try {
        const electronConfig = await window.electronAPI.getApiConfig()
        if (electronConfig) {
          this.config = {
            baseUrl: electronConfig.baseUrl,
            timeout: electronConfig.timeout || 30000
          }
          return this.config
        }
      } catch (error) {
        console.warn('Failed to get API config from main process:', error)
      }
    }
    
    // Fallback to build-time environment variables (for development)
    const envApiUrl = process.env.VITE_API_BASE_URL || process.env.REACT_APP_API_BASE_URL
    
    // Check if we're in development mode
    const isDev = process.env.NODE_ENV === 'development'
    
    this.config = {
      baseUrl: envApiUrl || (isDev ? 'http://localhost:5002/api' : 'http://localhost:5002/api'),
      timeout: 30000
    }
    
    return this.config
  }
  
  // Method to update config at runtime (for settings page)
  updateConfig(newConfig: Partial<ApiConfig>): void {
    if (this.config) {
      this.config = { ...this.config, ...newConfig }
    } else {
      this.config = { baseUrl: newConfig.baseUrl || 'http://localhost:5002/api', timeout: 30000, ...newConfig }
    }
    
    // Notify main process about config change
    if (window.electronAPI?.setApiConfig) {
      window.electronAPI.setApiConfig(this.config)
    }
  }
  
  // Reset config (forces reload from main process)
  resetConfig(): void {
    this.config = null
  }
}

// Singleton instance
const runtimeApiConfig = RuntimeApiConfig.getInstance()

// Export async function to get current API base URL
export async function getApiBaseUrl(): Promise<string> {
  const config = await runtimeApiConfig.getConfig()
  return config.baseUrl
}

// Export full config getter
export async function getApiConfig(): Promise<ApiConfig> {
  return runtimeApiConfig.getConfig()
}

// Export config updater
export function updateApiConfig(newConfig: Partial<ApiConfig>): void {
  runtimeApiConfig.updateConfig(newConfig)
}

// For backwards compatibility, provide synchronous default
export const API_BASE_URL = 'http://localhost:5002/api' // Default fallback

// Type for window.electronAPI
declare global {
  interface Window {
    electronAPI?: {
      getApiConfig: () => Promise<ApiConfig>
      setApiConfig: (config: ApiConfig) => Promise<void>
    }
  }
}