import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Info, Globe, ShoppingCart, Receipt, Package, RotateCcw,
  Save, ChevronRight, Eye
} from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import ReceiptTemplatePreview from './ReceiptTemplatePreview'
import SessionManager from '../utils/SessionManager'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import ApiClient from '../utils/ApiClient'
import { useToast } from '../contexts/ToastContext'
import { clearDateFormatCache } from '../utils/dateFormat'
import PageHeader from './ui/PageHeader'
import { SectionLoader } from './ui/LoadingSpinner'

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
  const { showToast } = useToast()

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
      showToast('Failed to load settings. Please refresh.', 'error')
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
      
      showToast('Settings saved successfully', 'success')
    } catch (err) {
      showToast('Failed to save settings. Please try again.', 'error')
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

  // ── Shared helpers ────────────────────────────────────────────────────────

  const SectionHeader = ({ icon: Icon, label, color = 'emerald' }: {
    icon: React.ElementType; label: string; color?: 'emerald' | 'navy' | 'red'
  }) => {
    const cls = {
      emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      navy:    'text-[hsl(215,65%,30%)] bg-slate-50 border-slate-200',
      red:     'text-red-600 bg-red-50 border-red-200',
    }[color]
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cls} mb-4`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm font-semibold tracking-wide uppercase">{label}</span>
      </div>
    )
  }

  const SubHeader = ({ label }: { label: string }) => (
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 mt-1">{label}</p>
  )

  const ToggleRow = ({ id, checked, onChange, label, sub }: {
    id: string; checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string
  }) => (
    <label htmlFor={id} className="flex items-center justify-between gap-4 py-3 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-colors">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <div className="relative flex-shrink-0">
        <input id={id} type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className="w-10 h-6 rounded-full bg-slate-200 peer-checked:bg-emerald-500 transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </div>
    </label>
  )

  const StyledSelect = ({ value, onChange, children, hint }: {
    value: string | number; onChange: (v: string) => void; children: React.ReactNode; hint?: string
  }) => (
    <div>
      <div className="relative">
        <select
          className="w-full appearance-none border border-slate-300 rounded-lg px-3 py-2.5 pr-9 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {children}
        </select>
        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90 pointer-events-none" />
      </div>
      {hint && <p className="text-xs text-slate-500 mt-1.5">{hint}</p>}
    </div>
  )

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{children}</label>
  )

  const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"

  const PresetBar = ({ label, children }: { label?: string; children: React.ReactNode }) => (
    <div className="mt-3">
      {label && <p className="text-xs font-medium text-slate-500 mb-2">{label}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )

  const PresetBtn = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <Button type="button" variant="outline" size="sm" onClick={onClick}
      className="text-xs border-slate-300 text-slate-600 hover:bg-slate-50">
      {label}
    </Button>
  )

  const TipNote = ({ children }: { children: React.ReactNode }) => (
    <p className="flex items-start gap-1 text-xs text-[hsl(215,65%,30%)] mt-2">
      <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />{children}
    </p>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
        <PageHeader
          title="System Settings"
          subtitle="Configure system preferences"
          onBack={goBack}
          right={<SessionStatus />}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50">
          {loading ? (
            <SectionLoader message="Loading system settings..." />
          ) : !settings ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-red-600 font-medium">Failed to load system settings</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

              {/* ── Regional Settings ──────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <SectionHeader icon={Globe} label="Regional Settings" color="emerald" />
                  <div className="max-w-xs">
                    <FieldLabel>Date Format</FieldLabel>
                    <StyledSelect value={settings.dateFormat} onChange={v => setSettings({ ...settings, dateFormat: v })}>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (31/12/2024)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
                    </StyledSelect>
                  </div>
                </CardContent>
              </Card>

              {/* ── POS Behavior ───────────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5 space-y-5">
                  <SectionHeader icon={ShoppingCart} label="POS Behavior" color="navy" />

                  {/* Session & Security */}
                  <div>
                    <SubHeader label="Session & Security" />
                    <div className="max-w-xs space-y-1">
                      <FieldLabel>Auto Logout (minutes)</FieldLabel>
                      <HybridInput
                        type="decimal"
                        className={inputCls}
                        value={settings.autoLogoutMinutes}
                        onChange={(value) => setSettings({ ...settings, autoLogoutMinutes: value })}
                        onTouchKeyboard={() => openKb('autoLogoutMinutes', 'decimal', 'Auto Logout Minutes')}
                      />
                      <p className="text-xs text-slate-500">Minimum 5 minutes for system stability</p>
                    </div>
                  </div>

                  {/* Payment Methods */}
                  <div>
                    <SubHeader label="Payment Methods" />
                    <div className="space-y-4">
                      <div>
                        <FieldLabel>Available Methods (comma-separated)</FieldLabel>
                        <HybridInput
                          className={inputCls}
                          value={settings.availablePaymentMethods}
                          onChange={(value) => setSettings({ ...settings, availablePaymentMethods: value })}
                          placeholder="Cash,Card,ETF/Digital"
                          onTouchKeyboard={() => openKb('availablePaymentMethods', 'qwerty', 'Available Payment Methods')}
                        />
                        <p className="text-xs text-slate-500 mt-1">Payment methods available in POS</p>
                        <PresetBar label="Quick presets:">
                          <PresetBtn label="Standard" onClick={() => setSettings({ ...settings, availablePaymentMethods: "Cash,Card,ETF/Digital" })} />
                          <PresetBtn label="Cash Only" onClick={() => setSettings({ ...settings, availablePaymentMethods: "Cash" })} />
                          <PresetBtn label="Digital Only" onClick={() => setSettings({ ...settings, availablePaymentMethods: "Card,ETF/Digital" })} />
                        </PresetBar>
                      </div>
                      <div className="max-w-xs">
                        <FieldLabel>Default Payment Method</FieldLabel>
                        <StyledSelect
                          value={settings.defaultPaymentMethod}
                          onChange={v => setSettings({ ...settings, defaultPaymentMethod: v })}
                          hint="Selected by default in POS checkout"
                        >
                          {settings.availablePaymentMethods.split(',').map(m => {
                            const t = m.trim(); return t ? <option key={t} value={t}>{t}</option> : null
                          })}
                        </StyledSelect>
                      </div>
                    </div>
                  </div>

                  {/* Transaction Controls & System Preferences */}
                  <div>
                    <SubHeader label="Controls & Preferences" />
                    <div className="space-y-2">
                      <ToggleRow
                        id="managerApproval"
                        checked={settings.requireManagerApprovalForDiscount}
                        onChange={v => setSettings({ ...settings, requireManagerApprovalForDiscount: v })}
                        label="Require Manager Approval for Discounts"
                        sub="Cashier must enter manager PIN to apply any discount"
                      />
                      <ToggleRow
                        id="soundEffects"
                        checked={settings.soundEffectsEnabled}
                        onChange={v => setSettings({ ...settings, soundEffectsEnabled: v })}
                        label="Enable Sound Effects"
                        sub="Beeps and feedback sounds during POS operations"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Receipt & Printing ─────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5 space-y-5">
                  <SectionHeader icon={Receipt} label="Receipt & Printing" color="emerald" />

                  {/* Receipt Content */}
                  <div>
                    <SubHeader label="Receipt Content" />
                    <div className="space-y-3">
                      <div>
                        <FieldLabel>Header Text</FieldLabel>
                        <HybridInput
                          className={inputCls}
                          value={settings.receiptHeaderText || ''}
                          onChange={(value) => setSettings({ ...settings, receiptHeaderText: value })}
                          placeholder="e.g. WELCOME TO BMS PET STORE"
                          onTouchKeyboard={() => openKb('receiptHeaderText', 'qwerty', 'Receipt Header Text')}
                        />
                        <p className="text-xs text-slate-500 mt-1">Business name is managed in Tax Settings.</p>
                      </div>
                      <div>
                        <FieldLabel>Store Location / Address</FieldLabel>
                        <HybridInput
                          className={inputCls}
                          value={settings.storeLocation || ''}
                          onChange={(value) => setSettings({ ...settings, storeLocation: value })}
                          placeholder="Store address or location identifier"
                          onTouchKeyboard={() => openKb('storeLocation', 'qwerty', 'Store Location')}
                        />
                      </div>
                      <div>
                        <FieldLabel>Phone Number</FieldLabel>
                        <HybridInput
                          className={inputCls}
                          value={settings.phoneNumber || ''}
                          onChange={(value) => setSettings({ ...settings, phoneNumber: value })}
                          placeholder="+63 123 456 7890"
                          onTouchKeyboard={() => openKb('phoneNumber', 'qwerty', 'Phone Number')}
                        />
                      </div>
                      <div>
                        <FieldLabel>Footer Text</FieldLabel>
                        <HybridInput
                          className={inputCls}
                          value={settings.receiptFooterText || ''}
                          onChange={(value) => setSettings({ ...settings, receiptFooterText: value })}
                          placeholder="e.g. Thank you for shopping with us!"
                          onTouchKeyboard={() => openKb('receiptFooterText', 'qwerty', 'Receipt Footer Text')}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Printing Configuration */}
                  <div>
                    <SubHeader label="Printing Configuration" />
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <FieldLabel>Paper Size</FieldLabel>
                        <div className="px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-100 text-sm text-slate-500">
                          80mm — Fixed
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Locked for thermal printing</p>
                      </div>
                      <div>
                        <FieldLabel>Font Size</FieldLabel>
                        <StyledSelect value={settings.receiptFontSize} onChange={v => setSettings({ ...settings, receiptFontSize: v })}>
                          <option value="Small">Small</option>
                          <option value="Normal">Normal</option>
                          <option value="Large">Large</option>
                        </StyledSelect>
                      </div>
                      <div>
                        <FieldLabel>Receipt Copies</FieldLabel>
                        <HybridInput
                          type="decimal"
                          className={inputCls}
                          value={settings.receiptCopies}
                          onChange={(value) => setSettings({ ...settings, receiptCopies: value })}
                          onTouchKeyboard={() => openKb('receiptCopies', 'decimal', 'Number of Receipt Copies')}
                        />
                      </div>
                      <div className="col-span-2">
                        <FieldLabel>Template Layout</FieldLabel>
                        <StyledSelect
                          value={settings.receiptTemplateLayout}
                          onChange={v => setSettings({ ...settings, receiptTemplateLayout: v })}
                          hint="Controls how much detail appears on each receipt"
                        >
                          <option value="Compact">Compact — Minimal, fits more on small receipts</option>
                          <option value="Standard">Standard — Balanced with all essential info</option>
                          <option value="Detailed">Detailed — Comprehensive with full product details</option>
                        </StyledSelect>
                        <div className="mt-2">
                          <Button type="button" variant="outline" size="sm"
                            onClick={() => setShowReceiptPreview(true)}
                            className="gap-2 text-emerald-600 border-emerald-300 hover:bg-emerald-50 text-xs">
                            <Eye className="w-3.5 h-3.5" /> Preview Template
                          </Button>
                        </div>
                      </div>
                      <div>
                        <FieldLabel>Default Email</FieldLabel>
                        <HybridInput
                          className={inputCls}
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
                  <div>
                    <SubHeader label="Printing Options" />
                    <div className="space-y-2">
                      <ToggleRow
                        id="printAutomatically"
                        checked={settings.printReceiptAutomatically}
                        onChange={v => setSettings({ ...settings, printReceiptAutomatically: v })}
                        label="Auto-print after payment"
                        sub="Prints receipt immediately when a sale is completed"
                      />
                      <ToggleRow
                        id="showReceiptPreview"
                        checked={settings.showReceiptPreview}
                        onChange={v => setSettings({ ...settings, showReceiptPreview: v })}
                        label="Show preview before printing"
                        sub="Display receipt on screen for confirmation first"
                      />
                      <ToggleRow
                        id="emailReceiptEnabled"
                        checked={settings.emailReceiptEnabled}
                        onChange={v => setSettings({ ...settings, emailReceiptEnabled: v })}
                        label="Enable email receipts"
                        sub="Allow sending receipts to customer email addresses"
                      />
                      <ToggleRow
                        id="showReceiptBarcode"
                        checked={settings.showReceiptBarcode}
                        onChange={v => setSettings({ ...settings, showReceiptBarcode: v })}
                        label="Show transaction barcode"
                        sub="Prints a scannable barcode for easy returns lookup"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Product Management ─────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <SectionHeader icon={Package} label="Product Management" color="navy" />
                  <SubHeader label="Product Categories" />
                  <div>
                    <FieldLabel>Available Categories (comma-separated)</FieldLabel>
                    <HybridInput
                      className={inputCls}
                      value={settings.productCategories || ''}
                      onChange={(value) => setSettings({ ...settings, productCategories: value })}
                      placeholder="Pet Food,Pet Toys,Pet Accessories,Pet Medicine,Pet Grooming,Pet Treats"
                      onTouchKeyboard={() => openKb('productCategories', 'qwerty', 'Product Categories')}
                    />
                    <p className="text-xs text-slate-500 mt-1">Used when adding or editing products in inventory</p>
                    <PresetBar label="Quick presets:">
                      <PresetBtn label="Pet Store Comprehensive" onClick={() => setSettings({ ...settings, productCategories: "Pet Food,Pet Toys,Pet Accessories,Pet Medicine,Pet Grooming,Pet Treats,Pet Beds,Pet Carriers,Pet Collars & Leashes,Pet Bowls & Feeders" })} />
                      <PresetBtn label="Pet Store Basic" onClick={() => setSettings({ ...settings, productCategories: "Pet Food,Pet Toys,Pet Accessories,Pet Medicine" })} />
                      <PresetBtn label="Dog & Cat Focused" onClick={() => setSettings({ ...settings, productCategories: "Dog Food,Cat Food,Dog Toys,Cat Toys,Dog Accessories,Cat Accessories,Pet Medicine,Pet Treats" })} />
                      <PresetBtn label="General Retail" onClick={() => setSettings({ ...settings, productCategories: "Food & Beverages,Electronics,Clothing,Home & Garden,Books,Toys & Games,Sports,Health & Beauty" })} />
                    </PresetBar>
                    <TipNote>Consistent categories improve inventory organisation, reporting, and product search.</TipNote>
                  </div>
                </CardContent>
              </Card>

              {/* ── Returns Policy ─────────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <SectionHeader icon={RotateCcw} label="Returns Policy" color="red" />

                  {/* Master toggle */}
                  <ToggleRow
                    id="enableReturns"
                    checked={settings.enableReturns}
                    onChange={v => setSettings({ ...settings, enableReturns: v })}
                    label="Enable Returns System"
                    sub="Allow cashiers to process product returns and refunds"
                  />

                  {settings.enableReturns && (
                    <div className="mt-5 space-y-5">
                      {/* Return Policies */}
                      <div>
                        <SubHeader label="Return Policies" />
                        <div className="space-y-2">
                          <ToggleRow
                            id="requireReceiptForReturns"
                            checked={settings.requireReceiptForReturns}
                            onChange={v => setSettings({ ...settings, requireReceiptForReturns: v })}
                            label="Require receipt for returns"
                            sub="Customer must present original receipt"
                          />
                          <ToggleRow
                            id="requireManagerApprovalForReturns"
                            checked={settings.requireManagerApprovalForReturns}
                            onChange={v => setSettings({ ...settings, requireManagerApprovalForReturns: v })}
                            label="Require manager approval for all returns"
                            sub="Every return needs manager PIN regardless of amount"
                          />
                          <ToggleRow
                            id="restockReturnedItems"
                            checked={settings.restockReturnedItems}
                            onChange={v => setSettings({ ...settings, restockReturnedItems: v })}
                            label="Auto-restock returned items"
                            sub="Good condition returns are added back to inventory"
                          />
                          <ToggleRow
                            id="allowDefectiveItemReturns"
                            checked={settings.allowDefectiveItemReturns}
                            onChange={v => setSettings({ ...settings, allowDefectiveItemReturns: v })}
                            label="Allow defective / damaged returns"
                            sub="Accept returns for items with defects or damage"
                          />
                        </div>
                      </div>

                      {/* Return Limits */}
                      <div>
                        <SubHeader label="Return Limits" />
                        <div className="grid grid-cols-2 gap-4 max-w-lg">
                          <div>
                            <FieldLabel>Time Limit (days)</FieldLabel>
                            <HybridInput
                              type="decimal"
                              className={inputCls}
                              value={settings.returnTimeLimitDays}
                              onChange={(value) => setSettings({ ...settings, returnTimeLimitDays: value })}
                              onTouchKeyboard={() => openKb('returnTimeLimitDays', 'decimal', 'Return Time Limit (Days)')}
                            />
                            <p className="text-xs text-slate-500 mt-1">Days customer has to return items</p>
                          </div>
                          <div>
                            <FieldLabel>Manager Approval Threshold</FieldLabel>
                            <HybridInput
                              type="decimal"
                              className={inputCls}
                              value={settings.returnManagerApprovalAmount}
                              onChange={(value) => setSettings({ ...settings, returnManagerApprovalAmount: value })}
                              onTouchKeyboard={() => openKb('returnManagerApprovalAmount', 'decimal', 'Manager Approval Amount')}
                            />
                            <p className="text-xs text-slate-500 mt-1">Returns above this require manager PIN</p>
                          </div>
                        </div>
                      </div>

                      {/* Return Reasons */}
                      <div>
                        <SubHeader label="Return Reasons" />
                        <FieldLabel>Reasons (comma-separated)</FieldLabel>
                        <HybridInput
                          className={inputCls}
                          value={settings.returnReasons}
                          onChange={(value) => setSettings({ ...settings, returnReasons: value })}
                          placeholder="Defective Product,Wrong Size,Pet Doesn't Like,Changed Mind,Other"
                          onTouchKeyboard={() => openKb('returnReasons', 'qwerty', 'Return Reasons')}
                        />
                        <PresetBar label="Quick presets:">
                          <PresetBtn label="Pet Store Default" onClick={() => setSettings({ ...settings, returnReasons: "Defective Product,Wrong Size,Pet Doesn't Like,Food Allergies,Damaged Package,Changed Mind,Other" })} />
                          <PresetBtn label="Simple" onClick={() => setSettings({ ...settings, returnReasons: "Defective,Wrong Item,Changed Mind,No Receipt,Other" })} />
                          <PresetBtn label="Detailed" onClick={() => setSettings({ ...settings, returnReasons: "Product Defect,Size Issue,Pet Allergic Reaction,Vet Recommendation,Wrong Item Ordered,Customer Changed Mind,Damaged in Transit,Other" })} />
                        </PresetBar>
                        <TipNote>Customise these reasons based on what you commonly see at your store.</TipNote>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Save ───────────────────────────────────────────── */}
              <div className="flex justify-end pb-2">
                <Button
                  onClick={saveSettings}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 gap-2"
                >
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                  ) : (
                    <><Save className="w-4 h-4" />Save Settings</>
                  )}
                </Button>
              </div>

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
          )}
        </main>
      </div>
    </SessionGuard>
  )
}

export default SystemSettings