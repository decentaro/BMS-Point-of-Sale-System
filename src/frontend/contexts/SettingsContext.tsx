import React, { createContext, useContext, useState, useEffect } from 'react'
import ApiClient from '../utils/ApiClient'

interface BusinessSettings {
  businessName: string
  businessLogoPath?: string
  storeLocation?: string
  phoneNumber?: string
  receiptHeaderText?: string
  receiptFooterText?: string
}

interface SettingsContextType {
  businessSettings: BusinessSettings
  loading: boolean
  refreshBusinessSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>({
    businessName: '',
    businessLogoPath: '',
    storeLocation: '',
    phoneNumber: '',
    receiptHeaderText: '',
    receiptFooterText: ''
  })
  const [loading, setLoading] = useState<boolean>(true)

  const loadBusinessSettings = async () => {
    try {
      setLoading(true)
      
      // Load system settings first (always exists)
      const systemData = await ApiClient.getSettings<any>('system')
      
      // Try to load tax settings (may not exist for new setup)
      let businessName = ''
      try {
        const taxSettings = await ApiClient.getSettings<any>('tax')
        businessName = taxSettings.businessName || ''
      } catch (error) {
        // Tax settings don't exist yet - this is normal for new setup
        console.log('Tax settings not configured yet - using empty business name')
      }

      setBusinessSettings({
        businessName,
        businessLogoPath: systemData.businessLogoPath,
        storeLocation: systemData.storeLocation,
        phoneNumber: systemData.phoneNumber,
        receiptHeaderText: systemData.receiptHeaderText,
        receiptFooterText: systemData.receiptFooterText
      })
    } catch (error) {
      console.error('Error loading business settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshBusinessSettings = async () => {
    await loadBusinessSettings()
  }

  useEffect(() => {
    loadBusinessSettings()
  }, [])

  return (
    <SettingsContext.Provider value={{ businessSettings, loading, refreshBusinessSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useBusinessSettings = () => {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useBusinessSettings must be used within a SettingsProvider')
  }
  return context
}