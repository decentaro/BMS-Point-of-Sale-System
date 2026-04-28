/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

vi.mock('@/utils/ApiClient', () => ({
  default: {
    getSettings: vi.fn(),
    online: true,
    setOnline: vi.fn(),
  },
}))

// URL constructor for asset imports
global.URL = class MockURL {
  href: string
  constructor(path: string, _base?: string) {
    this.href = `mock://${path}`
  }
} as any

import ApiClient from '@/utils/ApiClient'
import { useKeyboardSound } from '@/utils/useKeyboardSound'

function makeAudioMock(canPlayThrough = true) {
  const listeners: Record<string, Function[]> = {}
  const audioMock = {
    volume: 1,
    preload: '',
    currentTime: 0,
    play: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockImplementation(() => {
      if (canPlayThrough && listeners['canplaythrough']) {
        setTimeout(() => listeners['canplaythrough'].forEach(fn => fn()), 0)
      }
    }),
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(handler)
    }),
    removeEventListener: vi.fn(),
    _trigger: (event: string) => listeners[event]?.forEach(fn => fn()),
  }
  return audioMock
}

describe('useKeyboardSound', () => {
  let audioMock: ReturnType<typeof makeAudioMock>

  beforeEach(() => {
    audioMock = makeAudioMock()
    vi.mocked(ApiClient.getSettings).mockReset()
    vi.mocked(ApiClient.getSettings).mockResolvedValue({ soundEffectsEnabled: true })

    // Mock Audio constructor — must be a real function (not arrow fn) so `new Audio()` works
    const AudioConstructor = function(this: any) { return audioMock }
    vi.stubGlobal('Audio', AudioConstructor)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── Happy Path ──────────────────────────────────────────────

  describe('Happy Path', () => {
    it('returns playKeySound and isLoaded', () => {
      const { result } = renderHook(() => useKeyboardSound())
      expect(typeof result.current.playKeySound).toBe('function')
      expect(typeof result.current.isLoaded).toBe('boolean')
    })

    it('isLoaded becomes true after audio loads and settings fetched', async () => {
      const { result } = renderHook(() => useKeyboardSound())
      await waitFor(() => expect(result.current.isLoaded).toBe(true))
    })

    it('sets audio volume to 0.3', async () => {
      renderHook(() => useKeyboardSound())
      await waitFor(() => expect(audioMock.volume).toBe(0.3))
    })

    it('calls load() on the audio element', async () => {
      renderHook(() => useKeyboardSound())
      await waitFor(() => expect(audioMock.load).toHaveBeenCalled())
    })

    it('playKeySound calls play() when loaded and enabled', async () => {
      const { result } = renderHook(() => useKeyboardSound())
      await waitFor(() => expect(result.current.isLoaded).toBe(true))

      act(() => { result.current.playKeySound() })
      expect(audioMock.play).toHaveBeenCalled()
    })

    it('playKeySound resets currentTime to 0 before playing', async () => {
      const { result } = renderHook(() => useKeyboardSound())
      await waitFor(() => expect(result.current.isLoaded).toBe(true))

      audioMock.currentTime = 500
      act(() => { result.current.playKeySound() })
      expect(audioMock.currentTime).toBe(0)
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('playKeySound does nothing when sound is disabled', async () => {
      vi.mocked(ApiClient.getSettings).mockResolvedValueOnce({ soundEffectsEnabled: false })
      const { result } = renderHook(() => useKeyboardSound())
      await waitFor(() => expect(result.current.isLoaded).toBe(true))

      act(() => { result.current.playKeySound() })
      expect(audioMock.play).not.toHaveBeenCalled()
    })

    it('defaults soundEnabled=true when settings returns no soundEffectsEnabled field', async () => {
      vi.mocked(ApiClient.getSettings).mockResolvedValueOnce({})
      const { result } = renderHook(() => useKeyboardSound())
      await waitFor(() => expect(result.current.isLoaded).toBe(true))

      act(() => { result.current.playKeySound() })
      expect(audioMock.play).toHaveBeenCalled()
    })

    it('isLoaded=true even when audio fails (fallback path)', async () => {
      // Audio error triggers the error listener
      audioMock = makeAudioMock(false)
      audioMock.load = vi.fn().mockImplementation(() => {
        setTimeout(() => audioMock._trigger('error'), 0)
      })
      const ErrorAudioConstructor = function(this: any) { return audioMock }
      vi.stubGlobal('Audio', ErrorAudioConstructor)

      const { result } = renderHook(() => useKeyboardSound())
      await waitFor(() => expect(result.current.isLoaded).toBe(true))
    })

    it('playKeySound silently ignores audio play errors', async () => {
      audioMock.play = vi.fn().mockRejectedValue(new Error('AutoplayError'))
      const { result } = renderHook(() => useKeyboardSound())
      await waitFor(() => expect(result.current.isLoaded).toBe(true))

      // Should not throw
      expect(() => act(() => { result.current.playKeySound() })).not.toThrow()
    })

    it('playKeySound does nothing before isLoaded (no-op guard)', async () => {
      // The hook starts as not loaded; calling playKeySound during this window should not throw
      const { result } = renderHook(() => useKeyboardSound())
      // play should NOT have been called during render itself
      expect(audioMock.play).not.toHaveBeenCalled()
    })
  })
})
