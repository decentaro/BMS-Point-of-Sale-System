import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

import ErrorBoundary from '@/components/ui/ErrorBoundary'

// Component that throws on command
function Bomb({ shouldThrow = false }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error('test error: component exploded')
  return <div data-testid="child">Safe content</div>
}

describe('ErrorBoundary', () => {
  // setup.ts calls vi.restoreAllMocks() in its beforeEach, so we re-spy here
  // (after restore) to suppress expected React error output and track calls.
  let consoleError: ReturnType<typeof vi.spyOn<typeof console, 'error'>>
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // ── Happy Path ────────────────────────────────────────────────

  describe('Happy Path', () => {
    it('renders children when no error', () => {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={false} />
        </ErrorBoundary>
      )
      expect(screen.getByTestId('child')).toBeTruthy()
      expect(screen.getByText('Safe content')).toBeTruthy()
    })

    it('renders multiple children', () => {
      render(
        <ErrorBoundary>
          <span data-testid="a">A</span>
          <span data-testid="b">B</span>
        </ErrorBoundary>
      )
      expect(screen.getByTestId('a')).toBeTruthy()
      expect(screen.getByTestId('b')).toBeTruthy()
    })
  })

  // ── Error State ───────────────────────────────────────────────

  describe('Error State', () => {
    it('shows default error UI when child throws', () => {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(screen.getByText('Something went wrong')).toBeTruthy()
    })

    it('shows error message in code block', () => {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(screen.getByText(/test error: component exploded/)).toBeTruthy()
    })

    it('shows Reload Page button', () => {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(screen.getByText('Reload Page')).toBeTruthy()
    })

    it('hides children content when error occurs', () => {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(screen.queryByTestId('child')).toBeNull()
    })

    it('uses custom fallback when provided', () => {
      render(
        <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom error UI</div>}>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(screen.getByTestId('custom-fallback')).toBeTruthy()
      expect(screen.queryByText('Something went wrong')).toBeNull()
    })

    it('getDerivedStateFromError sets hasError=true', () => {
      const state = ErrorBoundary.getDerivedStateFromError(new Error('test'))
      expect(state.hasError).toBe(true)
      expect(state.error).toBeInstanceOf(Error)
    })
  })

  // ── Edge Cases ────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('renders empty children without error', () => {
      const { container } = render(<ErrorBoundary />)
      // Should not throw, renders nothing
      expect(container).toBeTruthy()
    })

    it('catches async-like error from child', () => {
      function AsyncThrow() {
        throw new TypeError('type error from child')
      }
      render(
        <ErrorBoundary>
          <AsyncThrow />
        </ErrorBoundary>
      )
      expect(screen.getByText(/type error from child/)).toBeTruthy()
    })

    it('Reload Page button calls window.location.reload', async () => {
      const user = userEvent.setup()
      const reloadMock = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: reloadMock },
        writable: true,
      })

      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      )
      await user.click(screen.getByText('Reload Page'))
      expect(reloadMock).toHaveBeenCalled()
    })

    it('logs error via console.error', () => {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      )
      expect(consoleError).toHaveBeenCalled()
    })
  })
})
