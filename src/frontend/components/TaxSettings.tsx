import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Receipt, Plus, Save, CheckCircle2,
  XCircle, Percent, FileText
} from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import ApiClient from '../utils/ApiClient'
import { useToast } from '../contexts/ToastContext'
import PageHeader from './ui/PageHeader'
import { SectionLoader } from './ui/LoadingSpinner'

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
  const { showToast } = useToast()

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
      // Check if it's missing tax settings (expected) vs actual error
      if (err instanceof Error && (err.message.includes('404') || err.message.includes('Tax settings not configured'))) {
        console.log('No tax settings found, using defaults - this is normal for new setup')
        // Don't show alert for missing tax settings - it's expected behavior
      } else {
        showToast('Failed to load tax settings. Please refresh.', 'error')
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
      showToast('Tax settings saved successfully', 'success')
      
      // Refresh business settings to update header display
      await refreshBusinessSettings()
    } catch (err) {
      showToast('Failed to save tax settings. Please try again.', 'error')
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


  // ── Shared helpers ────────────────────────────────────────────────────────

  const SectionHeader = ({ icon: Icon, label, color = 'emerald' }: {
    icon: React.ElementType; label: string; color?: 'emerald' | 'navy'
  }) => {
    const cls = {
      emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      navy:    'text-[hsl(215,65%,30%)] bg-slate-50 border-slate-200',
    }[color]
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cls} mb-4`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm font-semibold tracking-wide uppercase">{label}</span>
      </div>
    )
  }

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{children}</label>
  )

  const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
        <PageHeader
          title="Tax Settings"
          subtitle="Configure sales tax for your business"
          onBack={() => navigate('/manager')}
          right={<SessionStatus />}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50">
          {loading ? (
            <SectionLoader message="Loading tax settings..." />
          ) : (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

              {/* ── Business Information ───────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <SectionHeader icon={Building2} label="Business Information" color="emerald" />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Business Name</FieldLabel>
                      <HybridInput
                        className={inputCls}
                        value={settings.businessName}
                        onChange={(value) => updateSetting('businessName', value)}
                        onTouchKeyboard={() => openKb('businessName', 'qwerty', 'Business Name')}
                        placeholder="Enter business name"
                      />
                    </div>
                    <div>
                      <FieldLabel>Tax / Registration Number</FieldLabel>
                      <HybridInput
                        className={inputCls}
                        value={settings.taxNumber}
                        onChange={(value) => updateSetting('taxNumber', value)}
                        onTouchKeyboard={() => openKb('taxNumber', 'qwerty', 'Tax Registration Number')}
                        placeholder="Enter tax registration number"
                      />
                    </div>
                    <div className="col-span-2">
                      <FieldLabel>Business Address</FieldLabel>
                      <HybridInput
                        className={inputCls}
                        value={settings.businessAddress}
                        onChange={(value) => updateSetting('businessAddress', value)}
                        onTouchKeyboard={() => openKb('businessAddress', 'qwerty', 'Business Address')}
                        placeholder="Enter complete business address"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Tax Configuration ──────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5 space-y-4">
                  <SectionHeader icon={Percent} label="Tax Configuration" color="navy" />

                  {/* Master toggle */}
                  <ToggleRow
                    id="enableTax"
                    checked={settings.enableTax}
                    onChange={v => updateSetting('enableTax', v)}
                    label="Enable Tax on Sales"
                    sub="Turn off if your business doesn't charge tax on products"
                  />

                  {settings.enableTax && (
                    <div className="space-y-4 pt-1">
                      {/* Primary Tax */}
                      <div className="grid grid-cols-2 gap-4 px-4 py-4 rounded-lg border border-slate-100 bg-slate-50">
                        <div>
                          <FieldLabel>Tax Name</FieldLabel>
                          <HybridInput
                            className={inputCls}
                            value={settings.taxName}
                            onChange={(value) => updateSetting('taxName', value)}
                            onTouchKeyboard={() => openKb('taxName', 'qwerty', 'Tax Name')}
                            placeholder="e.g. Sales Tax, VAT, GST"
                          />
                        </div>
                        <div>
                          <FieldLabel>Tax Rate (%)</FieldLabel>
                          <HybridInput
                            type="decimal"
                            className={inputCls}
                            value={settings.taxRate.toString()}
                            onChange={(value) => updateSetting('taxRate', parseFloat(value) || 0)}
                            onTouchKeyboard={() => openKb('taxRate', 'decimal', 'Tax Rate (%)')}
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {/* Secondary Tax */}
                      <div className="space-y-3">
                        <ToggleRow
                          id="enableSecondaryTax"
                          checked={settings.enableSecondaryTax}
                          onChange={v => updateSetting('enableSecondaryTax', v)}
                          label="Add Secondary Tax"
                          sub="Some regions have multiple taxes (e.g. State + Federal, VAT + Service Tax)"
                        />

                        {settings.enableSecondaryTax && (
                          <div className="grid grid-cols-2 gap-4 px-4 py-4 rounded-lg border border-slate-100 bg-slate-50">
                            <div>
                              <FieldLabel>Secondary Tax Name</FieldLabel>
                              <HybridInput
                                className={inputCls}
                                value={settings.secondaryTaxName}
                                onChange={(value) => updateSetting('secondaryTaxName', value)}
                                onTouchKeyboard={() => openKb('secondaryTaxName', 'qwerty', 'Secondary Tax Name')}
                                placeholder="e.g. Service Tax, City Tax"
                              />
                            </div>
                            <div>
                              <FieldLabel>Secondary Tax Rate (%)</FieldLabel>
                              <HybridInput
                                type="decimal"
                                className={inputCls}
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
                      <ToggleRow
                        id="enableTaxExemptions"
                        checked={settings.enableTaxExemptions}
                        onChange={v => updateSetting('enableTaxExemptions', v)}
                        label="Allow Tax-Exempt Sales"
                        sub='Adds a "Tax Exempt" option in POS for special customers or products'
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Additional Settings ────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <SectionHeader icon={FileText} label="Additional Settings" color="emerald" />
                  <FieldLabel>Notes</FieldLabel>
                  <HybridInput
                    className={inputCls}
                    value={settings.notes}
                    onChange={(value) => updateSetting('notes', value)}
                    onTouchKeyboard={() => openKb('notes', 'qwerty', 'Tax Notes')}
                    placeholder="Special tax notes, exemptions, or compliance requirements for your region…"
                  />
                </CardContent>
              </Card>

              {/* ── Current Configuration Summary ──────────────────── */}
              <Card className="border-[hsl(215,65%,30%)]/20 shadow-sm bg-[hsl(215,65%,30%)]/5">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Receipt className="w-4 h-4 text-[hsl(215,65%,30%)]" />
                    <span className="text-sm font-semibold uppercase tracking-wide text-[hsl(215,65%,30%)]">Current Configuration</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white border border-slate-200">
                      {settings.enableTax
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        : <XCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                      <div>
                        <p className="text-xs text-slate-500">Tax Status</p>
                        <p className="text-sm font-semibold text-slate-800">{settings.enableTax ? 'Enabled' : 'Disabled'}</p>
                      </div>
                    </div>

                    {settings.enableTax && (
                      <>
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white border border-slate-200">
                          <Percent className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-slate-500">Primary Tax</p>
                            <p className="text-sm font-semibold text-slate-800">{settings.taxName} ({settings.taxRate}%)</p>
                          </div>
                        </div>

                        {settings.enableSecondaryTax && (
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white border border-slate-200">
                            <Plus className="w-4 h-4 text-[hsl(215,65%,30%)] flex-shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500">Secondary Tax</p>
                              <p className="text-sm font-semibold text-slate-800">{settings.secondaryTaxName} ({settings.secondaryTaxRate}%)</p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white border border-slate-200">
                          {settings.enableTaxExemptions
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            : <XCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                          <div>
                            <p className="text-xs text-slate-500">Tax Exemptions</p>
                            <p className="text-sm font-semibold text-slate-800">{settings.enableTaxExemptions ? 'Allowed' : 'Not Allowed'}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* ── Action Buttons ─────────────────────────────────── */}
              <div className="flex gap-3 justify-end pb-2">
                <Button variant="outline" onClick={() => navigate('/manager')} className="text-slate-600">
                  Cancel
                </Button>
                <Button
                  onClick={saveTaxSettings}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6"
                >
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                  ) : (
                    <><Save className="w-4 h-4" />Save Tax Settings</>
                  )}
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