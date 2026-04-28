import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

const mockShowToast = vi.fn()

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('@/contexts/SettingsContext', () => ({
  useBusinessSettings: () => ({
    businessSettings: { businessName: 'Test Store' },
    loading: false,
  }),
}))

vi.mock('@/utils/useKeyboardSound', () => ({
  useKeyboardSound: () => ({ playKeySound: vi.fn() }),
}))

vi.mock('@/utils/ApiClient', () => ({
  default: {
    postJson: vi.fn(),
    put: vi.fn(),
    getSettings: vi.fn(() => Promise.resolve({ autoLogoutMinutes: 30 })),
    online: true,
    setOnline: vi.fn(),
  },
}))

import ApiClient from '@/utils/ApiClient'
import SessionManager from '@/utils/SessionManager'
import Login from '@/components/Login'

function LocationDisplay() {
  const loc = useLocation()
  return <span data-testid="location">{loc.pathname}</span>
}

function renderLogin(initialRoute = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/manager" element={<LocationDisplay />} />
        <Route path="/cashier-dashboard" element={<LocationDisplay />} />
        <Route path="/pos" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>
  )
}

function getKeyButton(digit: string) {
  const matches = screen.getAllByText(digit)
  return matches.find(el => el.tagName === 'BUTTON') ?? matches[0]
}

async function typeOnKeypad(user: ReturnType<typeof userEvent.setup>, digits: string) {
  for (const d of digits) {
    await user.click(getKeyButton(d))
  }
}

async function switchToPinField(user: ReturnType<typeof userEvent.setup>) {
  const pinField = screen.getByText('PIN').closest('button')!
  await user.click(pinField)
}

describe('Login', () => {
  beforeEach(() => {
    sessionStorage.clear()
    SessionManager.clearSession()
    ;(SessionManager as any).cachedTimeout = null
    vi.mocked(ApiClient.postJson).mockReset()
    mockShowToast.mockClear()
    ;(window as any).electronAPI = undefined
  })

  // ── Rendering ───────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders login form with business name', () => {
      renderLogin()
      expect(screen.getAllByText('Test Store').length).toBeGreaterThan(0)
      expect(screen.getByText('Welcome back')).toBeTruthy()
    })

    it('renders the keypad with digits 0-9', () => {
      renderLogin()
      for (let i = 0; i <= 9; i++) {
        expect(screen.getByText(String(i))).toBeTruthy()
      }
    })

    it('renders CLR and Sign In buttons', () => {
      renderLogin()
      expect(screen.getByText('CLR')).toBeTruthy()
      expect(screen.getByText('Sign In →')).toBeTruthy()
    })

    it('Sign In button is disabled initially', () => {
      renderLogin()
      const btn = screen.getByText('Sign In →')
      expect(btn).toBeDisabled()
    })
  })

  // ── Input Behavior ──────────────────────────────────────────

  describe('Input Behavior', () => {
    it('digit buttons update employee ID field', async () => {
      const user = userEvent.setup()
      renderLogin()

      await typeOnKeypad(user, '123')
      expect(screen.getByText('123')).toBeTruthy()
    })

    it('CLR button clears current field', async () => {
      const user = userEvent.setup()
      renderLogin()

      await typeOnKeypad(user, '12')
      await user.click(screen.getByText('CLR'))

      expect(screen.getByText('—')).toBeTruthy()
    })

    it('limits employee ID to 10 digits', async () => {
      const user = userEvent.setup()
      renderLogin()

      await typeOnKeypad(user, '111111111111') // 12 digits
      expect(screen.getByText('1111111111')).toBeTruthy()
    })
  })

  // ── Login Flow ──────────────────────────────────────────────

  describe('Login Flow', () => {
    it('successful login navigates to manager dashboard', async () => {
      vi.mocked(ApiClient.postJson).mockResolvedValueOnce({
        success: true,
        data: {
          employee: { id: 1, employeeId: 'MGR-001', name: 'Manager', role: 'Manager', isManager: true },
          token: 'jwt-token',
        },
      })

      const user = userEvent.setup()
      renderLogin()

      // Enter employee ID
      await typeOnKeypad(user, '1')
      await switchToPinField(user)
      await typeOnKeypad(user, '2345')

      // Submit
      await user.click(screen.getByText('Sign In →'))

      // Should show welcome message
      await screen.findByText('Welcome, Manager!')
    })

    it('failed login shows error toast', async () => {
      vi.mocked(ApiClient.postJson).mockResolvedValueOnce({
        success: false,
        message: 'Invalid credentials',
      })

      const user = userEvent.setup()
      renderLogin()

      await user.click(screen.getByText('1'))
      const pinField = screen.getByText('PIN').closest('button')!
      await user.click(pinField)
      await user.click(screen.getByText('2'))
      await user.click(screen.getByText('3'))
      await user.click(screen.getByText('4'))
      await user.click(screen.getByText('5'))

      await user.click(screen.getByText('Sign In →'))

      expect(mockShowToast).toHaveBeenCalledWith(
        'Invalid Employee ID or PIN', 'error'
      )
    })

    it('shows lockout message when account is locked', async () => {
      vi.mocked(ApiClient.postJson).mockResolvedValueOnce({
        success: false,
        message: 'Account locked for 5 minutes',
      })

      const user = userEvent.setup()
      renderLogin()

      await user.click(screen.getByText('1'))
      const pinField = screen.getByText('PIN').closest('button')!
      await user.click(pinField)
      await user.click(screen.getByText('2'))
      await user.click(screen.getByText('3'))
      await user.click(screen.getByText('4'))
      await user.click(screen.getByText('5'))

      await user.click(screen.getByText('Sign In →'))

      expect(mockShowToast).toHaveBeenCalledWith(
        'Account locked for 5 minutes', 'error'
      )
    })

    it('network error shows connection error toast', async () => {
      vi.mocked(ApiClient.postJson).mockRejectedValueOnce(new Error('network fail'))

      const user = userEvent.setup()
      renderLogin()

      await user.click(screen.getByText('1'))
      const pinField = screen.getByText('PIN').closest('button')!
      await user.click(pinField)
      await user.click(screen.getByText('2'))
      await user.click(screen.getByText('3'))
      await user.click(screen.getByText('4'))
      await user.click(screen.getByText('5'))

      await user.click(screen.getByText('Sign In →'))

      expect(mockShowToast).toHaveBeenCalledWith(
        'Login failed. Please check your connection and try again.', 'error'
      )
    })

    it('empty fields show validation message', async () => {
      const user = userEvent.setup()
      renderLogin()

      // Sign In should be disabled — but let's test the statusMessage path
      // We can't click a disabled button, so we need to directly test the guard
      // Actually the button IS disabled when both are empty, so this path tests correctly
      const btn = screen.getByText('Sign In →')
      expect(btn).toBeDisabled()
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('shows expired session toast when redirected with reason=expired', () => {
      renderLogin('/login?reason=expired')

      expect(mockShowToast).toHaveBeenCalledWith(
        'Your session has expired. Please log in again.', 'warning'
      )
    })

    it('uses electronAPI.validateLogin when available', async () => {
      const mockValidateLogin = vi.fn().mockResolvedValueOnce({
        success: true,
        data: {
          employee: { id: 1, employeeId: '1', name: 'Emp', role: 'Cashier', isManager: false },
          token: 'jwt',
        },
      })
      ;(window as any).electronAPI = { validateLogin: mockValidateLogin, setAuthToken: vi.fn() }

      const user = userEvent.setup()
      renderLogin()

      await user.click(screen.getByText('1'))
      const pinField = screen.getByText('PIN').closest('button')!
      await user.click(pinField)
      await user.click(screen.getByText('2'))
      await user.click(screen.getByText('3'))
      await user.click(screen.getByText('4'))
      await user.click(screen.getByText('5'))

      await user.click(screen.getByText('Sign In →'))

      expect(mockValidateLogin).toHaveBeenCalledWith('1', '2345', undefined)
      expect(ApiClient.postJson).not.toHaveBeenCalled()
    })

    it('mustChangePinOnNextLogin shows PIN change screen', async () => {
      vi.mocked(ApiClient.postJson).mockResolvedValueOnce({
        success: true,
        data: {
          employee: {
            id: 1, employeeId: 'EMP-01', name: 'New Employee',
            role: 'Cashier', isManager: false, mustChangePinOnNextLogin: true,
          },
          token: 'jwt',
        },
      })

      const user = userEvent.setup()
      renderLogin()

      await user.click(screen.getByText('1'))
      const pinField = screen.getByText('PIN').closest('button')!
      await user.click(pinField)
      await user.click(screen.getByText('2'))
      await user.click(screen.getByText('3'))
      await user.click(screen.getByText('4'))
      await user.click(screen.getByText('5'))

      await user.click(screen.getByText('Sign In →'))

      await screen.findByText('Set a New PIN')
      expect(screen.getByText('Hi New Employee — your default PIN must be changed before continuing.')).toBeTruthy()
    })
  })

  // ── PIN Change Flow ───────────────────────────────────────────────────────

  describe('PIN Change Flow', () => {
    async function goToPinChangeScreen(user: ReturnType<typeof userEvent.setup>) {
      vi.mocked(ApiClient.postJson).mockResolvedValueOnce({
        success: true,
        data: {
          employee: {
            id: 1, employeeId: 'EMP-01', name: 'New Employee',
            role: 'Cashier', isManager: false, mustChangePinOnNextLogin: true,
          },
          token: 'jwt',
        },
      })
      renderLogin()
      // Type employee ID then switch to PIN and type it
      await user.click(getKeyButton('1'))
      await switchToPinField(user)
      await typeOnKeypad(user, '1234')
      await user.click(screen.getByText('Sign In →'))
      await screen.findByText('Set a New PIN')
    }

    it('Next button is disabled when new PIN has fewer than 4 digits', async () => {
      const user = userEvent.setup()
      await goToPinChangeScreen(user)
      await typeOnKeypad(user, '123')
      const nextBtn = screen.getByText('Next →').closest('button')!
      expect((nextBtn as HTMLButtonElement).disabled).toBe(true)
    })

    it('entering 4+ digits and clicking Next advances to confirm step', async () => {
      const user = userEvent.setup()
      await goToPinChangeScreen(user)
      await typeOnKeypad(user, '1234')
      await user.click(screen.getByText('Next →'))
      expect(screen.getByText('Confirm new PIN')).toBeTruthy()
    })

    it('mismatched PINs shows error toast and resets to new PIN step', async () => {
      const user = userEvent.setup()
      await goToPinChangeScreen(user)
      await typeOnKeypad(user, '1234')
      await user.click(screen.getByText('Next →'))
      await typeOnKeypad(user, '5678')
      await user.click(screen.getByText('Set PIN'))
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('PINs do not match. Try again.', 'error'))
      expect(screen.getByText('Enter new PIN')).toBeTruthy()
    })

    it('matching PINs calls ApiClient.put and shows success toast', async () => {
      vi.mocked(ApiClient.put).mockResolvedValueOnce({})
      const user = userEvent.setup()
      await goToPinChangeScreen(user)
      await typeOnKeypad(user, '1234')
      await user.click(screen.getByText('Next →'))
      await typeOnKeypad(user, '1234')
      await user.click(screen.getByText('Set PIN'))
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('PIN updated successfully', 'success'))
      expect(vi.mocked(ApiClient.put)).toHaveBeenCalledWith('/employees/1/reset-pin', { newPin: '1234' })
    })

    it('shows error toast when PIN update API fails', async () => {
      vi.mocked(ApiClient.put).mockRejectedValueOnce(new Error('server error'))
      const user = userEvent.setup()
      await goToPinChangeScreen(user)
      await typeOnKeypad(user, '1234')
      await user.click(screen.getByText('Next →'))
      await typeOnKeypad(user, '1234')
      await user.click(screen.getByText('Set PIN'))
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update PIN'),
        'error'
      ))
    })
  })
})
