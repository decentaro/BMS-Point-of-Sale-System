import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import ApiClient from '../utils/ApiClient'

interface TaxSettings {
  businessName: string
  taxNumber: string
  businessAddress: string
  enableTax: boolean
  taxName: string
  taxRate: number
  enableSecondaryTax: boolean
  secondaryTaxName: string
  secondaryTaxRate: number
  enableTaxExemptions: boolean
  notes: string
}


const TaxSettings: React.FC = () => {
  const navigate = useNavigate()
  const { refreshBusinessSettings } = useBusinessSettings()

  // Get user context for API headers
  const getUserHeaders = () => {
    return SessionManager.getUserHeaders()
  }

  // Session and role validation handled by SessionGuard wrapper

  // State management
  const [settings, setSettings] = React.useState<TaxSettings>({
    businessName: '',
    taxNumber: '',
    businessAddress: '',
    enableTax: true,
    taxName: 'Sales Tax',
    taxRate: 10,
    enableSecondaryTax: false,
    secondaryTaxName: 'Service Tax',
    secondaryTaxRate: 5,
    enableTaxExemptions: false,
    notes: ''
  })

  const [loading, setLoading] = React.useState<boolean>(true)
  const [saving, setSaving] = React.useState<boolean>(false)

  // Modal keyboard state
  type FieldKeys = 'businessName' | 'taxNumber' | 'businessAddress' | 'taxName' | 'taxRate' | 'secondaryTaxName' | 'secondaryTaxRate' | 'notes'
  const [kbOpen, setKbOpen] = React.useState<boolean>(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('qwerty')
  const [kbTitle, setKbTitle] = React.useState<string>('')
  const [kbTarget, setKbTarget] = React.useState<FieldKeys>('businessName')


  // Load current settings
  React.useEffect(() => {
    loadTaxSettings()
  }, [])

  const loadTaxSettings = async () => {
    try {
      setLoading(true)
      const data = await ApiClient.getSettings<TaxSettings>('tax')
      setSettings(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load tax settings'
      // Check if it's missing tax settings (expected) vs actual error
      if (err instanceof Error && (err.message.includes('404') || err.message.includes('Tax settings not configured'))) {
        console.log('No tax settings found, using defaults - this is normal for new setup')
        // Don't show alert for missing tax settings - it's expected behavior
      } else {
        alert(`Failed to load tax settings!\n\n${errorMessage}\n\nPlease check your connection and try again.`)
        console.error('Error loading tax settings:', err)
      }
    } finally {
      setLoading(false)
    }
  }

  const saveTaxSettings = async () => {
    try {
      setSaving(true)
      await ApiClient.postJson('/tax-settings', settings)
      alert('Tax settings saved successfully!')
      
      // Refresh business settings to update header display
      await refreshBusinessSettings()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save tax settings'
      alert(`Failed to save tax settings!\n\n${errorMessage}\n\nPlease try again.`)
      console.error('Error saving tax settings:', err)
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: keyof TaxSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  // Keyboard handling
  const openKb = (target: FieldKeys, type: KeyboardType, title: string) => {
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
    setKbOpen(true)
  }

  const applyKb = (val: string) => {
    if (kbTarget === 'taxRate' || kbTarget === 'secondaryTaxRate') {
      // Handle numeric fields
      const numValue = parseFloat(val) || 0
      updateSetting(kbTarget, numValue)
    } else {
      // Handle text fields
      updateSetting(kbTarget, val)
    }
    setKbOpen(false)
  }


  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
      {/* Header */}
      <header className="h-14 px-4 border-b flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => navigate('/manager')}>← Back</Button>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-emerald-600">Tax Settings</h1>
          <p className="text-[10px] text-muted-foreground">Configure sales tax for your business</p>
        </div>
        <SessionStatus />
      </header>

      {/* Body */}
      <main className="flex-1 p-4 bg-slate-50 overflow-auto">
        {loading ? (
          <div className="text-center py-8">Loading tax settings...</div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Business Information */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Business Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Business Name</label>
                  <HybridInput
                    className="w-full p-2 border rounded"
                    value={settings.businessName}
                    onChange={(value) => updateSetting('businessName', value)}
                    onTouchKeyboard={() => openKb('businessName', 'qwerty', 'Business Name')}
                    placeholder="Enter business name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Tax Number</label>
                  <HybridInput
                    className="w-full p-2 border rounded"
                    value={settings.taxNumber}
                    onChange={(value) => updateSetting('taxNumber', value)}
                    onTouchKeyboard={() => openKb('taxNumber', 'qwerty', 'Tax Registration Number')}
                    placeholder="Enter tax registration number"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-2">Business Address</label>
                  <HybridInput
                    className="w-full p-2 border rounded"
                    value={settings.businessAddress}
                    onChange={(value) => updateSetting('businessAddress', value)}
                    onTouchKeyboard={() => openKb('businessAddress', 'qwerty', 'Business Address')}
                    placeholder="Enter complete business address"
                  />
                </div>
              </div>
            </div>

            {/* Tax Configuration */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Tax Configuration</h2>
              
              {/* Enable/Disable Tax */}
              <div className="mb-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.enableTax}
                    onChange={(e) => updateSetting('enableTax', e.target.checked)}
                    className="mr-2"
                  />
                  <span className="font-medium">Enable Tax on Sales</span>
                </label>
                <p className="text-xs text-slate-600 mt-1">
                  Turn this off if your business doesn't charge tax on products
                </p>
              </div>

              {settings.enableTax && (
                <>
                  {/* Primary Tax */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium mb-2">Tax Name</label>
                      <HybridInput
                        className="w-full p-2 border rounded"
                        value={settings.taxName}
                        onChange={(value) => updateSetting('taxName', value)}
                        onTouchKeyboard={() => openKb('taxName', 'qwerty', 'Tax Name')}
                        placeholder="e.g. Sales Tax, VAT, GST"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Tax Rate (%)</label>
                      <HybridInput
                        type="decimal"
                        className="w-full p-2 border rounded"
                        value={settings.taxRate.toString()}
                        onChange={(value) => updateSetting('taxRate', parseFloat(value) || 0)}
                        onTouchKeyboard={() => openKb('taxRate', 'decimal', 'Tax Rate (%)')}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Secondary Tax (Optional) */}
                  <div className="mb-6">
                    <label className="flex items-center mb-3">
                      <input
                        type="checkbox"
                        checked={settings.enableSecondaryTax}
                        onChange={(e) => updateSetting('enableSecondaryTax', e.target.checked)}
                        className="mr-2"
                      />
                      <span className="font-medium">Add Secondary Tax</span>
                    </label>
                    <p className="text-xs text-slate-600 mb-3">
                      Some regions have multiple taxes (e.g. State + Federal, VAT + Service Tax)
                    </p>
                    
                    {settings.enableSecondaryTax && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Secondary Tax Name</label>
                          <HybridInput
                            className="w-full p-2 border rounded"
                            value={settings.secondaryTaxName}
                            onChange={(value) => updateSetting('secondaryTaxName', value)}
                            onTouchKeyboard={() => openKb('secondaryTaxName', 'qwerty', 'Secondary Tax Name')}
                            placeholder="e.g. Service Tax, City Tax"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Secondary Tax Rate (%)</label>
                          <HybridInput
                            type="decimal"
                            className="w-full p-2 border rounded"
                            value={settings.secondaryTaxRate.toString()}
                            onChange={(value) => updateSetting('secondaryTaxRate', parseFloat(value) || 0)}
                            onTouchKeyboard={() => openKb('secondaryTaxRate', 'decimal', 'Secondary Tax Rate (%)')}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tax Exemptions */}
                  <div className="mb-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.enableTaxExemptions}
                        onChange={(e) => updateSetting('enableTaxExemptions', e.target.checked)}
                        className="mr-2"
                      />
                      <span className="font-medium">Allow Tax-Exempt Sales</span>
                    </label>
                    <p className="text-xs text-slate-600 mt-1">
                      Enable this to have a "Tax Exempt" option in POS for special cases
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Additional Settings */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Additional Settings</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Notes</label>
                <HybridInput
                  className="w-full p-2 border rounded"
                  value={settings.notes}
                  onChange={(value) => updateSetting('notes', value)}
                  onTouchKeyboard={() => openKb('notes', 'qwerty', 'Tax Notes')}
                  placeholder="Add any special tax notes, exemptions, or compliance requirements for your region..."
                />
              </div>
            </div>

            {/* Tax Summary */}
            <div className="bg-blue-50 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Current Tax Configuration</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Tax Status:</strong> {settings.enableTax ? 'Enabled' : 'Disabled'}
                </div>
                {settings.enableTax && (
                  <>
                    <div>
                      <strong>Primary Tax:</strong> {settings.taxName} ({settings.taxRate}%)
                    </div>
                    {settings.enableSecondaryTax && (
                      <div>
                        <strong>Secondary Tax:</strong> {settings.secondaryTaxName} ({settings.secondaryTaxRate}%)
                      </div>
                    )}
                    <div>
                      <strong>Tax Exemptions:</strong> {settings.enableTaxExemptions ? 'Allowed' : 'Not Allowed'}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 justify-end">
              <Button variant="outline" onClick={() => navigate('/manager')}>
                Cancel
              </Button>
              <Button 
                onClick={saveTaxSettings}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700"
              >
                {saving ? 'Saving...' : 'Save Tax Settings'}
              </Button>
            </div>
          </div>
        )}
      </main>
      
      <ModalKeyboard 
        open={kbOpen} 
        type={kbType} 
        title={kbTitle} 
        initialValue={settings[kbTarget]?.toString() || ''} 
        onSubmit={applyKb} 
        onClose={() => setKbOpen(false)} 
      />
      </div>
    </SessionGuard>
  )
}

export default TaxSettings