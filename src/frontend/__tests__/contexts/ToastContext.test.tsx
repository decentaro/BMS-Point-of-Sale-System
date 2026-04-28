import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

import { ToastProvider, useToast } from '@/contexts/ToastContext'

// Consumer component that exposes toast API
function ToastConsumer() {
  const { toasts, showToast, dismissToast } = useToast()
  return (
    <div>
      <button data-testid="show-success" onClick={() => showToast('Success msg', 'success')}>show success</button>
      <button data-testid="show-error" onClick={() => showToast('Error msg', 'error')}>show error</button>
      <button data-testid="show-warning" onClick={() => showToast('Warning msg', 'warning')}>show warning</button>
      <button data-testid="show-info" onClick={() => showToast('Info msg', 'info')}>show info</button>
      <button data-testid="show-default" onClick={() => showToast('Default msg')}>show default</button>
      <button data-testid="show-no-dismiss" onClick={() => showToast('Persistent msg', 'info', 0)}>show no-dismiss</button>
      <button data-testid="show-short" onClick={() => showToast('Short msg', 'info', 100)}>show short</button>
      {toasts.map(t => (
        <div key={t.id} data-testid="toast" data-type={t.type}>
          <span>{t.message}</span>
          <button data-testid={`dismiss-${t.id}`} onClick={() => dismissToast(t.id)}>×</button>
        </div>
      ))}
    </div>
  )
}

function renderToastConsumer() {
  return render(
    <ToastProvider>
      <ToastConsumer />
    </ToastProvider>
  )
}

describe('ToastContext', () => {
  // ── Happy Path ──────────────────────────────────────────────

  describe('Happy Path', () => {
    it('starts with no toasts', () => {
      renderToastConsumer()
      expect(screen.queryAllByTestId('toast').length).toBe(0)
    })

    it('showToast adds a toast', async () => {
      const user = userEvent.setup()
      renderToastConsumer()
      await user.click(screen.getByTestId('show-success'))
      expect(screen.getAllByTestId('toast').length).toBe(1)
      expect(screen.getByText('Success msg')).toBeTruthy()
    })

    it('toast has correct type attribute', async () => {
      const user = userEvent.setup()
      renderToastConsumer()
      await user.click(screen.getByTestId('show-error'))
      const toast = screen.getByTestId('toast')
      expect(toast.getAttribute('data-type')).toBe('error')
    })

    it('dismissToast removes a toast', async () => {
      const user = userEvent.setup()
      renderToastConsumer()
      await user.click(screen.getByTestId('show-success'))
      expect(screen.getAllByTestId('toast').length).toBe(1)

      const dismissBtn = screen.getByText('×')
      await user.click(dismissBtn)
      expect(screen.queryAllByTestId('toast').length).toBe(0)
    })

    it('auto-dismiss after duration using fake timers', () => {
      vi.useFakeTimers()
      try {
        renderToastConsumer()
        act(() => {
          // Directly call showToast by triggering the internal state
          screen.getByTestId('show-short').click()
        })
        expect(screen.getAllByTestId('toast').length).toBe(1)

        act(() => { vi.advanceTimersByTime(200) })
        expect(screen.queryAllByTestId('toast').length).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    })

    it('multiple toasts can coexist', async () => {
      const user = userEvent.setup()
      renderToastConsumer()
      await user.click(screen.getByTestId('show-success'))
      await user.click(screen.getByTestId('show-error'))
      await user.click(screen.getByTestId('show-warning'))
      expect(screen.getAllByTestId('toast').length).toBe(3)
    })

    it('all toast types render correctly', async () => {
      const user = userEvent.setup()
      renderToastConsumer()
      await user.click(screen.getByTestId('show-success'))
      await user.click(screen.getByTestId('show-error'))
      await user.click(screen.getByTestId('show-warning'))
      await user.click(screen.getByTestId('show-info'))
      const types = screen.getAllByTestId('toast').map(t => t.getAttribute('data-type'))
      expect(types).toContain('success')
      expect(types).toContain('error')
      expect(types).toContain('warning')
      expect(types).toContain('info')
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('default type is success', async () => {
      const user = userEvent.setup()
      renderToastConsumer()
      await user.click(screen.getByTestId('show-default'))
      const toast = screen.getByTestId('toast')
      expect(toast.getAttribute('data-type')).toBe('success')
    })

    it('duration=0 prevents auto-dismiss', () => {
      vi.useFakeTimers()
      try {
        renderToastConsumer()
        act(() => { screen.getByTestId('show-no-dismiss').click() })
        act(() => { vi.advanceTimersByTime(10000) })
        expect(screen.getAllByTestId('toast').length).toBe(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('dismissing one of multiple toasts only removes that one', async () => {
      const user = userEvent.setup()
      renderToastConsumer()
      await user.click(screen.getByTestId('show-success'))
      await user.click(screen.getByTestId('show-error'))
      expect(screen.getAllByTestId('toast').length).toBe(2)

      const dismissBtns = screen.getAllByText('×')
      await user.click(dismissBtns[0])
      expect(screen.getAllByTestId('toast').length).toBe(1)
    })

    it('each toast has a unique id', async () => {
      const user = userEvent.setup()
      renderToastConsumer()
      await user.click(screen.getByTestId('show-success'))
      await user.click(screen.getByTestId('show-error'))

      const toasts = screen.getAllByTestId('toast')
      const ids = toasts.map(t => t.querySelector('[data-testid^="dismiss-"]')?.getAttribute('data-testid'))
      expect(new Set(ids).size).toBe(2)
    })
  })

  // ── Error Cases ─────────────────────────────────────────────

  describe('Error Cases', () => {
    it('useToast throws when used outside ToastProvider', () => {
      function BadConsumer() {
        useToast()
        return null
      }
      expect(() => render(<BadConsumer />)).toThrow('useToast must be used within ToastProvider')
    })
  })
})
