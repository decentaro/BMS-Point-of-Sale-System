import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

// ModalKeyboard: expose onClose/onSubmit for keyboard interaction tests
let _swKbOnClose: (() => void) | null = null
let _swKbOnSubmit: ((v: string) => void) | null = null
vi.mock('@/components/ModalKeyboard', () => ({
  // SetupWizard uses the named export { ModalKeyboard }
  ModalKeyboard: ({ open, onClose, onSubmit }: any) => {
    _swKbOnClose = open ? onClose : null
    _swKbOnSubmit = open ? onSubmit : null
    return open ? <div data-testid="sw-modal-keyboard" /> : null
  },
  // default export kept as null (not used by SetupWizard)
  default: () => null,
}))

vi.mock('@/utils/ApiClient', () => ({
  default: {
    setTerminalId: vi.fn(),
  },
}))

import SetupWizard from '@/components/SetupWizard'

function makeElectronAPI(overrides: any = {}) {
  return {
    testDbConnection: vi.fn().mockResolvedValue({ reachable: true }),
    saveEnv: vi.fn().mockResolvedValue({ success: true }),
    setTerminalConfig: vi.fn().mockResolvedValue(undefined),
    relaunchApp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

beforeEach(() => {
  ;(window as any).electronAPI = makeElectronAPI()
  _swKbOnClose = null
  _swKbOnSubmit = null
})

async function renderAndWait() {
  let result!: ReturnType<typeof render>
  await act(async () => { result = render(<SetupWizard />) })
  return result
}

describe('SetupWizard', () => {

  // ── Initial step (Instructions) ───────────────────────────────────────────

  describe('Instructions step', () => {
    it('shows "Before you begin" heading', async () => {
      await renderAndWait()
      expect(screen.getByText('Before you begin')).toBeTruthy()
    })

    it('shows "I\'m ready →" button', async () => {
      await renderAndWait()
      expect(screen.getByText("I'm ready →")).toBeTruthy()
    })

    it('shows "Open supabase.com" link', async () => {
      await renderAndWait()
      expect(screen.getByText('Open supabase.com')).toBeTruthy()
    })

    it('shows step labels in sidebar', async () => {
      await renderAndWait()
      expect(screen.getByText('Introduction')).toBeTruthy()
      expect(screen.getByText('Credentials')).toBeTruthy()
      expect(screen.getByText('Connect & Save')).toBeTruthy()
      expect(screen.getByText('Terminal Identity')).toBeTruthy()
      expect(screen.getByText('Done')).toBeTruthy()
    })

    it('shows BMS POS branding', async () => {
      await renderAndWait()
      expect(screen.getByText('BMS POS')).toBeTruthy()
    })

    it('clicking "I\'m ready →" advances to credentials step', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      expect(screen.getByText('Enter your credentials')).toBeTruthy()
    })
  })

  // ── Credentials step ──────────────────────────────────────────────────────

  describe('Credentials step', () => {
    async function goToCredentials() {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
    }

    it('shows "Enter your credentials" heading', async () => {
      await goToCredentials()
      expect(screen.getByText('Enter your credentials')).toBeTruthy()
    })

    it('shows Connection String tab by default', async () => {
      await goToCredentials()
      expect(screen.getByText('Connection String')).toBeTruthy()
    })

    it('shows Manual Entry tab', async () => {
      await goToCredentials()
      expect(screen.getByText('Manual Entry')).toBeTruthy()
    })

    it('shows URI textarea in URI mode', async () => {
      await goToCredentials()
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      expect(textarea).toBeTruthy()
    })

    it('shows "Test Connection →" button', async () => {
      await goToCredentials()
      expect(screen.getByText('Test Connection →')).toBeTruthy()
    })

    it('shows "← Back" button', async () => {
      await goToCredentials()
      expect(screen.getByText('← Back')).toBeTruthy()
    })

    it('← Back returns to instructions step', async () => {
      await goToCredentials()
      await act(async () => { fireEvent.click(screen.getByText('← Back')) })
      expect(screen.getByText('Before you begin')).toBeTruthy()
    })

    it('shows parse error when connection string is empty', async () => {
      await goToCredentials()
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      expect(screen.getByText(/Could not parse the connection string/)).toBeTruthy()
    })

    it('shows parse error for invalid URI', async () => {
      await goToCredentials()
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => { fireEvent.change(textarea, { target: { value: 'not-a-valid-uri' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      expect(screen.getByText(/Could not parse the connection string/)).toBeTruthy()
    })

    it('shows parse error when connection string has no password', async () => {
      await goToCredentials()
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres@host:5432/dbname' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      expect(screen.getByText(/does not include a password/)).toBeTruthy()
    })

    it('switches to manual entry mode', async () => {
      await goToCredentials()
      await act(async () => { fireEvent.click(screen.getByText('Manual Entry')) })
      expect(screen.getByPlaceholderText(/aws-0-region\.pooler\.supabase\.com/)).toBeTruthy()
    })

    it('shows host required error in manual mode with empty host', async () => {
      await goToCredentials()
      await act(async () => { fireEvent.click(screen.getByText('Manual Entry')) })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      expect(screen.getByText('Host is required.')).toBeTruthy()
    })

    it('shows password required error in manual mode with missing password', async () => {
      await goToCredentials()
      await act(async () => { fireEvent.click(screen.getByText('Manual Entry')) })
      const hostInput = screen.getByPlaceholderText(/aws-0-region\.pooler\.supabase\.com/)
      await act(async () => { fireEvent.change(hostInput, { target: { value: 'db.supabase.co' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      expect(screen.getByText('Password is required.')).toBeTruthy()
    })
  })

  // ── Testing / Saving transition ───────────────────────────────────────────

  describe('Testing and Saving', () => {
    async function submitValidUri() {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@aws-0-us.pooler.supabase.com:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
    }

    it('calls electronAPI.testDbConnection with correct args', async () => {
      const api = makeElectronAPI()
      ;(window as any).electronAPI = api
      await submitValidUri()
      await waitFor(() => {
        expect(api.testDbConnection).toHaveBeenCalledWith(
          'aws-0-us.pooler.supabase.com',
          '5432',
          'postgres.ref',
          'MyPass123',
          'postgres'
        )
      })
    })

    it('calls electronAPI.saveEnv after successful connection test', async () => {
      const api = makeElectronAPI()
      ;(window as any).electronAPI = api
      await submitValidUri()
      await waitFor(() => {
        expect(api.saveEnv).toHaveBeenCalledWith(expect.objectContaining({
          dbHost: 'aws-0-us.pooler.supabase.com',
        }))
      })
    })

    it('advances to terminal step after successful save', async () => {
      await submitValidUri()
      await waitFor(() => {
        expect(screen.getByText('Identify this terminal')).toBeTruthy()
      })
    })
  })

  // ── Error step ────────────────────────────────────────────────────────────

  describe('Error step', () => {
    it('shows Connection failed when testDbConnection returns reachable=false', async () => {
      ;(window as any).electronAPI = makeElectronAPI({
        testDbConnection: vi.fn().mockResolvedValue({ reachable: false, error: 'Host unreachable' }),
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@bad-host.supabase.com:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeTruthy()
      })
    })

    it('shows specific error message from API', async () => {
      ;(window as any).electronAPI = makeElectronAPI({
        testDbConnection: vi.fn().mockResolvedValue({ reachable: false, error: 'Host unreachable' }),
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@bad-host.supabase.com:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      await waitFor(() => {
        expect(screen.getByText('Host unreachable')).toBeTruthy()
      })
    })

    it('clicking "← Try Again" returns to credentials step', async () => {
      ;(window as any).electronAPI = makeElectronAPI({
        testDbConnection: vi.fn().mockResolvedValue({ reachable: false, error: 'fail' }),
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@bad.co:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      await waitFor(() => { expect(screen.getByText('Connection failed')).toBeTruthy() })
      await act(async () => { fireEvent.click(screen.getByText('← Try Again')) })
      expect(screen.getByText('Enter your credentials')).toBeTruthy()
    })
  })

  // ── Terminal step ─────────────────────────────────────────────────────────

  describe('Terminal step', () => {
    async function goToTerminal() {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@aws-0-us.pooler.supabase.com:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      await waitFor(() => { expect(screen.getByText('Identify this terminal')).toBeTruthy() })
    }

    it('shows "Identify this terminal" heading', async () => {
      await goToTerminal()
      expect(screen.getByText('Identify this terminal')).toBeTruthy()
    })

    it('shows Terminal ID input', async () => {
      await goToTerminal()
      expect(screen.getByPlaceholderText('e.g. T01')).toBeTruthy()
    })

    it('shows Terminal Name input', async () => {
      await goToTerminal()
      expect(screen.getByPlaceholderText('e.g. Front Counter')).toBeTruthy()
    })

    it('shows "Save & Continue →" button', async () => {
      await goToTerminal()
      expect(screen.getByText('Save & Continue →')).toBeTruthy()
    })

    it('shows error when terminal ID is empty', async () => {
      await goToTerminal()
      await act(async () => { fireEvent.click(screen.getByText('Save & Continue →')) })
      expect(screen.getByText('Terminal ID is required.')).toBeTruthy()
    })

    it('shows error for invalid terminal ID characters', async () => {
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.change(idInput, { target: { value: 'T@01!' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Save & Continue →')) })
      expect(screen.getByText(/Use only letters, numbers/)).toBeTruthy()
    })

    it('calls setTerminalConfig with terminal ID', async () => {
      const api = makeElectronAPI()
      ;(window as any).electronAPI = api
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.change(idInput, { target: { value: 'T01' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Save & Continue →')) })
      await waitFor(() => {
        expect(api.setTerminalConfig).toHaveBeenCalledWith(
          expect.objectContaining({ terminalId: 'T01' })
        )
      })
    })

    it('advances to done step after saving terminal', async () => {
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.change(idInput, { target: { value: 'T01' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Save & Continue →')) })
      await waitFor(() => {
        expect(screen.getByText(/Setup complete/)).toBeTruthy()
      })
    })
  })

  // ── Done step ─────────────────────────────────────────────────────────────

  describe('Done step', () => {
    async function goToDone() {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@aws-0-us.pooler.supabase.com:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      await waitFor(() => { expect(screen.getByText('Identify this terminal')).toBeTruthy() })
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.change(idInput, { target: { value: 'T02' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Save & Continue →')) })
      await waitFor(() => { expect(screen.getByText(/Setup complete/)).toBeTruthy() })
    }

    it('shows "Setup complete" heading', async () => {
      await goToDone()
      expect(screen.getByText(/Setup complete/)).toBeTruthy()
    })

    it('shows credentials saved confirmation', async () => {
      await goToDone()
      expect(screen.getByText('Credentials saved')).toBeTruthy()
    })

    it('shows terminal identity saved confirmation', async () => {
      await goToDone()
      expect(screen.getByText(/Terminal identity saved/)).toBeTruthy()
    })

    it('shows default admin credentials', async () => {
      await goToDone()
      expect(screen.getByText(/Default admin/)).toBeTruthy()
    })

    it('calls relaunchApp', async () => {
      const api = makeElectronAPI()
      ;(window as any).electronAPI = api
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@aws-0-us.pooler.supabase.com:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      await waitFor(() => { expect(screen.getByText('Identify this terminal')).toBeTruthy() })
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.change(idInput, { target: { value: 'T03' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Save & Continue →')) })
      await waitFor(() => {
        expect(api.relaunchApp).toHaveBeenCalledTimes(1)
      })
    })
  })

  // ── Manual mode Paste buttons ─────────────────────────────────────────────

  describe('Manual mode paste buttons', () => {
    async function goToManual() {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      await act(async () => { fireEvent.click(screen.getByText('Manual Entry')) })
    }

    it('Paste button in manual mode reads clipboard and sets host', async () => {
      Object.assign(navigator, {
        clipboard: { readText: vi.fn().mockResolvedValue('db.myhost.com') },
      })
      await goToManual()
      // There is one Paste button per manual field (host, user, password) — click first
      const pasteBtns = screen.getAllByRole('button', { name: 'Paste' })
      await act(async () => { fireEvent.click(pasteBtns[0]) })
      await waitFor(() => {
        const hostInput = screen.getByPlaceholderText(/aws-0-region\.pooler\.supabase\.com/)
        expect((hostInput as HTMLInputElement).value).toBe('db.myhost.com')
      })
    })

    it('Paste button in manual mode handles clipboard error gracefully', async () => {
      Object.assign(navigator, {
        clipboard: { readText: vi.fn().mockRejectedValue(new Error('Denied')) },
      })
      await goToManual()
      const pasteBtns = screen.getAllByRole('button', { name: 'Paste' })
      // Should not throw — error is swallowed by try/catch
      await act(async () => { fireEvent.click(pasteBtns[0]) })
      expect(screen.getByPlaceholderText(/aws-0-region\.pooler\.supabase\.com/)).toBeTruthy()
    })
  })

  // ── Terminal step — terminal name + preview ───────────────────────────────

  describe('Terminal step extended', () => {
    async function goToTerminal() {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@aws-0-us.pooler.supabase.com:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      await waitFor(() => { expect(screen.getByText('Identify this terminal')).toBeTruthy() })
    }

    it('shows session code preview when terminal ID is entered', async () => {
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.change(idInput, { target: { value: 'T01' } }) })
      await waitFor(() => {
        expect(screen.getByText(/Session codes will look like/)).toBeTruthy()
      })
    })

    it('terminal ID input uppercases the value', async () => {
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.change(idInput, { target: { value: 'abc' } }) })
      expect((idInput as HTMLInputElement).value).toBe('ABC')
    })

    it('done step shows terminal name in parentheses when provided', async () => {
      const api = makeElectronAPI()
      ;(window as any).electronAPI = api
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      const nameInput = screen.getByPlaceholderText('e.g. Front Counter')
      await act(async () => { fireEvent.change(idInput, { target: { value: 'T01' } }) })
      await act(async () => { fireEvent.change(nameInput, { target: { value: 'Front Counter' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Save & Continue →')) })
      await waitFor(() => {
        expect(screen.getByText(/Terminal identity saved/)).toBeTruthy()
        expect(screen.getByText(/Front Counter/)).toBeTruthy()
      })
    })

    it('shows error when setTerminalConfig throws', async () => {
      ;(window as any).electronAPI = makeElectronAPI({
        setTerminalConfig: vi.fn().mockRejectedValue(new Error('Config write failed')),
      })
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.change(idInput, { target: { value: 'T01' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Save & Continue →')) })
      await waitFor(() => {
        expect(screen.getByText('Config write failed')).toBeTruthy()
      })
    })

    it('setTerminalConfig not called when electronAPI lacks the method', async () => {
      const api = makeElectronAPI()
      delete (api as any).setTerminalConfig
      ;(window as any).electronAPI = api
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.change(idInput, { target: { value: 'T01' } }) })
      await act(async () => { fireEvent.click(screen.getByText('Save & Continue →')) })
      await waitFor(() => {
        expect(screen.getByText(/Setup complete/)).toBeTruthy()
      })
    })
  })

  // ── Terminal keyboard interactions (lines 409, 428, 534-548) ────────────────

  describe('Terminal keyboard (lines 409 & 428)', () => {
    async function goToTerminal() {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@aws-0-us.pooler.supabase.com:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      await waitFor(() => { expect(screen.getByText('Identify this terminal')).toBeTruthy() })
    }

    it('clicking terminal ID input opens ModalKeyboard (line 409)', async () => {
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.click(idInput) })
      await waitFor(() => expect(screen.getByTestId('sw-modal-keyboard')).toBeTruthy())
    })

    it('clicking terminal name input opens ModalKeyboard (line 428)', async () => {
      await goToTerminal()
      const nameInput = screen.getByPlaceholderText('e.g. Front Counter')
      await act(async () => { fireEvent.click(nameInput) })
      await waitFor(() => expect(screen.getByTestId('sw-modal-keyboard')).toBeTruthy())
    })

    it('ModalKeyboard onClose closes the keyboard (line 548)', async () => {
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.click(idInput) })
      await waitFor(() => expect(screen.getByTestId('sw-modal-keyboard')).toBeTruthy())
      await act(async () => { _swKbOnClose!() })
      await waitFor(() => expect(screen.queryByTestId('sw-modal-keyboard')).toBeNull())
    })

    it('ModalKeyboard onSubmit updates terminal ID (lines 534-548)', async () => {
      await goToTerminal()
      const idInput = screen.getByPlaceholderText('e.g. T01')
      await act(async () => { fireEvent.click(idInput) })
      await waitFor(() => expect(_swKbOnSubmit).toBeTruthy())
      await act(async () => { _swKbOnSubmit!('POS1') })
      // After submitting the keyboard value, the input should reflect the uppercase value
      await waitFor(() => {
        expect((screen.getByPlaceholderText('e.g. T01') as HTMLInputElement).value).toBe('POS1')
      })
    })
  })

  // ── saveEnv failure path ──────────────────────────────────────────────────

  describe('saveEnv failure', () => {
    it('shows Connection failed when saveEnv returns success=false', async () => {
      ;(window as any).electronAPI = makeElectronAPI({
        saveEnv: vi.fn().mockResolvedValue({ success: false, error: 'Disk full' }),
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@aws-0-us.pooler.supabase.com:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeTruthy()
        expect(screen.getByText('Disk full')).toBeTruthy()
      })
    })

    it('shows Connection failed when saveEnv throws', async () => {
      ;(window as any).electronAPI = makeElectronAPI({
        saveEnv: vi.fn().mockRejectedValue(new Error('Write error')),
      })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText("I'm ready →")) })
      const textarea = screen.getByPlaceholderText(/postgresql:\/\//)
      await act(async () => {
        fireEvent.change(textarea, { target: { value: 'postgresql://postgres.ref:MyPass123@aws-0-us.pooler.supabase.com:5432/postgres' } })
      })
      await act(async () => { fireEvent.click(screen.getByText('Test Connection →')) })
      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeTruthy()
        expect(screen.getByText('Write error')).toBeTruthy()
      })
    })
  })
})
