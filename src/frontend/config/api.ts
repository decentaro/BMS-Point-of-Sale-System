/// <reference types="vite/client" />

interface ApiConfig {
  baseUrl: string
  timeout?: number
}

const getApiConfig = (): ApiConfig => {
  // Vite exposes env vars via import.meta.env — process.env does not exist in the renderer
  const envApiUrl = import.meta.env.VITE_API_BASE_URL as string | undefined

  if (envApiUrl) {
    return { baseUrl: envApiUrl, timeout: 30000 }
  }

  // Default — .NET API always runs on localhost regardless of dev/prod
  return { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 }
}

export const API_CONFIG = getApiConfig()
export const API_BASE_URL = API_CONFIG.baseUrl

export default API_CONFIG
