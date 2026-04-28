import '@testing-library/jest-dom/vitest'

// Mock sessionStorage
const sessionStore: Record<string, string> = {}
const sessionStorageMock: Storage = {
  getItem: (key: string) => sessionStore[key] ?? null,
  setItem: (key: string, value: string) => { sessionStore[key] = value },
  removeItem: (key: string) => { delete sessionStore[key] },
  clear: () => { Object.keys(sessionStore).forEach(k => delete sessionStore[k]) },
  get length() { return Object.keys(sessionStore).length },
  key: (i: number) => Object.keys(sessionStore)[i] ?? null,
}
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true })

// Custom localStorage that supports Object.keys() — matching Chromium/Electron behavior.
// jsdom's built-in Storage doesn't expose keys via Object.keys(), but real browsers do.
function createBrowserLikeStorage(): Storage {
  const store: Record<string, string> = {}
  const handler: ProxyHandler<Storage> = {
    get(_target, prop: string | symbol) {
      if (prop === 'getItem') return (k: string) => store[k] ?? null
      if (prop === 'setItem') return (k: string, v: string) => { store[k] = v }
      if (prop === 'removeItem') return (k: string) => { delete store[k] }
      if (prop === 'clear') return () => { Object.keys(store).forEach(k => delete store[k]) }
      if (prop === 'length') return Object.keys(store).length
      if (prop === 'key') return (i: number) => Object.keys(store)[i] ?? null
      if (typeof prop === 'string' && prop in store) return store[prop]
      return undefined
    },
    ownKeys() { return Object.keys(store) },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === 'string' && prop in store) {
        return { configurable: true, enumerable: true, value: store[prop] }
      }
      return undefined
    },
  }
  return new Proxy({} as Storage, handler)
}
Object.defineProperty(globalThis, 'localStorage', { value: createBrowserLikeStorage(), writable: true })

// Mock crypto.getRandomValues
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
      return arr
    },
  },
  writable: true,
})

// Guard browser-only mocks — setup.ts is shared across jsdom and node environments
if (typeof globalThis.window !== 'undefined') {
  // Mock window.location
  Object.defineProperty(globalThis.window, 'location', {
    value: { href: '', hash: '' },
    writable: true,
  })

  // Mock window.electronAPI
  Object.defineProperty(globalThis.window, 'electronAPI', {
    value: {
      setAuthToken: vi.fn(),
      clearAuthToken: vi.fn(),
    },
    writable: true,
  })
}

// Clear storage between tests
beforeEach(() => {
  sessionStorageMock.clear()
  if (typeof localStorage !== 'undefined') localStorage.clear()
  vi.restoreAllMocks()
  if (typeof window !== 'undefined' && window.location) window.location.href = ''
})
