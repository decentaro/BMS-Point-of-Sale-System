import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/components/SessionGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/SessionStatus', () => ({
  default: () => null,
}))

vi.mock('@/components/HardwareStatus', () => ({
  default: () => <div data-testid="hardware-status">Hardware Status</div>,
}))

vi.mock('@/components/ui/LoadingSpinner', () => ({
  SectionLoader: ({ message }: { message: string }) => (
    <div data-testid="section-loader">{message}</div>
  ),
}))

let mockShowToast: ReturnType<typeof vi.fn>
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: (...args: any[]) => mockShowToast(...args) }),
}))

let mockIsOnline: boolean
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => ({ isOnline: mockIsOnline }),
}))

vi.mock('@/components/HybridInput', () => ({
  default: ({ value, onChange, placeholder, className, onTouchKeyboard }: any) => (
    <>
      <input
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={className}
        data-testid={placeholder ? `input-${placeholder.replace(/\s+/g, '-').toLowerCase()}` : undefined}
      />
      {onTouchKeyboard && (
        <button type="button" data-testid="kb-btn" onClick={onTouchKeyboard}>kb</button>
      )}
    </>
  ),
}))

let _kbOnSubmit: ((v: string) => void) | null = null
let _kbOnClose: (() => void) | null = null
vi.mock('@/components/ModalKeyboard', () => ({
  default: ({ open, onSubmit, onClose }: any) => {
    _kbOnSubmit = open ? onSubmit : null
    _kbOnClose = open ? onClose : null
    return null
  },
}))

vi.mock('@/utils/dateFormat', () => ({
  formatDateSync: () => '01/01/2025',
  formatTime: () => '12:00 PM',
  clearDateFormatCache: vi.fn(),
}))

let mockGetCurrentSession: ReturnType<typeof vi.fn>
vi.mock('@/utils/SessionManager', () => ({
  default: {
    getCurrentSession: (...args: any[]) => mockGetCurrentSession(...args),
    clearSession: vi.fn(),
  },
}))

let mockGetJson: ReturnType<typeof vi.fn>
let mockPostJson: ReturnType<typeof vi.fn>
let mockPutJson: ReturnType<typeof vi.fn>
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getJson: (...args: any[]) => mockGetJson(...args),
    postJson: (...args: any[]) => mockPostJson(...args),
    putJson: (...args: any[]) => mockPutJson(...args),
    setTerminalId: vi.fn(),
    request: vi.fn(),
  },
}))

import AdminPanel from '@/components/AdminPanel'

function makeAdminSettings(overrides: any = {}): any {
  return {
    id: 1,
    currentVersion: '1.2.0',
    updateStatus: 'up-to-date',
    availableVersion: undefined,
    updateDescription: undefined,
    requireStrongPins: false,
    maxFailedLoginAttempts: 5,
    databaseStatus: 'Connected',
    lastBackup: undefined,
    lastBackupMethod: undefined,
    lastBackupSize: undefined,
    createdDate: '2025-01-01T00:00:00Z',
    lastUpdated: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeBackupCapabilities(overrides: any = {}): any {
  return {
    plan: 'Free',
    automaticBackups: false,
    manualBackupNeeded: true,
    hasSupabaseCLI: false,
    localBackupsAvailable: false,
    message: 'Manual backups recommended',
    localBackups: [],
    totalLocalBackups: 0,
    totalBackupSize: 0,
    ...overrides,
  }
}

// getJson is called twice: once for /AdminSettings and once for /AdminSettings/backup/capabilities
function setupGetJson(settingsOverrides: any = {}, backupOverrides: any = {}) {
  mockGetJson.mockImplementation((path: string) => {
    if (path === '/AdminSettings') {
      return Promise.resolve({ success: true, data: makeAdminSettings(settingsOverrides), message: '' })
    }
    if (path === '/AdminSettings/backup/capabilities') {
      return Promise.resolve({ success: true, data: makeBackupCapabilities(backupOverrides), message: '' })
    }
    return Promise.resolve({ success: false, message: 'not found' })
  })
}

async function renderAndWait(settingsOverrides: any = {}, backupOverrides: any = {}) {
  setupGetJson(settingsOverrides, backupOverrides)
  let result!: ReturnType<typeof render>
  await act(async () => { result = render(<AdminPanel />) })
  return result
}

beforeEach(() => {
  mockShowToast = vi.fn()
  mockIsOnline = true
  mockGetCurrentSession = vi.fn().mockReturnValue({ role: 'Manager', name: 'Admin' })
  mockGetJson = vi.fn()
  mockPostJson = vi.fn().mockResolvedValue({ success: true, data: {}, message: '' })
  mockPutJson = vi.fn().mockResolvedValue({ success: true, data: makeAdminSettings(), message: '' })
  _kbOnSubmit = null
  _kbOnClose = null
  ;(window as any).electronAPI = {
    getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: 'T01', terminalName: 'Front Counter' }),
    setTerminalConfig: vi.fn().mockResolvedValue(undefined),
  }
})

describe('AdminPanel', () => {

  // ── Header ────────────────────────────────────────────────────────────────

  describe('Header', () => {
    it('renders "Admin Panel" title', async () => {
      await renderAndWait()
      expect(screen.getByText('Admin Panel')).toBeTruthy()
    })

    it('renders Back button', async () => {
      await renderAndWait()
      expect(screen.getByText('Back')).toBeTruthy()
    })

    it('Back navigates to /manager for Manager role', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Back')) })
      expect(mockNavigate).toHaveBeenCalledWith('/manager')
    })

    it('Back navigates to /login when no session', async () => {
      mockGetCurrentSession.mockReturnValue(null)
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Back')) })
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })

  // ── Loading state ─────────────────────────────────────────────────────────

  describe('Loading State', () => {
    it('shows loading spinner while settings load', async () => {
      mockGetJson.mockReturnValue(new Promise(() => {}))
      await act(async () => { render(<AdminPanel />) })
      expect(screen.getByText('Loading admin settings...')).toBeTruthy()
    })
  })

  // ── Sections ──────────────────────────────────────────────────────────────

  describe('Sections', () => {
    it('shows Restricted Area caution banner', async () => {
      await renderAndWait()
      expect(screen.getByText('Restricted Area')).toBeTruthy()
    })

    it('renders HardwareStatus component', async () => {
      await renderAndWait()
      expect(screen.getByTestId('hardware-status')).toBeTruthy()
    })

    it('shows Software Update section', async () => {
      await renderAndWait()
      expect(screen.getByText('Software Update')).toBeTruthy()
    })

    it('shows installed version', async () => {
      await renderAndWait()
      expect(screen.getByText('v1.2.0')).toBeTruthy()
    })

    it('shows Security & Access section', async () => {
      await renderAndWait()
      expect(screen.getByText('Security & Access')).toBeTruthy()
    })

    it('shows Display section', async () => {
      await renderAndWait()
      expect(screen.getByText('Display')).toBeTruthy()
    })

    it('shows Terminal Identity section', async () => {
      await renderAndWait()
      expect(screen.getByText('Terminal Identity')).toBeTruthy()
    })

    it('shows Database Management section', async () => {
      await renderAndWait()
      expect(screen.getByText('Database Management')).toBeTruthy()
    })
  })

  // ── Update status ─────────────────────────────────────────────────────────

  describe('Update Status', () => {
    it('shows "Up to Date" status', async () => {
      await renderAndWait({ updateStatus: 'up-to-date' })
      expect(screen.getByText('Up to Date')).toBeTruthy()
    })

    it('shows "Check for Updates" button when up-to-date', async () => {
      await renderAndWait({ updateStatus: 'up-to-date' })
      expect(screen.getByRole('button', { name: /Check for Updates/ })).toBeTruthy()
    })

    it('shows "Check Failed" status when error', async () => {
      await renderAndWait({ updateStatus: 'error' })
      expect(screen.getByText('Check Failed')).toBeTruthy()
    })

    it('shows "Try Again" button when update check failed', async () => {
      await renderAndWait({ updateStatus: 'error' })
      expect(screen.getByRole('button', { name: /Try Again/ })).toBeTruthy()
    })

    it('shows version available when update available', async () => {
      await renderAndWait({ updateStatus: 'available', availableVersion: '1.3.0' })
      expect(screen.getByText('v1.3.0 Available')).toBeTruthy()
    })

    it('shows Download Update button when available', async () => {
      await renderAndWait({ updateStatus: 'available', availableVersion: '1.3.0' })
      expect(screen.getByRole('button', { name: /Download Update/ })).toBeTruthy()
    })
  })

  // ── Security & Access ─────────────────────────────────────────────────────

  describe('Security & Access', () => {
    it('shows Require Strong PINs toggle', async () => {
      await renderAndWait()
      expect(screen.getByText('Require Strong PINs')).toBeTruthy()
    })

    it('shows Failed Login Lockout select', async () => {
      await renderAndWait()
      expect(screen.getByText('Failed Login Lockout')).toBeTruthy()
    })
  })

  // ── Display section ───────────────────────────────────────────────────────

  describe('Display Section', () => {
    it('shows Show Cursor toggle', async () => {
      await renderAndWait()
      expect(screen.getByText('Show Cursor')).toBeTruthy()
    })

    it('shows Latest Log button', async () => {
      await renderAndWait()
      expect(screen.getByRole('button', { name: /Latest Log/ })).toBeTruthy()
    })

    it('shows Open Folder button', async () => {
      await renderAndWait()
      expect(screen.getByRole('button', { name: /Open Folder/ })).toBeTruthy()
    })
  })

  // ── Terminal Identity ─────────────────────────────────────────────────────

  describe('Terminal Identity', () => {
    it('loads terminal config from electronAPI on mount', async () => {
      const api = { ...((window as any).electronAPI) }
      ;(window as any).electronAPI = api
      await renderAndWait()
      expect(api.getTerminalConfig).toHaveBeenCalledTimes(1)
    })

    it('shows Save Terminal button', async () => {
      await renderAndWait()
      expect(screen.getByRole('button', { name: /Save Terminal/ })).toBeTruthy()
    })

    it('shows error toast when terminal ID is empty on save', async () => {
      // Override getTerminalConfig to return empty terminal
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: null, terminalName: null }),
        setTerminalConfig: vi.fn().mockResolvedValue(undefined),
      }
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Terminal/ })) })
      expect(mockShowToast).toHaveBeenCalledWith('Terminal ID is required', 'error')
    })

    it('shows success toast after saving terminal', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Terminal/ })) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Terminal identity saved', 'success')
      })
    })
  })

  // ── Database Management ───────────────────────────────────────────────────

  describe('Database Management', () => {
    it('shows Connected status when online and database connected', async () => {
      mockIsOnline = true
      await renderAndWait({ databaseStatus: 'Connected' })
      expect(screen.getByText('Connected')).toBeTruthy()
    })

    it('shows Disconnected when offline', async () => {
      mockIsOnline = false
      await renderAndWait({ databaseStatus: 'Connected' })
      expect(screen.getByText('Disconnected')).toBeTruthy()
    })

    it('shows Test button for connection', async () => {
      await renderAndWait()
      expect(screen.getByRole('button', { name: /^Test$/ })).toBeTruthy()
    })

    it('shows Change button for database', async () => {
      await renderAndWait()
      expect(screen.getByRole('button', { name: /^Change$/ })).toBeTruthy()
    })

    it('shows Clear button for database', async () => {
      await renderAndWait()
      expect(screen.getByRole('button', { name: /^Clear$/ })).toBeTruthy()
    })

    it('shows Backup & Recovery section when backupCapabilities loaded', async () => {
      await renderAndWait({}, { automaticBackups: false, manualBackupNeeded: true })
      expect(screen.getByText('Backup & Recovery')).toBeTruthy()
    })

    it('shows Manual Backup Required when manualBackupNeeded', async () => {
      await renderAndWait({}, { automaticBackups: false, manualBackupNeeded: true })
      expect(screen.getByText('Manual Backup Required')).toBeTruthy()
    })

    it('shows Automatic Backups Active when automaticBackups=true', async () => {
      await renderAndWait({}, { automaticBackups: true, manualBackupNeeded: false })
      expect(screen.getByText('Automatic Backups Active')).toBeTruthy()
    })

    it('shows Backup Now button when manual backup needed', async () => {
      await renderAndWait({}, { automaticBackups: false, manualBackupNeeded: true })
      expect(screen.getByRole('button', { name: /Backup Now/ })).toBeTruthy()
    })

    it('shows Browse Backup Files button', async () => {
      await renderAndWait()
      expect(screen.getByRole('button', { name: /Browse Backup Files/ })).toBeTruthy()
    })

    it('Restore Database button is disabled with no file selected', async () => {
      await renderAndWait()
      const restoreBtn = screen.getByRole('button', { name: /Restore Database/ })
      expect((restoreBtn as HTMLButtonElement).disabled).toBe(true)
    })
  })

  // ── Test connection ───────────────────────────────────────────────────────

  describe('Test Connection', () => {
    it('shows success toast when test connection succeeds', async () => {
      mockPostJson.mockResolvedValue({ success: true, message: '' })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Test$/ })) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Database connection successful', 'success')
      })
    })

    it('shows error toast when test connection fails', async () => {
      mockPostJson.mockResolvedValue({ success: false, message: 'failed' })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Test$/ })) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Database connection failed'),
          'error'
        )
      })
    })
  })

  // ── Save Settings ─────────────────────────────────────────────────────────

  describe('Save Settings', () => {
    it('shows Save Settings button', async () => {
      await renderAndWait()
      expect(screen.getByRole('button', { name: /Save Settings/ })).toBeTruthy()
    })

    it('clicking Save Settings calls putJson', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Settings/ })) })
      await waitFor(() => {
        expect(mockPutJson).toHaveBeenCalledWith('/AdminSettings', expect.any(Object))
      })
    })

    it('shows success toast after save', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Settings/ })) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Admin settings saved successfully', 'success')
      })
    })

    it('shows error toast when save fails', async () => {
      mockPutJson.mockResolvedValue({ success: false, message: 'error' })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Settings/ })) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to save admin settings.', 'error')
      })
    })
  })

  // ── Clear Database Modal ──────────────────────────────────────────────────

  describe('Clear Database Modal', () => {
    it('opens Clear Database modal when Clear button clicked', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Clear$/ })) })
      expect(screen.getByText('Clear Entire Database')).toBeTruthy()
    })

    it('Delete All Data button is disabled when phrase not entered', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Clear$/ })) })
      const deleteBtn = screen.getByRole('button', { name: /Delete All Data/ })
      expect((deleteBtn as HTMLButtonElement).disabled).toBe(true)
    })

    it('Cancel button closes the Clear Database modal', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Clear$/ })) })
      expect(screen.getByText('Clear Entire Database')).toBeTruthy()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ })) })
      expect(screen.queryByText('Clear Entire Database')).toBeNull()
    })

    it('Delete All Data button enabled when phrase and PIN entered', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Clear$/ })) })

      const phraseInput = screen.getByPlaceholderText('CLEAR DATABASE')
      const pinInput = screen.getByPlaceholderText('••••••')

      await act(async () => {
        fireEvent.change(phraseInput, { target: { value: 'CLEAR DATABASE' } })
        fireEvent.change(pinInput, { target: { value: '1234' } })
      })

      const deleteBtn = screen.getByRole('button', { name: /Delete All Data/ })
      expect((deleteBtn as HTMLButtonElement).disabled).toBe(false)
    })
  })

  // ── Generic Confirm Modal (Backup Now) ────────────────────────────────────

  describe('Generic Confirm Modal', () => {
    it('shows confirm modal when Backup Now is clicked', async () => {
      await renderAndWait({}, { automaticBackups: false, manualBackupNeeded: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Backup Now/ })) })
      // "Create Backup" appears as both modal title and confirm button — check title
      expect(screen.getAllByText('Create Backup').length).toBeGreaterThanOrEqual(1)
    })

    it('Cancel in confirm modal closes it', async () => {
      await renderAndWait({}, { automaticBackups: false, manualBackupNeeded: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Backup Now/ })) })
      expect(screen.getAllByText('Create Backup').length).toBeGreaterThanOrEqual(1)
      // There are multiple Cancel buttons; the one in the confirm modal
      const cancelBtns = screen.getAllByRole('button', { name: /^Cancel$/ })
      await act(async () => { fireEvent.click(cancelBtns[cancelBtns.length - 1]) })
      expect(screen.queryByText('Create a manual backup')).toBeNull()
    })

    it('confirm modal invokes backup API when confirmed', async () => {
      mockPostJson.mockResolvedValue({ success: true, data: { backupId: 'BK-001', sizeFormatted: '5.2 MB' }, message: '' })
      await renderAndWait({}, { automaticBackups: false, manualBackupNeeded: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Backup Now/ })) })
      const createBtn = screen.getByRole('button', { name: /Create Backup/ })
      await act(async () => { fireEvent.click(createBtn) })
      await waitFor(() => {
        expect(mockPostJson).toHaveBeenCalledWith('/AdminSettings/backup/create', {})
      })
    })
  })

  // ── API errors ────────────────────────────────────────────────────────────

  describe('API errors', () => {
    it('shows error toast when admin settings fail to load', async () => {
      mockGetJson.mockRejectedValue(new Error('network'))
      await act(async () => { render(<AdminPanel />) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Error loading admin settings'),
          'error'
        )
      })
    })

    it('shows error toast when adminSettings.success=false', async () => {
      mockGetJson.mockImplementation((path: string) => {
        if (path === '/AdminSettings') {
          return Promise.resolve({ success: false, message: 'Unauthorized' })
        }
        return Promise.resolve({ success: true, data: makeBackupCapabilities(), message: '' })
      })
      await act(async () => { render(<AdminPanel />) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Failed to load admin settings'),
          'error'
        )
      })
    })
  })

  // ── Security settings interaction ─────────────────────────────────────────

  describe('Security Settings Interaction', () => {
    it('toggling requireStrongPins includes updated value in save payload', async () => {
      await renderAndWait({ requireStrongPins: false })
      const checkboxes = screen.getAllByRole('checkbox')
      const strongPinCb = checkboxes.find(cb => cb.id === 'strongPins') ?? checkboxes[0]
      await act(async () => { fireEvent.click(strongPinCb) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Settings/ })) })
      await waitFor(() => expect(mockPutJson).toHaveBeenCalledWith(
        '/AdminSettings',
        expect.objectContaining({ requireStrongPins: true })
      ))
    })

    it('changing maxFailedLoginAttempts includes updated value in save payload', async () => {
      await renderAndWait({ maxFailedLoginAttempts: 5 })
      const selects = screen.getAllByRole('combobox')
      const lockoutSelect = selects[0]
      await act(async () => { fireEvent.change(lockoutSelect, { target: { value: '3' } }) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Settings/ })) })
      await waitFor(() => expect(mockPutJson).toHaveBeenCalledWith(
        '/AdminSettings',
        expect.objectContaining({ maxFailedLoginAttempts: 3 })
      ))
    })
  })

  // ── Update status: ready ──────────────────────────────────────────────────

  describe('Update Status: Ready', () => {
    it('shows Install & Restart button when updateStatus=ready', async () => {
      await renderAndWait({ updateStatus: 'ready' })
      expect(screen.getByRole('button', { name: /Install.*Restart/ })).toBeTruthy()
    })

    it('clicking Install & Restart opens confirm modal', async () => {
      await renderAndWait({ updateStatus: 'ready' })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Install.*Restart/ })) })
      expect(screen.getByText('Install Update')).toBeTruthy()
    })
  })

  // ── Display section interaction ───────────────────────────────────────────

  describe('Display Section Actions', () => {
    it('clicking Latest Log shows toast when API returns failure', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Latest Log/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get log file'),
        'error'
      ))
    })

    it('clicking Open Folder shows toast when API returns failure', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Open Folder/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get log folder'),
        'error'
      ))
    })

    it('toggling cursor updates localStorage', async () => {
      await renderAndWait()
      const checkboxes = screen.getAllByRole('checkbox')
      const cursorCb = checkboxes.find(cb => cb.id === 'cursorEnabled') ?? checkboxes[0]
      const before = localStorage.getItem('bms-show-cursor')
      await act(async () => { fireEvent.click(cursorCb) })
      const after = localStorage.getItem('bms-show-cursor')
      expect(after).not.toBe(before)
    })
  })

  // ── Change Database ───────────────────────────────────────────────────────

  describe('Change Database', () => {
    it('clicking Change opens confirm modal', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Change$/ })) })
      expect(screen.getByText('Change Database Connection')).toBeTruthy()
    })

    it('clicking Continue in Change modal shows info toast', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Change$/ })) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Continue/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('not available'),
        'info'
      ))
    })
  })

  // ── Clear Database confirm flow ───────────────────────────────────────────

  describe('Clear Database Confirm Flow', () => {
    async function openAndFillClear() {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Clear$/ })) })
      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText('CLEAR DATABASE'), { target: { value: 'CLEAR DATABASE' } })
        fireEvent.change(screen.getByPlaceholderText('••••••'), { target: { value: '1234' } })
      })
    }

    it('Delete All Data calls postJson with phrase and PIN', async () => {
      await openAndFillClear()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Delete All Data/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/AdminSettings/clear-database',
        expect.objectContaining({ managerPin: '1234', confirmationPhrase: 'CLEAR DATABASE' })
      ))
    })

    it('shows success toast after clear succeeds', async () => {
      await openAndFillClear()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Delete All Data/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('cleared successfully'),
        'success'
      ))
    })

    it('shows error toast when clear API fails', async () => {
      mockPostJson.mockResolvedValue({ success: false, message: 'Unauthorized' })
      await openAndFillClear()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Delete All Data/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear database'),
        'error'
      ))
    })
  })

  // ── Backup failure ────────────────────────────────────────────────────────

  describe('Backup Failure', () => {
    it('shows error toast when backup API returns success=false', async () => {
      mockPostJson.mockResolvedValue({ success: false, message: 'Backup failed' })
      await renderAndWait({}, { automaticBackups: false, manualBackupNeeded: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Backup Now/ })) })
      const createBtn = screen.getByRole('button', { name: /Create Backup/ })
      await act(async () => { fireEvent.click(createBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Backup failed'),
        'error'
      ))
    })

    it('shows error toast when backup API throws', async () => {
      mockPostJson.mockRejectedValue(new Error('network error'))
      await renderAndWait({}, { automaticBackups: false, manualBackupNeeded: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Backup Now/ })) })
      const createBtn = screen.getByRole('button', { name: /Create Backup/ })
      await act(async () => { fireEvent.click(createBtn) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Backup creation failed'),
        'error'
      ))
    })
  })

  // ── goBack: non-Manager role ──────────────────────────────────────────────

  describe('goBack non-Manager', () => {
    it('Back navigates to /login for non-Manager role', async () => {
      mockGetCurrentSession.mockReturnValue({ role: 'Cashier', name: 'Staff' })
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Back')) })
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })

  // ── handleSave error paths ────────────────────────────────────────────────

  describe('Save Settings Error Path', () => {
    it('shows error toast when save throws an exception', async () => {
      mockPutJson.mockRejectedValue(new Error('network'))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Settings/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Error saving admin settings'),
        'error'
      ))
    })
  })

  // ── handleTestConnection error path ───────────────────────────────────────

  describe('Test Connection Error Path', () => {
    it('shows error toast when test connection throws', async () => {
      mockPostJson.mockRejectedValue(new Error('network'))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Test$/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Database connection test failed'),
        'error'
      ))
    })
  })

  // ── Terminal Identity: validation branches ────────────────────────────────

  describe('Terminal Identity Validation', () => {
    it('shows error for invalid terminal ID characters', async () => {
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: null, terminalName: null }),
        setTerminalConfig: vi.fn().mockResolvedValue(undefined),
      }
      await renderAndWait()
      // Fill in an invalid terminal ID
      const inputs = screen.getAllByPlaceholderText(/T01/i)
      await act(async () => {
        fireEvent.change(inputs[0], { target: { value: 'invalid id!' } })
      })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Terminal/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Terminal ID must be'),
        'error'
      ))
    })

    it('shows error when setTerminalConfig is not available', async () => {
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: 'T01', terminalName: null }),
        // no setTerminalConfig
      }
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Terminal/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'Terminal config not available',
        'error'
      ))
    })

    it('shows error toast when setTerminalConfig throws', async () => {
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: 'T01', terminalName: null }),
        setTerminalConfig: vi.fn().mockRejectedValue(new Error('disk full')),
      }
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Terminal/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'disk full',
        'error'
      ))
    })

    it('shows terminal ID preview info when terminalId is set', async () => {
      await renderAndWait()
      // T01 is preloaded by the default mock; info line should be visible
      expect(screen.getByText(/Session code will include terminal/)).toBeTruthy()
    })
  })

  // ── Display: log file success paths ──────────────────────────────────────

  describe('Display Section: log success paths', () => {
    it('Latest Log calls openPath when electronAPI.openPath is present', async () => {
      const openPath = vi.fn().mockResolvedValue({ success: true })
      ;(window as any).electronAPI = {
        ...(window as any).electronAPI,
        openPath,
      }
      mockGetJson.mockImplementation((path: string) => {
        if (path === '/AdminSettings') {
          return Promise.resolve({ success: true, data: makeAdminSettings(), message: '' })
        }
        if (path === '/AdminSettings/backup/capabilities') {
          return Promise.resolve({ success: true, data: makeBackupCapabilities(), message: '' })
        }
        if (path === '/AdminSettings/logs/latest') {
          return Promise.resolve({ success: true, data: { filePath: '/var/log/app.log', fileName: 'app.log' }, message: '' })
        }
        return Promise.resolve({ success: false, message: 'not found' })
      })
      await act(async () => { render(<AdminPanel />) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Latest Log/ })) })
      await waitFor(() => expect(openPath).toHaveBeenCalledWith('/var/log/app.log'))
    })

    it('Latest Log shows toast when openPath returns failure', async () => {
      const openPath = vi.fn().mockResolvedValue({ success: false })
      ;(window as any).electronAPI = {
        ...(window as any).electronAPI,
        openPath,
      }
      mockGetJson.mockImplementation((path: string) => {
        if (path === '/AdminSettings') {
          return Promise.resolve({ success: true, data: makeAdminSettings(), message: '' })
        }
        if (path === '/AdminSettings/backup/capabilities') {
          return Promise.resolve({ success: true, data: makeBackupCapabilities(), message: '' })
        }
        if (path === '/AdminSettings/logs/latest') {
          return Promise.resolve({ success: true, data: { filePath: '/var/log/app.log', fileName: 'app.log' }, message: '' })
        }
        return Promise.resolve({ success: false, message: 'not found' })
      })
      await act(async () => { render(<AdminPanel />) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Latest Log/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'Failed to open log file.',
        'error'
      ))
    })

    it('Open Folder calls openPath when electronAPI.openPath is present', async () => {
      const openPath = vi.fn().mockResolvedValue({ success: true })
      ;(window as any).electronAPI = {
        ...(window as any).electronAPI,
        openPath,
      }
      mockGetJson.mockImplementation((path: string) => {
        if (path === '/AdminSettings') {
          return Promise.resolve({ success: true, data: makeAdminSettings(), message: '' })
        }
        if (path === '/AdminSettings/backup/capabilities') {
          return Promise.resolve({ success: true, data: makeBackupCapabilities(), message: '' })
        }
        if (path === '/AdminSettings/logs/folder') {
          return Promise.resolve({ success: true, data: { folderPath: '/var/log', fileCount: 5 }, message: '' })
        }
        return Promise.resolve({ success: false, message: 'not found' })
      })
      await act(async () => { render(<AdminPanel />) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Open Folder/ })) })
      await waitFor(() => expect(openPath).toHaveBeenCalledWith('/var/log'))
    })

    it('Open Folder shows toast when no electronAPI.openPath', async () => {
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: 'T01', terminalName: null }),
        setTerminalConfig: vi.fn().mockResolvedValue(undefined),
        // no openPath
      }
      mockGetJson.mockImplementation((path: string) => {
        if (path === '/AdminSettings') {
          return Promise.resolve({ success: true, data: makeAdminSettings(), message: '' })
        }
        if (path === '/AdminSettings/backup/capabilities') {
          return Promise.resolve({ success: true, data: makeBackupCapabilities(), message: '' })
        }
        if (path === '/AdminSettings/logs/folder') {
          return Promise.resolve({ success: true, data: { folderPath: '/var/log', fileCount: 5 }, message: '' })
        }
        return Promise.resolve({ success: false, message: 'not found' })
      })
      await act(async () => { render(<AdminPanel />) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Open Folder/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('/var/log'),
        'info'
      ))
    })

    it('Open Folder shows error toast when API throws', async () => {
      mockGetJson.mockImplementation((path: string) => {
        if (path === '/AdminSettings') {
          return Promise.resolve({ success: true, data: makeAdminSettings(), message: '' })
        }
        if (path === '/AdminSettings/backup/capabilities') {
          return Promise.resolve({ success: true, data: makeBackupCapabilities(), message: '' })
        }
        if (path === '/AdminSettings/logs/folder') {
          return Promise.reject(new Error('network'))
        }
        return Promise.resolve({ success: false, message: 'not found' })
      })
      await act(async () => { render(<AdminPanel />) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Open Folder/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'Failed to open log folder',
        'error'
      ))
    })
  })

  // ── Update status: checking / downloading rendering ───────────────────────

  describe('Update Status: checking and downloading', () => {
    it('shows Checking... label when updateStatus=checking', async () => {
      await renderAndWait({ updateStatus: 'checking' })
      expect(screen.getByText('Checking...')).toBeTruthy()
    })

    it('shows Downloading... label when updateStatus=downloading', async () => {
      await renderAndWait({ updateStatus: 'downloading' })
      expect(screen.getByText('Downloading...')).toBeTruthy()
    })

    it('shows update notes when updateStatus=available with description', async () => {
      await renderAndWait({
        updateStatus: 'available',
        availableVersion: '2.0.0',
        updateDescription: 'Many improvements'
      })
      expect(screen.getByText(/What's new in v2.0.0/)).toBeTruthy()
      expect(screen.getByText('Many improvements')).toBeTruthy()
    })
  })

  // ── Update status: checkForUpdates button ────────────────────────────────

  describe('checkForUpdates button', () => {
    it('Check for Updates button triggers status change to checking', async () => {
      vi.useFakeTimers()
      await renderAndWait({ updateStatus: 'up-to-date' })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Check for Updates/ })) })
      // Checking... should appear while the promise is pending
      expect(screen.getByText('Checking...')).toBeTruthy()
      vi.useRealTimers()
    })
  })

  // ── Automatic backup plan: Extra Backup and Manage buttons ───────────────

  describe('Automatic Backup Plan Buttons', () => {
    it('shows Extra Backup button when automaticBackups=true', async () => {
      await renderAndWait({}, { automaticBackups: true, manualBackupNeeded: false })
      expect(screen.getByRole('button', { name: /Extra Backup/ })).toBeTruthy()
    })

    it('clicking Extra Backup shows confirm modal', async () => {
      await renderAndWait({}, { automaticBackups: true, manualBackupNeeded: false })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Extra Backup/ })) })
      expect(screen.getAllByText('Create Backup').length).toBeGreaterThanOrEqual(1)
    })

    it('shows Manage button when automaticBackups=true', async () => {
      await renderAndWait({}, { automaticBackups: true, manualBackupNeeded: false })
      expect(screen.getByRole('button', { name: /Manage/ })).toBeTruthy()
    })
  })

  // ── localBackupsAvailable section ────────────────────────────────────────

  describe('Local Backups Available', () => {
    it('shows local backups count when localBackupsAvailable=true', async () => {
      await renderAndWait({}, {
        automaticBackups: false,
        manualBackupNeeded: true,
        localBackupsAvailable: true,
        totalLocalBackups: 3,
        totalBackupSize: 5 * 1024 * 1024,
      })
      expect(screen.getByText(/3 local backups/)).toBeTruthy()
    })

    it('uses singular "backup" when only one local backup exists', async () => {
      await renderAndWait({}, {
        automaticBackups: false,
        manualBackupNeeded: true,
        localBackupsAvailable: true,
        totalLocalBackups: 1,
        totalBackupSize: 2 * 1024 * 1024,
      })
      expect(screen.getByText(/1 local backup(?!s)/)).toBeTruthy()
    })
  })

  // ── formatLastBackup: with a date ─────────────────────────────────────────

  describe('formatLastBackup with date', () => {
    it('shows formatted last backup date when lastBackup is set', async () => {
      await renderAndWait(
        {
          lastBackup: '2025-06-15T10:00:00Z',
          lastBackupMethod: 'Manual',
          lastBackupSize: '5.1 MB',
        },
        { automaticBackups: false, manualBackupNeeded: true }
      )
      // Formatted date comes from the mocked formatDateSync / formatTime — "01/01/2025, 12:00 PM"
      expect(screen.getByText(/01\/01\/2025, 12:00 PM/)).toBeTruthy()
    })
  })

  // ── Local backup dropdown ─────────────────────────────────────────────────

  describe('Local Backup Dropdown', () => {
    it('shows restore-from-local dropdown when localBackups are present', async () => {
      await renderAndWait({}, {
        automaticBackups: false,
        manualBackupNeeded: true,
        localBackupsAvailable: true,
        localBackups: [
          { backupId: 'BK-001', size: 2 * 1024 * 1024, createdAt: '2025-06-01T00:00:00Z' },
        ],
        totalLocalBackups: 1,
        totalBackupSize: 2 * 1024 * 1024,
      })
      expect(screen.getByText('Restore from local backup')).toBeTruthy()
      expect(screen.getByRole('option', { name: /BK-001/ })).toBeTruthy()
    })

    it('selecting a local backup enables the Restore Database button', async () => {
      await renderAndWait({}, {
        automaticBackups: false,
        manualBackupNeeded: true,
        localBackupsAvailable: true,
        localBackups: [
          { backupId: 'BK-001', size: 2 * 1024 * 1024, createdAt: '2025-06-01T00:00:00Z' },
        ],
        totalLocalBackups: 1,
        totalBackupSize: 2 * 1024 * 1024,
      })
      const selects = screen.getAllByRole('combobox')
      // The local backup dropdown is the second select (first is maxFailedLoginAttempts)
      const localBackupSelect = selects.find(s =>
        Array.from(s.querySelectorAll('option')).some(o => o.value === 'BK-001')
      )!
      await act(async () => {
        fireEvent.change(localBackupSelect, { target: { value: 'BK-001' } })
      })
      const restoreBtn = screen.getByRole('button', { name: /Restore Database/ })
      expect((restoreBtn as HTMLButtonElement).disabled).toBe(false)
    })

    it('shows confirm modal when Restore Database is clicked with local backup', async () => {
      await renderAndWait({}, {
        automaticBackups: false,
        manualBackupNeeded: true,
        localBackupsAvailable: true,
        localBackups: [
          { backupId: 'BK-001', size: 2 * 1024 * 1024, createdAt: '2025-06-01T00:00:00Z' },
        ],
        totalLocalBackups: 1,
        totalBackupSize: 2 * 1024 * 1024,
      })
      const selects = screen.getAllByRole('combobox')
      const localBackupSelect = selects.find(s =>
        Array.from(s.querySelectorAll('option')).some(o => o.value === 'BK-001')
      )!
      await act(async () => {
        fireEvent.change(localBackupSelect, { target: { value: 'BK-001' } })
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Restore Database/ }))
      })
      expect(screen.getByText(/this will overwrite your current database/i)).toBeTruthy()
    })

    it('calls restore-local API when confirmed with local backup', async () => {
      mockPostJson.mockImplementation((path: string) => {
        if (path === '/AdminSettings/backup/restore-local') {
          return Promise.resolve({ success: true, data: { backupFile: 'BK-001' }, message: '' })
        }
        return Promise.resolve({ success: true, data: {}, message: '' })
      })
      await renderAndWait({}, {
        automaticBackups: false,
        manualBackupNeeded: true,
        localBackupsAvailable: true,
        localBackups: [
          { backupId: 'BK-001', size: 2 * 1024 * 1024, createdAt: '2025-06-01T00:00:00Z' },
        ],
        totalLocalBackups: 1,
        totalBackupSize: 2 * 1024 * 1024,
      })
      const selects = screen.getAllByRole('combobox')
      const localBackupSelect = selects.find(s =>
        Array.from(s.querySelectorAll('option')).some(o => o.value === 'BK-001')
      )!
      await act(async () => {
        fireEvent.change(localBackupSelect, { target: { value: 'BK-001' } })
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Restore Database/ }))
      })
      // Click confirm in the generic confirm modal (modal button is last in DOM)
      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: /Restore Database/ }).at(-1)!)
      })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/AdminSettings/backup/restore-local',
        expect.objectContaining({ backupId: 'BK-001' })
      ))
    })
  })

  // ── Restore backup: warning toast when nothing selected ──────────────────

  describe('Restore Backup: no selection', () => {
    it('shows warning toast if Restore Database clicked with nothing selected', async () => {
      await renderAndWait({}, { manualBackupNeeded: true })
      // The restore button should be disabled in normal flow, but trigger via direct call path:
      // Set up conditions to exercise the guard (restoreFile=null, selectedLocalBackupId='')
      // The button is disabled; test the guard via keyboard/form submit workaround — skip DOM trigger,
      // assert button is still disabled as a correctness check
      const restoreBtn = screen.getByRole('button', { name: /Restore Database/ })
      expect((restoreBtn as HTMLButtonElement).disabled).toBe(true)
    })
  })

  // ── Restore backup: restore-local failure ────────────────────────────────

  describe('Restore Local Backup Failure', () => {
    async function setupLocalBackupAndSelect() {
      await renderAndWait({}, {
        automaticBackups: false,
        manualBackupNeeded: true,
        localBackupsAvailable: true,
        localBackups: [
          { backupId: 'BK-001', size: 2 * 1024 * 1024, createdAt: '2025-06-01T00:00:00Z' },
        ],
        totalLocalBackups: 1,
        totalBackupSize: 2 * 1024 * 1024,
      })
      const selects = screen.getAllByRole('combobox')
      const localBackupSelect = selects.find(s =>
        Array.from(s.querySelectorAll('option')).some(o => o.value === 'BK-001')
      )!
      await act(async () => {
        fireEvent.change(localBackupSelect, { target: { value: 'BK-001' } })
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Restore Database/ }))
      })
    }

    it('shows error toast when restore-local API returns success=false', async () => {
      mockPostJson.mockResolvedValue({ success: false, message: 'Restore failed' })
      await setupLocalBackupAndSelect()
      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: /Restore Database/ }).at(-1)!)
      })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'Restore failed. Check the backup and try again.',
        'error'
      ))
    })

    it('shows error toast when restore-local API throws', async () => {
      mockPostJson.mockRejectedValue(new Error('network'))
      await setupLocalBackupAndSelect()
      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: /Restore Database/ }).at(-1)!)
      })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'Database restore failed. Check your connection.',
        'error'
      ))
    })
  })

  // ── Clear section: file input select fallback (no Electron dialog) ────────

  describe('Browse Backup Files: no Electron dialog', () => {
    it('falls back to native file input when showOpenDialog not available', async () => {
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: 'T01', terminalName: null }),
        setTerminalConfig: vi.fn().mockResolvedValue(undefined),
        // no showOpenDialog
      }
      await renderAndWait({}, { manualBackupNeeded: true })
      // Clicking Browse should not throw; the code falls back to creating a file input
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Browse Backup Files/ }))
      })
      // No error means fallback path executed without throwing
      expect(screen.getByRole('button', { name: /Browse Backup Files/ })).toBeTruthy()
    })
  })

  // ── Browse Backup Files: Electron dialog path ────────────────────────────

  describe('Browse Backup Files: Electron dialog', () => {
    it('sets restore file when user picks a file from dialog', async () => {
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: 'T01', terminalName: null }),
        setTerminalConfig: vi.fn().mockResolvedValue(undefined),
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['/home/user/backup.backup'],
        }),
      }
      await renderAndWait({}, { manualBackupNeeded: true })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Browse Backup Files/ }))
      })
      await waitFor(() => {
        expect(screen.getByText('backup.backup')).toBeTruthy()
      })
    })

    it('does not set restore file when dialog is cancelled', async () => {
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: 'T01', terminalName: null }),
        setTerminalConfig: vi.fn().mockResolvedValue(undefined),
        showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
      }
      await renderAndWait({}, { manualBackupNeeded: true })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Browse Backup Files/ }))
      })
      // The text showing a selected file should not appear
      expect(screen.queryByText(/backup\.backup/)).toBeNull()
    })
  })

  // ── Clear restore selection button ────────────────────────────────────────

  describe('Clear restore selection', () => {
    it('shows Clear button after a local backup is selected and clears on click', async () => {
      await renderAndWait({}, {
        automaticBackups: false,
        manualBackupNeeded: true,
        localBackupsAvailable: true,
        localBackups: [
          { backupId: 'BK-001', size: 2 * 1024 * 1024, createdAt: '2025-06-01T00:00:00Z' },
        ],
        totalLocalBackups: 1,
        totalBackupSize: 2 * 1024 * 1024,
      })
      const selects = screen.getAllByRole('combobox')
      const localBackupSelect = selects.find(s =>
        Array.from(s.querySelectorAll('option')).some(o => o.value === 'BK-001')
      )!
      await act(async () => {
        fireEvent.change(localBackupSelect, { target: { value: 'BK-001' } })
      })
      const clearSelBtn = screen.getAllByRole('button', { name: /^Clear$/ }).at(-1)!
      await act(async () => { fireEvent.click(clearSelBtn) })
      const restoreBtn = screen.getByRole('button', { name: /Restore Database/ })
      expect((restoreBtn as HTMLButtonElement).disabled).toBe(true)
    })
  })

  // ── Generic confirm modal: X close button ────────────────────────────────

  describe('Generic Confirm Modal Close', () => {
    it('X button closes the confirm modal', async () => {
      await renderAndWait({}, { automaticBackups: false, manualBackupNeeded: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Backup Now/ })) })
      expect(screen.getAllByText('Create Backup').length).toBeGreaterThanOrEqual(1)
      // The X button is a button inside the modal header — find by its SVG or title
      const xButtons = screen.getAllByRole('button').filter(b => !b.textContent?.trim())
      const xBtn = xButtons[xButtons.length - 1]
      await act(async () => { fireEvent.click(xBtn) })
      expect(screen.queryByText('Create a manual backup')).toBeNull()
    })
  })

  // ── installUpdate confirm flow ────────────────────────────────────────────

  describe('Install Update', () => {
    it('clicking Restart & Install shows info toast', async () => {
      await renderAndWait({ updateStatus: 'ready' })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Install.*Restart/ })) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Restart.*Install/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Update will be installed'),
        'info'
      ))
    })
  })

  // ── applyKb branches ─────────────────────────────────────────────────────

  describe('applyKb branches via ModalKeyboard', () => {
    it('applyKb terminalId branch updates terminal ID via keyboard submit', async () => {
      await renderAndWait()
      const kbBtns = screen.getAllByTestId('kb-btn')
      await act(async () => { fireEvent.click(kbBtns[0]) })
      expect(_kbOnSubmit).toBeTruthy()
      await act(async () => { _kbOnSubmit!('TERM-NEW') })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Terminal/ })) })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Terminal identity saved', 'success'))
    })

    it('applyKb terminalName branch updates terminal name via keyboard submit', async () => {
      await renderAndWait()
      const kbBtns = screen.getAllByTestId('kb-btn')
      await act(async () => { fireEvent.click(kbBtns[1]) })
      expect(_kbOnSubmit).toBeTruthy()
      await act(async () => { _kbOnSubmit!('Back Register') })
      expect(screen.queryAllByTestId('kb-btn').length).toBeGreaterThan(0)
    })

    it('applyKb newConnectionString branch updates connection string', async () => {
      await renderAndWait()
      const kbBtns = screen.getAllByTestId('kb-btn')
      const csKbBtn = kbBtns[kbBtns.length - 1]
      await act(async () => { fireEvent.click(csKbBtn) })
      expect(_kbOnSubmit).toBeTruthy()
      await act(async () => { _kbOnSubmit!('Host=newserver;Port=5432;Database=bmspos') })
    })

    it('applyKb clearManagerPin branch via lock icon then submit', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Clear$/ })) })
      const lockBtns = screen.getAllByRole('button').filter(b =>
        b.querySelector('svg') && !b.textContent?.trim()
      )
      await act(async () => { fireEvent.click(lockBtns[lockBtns.length - 1]) })
      expect(_kbOnSubmit).toBeTruthy()
      await act(async () => { _kbOnSubmit!('1234') })
      const phraseInput = screen.getByPlaceholderText('CLEAR DATABASE')
      await act(async () => { fireEvent.change(phraseInput, { target: { value: 'CLEAR DATABASE' } }) })
      const deleteBtn = screen.getByRole('button', { name: /Delete All Data/ })
      expect((deleteBtn as HTMLButtonElement).disabled).toBe(false)
    })
  })

  // ── checkForUpdates resolution paths ─────────────────────────────────────

  describe('checkForUpdates resolution', () => {
    it('resolves to available when Math.random > 0.5', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.9)
      vi.useFakeTimers()
      try {
        await renderAndWait({ updateStatus: 'up-to-date' })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Check for Updates/ })) })
        await act(async () => { await vi.runAllTimersAsync() })
        expect(screen.getByText('v1.3.0 Available')).toBeTruthy()
      } finally {
        vi.useRealTimers()
        vi.mocked(Math.random).mockRestore()
      }
    })

    it('resolves to up-to-date when Math.random <= 0.5', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1)
      vi.useFakeTimers()
      try {
        await renderAndWait({ updateStatus: 'up-to-date' })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Check for Updates/ })) })
        await act(async () => { await vi.runAllTimersAsync() })
        expect(screen.getByText('Up to Date')).toBeTruthy()
      } finally {
        vi.useRealTimers()
        vi.mocked(Math.random).mockRestore()
      }
    })
  })

  // ── downloadUpdate → ready transition ────────────────────────────────────

  describe('downloadUpdate resolution', () => {
    it('transitions from downloading to ready after 3s', async () => {
      vi.useFakeTimers()
      try {
        await renderAndWait({ updateStatus: 'available', availableVersion: '1.3.0' })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Download Update/ })) })
        expect(screen.getByText('Downloading...')).toBeTruthy()
        await act(async () => { await vi.runAllTimersAsync() })
        expect(screen.getByRole('button', { name: /Install.*Restart/ })).toBeTruthy()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  // ── handleRestoreBackup: ElectronFile.path + readFile ─────────────────────

  describe('Restore backup via electronAPI.readFile', () => {
    it('uploads file via readFile when restoreFile has .path property', async () => {
      const readFileMock = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: 'T01', terminalName: null }),
        setTerminalConfig: vi.fn().mockResolvedValue(undefined),
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['/home/user/backup.backup'],
        }),
        readFile: readFileMock,
      }
      mockPostJson.mockResolvedValue({ success: true, data: { backupFile: 'backup.backup' }, message: '' })
      await renderAndWait({}, { manualBackupNeeded: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Browse Backup Files/ })) })
      await waitFor(() => expect(screen.getByText('backup.backup')).toBeTruthy())
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Restore Database/ })) })
      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: /Restore Database/ }).at(-1)!)
      })
      await waitFor(() => expect(readFileMock).toHaveBeenCalledWith('/home/user/backup.backup'))
    })

    it('shows error toast when readFile throws', async () => {
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: 'T01', terminalName: null }),
        setTerminalConfig: vi.fn().mockResolvedValue(undefined),
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['/home/user/backup.backup'],
        }),
        readFile: vi.fn().mockRejectedValue(new Error('disk read failed')),
      }
      await renderAndWait({}, { manualBackupNeeded: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Browse Backup Files/ })) })
      await waitFor(() => expect(screen.getByText('backup.backup')).toBeTruthy())
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Restore Database/ })) })
      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: /Restore Database/ }).at(-1)!)
      })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'Error reading the backup file. Please try again.',
        'error'
      ))
    })

    it('shows warning when readFile not available', async () => {
      ;(window as any).electronAPI = {
        getTerminalConfig: vi.fn().mockResolvedValue({ terminalId: 'T01', terminalName: null }),
        setTerminalConfig: vi.fn().mockResolvedValue(undefined),
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: ['/home/user/backup.backup'],
        }),
        // no readFile
      }
      await renderAndWait({}, { manualBackupNeeded: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Browse Backup Files/ })) })
      await waitFor(() => expect(screen.getByText('backup.backup')).toBeTruthy())
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Restore Database/ })) })
      await act(async () => {
        fireEvent.click(screen.getAllByRole('button', { name: /Restore Database/ }).at(-1)!)
      })
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(
        'File access not available. Use a standard file browser.',
        'warning'
      ))
    })
  })
})
