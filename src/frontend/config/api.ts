interface ApiConfig {
  baseUrl: string
  timeout?: number
}

const getApiConfig = (): ApiConfig => {
  // Check if we're in development mode
  const isDev = process.env.NODE_ENV === 'development'
  
  // Check for environment variable first (allows override)
  const envApiUrl = process.env.VITE_API_BASE_URL || process.env.REACT_APP_API_BASE_URL
  
  if (envApiUrl) {
    return {
      baseUrl: envApiUrl,
      timeout: 30000
    }
  }
  
  // Default configuration based on environment
  if (isDev) {
    return {
      baseUrl: 'http://localhost:5002/api',
      timeout: 30000
    }
  }
  
  // Production configuration - you can update this when deploying
  return {
    baseUrl: 'http://localhost:5002/api', // Update for production
    timeout: 30000
  }
}

export const API_CONFIG = getApiConfig()
export const API_BASE_URL = API_CONFIG.baseUrl

export default API_CONFIG