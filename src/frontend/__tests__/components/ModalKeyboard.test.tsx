import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

vi.mock('@/utils/useKeyboardSound', () => ({
  useKeyboardSound: () => ({ playKeySound: vi.fn(), isLoaded: true }),
}))

vi.mock('@/utils/ApiClient', () => ({
  default: { getSettings: vi.fn(() => Promise.resolve({})), online: true, setOnline: vi.fn() },
}))

import ModalKeyboard from '@/components/ModalKeyboard'

const defaultProps = {
  open: true,
  type: 'decimal' as const,
  onSubmit: vi.fn(),
  onClose: vi.fn(),
}

function renderKb(overrides: Partial<typeof defaultProps> = {}) {
  return render(<ModalKeyboard {...defaultProps} {...overrides} />)
}

describe('ModalKeyboard', () => {
  beforeEach(() => {
    vi.mocked(defaultProps.onSubmit).mockClear()
    vi.mocked(defaultProps.onClose).mockClear()
  })

  // ── Rendering ────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders nothing when open=false', () => {
      const { container } = renderKb({ open: false })
      expect(container.querySelector('input')).toBeNull()
    })

    it('renders input field when open=true', () => {
      renderKb()
      expect(screen.getByRole('textbox')).toBeTruthy()
    })

    it('shows custom title', () => {
      renderKb({ title: 'Enter PIN' })
      expect(screen.getByText('Enter PIN')).toBeTruthy()
    })

    it('shows default title for decimal type', () => {
      renderKb({ type: 'decimal', title: undefined })
      expect(screen.getByText('Enter amount')).toBeTruthy()
    })

    it('shows default title for numeric type', () => {
      renderKb({ type: 'numeric', title: undefined })
      expect(screen.getByText('Enter number')).toBeTruthy()
    })

    it('shows default title for qwerty type', () => {
      renderKb({ type: 'qwerty', title: undefined })
      expect(screen.getByText('Enter text')).toBeTruthy()
    })

    it('pre-fills input with initialValue', () => {
      renderKb({ initialValue: '42.50' })
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('42.50')
    })

    it('masked mode shows bullet dots not actual chars', () => {
      renderKb({ masked: true, initialValue: '1234', type: 'qwerty' })
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('••••')
    })

    it('masked input is readOnly', () => {
      renderKb({ masked: true, type: 'qwerty' })
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.readOnly).toBe(true)
    })
  })

  // ── Decimal Keyboard ─────────────────────────────────────────

  describe('Decimal keyboard', () => {
    it('digit buttons 0-9 append to value', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'decimal', initialValue: '' })
      await user.click(screen.getByText('5'))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('5')
    })

    it('decimal point button appends .', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'decimal', initialValue: '10' })
      await user.click(screen.getByText('.'))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('10.')
    })

    it('backspace button removes last character', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'decimal', initialValue: '42' })
      await user.click(screen.getByText('⌫'))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('4')
    })

    it('backspace on empty does nothing', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'decimal', initialValue: '' })
      await user.click(screen.getByText('⌫'))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('')
    })

    it('Done button calls onSubmit with current value', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'decimal', initialValue: '15.50' })
      await user.click(screen.getByText('Done'))
      expect(defaultProps.onSubmit).toHaveBeenCalledWith('15.50')
    })

    it('Cancel button calls onClose', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'decimal' })
      await user.click(screen.getByText('Cancel'))
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('renders grid with digits 1-9, decimal, 0, backspace', () => {
      renderKb({ type: 'decimal' })
      for (let i = 1; i <= 9; i++) expect(screen.getByText(String(i))).toBeTruthy()
      expect(screen.getByText('0')).toBeTruthy()
      expect(screen.getByText('.')).toBeTruthy()
    })
  })

  // ── QWERTY Keyboard ──────────────────────────────────────────

  describe('QWERTY keyboard', () => {
    it('renders letter keys', () => {
      renderKb({ type: 'qwerty' })
      // Letters shown in lowercase by default
      expect(screen.getByText('q')).toBeTruthy()
      expect(screen.getByText('a')).toBeTruthy()
      expect(screen.getByText('z')).toBeTruthy()
    })

    it('letter key appends lowercase char', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'qwerty', initialValue: '' })
      await user.click(screen.getByText('h'))
      await user.click(screen.getByText('i'))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('hi')
    })

    it('space key appends space', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'qwerty', initialValue: 'hello' })
      const spaceBtns = screen.getAllByText('space')
      await user.click(spaceBtns[0])
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('hello ')
    })

    it('return button calls onSubmit', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'qwerty', initialValue: 'test' })
      await user.click(screen.getByText('return'))
      expect(defaultProps.onSubmit).toHaveBeenCalledWith('test')
    })

    it('shift: off → shifted makes letters uppercase', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'qwerty' })
      // Click shift (⇧ icon)
      await user.click(screen.getByText('⇧'))
      // After shift, letters should be uppercase
      expect(screen.getByText('Q')).toBeTruthy()
    })

    it('shift one-shot: reverts to lowercase after typing one char', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'qwerty', initialValue: '' })
      await user.click(screen.getByText('⇧')) // shifted
      await user.click(screen.getByText('H')) // type H
      // Shift should now be off, showing lowercase
      expect(screen.getByText('q')).toBeTruthy()
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('H')
    })

    it('double-tap shift enters caps lock', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'qwerty' })
      await user.click(screen.getByText('⇧')) // shifted
      await user.click(screen.getByText('⬆')) // double-tap → caps lock
      // Should show caps lock icon
      expect(screen.getByText('⇪')).toBeTruthy()
    })

    it('caps lock: letters stay uppercase after multiple chars', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'qwerty', initialValue: '' })
      await user.click(screen.getByText('⇧'))
      await user.click(screen.getByText('⬆')) // caps lock on
      await user.click(screen.getByText('H'))
      await user.click(screen.getByText('I'))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('HI')
    })

    it('123 button switches to numeric mode', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'qwerty' })
      await user.click(screen.getByText('123'))
      // Numeric mode shows ABC button
      expect(screen.getAllByText('ABC').length).toBeGreaterThan(0)
    })

    it('close × button calls onClose', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'qwerty' })
      await user.click(screen.getByText('×'))
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('backdrop click calls onClose', async () => {
      const user = userEvent.setup()
      const { container } = renderKb({ type: 'qwerty' })
      const backdrop = container.querySelector('.bg-black\\/30') as HTMLElement
      await user.click(backdrop)
      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })

  // ── Numeric keyboard ─────────────────────────────────────────

  describe('Numeric keyboard (qwerty-numeric switch)', () => {
    it('ABC button switches back to qwerty', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'numeric' })
      const abcBtns = screen.getAllByText('ABC')
      await user.click(abcBtns[0])
      expect(screen.getByText('q')).toBeTruthy()
    })

    it('delete key removes last char', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'numeric', initialValue: 'abc' })
      await user.click(screen.getByText('delete'))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('ab')
    })

    it('#+= button toggles symbol mode', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'numeric' })
      // First #+= button toggles symbol mode
      const symBtns = screen.getAllByText('#+=')
      await user.click(symBtns[0])
      expect(screen.getAllByText('123').length).toBeGreaterThan(0)
    })
  })

  // ── Physical keyboard support ─────────────────────────────────

  describe('Physical keyboard', () => {
    it('Escape key calls onClose', () => {
      renderKb({ type: 'qwerty' })
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('Enter key calls onSubmit with current value', () => {
      renderKb({ type: 'qwerty', initialValue: 'hello' })
      fireEvent.keyDown(window, { key: 'Enter' })
      expect(defaultProps.onSubmit).toHaveBeenCalledWith('hello')
    })

    it('masked mode: physical key appends char to value', () => {
      renderKb({ type: 'qwerty', masked: true, initialValue: '' })
      fireEvent.keyDown(window, { key: 'a' })
      const input = screen.getByRole('textbox') as HTMLInputElement
      // Masked: shows bullet
      expect(input.value).toBe('•')
    })

    it('masked mode: Backspace removes last char', () => {
      renderKb({ type: 'qwerty', masked: true, initialValue: 'abc' })
      fireEvent.keyDown(window, { key: 'Backspace' })
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('••') // 2 bullets for 'ab'
    })

    it('physical keys ignored when open=false', () => {
      renderKb({ open: false, type: 'qwerty' })
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(defaultProps.onClose).not.toHaveBeenCalled()
    })
  })

  // ── Edge Cases ────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('resets value when re-opened with new initialValue', () => {
      const { rerender } = renderKb({ open: false, initialValue: 'old' })
      rerender(<ModalKeyboard {...defaultProps} open={true} initialValue='new' />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('new')
    })

    it('onSubmit called with empty string if no input', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'decimal', initialValue: '' })
      await user.click(screen.getByText('Done'))
      expect(defaultProps.onSubmit).toHaveBeenCalledWith('')
    })

    it('multiple digits build up correctly', async () => {
      const user = userEvent.setup()
      renderKb({ type: 'decimal', initialValue: '' })
      await user.click(screen.getByText('1'))
      await user.click(screen.getByText('2'))
      await user.click(screen.getByText('3'))
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('123')
    })
  })
})
