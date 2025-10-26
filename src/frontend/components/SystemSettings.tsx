import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import ReceiptTemplatePreview from './ReceiptTemplatePreview'
import SessionManager from '../utils/SessionManager'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import ApiClient from '../utils/ApiClient'
import { clearDateFormatCache } from '../utils/dateFormat'

// SystemSettings interface matching the API model
interface SystemSettings {
  id: number
  dateFormat: string
  decimalSeparator: string
  thousandsSeparator: string
  autoLogoutMinutes: number
  defaultPaymentMethod: string
  availablePaymentMethods: string
  soundEffectsEnabled: boolean
  requireManagerApprovalForDiscount: boolean
  theme: string
  fontScaling: number
  receiptFooterText?: string
  storeLocation?: string
  phoneNumber?: string
  receiptHeaderText?: string
  printReceiptAutomatically: boolean
  receiptCopies: number
  receiptPaperSize: string
  showReceiptPreview: boolean
  emailReceiptEnabled: boolean
  defaultReceiptEmail?: string
  receiptFontSize: string
  receiptTemplateLayout: string
  showReceiptBarcode: boolean
  // Returns Policy Settings
  enableReturns: boolean
  requireReceiptForReturns: boolean
  requireManagerApprovalForReturns: boolean
  restockReturnedItems: boolean
  allowDefectiveItemReturns: boolean
  returnTimeLimitDays: number
  returnManagerApprovalAmount: number
  returnReasons: string
  // Product Management Settings
  productCategories?: string
  createdDate: string
  lastUpdated: string
}

const SystemSettings: React.FC = () => {
  const navigate = useNavigate()


  // Session and role validation handled by SessionGuard wrapper

  // State management
  const [settings, setSettings] = React.useState<SystemSettings | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  const [saving, setSaving] = React.useState<boolean>(false)
  const [showReceiptPreview, setShowReceiptPreview] = React.useState<boolean>(false)

  // Modal keyboard state
  type FormKeys = 'autoLogoutMinutes' | 'fontScaling' | 'receiptFooterText' | 'storeLocation' | 'phoneNumber' | 'receiptHeaderText' | 'receiptCopies' | 'defaultReceiptEmail' | 'returnTimeLimitDays' | 'returnManagerApprovalAmount' | 'returnReasons' | 'availablePaymentMethods' | 'productCategories'
  const [kbOpen, setKbOpen] = React.useState<boolean>(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('qwerty')
  const [kbTitle, setKbTitle] = React.useState<string>('')
  const [kbTarget, setKbTarget] = React.useState<FormKeys>('receiptHeaderText')

  const openKb = (target: FormKeys, type: KeyboardType, title: string) => {
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
    setKbOpen(true)
  }

  const applyKb = (val: string) => {
    if (settings) {
      let processedValue: any = val
      
      // Handle numeric fields with validation
      if (kbTarget === 'autoLogoutMinutes') {
        processedValue = Math.max(5, parseInt(val) || 5) // Minimum 5 minutes
      } else if (kbTarget === 'receiptCopies' || kbTarget === 'returnTimeLimitDays') {
        processedValue = parseInt(val) || 0
      } else if (kbTarget === 'fontScaling') {
        processedValue = parseFloat(val) || 1.0
      } else if (kbTarget === 'returnManagerApprovalAmount') {
        processedValue = parseFloat(val) || 0
      }
      
      setSettings({ ...settings, [kbTarget]: processedValue })
    }
    setKbOpen(false)
  }

  // Load settings
  const loadSettings = async () => {
    try {
      setLoading(true)
      const settingsData = await ApiClient.getSettings<SystemSettings>('system')

      setSettings(settingsData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load settings'
      alert(`Failed to load settings!\n${errorMessage}\n\nPlease check your connection and try again.`)
      console.error('Error loading settings:', err)
    } finally {
      setLoading(false)
    }
  }

  // Save settings
  const saveSettings = async () => {
    if (!settings) return

    try {
      setSaving(true)
      const updatedSettings = await ApiClient.postJson('/system-settings', settings)
      setSettings(updatedSettings)
      
      // Refresh session timeout immediately if auto logout setting changed
      await SessionManager.refreshSessionTimeout()
      
      // Clear date format cache so components use the new format
      clearDateFormatCache()
      
      // Show alert popup like payment confirmation
      alert('Settings saved successfully!\nAll changes have been applied.')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save settings'
      alert(`Failed to save settings!\n${errorMessage}\n\nPlease try again.`)
      console.error('Error saving settings:', err)
    } finally {
      setSaving(false)
    }
  }

  // Load settings on component mount
  React.useEffect(() => {
    loadSettings()
  }, [])

  const goBack = () => {
    navigate('/manager')
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600">Loading system settings...</div>
        </div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="text-center text-red-600">
          Failed to load system settings
        </div>
      </div>
    )
  }

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
      {/* Header */}
      <header className="h-14 px-4 border-b flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={goBack}>← Back</Button>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-emerald-600">System Settings</h1>
          <p className="text-[10px] text-muted-foreground">Configure system preferences</p>
        </div>
        <SessionStatus />
      </header>

      {/* Body */}
      <main className="flex-1 p-4 bg-slate-50 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          

          {/* Regional Settings */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Regional Settings</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Date Format */}
                <div>
                  <label className="block text-sm font-medium mb-2">Date Format</label>
                  <select 
                    className="w-full p-3 border rounded-lg"
                    value={settings.dateFormat}
                    onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value })}
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
                  </select>
                </div>

                
              </div>
            </CardContent>
          </Card>

          {/* POS Behavior Settings */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">POS Behavior</h2>
              <div className="space-y-6">
                
                {/* Session & Security */}
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-700 border-b pb-2">Session & Security</h3>
                  
                  {/* Auto Logout */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Auto Logout (minutes)</label>
                    <HybridInput 
                      type="decimal"
                      className="w-full p-3 border rounded-lg"
                      value={settings.autoLogoutMinutes}
                      onChange={(value) => setSettings({ ...settings, autoLogoutMinutes: value })}
                      onTouchKeyboard={() => openKb('autoLogoutMinutes', 'decimal', 'Auto Logout Minutes')}
                    />
                    <p className="text-xs text-gray-500 mt-1">Minimum 5 minutes for system stability</p>
                  </div>
                </div>

                {/* Payment Methods */}
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-700 border-b pb-2">Payment Methods</h3>
                  
                {/* Available Payment Methods */}
                <div>
                  <label className="block text-sm font-medium mb-2">Available Payment Methods (comma-separated)</label>
                  <HybridInput 
                    className="w-full p-3 border rounded-lg"
                    value={settings.availablePaymentMethods}
                    onChange={(value) => setSettings({ ...settings, availablePaymentMethods: value })}
                    placeholder="Cash,Card,ETF/Digital"
                    onTouchKeyboard={() => openKb('availablePaymentMethods', 'qwerty', 'Available Payment Methods')}
                  />
                  <p className="text-xs text-gray-500 mt-1">Payment methods available in POS system</p>
                  
                  {/* Quick Preset Buttons */}
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-600 mb-2">Quick Presets:</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setSettings({
                          ...settings,
                          availablePaymentMethods: "Cash,Card,ETF/Digital"
                        })}
                      >
                        Standard
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setSettings({
                          ...settings,
                          availablePaymentMethods: "Cash"
                        })}
                      >
                        Cash Only
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setSettings({
                          ...settings,
                          availablePaymentMethods: "Card,ETF/Digital"
                        })}
                      >
                        Digital Only
                      </Button>
                    </div>
                  </div>
                  </div>

                  {/* Default Payment Method */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Default Payment Method</label>
                    <select 
                      className="w-full p-3 border rounded-lg"
                      value={settings.defaultPaymentMethod}
                      onChange={(e) => setSettings({ ...settings, defaultPaymentMethod: e.target.value })}
                    >
                      {settings.availablePaymentMethods.split(',').map(method => {
                        const trimmedMethod = method.trim()
                        return trimmedMethod ? (
                          <option key={trimmedMethod} value={trimmedMethod}>{trimmedMethod}</option>
                        ) : null
                      })}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Payment method selected by default in POS</p>
                  </div>
                </div>

                {/* Transaction Controls */}
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-700 border-b pb-2">Transaction Controls</h3>
                  
                  {/* Manager Approval for Discount */}
                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox"
                      id="managerApproval"
                      checked={settings.requireManagerApprovalForDiscount}
                      onChange={(e) => setSettings({ ...settings, requireManagerApprovalForDiscount: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="managerApproval" className="text-sm font-medium">Require Manager Approval for Discounts</label>
                  </div>
                </div>

                {/* System Preferences */}
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-700 border-b pb-2">System Preferences</h3>
                  
                  {/* Sound Effects */}
                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox"
                      id="soundEffects"
                      checked={settings.soundEffectsEnabled}
                      onChange={(e) => setSettings({ ...settings, soundEffectsEnabled: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="soundEffects" className="text-sm font-medium">Enable Sound Effects</label>
                  </div>
                </div>
                
              </div>
            </CardContent>
          </Card>


          {/* Receipt & Printing Settings */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Receipt & Printing Settings</h2>
              <div className="space-y-4">
                
                {/* Receipt Content */}
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-700 border-b pb-2">Receipt Content</h3>
                  

                  {/* Receipt Header Text */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Receipt Header Text</label>
                    <HybridInput 
                      className="w-full p-3 border rounded-lg"
                      value={settings.receiptHeaderText || ''}
                      onChange={(value) => setSettings({ ...settings, receiptHeaderText: value })}
                      placeholder="Main header for receipts (e.g., WELCOME TO BMS PET STORE)"
                      onTouchKeyboard={() => openKb('receiptHeaderText', 'qwerty', 'Receipt Header Text')}
                    />
                    <p className="text-xs text-gray-500 mt-1">This will be the main header on your receipts. Business name is managed in Tax Settings.</p>
                  </div>

                  {/* Store Location */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Store Location/Address</label>
                    <HybridInput 
                      className="w-full p-3 border rounded-lg"
                      value={settings.storeLocation || ''}
                      onChange={(value) => setSettings({ ...settings, storeLocation: value })}
                      placeholder="Store address or location identifier"
                      onTouchKeyboard={() => openKb('storeLocation', 'qwerty', 'Store Location')}
                    />
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Phone Number</label>
                    <HybridInput 
                      className="w-full p-3 border rounded-lg"
                      value={settings.phoneNumber || ''}
                      onChange={(value) => setSettings({ ...settings, phoneNumber: value })}
                      placeholder="Store phone number (e.g., +63 123 456 7890)"
                      onTouchKeyboard={() => openKb('phoneNumber', 'qwerty', 'Phone Number')}
                    />
                  </div>

                  {/* Receipt Footer */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Receipt Footer Text</label>
                    <HybridInput 
                      className="w-full p-3 border rounded-lg"
                      value={settings.receiptFooterText || ''}
                      onChange={(value) => setSettings({ ...settings, receiptFooterText: value })}
                      placeholder="Message at bottom of receipt (e.g., Thank you!)"
                      onTouchKeyboard={() => openKb('receiptFooterText', 'qwerty', 'Receipt Footer Text')}
                    />
                  </div>
                </div>

                {/* Printing Configuration */}
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-700 border-b pb-2">Printing Configuration</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Paper Size - Locked to 80mm */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Receipt Paper Size</label>
                    <div className="w-full p-3 border rounded-lg bg-gray-100 text-gray-700">
                      80mm (Standard) - Fixed
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Paper size is locked to 80mm for optimal thermal printing</p>
                  </div>

                  {/* Font Size */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Receipt Font Size</label>
                    <select 
                      className="w-full p-3 border rounded-lg"
                      value={settings.receiptFontSize}
                      onChange={(e) => setSettings({ ...settings, receiptFontSize: e.target.value })}
                    >
                      <option value="Small">Small</option>
                      <option value="Normal">Normal</option>
                      <option value="Large">Large</option>
                    </select>
                  </div>

                  {/* Receipt Template Layout */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Receipt Template Layout</label>
                    <select 
                      className="w-full p-3 border rounded-lg"
                      value={settings.receiptTemplateLayout}
                      onChange={(e) => setSettings({ ...settings, receiptTemplateLayout: e.target.value })}
                    >
                      <option value="Compact">Compact - Minimal layout, fits more on small receipts</option>
                      <option value="Standard">Standard - Balanced layout with all essential info</option>
                      <option value="Detailed">Detailed - Comprehensive layout with full product details</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Choose how much information to display on receipts</p>
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowReceiptPreview(true)}
                        className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                      >
                        Preview Template
                      </Button>
                    </div>
                  </div>

                  {/* Receipt Copies */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Receipt Copies</label>
                    <HybridInput 
                      type="decimal"
                      className="w-full p-3 border rounded-lg"
                      value={settings.receiptCopies}
                      onChange={(value) => setSettings({ ...settings, receiptCopies: value })}
                      onTouchKeyboard={() => openKb('receiptCopies', 'decimal', 'Number of Receipt Copies')}
                    />
                  </div>

                  {/* Email Receipt */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Default Email for Receipts</label>
                    <HybridInput 
                      className="w-full p-3 border rounded-lg"
                      value={settings.defaultReceiptEmail || ''}
                      onChange={(value) => setSettings({ ...settings, defaultReceiptEmail: value })}
                      placeholder="customer@example.com"
                      onTouchKeyboard={() => openKb('defaultReceiptEmail', 'qwerty', 'Default Receipt Email')}
                      disabled={!settings.emailReceiptEnabled}
                    />
                  </div>
                  
                  </div>
                </div>

                {/* Printing Options */}
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-700 border-b pb-2">Printing Options</h3>
                  <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox"
                      id="printAutomatically"
                      checked={settings.printReceiptAutomatically}
                      onChange={(e) => setSettings({ ...settings, printReceiptAutomatically: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="printAutomatically" className="text-sm font-medium">Print receipts automatically after payment</label>
                  </div>


                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox"
                      id="showReceiptPreview"
                      checked={settings.showReceiptPreview}
                      onChange={(e) => setSettings({ ...settings, showReceiptPreview: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="showReceiptPreview" className="text-sm font-medium">Show receipt preview before printing</label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox"
                      id="emailReceiptEnabled"
                      checked={settings.emailReceiptEnabled}
                      onChange={(e) => setSettings({ ...settings, emailReceiptEnabled: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="emailReceiptEnabled" className="text-sm font-medium">Enable email receipts</label>
                  </div>


                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox"
                      id="showReceiptBarcode"
                      checked={settings.showReceiptBarcode}
                      onChange={(e) => setSettings({ ...settings, showReceiptBarcode: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="showReceiptBarcode" className="text-sm font-medium">Show transaction barcode on receipts (for easy returns)</label>
                  </div>
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>

          {/* Product Management Settings */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Product Management</h2>
              <div className="space-y-4">
                
                {/* Product Categories */}
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-700 border-b pb-2">Product Categories</h3>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Available Product Categories (comma-separated)</label>
                    <HybridInput 
                      className="w-full p-3 border rounded-lg"
                      value={settings.productCategories || ''}
                      onChange={(value) => setSettings({ ...settings, productCategories: value })}
                      placeholder="Pet Food,Pet Toys,Pet Accessories,Pet Medicine,Pet Grooming,Pet Treats"
                      onTouchKeyboard={() => openKb('productCategories', 'qwerty', 'Product Categories')}
                    />
                    <p className="text-xs text-gray-500 mt-1">Categories available when adding/editing products in inventory</p>
                    
                    {/* Quick Preset Buttons */}
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">Quick Presets:</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setSettings({
                            ...settings,
                            productCategories: "Pet Food,Pet Toys,Pet Accessories,Pet Medicine,Pet Grooming,Pet Treats,Pet Beds,Pet Carriers,Pet Collars & Leashes,Pet Bowls & Feeders"
                          })}
                        >
                          Pet Store Comprehensive
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setSettings({
                            ...settings,
                            productCategories: "Pet Food,Pet Toys,Pet Accessories,Pet Medicine"
                          })}
                        >
                          Pet Store Basic
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setSettings({
                            ...settings,
                            productCategories: "Dog Food,Cat Food,Dog Toys,Cat Toys,Dog Accessories,Cat Accessories,Pet Medicine,Pet Treats"
                          })}
                        >
                          Dog & Cat Focused
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setSettings({
                            ...settings,
                            productCategories: "Food & Beverages,Electronics,Clothing,Home & Garden,Books,Toys & Games,Sports,Health & Beauty"
                          })}
                        >
                          General Retail
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-blue-600 mt-2">💡 Tip: Having consistent categories helps with inventory organization, reporting, and finding products quickly</p>
                  </div>
                </div>
                
              </div>
            </CardContent>
          </Card>

          {/* Returns Policy Settings */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Returns Policy Settings</h2>
              <div className="space-y-4">
                
                {/* Master Enable/Disable */}
                <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                  <input 
                    type="checkbox"
                    id="enableReturns"
                    checked={settings.enableReturns}
                    onChange={(e) => setSettings({ ...settings, enableReturns: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="enableReturns" className="text-sm font-medium text-blue-800">Enable Returns System</label>
                </div>

                {/* Returns Configuration (only show if returns are enabled) */}
                {settings.enableReturns && (
                  <>
                    {/* Policy Options */}
                    <div className="space-y-3">
                      <h3 className="text-md font-medium text-gray-700 border-b pb-2">Return Policies</h3>
                      
                      <div className="flex items-center space-x-3">
                        <input 
                          type="checkbox"
                          id="requireReceiptForReturns"
                          checked={settings.requireReceiptForReturns}
                          onChange={(e) => setSettings({ ...settings, requireReceiptForReturns: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <label htmlFor="requireReceiptForReturns" className="text-sm font-medium">Require receipt for returns</label>
                      </div>

                      <div className="flex items-center space-x-3">
                        <input 
                          type="checkbox"
                          id="requireManagerApprovalForReturns"
                          checked={settings.requireManagerApprovalForReturns}
                          onChange={(e) => setSettings({ ...settings, requireManagerApprovalForReturns: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <label htmlFor="requireManagerApprovalForReturns" className="text-sm font-medium">Require manager approval for ALL returns</label>
                      </div>

                      <div className="flex items-center space-x-3">
                        <input 
                          type="checkbox"
                          id="restockReturnedItems"
                          checked={settings.restockReturnedItems}
                          onChange={(e) => setSettings({ ...settings, restockReturnedItems: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <label htmlFor="restockReturnedItems" className="text-sm font-medium">Automatically restock returned items (good condition)</label>
                      </div>

                      <div className="flex items-center space-x-3">
                        <input 
                          type="checkbox"
                          id="allowDefectiveItemReturns"
                          checked={settings.allowDefectiveItemReturns}
                          onChange={(e) => setSettings({ ...settings, allowDefectiveItemReturns: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <label htmlFor="allowDefectiveItemReturns" className="text-sm font-medium">Allow returns of defective/damaged items</label>
                      </div>
                    </div>

                    {/* Numerical Settings */}
                    <div className="space-y-4">
                      <h3 className="text-md font-medium text-gray-700 border-b pb-2">Return Limits</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium mb-2">Return Time Limit (Days)</label>
                          <HybridInput 
                            type="decimal"
                            className="w-full p-3 border rounded-lg"
                            value={settings.returnTimeLimitDays}
                            onChange={(value) => setSettings({ ...settings, returnTimeLimitDays: value })}
                            onTouchKeyboard={() => openKb('returnTimeLimitDays', 'decimal', 'Return Time Limit (Days)')}
                          />
                          <p className="text-xs text-gray-500 mt-1">How many days customers have to return items</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">Manager Approval Amount Threshold</label>
                          <HybridInput 
                            type="decimal"
                            className="w-full p-3 border rounded-lg"
                            value={settings.returnManagerApprovalAmount}
                            onChange={(value) => setSettings({ ...settings, returnManagerApprovalAmount: value })}
                            onTouchKeyboard={() => openKb('returnManagerApprovalAmount', 'decimal', 'Manager Approval Amount')}
                          />
                          <p className="text-xs text-gray-500 mt-1">Returns above this amount require manager PIN</p>
                        </div>
                      </div>
                    </div>

                    {/* Return Reasons */}
                    <div className="space-y-4">
                      <h3 className="text-md font-medium text-gray-700 border-b pb-2">Return Reasons</h3>
                      
                      <div>
                        <label className="block text-sm font-medium mb-2">Return Reasons (comma-separated)</label>
                        <HybridInput 
                          className="w-full p-3 border rounded-lg"
                          value={settings.returnReasons}
                          onChange={(value) => setSettings({ ...settings, returnReasons: value })}
                          placeholder="Defective Product,Wrong Size,Pet Doesn't Like,Food Allergies,Damaged Package,Changed Mind,Other"
                          onTouchKeyboard={() => openKb('returnReasons', 'qwerty', 'Return Reasons')}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          <strong>Pet Store Examples:</strong> "Defective Product", "Wrong Size", "Pet Doesn't Like", "Food Allergies", "Damaged Package", "Changed Mind", "Other"
                        </p>
                        <p className="text-xs text-blue-600 mt-1">💡 Tip: Customize these reasons based on what you commonly see at your store</p>
                        
                        {/* Quick Preset Buttons */}
                        <div className="mt-3">
                          <p className="text-xs font-medium text-gray-600 mb-2">Quick Presets:</p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => setSettings({
                                ...settings,
                                returnReasons: "Defective Product,Wrong Size,Pet Doesn't Like,Food Allergies,Damaged Package,Changed Mind,Other"
                              })}
                            >
                              Pet Store Default
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => setSettings({
                                ...settings,
                                returnReasons: "Defective,Wrong Item,Changed Mind,No Receipt,Other"
                              })}
                            >
                              Simple
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => setSettings({
                                ...settings,
                                returnReasons: "Product Defect,Size Issue,Pet Allergic Reaction,Vet Recommendation,Wrong Item Ordered,Customer Changed Mind,Damaged in Transit,Other"
                              })}
                            >
                              Detailed
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button 
              onClick={saveSettings} 
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8"
            >
              {saving ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving...</span>
                </div>
              ) : (
                'Save Settings'
              )}
            </Button>
          </div>

        </div>
      </main>

      {/* Modal Keyboard */}
      <ModalKeyboard 
        open={kbOpen} 
        type={kbType} 
        title={kbTitle} 
        initialValue={
          kbTarget === 'autoLogoutMinutes' ? settings.autoLogoutMinutes.toString() :
          kbTarget === 'fontScaling' ? settings.fontScaling.toString() :
          kbTarget === 'receiptCopies' ? settings.receiptCopies.toString() :
          kbTarget === 'receiptFooterText' ? settings.receiptFooterText || '' :
          kbTarget === 'receiptHeaderText' ? settings.receiptHeaderText || '' :
          kbTarget === 'defaultReceiptEmail' ? settings.defaultReceiptEmail || '' :
          kbTarget === 'storeLocation' ? settings.storeLocation || '' :
          kbTarget === 'phoneNumber' ? settings.phoneNumber || '' :
          kbTarget === 'returnTimeLimitDays' ? settings.returnTimeLimitDays.toString() :
          kbTarget === 'returnManagerApprovalAmount' ? settings.returnManagerApprovalAmount.toString() :
          kbTarget === 'returnReasons' ? settings.returnReasons || '' :
          kbTarget === 'availablePaymentMethods' ? settings.availablePaymentMethods || '' :
          kbTarget === 'productCategories' ? settings.productCategories || '' : ''
        } 
        onSubmit={applyKb} 
        onClose={() => setKbOpen(false)} 
      />

      {/* Receipt Template Preview Modal */}
      {settings && (
        <ReceiptTemplatePreview
          isOpen={showReceiptPreview}
          systemSettings={settings}
          onClose={() => setShowReceiptPreview(false)}
        />
      )}
      </div>
    </SessionGuard>
  )
}

export default SystemSettings