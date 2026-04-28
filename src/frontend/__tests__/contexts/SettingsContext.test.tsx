import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

import ApiClient from '@/utils/ApiClient'
import { SettingsProvider, useBusinessSettings } from '@/contexts/SettingsContext'

function SettingsConsumer() {
  const { businessSettings, loading, refreshBusinessSettings } = useBusinessSettings()
  return (
    <div>
      {loading && <span data-testid="loading">loading</span>}
      <span data-testid="business-name">{businessSettings.businessName}</span>
      <span data-testid="store-location">{businessSettings.storeLocation ?? ''}</span>
      <span data-testid="phone">{businessSettings.phoneNumber ?? ''}</span>
      <span data-testid="header">{businessSettings.receiptHeaderText ?? ''}</span>
      <span data-testid="footer">{businessSettings.receiptFooterText ?? ''}</span>
      <span data-testid="logo">{businessSettings.businessLogoPath ?? ''}</span>
      <button data-testid="refresh" onClick={refreshBusinessSettings}>refresh</button>
    </div>
  )
}

const mockSystemData = {
  businessLogoPath: '/logo.png',
  storeLocation: '123 Main St',
  phoneNumber: '555-0000',
  receiptHeaderText: 'Header Text',
  receiptFooterText: 'Footer Text',
}

const mockTaxData = {
  businessName: 'My Store',
}

function renderWithProvider() {
  return render(
    <SettingsProvider>
      <SettingsConsumer />
    </SettingsProvider>
  )
}

describe('SettingsContext', () => {
  beforeEach(() => {
    vi.mocked(ApiClient.getSettings).mockReset()
  })

  // ── Happy Path ──────────────────────────────────────────────

  describe('Happy Path', () => {
    it('shows loading state initially then resolves', async () => {
      vi.mocked(ApiClient.getSettings)
        .mockResolvedValueOnce(mockSystemData) // system
        .mockResolvedValueOnce(mockTaxData)   // tax

      renderWithProvider()
      // Loading is true initially
      // After resolve, loading is false
      await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull())
    })

    it('loads business name from tax settings', async () => {
      vi.mocked(ApiClient.getSettings)
        .mockResolvedValueOnce(mockSystemData)
        .mockResolvedValueOnce(mockTaxData)

      renderWithProvider()
      await waitFor(() => expect(screen.getByTestId('business-name').textContent).toBe('My Store'))
    })

    it('loads store location from system settings', async () => {
      vi.mocked(ApiClient.getSettings)
        .mockResolvedValueOnce(mockSystemData)
        .mockResolvedValueOnce(mockTaxData)

      renderWithProvider()
      await waitFor(() => expect(screen.getByTestId('store-location').textContent).toBe('123 Main St'))
    })

    it('loads phone number from system settings', async () => {
      vi.mocked(ApiClient.getSettings)
        .mockResolvedValueOnce(mockSystemData)
        .mockResolvedValueOnce(mockTaxData)

      renderWithProvider()
      await waitFor(() => expect(screen.getByTestId('phone').textContent).toBe('555-0000'))
    })

    it('loads receipt header from system settings', async () => {
      vi.mocked(ApiClient.getSettings)
        .mockResolvedValueOnce(mockSystemData)
        .mockResolvedValueOnce(mockTaxData)

      renderWithProvider()
      await waitFor(() => expect(screen.getByTestId('header').textContent).toBe('Header Text'))
    })

    it('loads logo path from system settings', async () => {
      vi.mocked(ApiClient.getSettings)
        .mockResolvedValueOnce(mockSystemData)
        .mockResolvedValueOnce(mockTaxData)

      renderWithProvider()
      await waitFor(() => expect(screen.getByTestId('logo').textContent).toBe('/logo.png'))
    })

    it('refreshBusinessSettings re-fetches settings', async () => {
      vi.mocked(ApiClient.getSettings)
        .mockResolvedValueOnce(mockSystemData)
        .mockResolvedValueOnce(mockTaxData)
        .mockResolvedValueOnce({ ...mockSystemData, storeLocation: 'New Location' })
        .mockResolvedValueOnce({ businessName: 'Updated Store' })

      const user = userEvent.setup()
      renderWithProvider()
      await waitFor(() => expect(screen.getByTestId('business-name').textContent).toBe('My Store'))

      await user.click(screen.getByTestId('refresh'))
      await waitFor(() => expect(screen.getByTestId('business-name').textContent).toBe('Updated Store'))
    })
  })

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles tax settings API error gracefully (businessName stays empty)', async () => {
      vi.mocked(ApiClient.getSettings)
        .mockResolvedValueOnce(mockSystemData)
        .mockRejectedValueOnce(new Error('Tax settings not found'))

      renderWithProvider()
      await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull())
      expect(screen.getByTestId('business-name').textContent).toBe('')
    })

    it('handles system settings API error without crashing', async () => {
      vi.mocked(ApiClient.getSettings)
        .mockRejectedValueOnce(new Error('System offline'))

      renderWithProvider()
      await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull())
      // Should still render with defaults
      expect(screen.getByTestId('business-name').textContent).toBe('')
    })

    it('businessName defaults to empty string when tax returns no businessName', async () => {
      vi.mocked(ApiClient.getSettings)
        .mockResolvedValueOnce(mockSystemData)
        .mockResolvedValueOnce({}) // no businessName

      renderWithProvider()
      await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull())
      expect(screen.getByTestId('business-name').textContent).toBe('')
    })
  })

  // ── Error Cases ─────────────────────────────────────────────

  describe('Error Cases', () => {
    it('useBusinessSettings throws when used outside SettingsProvider', () => {
      function BadConsumer() {
        useBusinessSettings()
        return null
      }
      expect(() => render(<BadConsumer />)).toThrow('useBusinessSettings must be used within a SettingsProvider')
    })
  })
})
