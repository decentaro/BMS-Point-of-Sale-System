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

vi.mock('@/components/ui/LoadingSpinner', () => ({
  SectionLoader: ({ message }: { message: string }) => (
    <div data-testid="section-loader">{message}</div>
  ),
}))

let mockShowToast: ReturnType<typeof vi.fn>
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: (...args: any[]) => mockShowToast(...args) }),
}))

let mockRefreshBusinessSettings: ReturnType<typeof vi.fn>
vi.mock('@/contexts/SettingsContext', () => ({
  useBusinessSettings: () => ({ refreshBusinessSettings: (...args: any[]) => mockRefreshBusinessSettings(...args) }),
}))

vi.mock('@/components/HybridInput', () => ({
  default: ({ value, onChange, placeholder, className, onTouchKeyboard }: any) => (
    <input
      data-testid={`hybrid-${placeholder?.replace(/\s+/g, '-').toLowerCase() ?? 'input'}`}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      onClick={() => onTouchKeyboard?.()}
      placeholder={placeholder}
      className={className}
    />
  ),
}))

let _kbOnSubmit: ((val: string) => void) | null = null
let _kbInitialValue: string | null = null
let _kbOpen: boolean = false
vi.mock('@/components/ModalKeyboard', () => ({
  default: ({ onSubmit, initialValue, open }: any) => {
    _kbOnSubmit = onSubmit
    _kbInitialValue = initialValue
    _kbOpen = open
    return null
  },
}))

let mockGetSettings: ReturnType<typeof vi.fn>
let mockPostJson: ReturnType<typeof vi.fn>
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getSettings: (...args: any[]) => mockGetSettings(...args),
    postJson: (...args: any[]) => mockPostJson(...args),
  },
}))

import TaxSettings from '@/components/TaxSettings'

function makeTaxSettings(overrides: any = {}): any {
  return {
    businessName: 'Acme Corp',
    taxNumber: 'TX-12345',
    businessAddress: '123 Main St',
    enableTax: true,
    taxName: 'GST',
    taxRate: 10,
    enableSecondaryTax: false,
    secondaryTaxName: 'Service Tax',
    secondaryTaxRate: 5,
    enableTaxExemptions: false,
    notes: '',
    ...overrides,
  }
}

async function renderAndWait() {
  let result!: ReturnType<typeof render>
  await act(async () => { result = render(<TaxSettings />) })
  return result
}

beforeEach(() => {
  mockShowToast = vi.fn()
  mockRefreshBusinessSettings = vi.fn().mockResolvedValue(undefined)
  mockGetSettings = vi.fn().mockResolvedValue(makeTaxSettings())
  mockPostJson = vi.fn().mockResolvedValue(undefined)
  _kbOnSubmit = null
  _kbInitialValue = null
  _kbOpen = false
})

describe('TaxSettings', () => {

  describe('Header', () => {
    it('renders "Tax Settings" title', async () => {
      await renderAndWait()
      expect(screen.getByText('Tax Settings')).toBeTruthy()
    })

    it('renders Back button', async () => {
      await renderAndWait()
      expect(screen.getByText('Back')).toBeTruthy()
    })

    it('Back navigates to /manager', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByText('Back')) })
      expect(mockNavigate).toHaveBeenCalledWith('/manager')
    })
  })

  describe('Loading State', () => {
    it('shows loading spinner while settings load', async () => {
      let reject!: (e: any) => void
      mockGetSettings.mockReturnValue(new Promise((_r, rej) => { reject = rej }))
      await act(async () => { render(<TaxSettings />) })
      expect(screen.getByText('Loading tax settings...')).toBeTruthy()
      await act(async () => { reject(new Error('cleanup')) })
    })
  })

  describe('Form Fields', () => {
    it('shows Business Information section', async () => {
      await renderAndWait()
      expect(screen.getByText('Business Information')).toBeTruthy()
    })

    it('populates business name from loaded settings', async () => {
      await renderAndWait()
      const input = screen.getByTestId('hybrid-enter-business-name')
      expect((input as HTMLInputElement).value).toBe('Acme Corp')
    })

    it('populates tax number from loaded settings', async () => {
      await renderAndWait()
      const input = screen.getByTestId('hybrid-enter-tax-registration-number')
      expect((input as HTMLInputElement).value).toBe('TX-12345')
    })

    it('shows Tax Configuration section', async () => {
      await renderAndWait()
      expect(screen.getByText('Tax Configuration')).toBeTruthy()
    })

    it('shows Enable Tax on Sales toggle', async () => {
      await renderAndWait()
      expect(screen.getByText('Enable Tax on Sales')).toBeTruthy()
    })

    it('shows Additional Settings section', async () => {
      await renderAndWait()
      expect(screen.getByText('Additional Settings')).toBeTruthy()
    })

    it('shows Save Tax Settings button', async () => {
      await renderAndWait()
      expect(screen.getByRole('button', { name: /Save Tax Settings/ })).toBeTruthy()
    })
  })

  describe('Toggle interactions', () => {
    it('toggling Enable Tax updates state', async () => {
      await renderAndWait()
      // enableTax starts true; toggle it off
      const enableTaxCheckbox = document.getElementById('enableTax') as HTMLInputElement
      await act(async () => { fireEvent.click(enableTaxCheckbox) })
      expect(enableTaxCheckbox.checked).toBe(false)
    })
  })

  describe('Save', () => {
    it('clicking Save calls postJson with settings', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => {
        expect(mockPostJson).toHaveBeenCalledWith('/tax-settings', expect.objectContaining({
          businessName: 'Acme Corp',
        }))
      })
    })

    it('shows success toast after save', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Tax settings saved successfully', 'success')
      })
    })

    it('refreshes business settings after save', async () => {
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => {
        expect(mockRefreshBusinessSettings).toHaveBeenCalledTimes(1)
      })
    })

    it('shows error toast when save fails', async () => {
      mockPostJson.mockRejectedValue(new Error('network'))
      await renderAndWait()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Failed to save'),
          'error'
        )
      })
    })
  })

  describe('API errors', () => {
    it('shows error toast when settings fail to load (non-404)', async () => {
      mockGetSettings.mockRejectedValue(new Error('server error'))
      await renderAndWait()
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load'),
        'error'
      )
    })

    it('does not show error toast for missing tax settings (404)', async () => {
      mockGetSettings.mockRejectedValue(new Error('404 not found'))
      await renderAndWait()
      // 404 is expected (new setup) — no toast
      expect(mockShowToast).not.toHaveBeenCalled()
    })

    it('does not show error toast for "Tax settings not configured" message', async () => {
      mockGetSettings.mockRejectedValue(new Error('Tax settings not configured'))
      await renderAndWait()
      expect(mockShowToast).not.toHaveBeenCalled()
    })
  })

  // ── Business Information Fields ───────────────────────────────────────────

  describe('Business Information Fields', () => {
    it('changing businessName saves updated value', async () => {
      await renderAndWait()
      const input = screen.getByTestId('hybrid-enter-business-name')
      await act(async () => { fireEvent.change(input, { target: { value: 'New Store Name' } }) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ businessName: 'New Store Name' })
      ))
    })

    it('changing taxNumber saves updated value', async () => {
      await renderAndWait()
      const input = screen.getByTestId('hybrid-enter-tax-registration-number')
      await act(async () => { fireEvent.change(input, { target: { value: 'TX-99999' } }) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ taxNumber: 'TX-99999' })
      ))
    })

    it('changing businessAddress saves updated value', async () => {
      await renderAndWait()
      const input = screen.getByTestId('hybrid-enter-complete-business-address')
      await act(async () => { fireEvent.change(input, { target: { value: '999 New Road, City' } }) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ businessAddress: '999 New Road, City' })
      ))
    })
  })

  // ── Tax Configuration Fields ──────────────────────────────────────────────

  describe('Tax Configuration Fields (enableTax=true)', () => {
    it('shows Tax Name and Tax Rate fields when enableTax is true', async () => {
      await renderAndWait()
      // taxName field placeholder
      expect(screen.getByPlaceholderText(/Sales Tax, VAT, GST/)).toBeTruthy()
    })

    it('changing taxName saves updated value', async () => {
      await renderAndWait()
      const input = screen.getByPlaceholderText(/Sales Tax, VAT, GST/)
      await act(async () => { fireEvent.change(input, { target: { value: 'VAT' } }) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ taxName: 'VAT' })
      ))
    })

    it('changing taxRate saves updated numeric value', async () => {
      await renderAndWait()
      // taxRate field: find by placeholder "0.00" within the Tax Rate section
      const rateInputs = screen.getAllByPlaceholderText('0.00')
      const taxRateInput = rateInputs[0]
      await act(async () => { fireEvent.change(taxRateInput, { target: { value: '15' } }) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ taxRate: 15 })
      ))
    })

    it('shows Tax Status as Enabled in summary when enableTax is true', async () => {
      await renderAndWait()
      expect(screen.getByText('Enabled')).toBeTruthy()
    })

    it('shows primary tax name and rate in summary when enableTax is true', async () => {
      await renderAndWait()
      // The summary shows "GST (10%)" from the mock data
      expect(screen.getByText('GST (10%)')).toBeTruthy()
    })

    it('hides tax fields when enableTax is toggled off', async () => {
      await renderAndWait()
      const enableTaxCb = document.getElementById('enableTax') as HTMLInputElement
      await act(async () => { fireEvent.click(enableTaxCb) })
      // Tax name field should no longer appear
      expect(screen.queryByPlaceholderText(/Sales Tax, VAT, GST/)).toBeNull()
    })

    it('shows Tax Status as Disabled in summary when enableTax is off', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableTax: false }))
      await renderAndWait()
      expect(screen.getByText('Disabled')).toBeTruthy()
    })
  })

  // ── Secondary Tax ─────────────────────────────────────────────────────────

  describe('Secondary Tax', () => {
    it('does not show secondary tax fields when enableSecondaryTax is false', async () => {
      await renderAndWait()
      expect(screen.queryByPlaceholderText(/Service Tax, City Tax/)).toBeNull()
    })

    it('shows secondary tax fields when enableSecondaryTax is enabled', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableSecondaryTax: true }))
      await renderAndWait()
      expect(screen.getByPlaceholderText(/Service Tax, City Tax/)).toBeTruthy()
    })

    it('toggling enableSecondaryTax reveals secondary tax fields', async () => {
      await renderAndWait()
      expect(screen.queryByPlaceholderText(/Service Tax, City Tax/)).toBeNull()
      const cb = document.getElementById('enableSecondaryTax') as HTMLInputElement
      await act(async () => { fireEvent.click(cb) })
      expect(screen.getByPlaceholderText(/Service Tax, City Tax/)).toBeTruthy()
    })

    it('changing secondaryTaxName saves updated value', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableSecondaryTax: true }))
      await renderAndWait()
      const input = screen.getByPlaceholderText(/Service Tax, City Tax/)
      await act(async () => { fireEvent.change(input, { target: { value: 'City Tax' } }) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ secondaryTaxName: 'City Tax' })
      ))
    })

    it('changing secondaryTaxRate saves updated numeric value', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableSecondaryTax: true }))
      await renderAndWait()
      const rateInputs = screen.getAllByPlaceholderText('0.00')
      // Second "0.00" placeholder is the secondary tax rate
      const secondaryRateInput = rateInputs[1]
      await act(async () => { fireEvent.change(secondaryRateInput, { target: { value: '8' } }) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ secondaryTaxRate: 8 })
      ))
    })

    it('shows secondary tax in configuration summary when enabled', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableSecondaryTax: true, secondaryTaxName: 'Service Tax', secondaryTaxRate: 5 }))
      await renderAndWait()
      expect(screen.getByText('Service Tax (5%)')).toBeTruthy()
    })
  })

  // ── Tax Exemptions ────────────────────────────────────────────────────────

  describe('Tax Exemptions', () => {
    it('shows Allow Tax-Exempt Sales toggle when enableTax is true', async () => {
      await renderAndWait()
      expect(screen.getByText('Allow Tax-Exempt Sales')).toBeTruthy()
    })

    it('toggling enableTaxExemptions saves updated value', async () => {
      await renderAndWait()
      const cb = document.getElementById('enableTaxExemptions') as HTMLInputElement
      expect(cb).toBeTruthy()
      const before = cb.checked // false from mock
      await act(async () => { fireEvent.click(cb) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ enableTaxExemptions: !before })
      ))
    })

    it('shows Tax Exemptions as Not Allowed in summary when disabled', async () => {
      await renderAndWait()
      expect(screen.getByText('Not Allowed')).toBeTruthy()
    })

    it('shows Tax Exemptions as Allowed in summary when enabled', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableTaxExemptions: true }))
      await renderAndWait()
      expect(screen.getByText('Allowed')).toBeTruthy()
    })
  })

  // ── Notes Field ───────────────────────────────────────────────────────────

  describe('Notes Field', () => {
    it('changing notes saves updated value', async () => {
      await renderAndWait()
      const input = screen.getByPlaceholderText(/Special tax notes/)
      await act(async () => { fireEvent.change(input, { target: { value: 'No tax on food items' } }) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ notes: 'No tax on food items' })
      ))
    })
  })

  // ── Cancel Button ─────────────────────────────────────────────────────────

  describe('Cancel Button', () => {
    it('Cancel button navigates to /manager', async () => {
      await renderAndWait()
      const cancelBtn = screen.getByRole('button', { name: /Cancel/ })
      await act(async () => { fireEvent.click(cancelBtn) })
      expect(mockNavigate).toHaveBeenCalledWith('/manager')
    })
  })

  // ── Touch keyboard opens (lines 301, 312, 342) ────────────────────────────

  describe('Touch keyboard triggers', () => {
    it('clicking secondary tax name input opens keyboard (line 301)', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableSecondaryTax: true }))
      await renderAndWait()
      const secondaryNameInput = screen.getByPlaceholderText(/Service Tax, City Tax/)
      await act(async () => { fireEvent.click(secondaryNameInput) })
      expect(_kbOpen).toBe(true)
    })

    it('clicking secondary tax rate input opens keyboard (line 312)', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableSecondaryTax: true }))
      await renderAndWait()
      // Second "0.00" placeholder input is the secondary tax rate
      const rateInputs = screen.getAllByPlaceholderText('0.00')
      const secondaryRateInput = rateInputs[1]
      await act(async () => { fireEvent.click(secondaryRateInput) })
      expect(_kbOpen).toBe(true)
    })

    it('clicking notes input opens keyboard (line 342)', async () => {
      await renderAndWait()
      const notesInput = screen.getByPlaceholderText(/Special tax notes/)
      await act(async () => { fireEvent.click(notesInput) })
      expect(_kbOpen).toBe(true)
    })
  })

  // ── ModalKeyboard initialValue (line 429) ────────────────────────────────

  describe('ModalKeyboard initialValue', () => {
    it('initialValue for taxRate is the current taxRate as string', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ taxRate: 12 }))
      await renderAndWait()
      // Open keyboard for taxRate (first "0.00" placeholder = primary tax rate)
      const taxRateInput = screen.getAllByPlaceholderText('0.00')[0]
      await act(async () => { fireEvent.click(taxRateInput) })
      expect(_kbInitialValue).toBe('12')
    })

    it('initialValue for secondaryTaxRate is the current secondaryTaxRate as string', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableSecondaryTax: true, secondaryTaxRate: 7 }))
      await renderAndWait()
      // Second "0.00" input is secondaryTaxRate
      const secondaryRateInput = screen.getAllByPlaceholderText('0.00')[1]
      await act(async () => { fireEvent.click(secondaryRateInput) })
      expect(_kbInitialValue).toBe('7')
    })

    it('initialValue for businessName is the current businessName', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ businessName: 'My Shop' }))
      await renderAndWait()
      const businessNameInput = screen.getByTestId('hybrid-enter-business-name')
      await act(async () => { fireEvent.click(businessNameInput) })
      expect(_kbInitialValue).toBe('My Shop')
    })

    it('initialValue for notes is the current notes string', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ notes: 'Special note here' }))
      await renderAndWait()
      const notesInput = screen.getByPlaceholderText(/Special tax notes/)
      await act(async () => { fireEvent.click(notesInput) })
      expect(_kbInitialValue).toBe('Special note here')
    })
  })

  // ── applyKb submission ────────────────────────────────────────────────────

  describe('applyKb keyboard submission', () => {
    it('submitting secondary tax name via keyboard updates state', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableSecondaryTax: true }))
      await renderAndWait()
      const secondaryNameInput = screen.getByPlaceholderText(/Service Tax, City Tax/)
      await act(async () => { fireEvent.click(secondaryNameInput) })
      // kbTarget is now 'secondaryTaxName'; submit via keyboard
      await act(async () => { _kbOnSubmit!('Municipal Tax') })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ secondaryTaxName: 'Municipal Tax' })
      ))
    })

    it('submitting secondary tax rate via keyboard parses float and updates state', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableSecondaryTax: true }))
      await renderAndWait()
      const secondaryRateInput = screen.getAllByPlaceholderText('0.00')[1]
      await act(async () => { fireEvent.click(secondaryRateInput) })
      await act(async () => { _kbOnSubmit!('6.5') })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ secondaryTaxRate: 6.5 })
      ))
    })

    it('submitting notes via keyboard updates state', async () => {
      await renderAndWait()
      const notesInput = screen.getByPlaceholderText(/Special tax notes/)
      await act(async () => { fireEvent.click(notesInput) })
      await act(async () => { _kbOnSubmit!('Keyboard note value') })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Save Tax Settings/ })) })
      await waitFor(() => expect(mockPostJson).toHaveBeenCalledWith(
        '/tax-settings',
        expect.objectContaining({ notes: 'Keyboard note value' })
      ))
    })
  })

  // ── enableSecondaryTax toggle OFF ─────────────────────────────────────────

  describe('enableSecondaryTax toggle OFF', () => {
    it('toggling enableSecondaryTax off hides secondary tax sub-section', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({ enableSecondaryTax: true }))
      await renderAndWait()
      // Secondary fields should be visible
      expect(screen.getByPlaceholderText(/Service Tax, City Tax/)).toBeTruthy()
      // Toggle off
      const cb = document.getElementById('enableSecondaryTax') as HTMLInputElement
      await act(async () => { fireEvent.click(cb) })
      // Sub-section should be gone
      expect(screen.queryByPlaceholderText(/Service Tax, City Tax/)).toBeNull()
    })

    it('summary does not show secondary tax when enableSecondaryTax is off', async () => {
      mockGetSettings.mockResolvedValue(makeTaxSettings({
        enableSecondaryTax: true,
        secondaryTaxName: 'Service Tax',
        secondaryTaxRate: 5,
      }))
      await renderAndWait()
      expect(screen.getByText('Service Tax (5%)')).toBeTruthy()
      const cb = document.getElementById('enableSecondaryTax') as HTMLInputElement
      await act(async () => { fireEvent.click(cb) })
      expect(screen.queryByText('Service Tax (5%)')).toBeNull()
    })
  })
})
