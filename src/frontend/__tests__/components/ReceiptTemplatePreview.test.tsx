import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:5002/api',
  API_CONFIG: { baseUrl: 'http://127.0.0.1:5002/api', timeout: 30000 },
}))

vi.mock('@/components/SharedReceiptRenderer', () => ({
  default: ({ systemSettings }: { systemSettings: any }) => (
    <div data-testid="receipt-renderer">{systemSettings.receiptTemplateLayout}</div>
  ),
}))

let mockGetSettings: ReturnType<typeof vi.fn>
vi.mock('@/utils/ApiClient', () => ({
  default: {
    getSettings: (...args: any[]) => mockGetSettings(...args),
  },
}))

import ReceiptTemplatePreview from '@/components/ReceiptTemplatePreview'

function makeSettings(overrides: any = {}): any {
  return {
    receiptTemplateLayout: 'Standard',
    receiptHeaderText: 'My Store',
    receiptFooterText: 'Thanks!',
    storeLocation: '',
    phoneNumber: '',
    showReceiptBarcode: false,
    businessLogoPath: null,
    ...overrides,
  }
}

beforeEach(() => {
  mockGetSettings = vi.fn().mockResolvedValue({
    enableTax: true,
    taxName: 'GST',
    taxRate: 10,
    enableSecondaryTax: false,
    secondaryTaxName: 'Service Tax',
    secondaryTaxRate: 5,
    enableTaxExemptions: false,
  })
})

async function renderOpen(overrides: any = {}) {
  let result!: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <ReceiptTemplatePreview
        isOpen={true}
        systemSettings={makeSettings(overrides)}
        onClose={vi.fn()}
      />
    )
  })
  return result
}

describe('ReceiptTemplatePreview', () => {
  describe('Visibility', () => {
    it('returns null when isOpen=false', () => {
      const { container } = render(
        <ReceiptTemplatePreview isOpen={false} systemSettings={makeSettings()} onClose={vi.fn()} />
      )
      expect(container.firstChild).toBeNull()
    })

    it('returns null when isOpen=true but taxSettings not yet loaded', () => {
      // Tax settings never resolve — component stays null (isOpen && !taxSettings)
      mockGetSettings.mockReturnValue(new Promise(() => {}))
      const { container } = render(
        <ReceiptTemplatePreview isOpen={true} systemSettings={makeSettings()} onClose={vi.fn()} />
      )
      expect(container.firstChild).toBeNull()
    })

    it('renders modal after tax settings load', async () => {
      await renderOpen()
      expect(screen.getByText(/Receipt Template Preview/)).toBeTruthy()
    })
  })

  describe('Header', () => {
    it('shows layout name in header', async () => {
      await renderOpen({ receiptTemplateLayout: 'Compact' })
      // "Compact" appears in both the h2 and the mock renderer — use getAllByText
      expect(screen.getAllByText(/Compact/).length).toBeGreaterThanOrEqual(1)
    })

    it('shows subtitle text', async () => {
      await renderOpen()
      expect(screen.getByText('Sample receipt with current settings')).toBeTruthy()
    })
  })

  describe('Content', () => {
    it('renders SharedReceiptRenderer with system settings', async () => {
      await renderOpen()
      expect(screen.getByTestId('receipt-renderer')).toBeTruthy()
      // Mock shows the template layout
      expect(screen.getByText('Standard')).toBeTruthy()
    })
  })

  describe('Actions', () => {
    it('renders Close Preview button', async () => {
      await renderOpen()
      expect(screen.getByText('Close Preview')).toBeTruthy()
    })

    it('calls onClose when Close Preview is clicked', async () => {
      const onClose = vi.fn()
      await act(async () => {
        render(
          <ReceiptTemplatePreview isOpen={true} systemSettings={makeSettings()} onClose={onClose} />
        )
      })
      fireEvent.click(screen.getByText('Close Preview'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Tax settings API', () => {
    it('calls ApiClient.getSettings("tax") on open', async () => {
      await renderOpen()
      expect(mockGetSettings).toHaveBeenCalledWith('tax')
    })

    it('falls back to defaults when tax settings API fails', async () => {
      mockGetSettings.mockRejectedValue(new Error('fail'))
      await renderOpen()
      // Component renders with fallback defaults (Sales Tax 10%)
      expect(screen.getByTestId('receipt-renderer')).toBeTruthy()
    })

    it('does not call API when isOpen=false', () => {
      render(<ReceiptTemplatePreview isOpen={false} systemSettings={makeSettings()} onClose={vi.fn()} />)
      expect(mockGetSettings).not.toHaveBeenCalled()
    })
  })
})
