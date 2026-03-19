import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Delete, ShieldCheck } from 'lucide-react'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionManager from '../utils/SessionManager'
import { useKeyboardSound } from '../utils/useKeyboardSound'
import ApiClient from '../utils/ApiClient'
import { useToast } from '../contexts/ToastContext'

type CurrentField = 'employeeId' | 'pin'

// ── Live clock shown on the branding panel ──────────────────────────────────
const LiveClock: React.FC = () => {
  const [now, setNow] = React.useState(new Date())
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="text-center select-none">
      <p className="text-4xl font-light text-white tracking-tight tabular-nums">
        {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </p>
      <p className="text-sm text-white/60 mt-1">
        {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>
    </div>
  )
}

// ── PIN dot row ──────────────────────────────────────────────────────────────
const PinDots: React.FC<{ length: number; max?: number }> = ({ length, max = 6 }) => (
  <div className="flex gap-2 justify-center">
    {Array.from({ length: max }).map((_, i) => (
      <div
        key={i}
        className={`w-3 h-3 rounded-full border-2 transition-all duration-100 ${
          i < length ? 'bg-emerald-500 border-emerald-500 scale-110' : 'border-slate-300'
        }`}
      />
    ))}
  </div>
)

// ── Keypad ───────────────────────────────────────────────────────────────────
interface KeypadProps {
  onDigit: (d: string) => void
  onBackspace: () => void
  onClear: () => void
  onSubmit: () => void
  submitLabel: string
  submitDisabled?: boolean
}

const Keypad: React.FC<KeypadProps> = ({ onDigit, onBackspace, onClear, onSubmit, submitLabel, submitDisabled }) => (
  <div className="grid grid-cols-3 gap-2.5">
    {[1,2,3,4,5,6,7,8,9].map(n => (
      <button
        key={n}
        onClick={() => onDigit(String(n))}
        className="h-14 bg-slate-50 hover:bg-slate-100 active:scale-95 border border-slate-200 rounded-xl text-xl font-semibold text-slate-700 transition-all shadow-sm"
      >
        {n}
      </button>
    ))}
    <button
      onClick={onClear}
      className="h-14 bg-red-50 hover:bg-red-100 active:scale-95 border border-red-200 rounded-xl text-xs font-bold text-red-600 transition-all shadow-sm"
    >
      CLR
    </button>
    <button
      onClick={() => onDigit('0')}
      className="h-14 bg-slate-50 hover:bg-slate-100 active:scale-95 border border-slate-200 rounded-xl text-xl font-semibold text-slate-700 transition-all shadow-sm"
    >
      0
    </button>
    <button
      onClick={onBackspace}
      className="h-14 bg-amber-50 hover:bg-amber-100 active:scale-95 border border-amber-200 rounded-xl text-amber-700 transition-all shadow-sm flex items-center justify-center"
    >
      <Delete className="w-5 h-5" />
    </button>
    <button
      onClick={onSubmit}
      disabled={submitDisabled}
      className="col-span-3 h-14 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-base transition-all shadow-md"
    >
      {submitLabel}
    </button>
  </div>
)

// ── Main component ───────────────────────────────────────────────────────────
const Login: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { businessSettings, loading } = useBusinessSettings()
  const { playKeySound } = useKeyboardSound()
  const { showToast } = useToast()

  const [currentField, setCurrentField] = useState<CurrentField>('employeeId')
  const [employeeId, setEmployeeId] = useState('')
  const [pin, setPin] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const [pendingEmployee, setPendingEmployee] = useState<{
    id: number; name: string; role: string; isManager: boolean; token: string; landingPage: string
  } | null>(null)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinChangeStep, setPinChangeStep] = useState<'new' | 'confirm'>('new')

  React.useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('reason') === 'expired') {
      showToast('Your session has expired. Please log in again.', 'warning')
    }
  }, [location.search, showToast])

  const inputNumber = (num: string) => {
    playKeySound()
    if (currentField === 'employeeId') {
      if (employeeId.length < 10) setEmployeeId(prev => prev + num)
    } else {
      if (pin.length < 6) setPin(prev => prev + num)
    }
  }

  const backspace = () => {
    playKeySound()
    if (currentField === 'employeeId') setEmployeeId(prev => prev.slice(0, -1))
    else setPin(prev => prev.slice(0, -1))
  }

  const clearField = () => {
    playKeySound()
    if (currentField === 'employeeId') setEmployeeId('')
    else setPin('')
  }

  const clearAll = () => {
    setEmployeeId('')
    setPin('')
    setCurrentField('employeeId')
    setStatusMessage('')
  }

  const login = async () => {
    if (!employeeId || !pin) {
      setStatusMessage('Please enter both Employee ID and PIN')
      return
    }
    try {
      setStatusMessage('Verifying…')
      let result
      if (window.electronAPI?.validateLogin) {
        result = await window.electronAPI.validateLogin(employeeId, pin, undefined)
      } else {
        result = await ApiClient.postJson('/auth/login', { employeeId, pin }, false)
      }

      if (result.success && result.data?.employee) {
        setStatusMessage(`Welcome, ${result.data.employee.name}!`)
        if (result.data?.token) SessionManager.setToken(result.data.token)

        const fullRole = result.data.employee.role || (result.data.employee.isManager ? 'Manager' : 'Cashier')
        await SessionManager.createSession({
          id: result.data.employee.id,
          employeeId: result.data.employee.employeeId,
          name: result.data.employee.name,
          role: fullRole,
          isManager: result.data.employee.isManager || fullRole.includes('Manager'),
        })

        const roles = fullRole.split(',').map((r: string) => r.trim())
        const hasCashier = roles.includes('Cashier')
        const hasInventory = roles.includes('Inventory')
        const landingPage = roles.includes('Manager')
          ? '/manager'
          : hasCashier && hasInventory ? '/cashier-inventory'
          : hasCashier ? '/cashier-dashboard'
          : hasInventory ? '/inventory-dashboard'
          : '/pos'

        if (result.data.employee.mustChangePinOnNextLogin) {
          setPendingEmployee({
            id: result.data.employee.id,
            name: result.data.employee.name,
            role: fullRole,
            isManager: result.data.employee.isManager || fullRole.includes('Manager'),
            token: result.data.token,
            landingPage,
          })
          return
        }

        window.dispatchEvent(new CustomEvent('bms:logged-in'))
        setTimeout(() => navigate(landingPage), 900)
      } else {
        const isLockout = result.message?.toLowerCase().includes('locked')
        showToast(isLockout ? result.message : 'Invalid Employee ID or PIN', 'error')
        clearAll()
      }
    } catch {
      showToast('Login failed. Please check your connection and try again.', 'error')
      setStatusMessage('')
    }
  }

  // ── PIN change handlers ──────────────────────────────────────────────────
  const pinChangeInput = (num: string) => {
    playKeySound()
    if (pinChangeStep === 'new') {
      if (newPin.length < 6) setNewPin(prev => prev + num)
    } else {
      if (confirmPin.length < 6) setConfirmPin(prev => prev + num)
    }
  }

  const pinChangeBackspace = () => {
    playKeySound()
    if (pinChangeStep === 'new') setNewPin(prev => prev.slice(0, -1))
    else setConfirmPin(prev => prev.slice(0, -1))
  }

  const pinChangeClear = () => {
    playKeySound()
    if (pinChangeStep === 'new') setNewPin('')
    else setConfirmPin('')
  }

  const pinChangeSubmit = async () => {
    if (!pendingEmployee) return
    if (pinChangeStep === 'new') {
      if (newPin.length < 4) { showToast('PIN must be at least 4 digits', 'warning'); return }
      setPinChangeStep('confirm')
      return
    }
    if (newPin !== confirmPin) {
      showToast('PINs do not match. Try again.', 'error')
      setNewPin(''); setConfirmPin(''); setPinChangeStep('new')
      return
    }
    try {
      SessionManager.setToken(pendingEmployee.token)
      await ApiClient.put(`/employees/${pendingEmployee.id}/reset-pin`, { newPin })
      await SessionManager.createSession({
        id: pendingEmployee.id,
        employeeId: String(pendingEmployee.id),
        name: pendingEmployee.name,
        role: pendingEmployee.role,
        isManager: pendingEmployee.isManager,
      })
      showToast('PIN updated successfully', 'success')
      window.dispatchEvent(new CustomEvent('bms:logged-in'))
      setTimeout(() => navigate(pendingEmployee.landingPage), 800)
    } catch {
      showToast('Failed to update PIN. Please try again.', 'error')
      setNewPin(''); setConfirmPin(''); setPinChangeStep('new')
    }
  }

  const brandInitial = loading ? '…' : (businessSettings.businessName?.[0]?.toUpperCase() || 'B')
  const brandName    = loading ? 'Loading…' : (businessSettings.businessName || 'Point of Sale')

  // ── PIN change screen ────────────────────────────────────────────────────
  if (pendingEmployee) {
    const currentPinValue = pinChangeStep === 'new' ? newPin : confirmPin
    return (
      <div className="w-full h-full flex overflow-hidden" style={{ background: 'hsl(215,65%,30%)' }}>
        {/* Branding side */}
        <div className="hidden lg:flex flex-col items-center justify-center flex-[2] p-12 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
            <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-emerald-500/10" />
          </div>
          <div className="relative z-10 text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/15 border border-white/20 backdrop-blur">
              <span className="text-4xl font-bold text-white">{brandInitial}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{brandName}</h1>
              <p className="text-white/50 text-sm mt-1">Point of Sale System</p>
            </div>
            <LiveClock />
          </div>
        </div>

        {/* PIN change card */}
        <div className="flex flex-col items-center justify-center flex-[3] bg-slate-50 p-6">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm p-7">
            <div className="flex flex-col items-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
                <ShieldCheck className="w-7 h-7 text-amber-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Set a New PIN</h2>
              <p className="text-sm text-slate-500 mt-1 text-center">
                Hi {pendingEmployee.name} — your default PIN must be changed before continuing.
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-5">
              {(['new', 'confirm'] as const).map((step, i) => (
                <React.Fragment key={step}>
                  <div className={`flex-1 h-1.5 rounded-full transition-colors ${
                    pinChangeStep === step || (step === 'new' && pinChangeStep === 'confirm')
                      ? 'bg-emerald-500' : 'bg-slate-200'
                  }`} />
                </React.Fragment>
              ))}
            </div>

            <p className="text-sm font-semibold text-slate-700 text-center mb-4">
              {pinChangeStep === 'new' ? 'Enter new PIN' : 'Confirm new PIN'}
            </p>

            <div className="mb-6">
              <PinDots length={currentPinValue.length} />
            </div>

            <Keypad
              onDigit={pinChangeInput}
              onBackspace={pinChangeBackspace}
              onClear={pinChangeClear}
              onSubmit={pinChangeSubmit}
              submitLabel={pinChangeStep === 'new' ? 'Next →' : 'Set PIN'}
              submitDisabled={currentPinValue.length < 4}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Login screen ─────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex overflow-hidden" style={{ background: 'hsl(215,65%,30%)' }}>

      {/* ── Left branding panel ────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col items-center justify-center flex-[2] p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
          <div className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-emerald-500/10" />
        </div>

        <div className="relative z-10 text-center space-y-8">
          {/* Logo */}
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-white/15 border border-white/20 backdrop-blur shadow-2xl">
            <span className="text-5xl font-bold text-white">{brandInitial}</span>
          </div>

          <div>
            <h1 className="text-3xl font-bold text-white leading-tight">{brandName}</h1>
            <p className="text-white/50 text-sm mt-2 tracking-wide uppercase">Point of Sale</p>
          </div>

          <LiveClock />

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-400/30">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-200 text-xs font-medium">System Ready</span>
          </div>
        </div>
      </div>

      {/* ── Right login panel ──────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center flex-[3] bg-slate-50 p-6">

        {/* Mobile logo */}
        <div className="lg:hidden mb-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3" style={{ background: 'hsl(215,65%,30%)' }}>
            <span className="text-3xl font-bold text-white">{brandInitial}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800">{brandName}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-sm p-6">

          <div className="mb-5 text-center">
            <h2 className="text-xl font-bold text-slate-800">Welcome back</h2>
            <p className="text-sm text-slate-500 mt-0.5">Sign in with your Employee ID and PIN</p>
          </div>

          {/* ── Field tabs ──────────────────────────────────────────────── */}
          <div className="space-y-2.5 mb-4">

            {/* Employee ID */}
            <button
              onClick={() => { playKeySound(); setCurrentField('employeeId') }}
              className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${
                currentField === 'employeeId'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                    Employee ID
                  </span>
                  <span className={`text-sm font-mono font-semibold ${employeeId ? 'text-slate-800' : 'text-slate-300'}`}>
                    {employeeId || '—'}
                  </span>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                  currentField === 'employeeId' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-200'
                }`} />
              </div>
            </button>

            {/* PIN */}
            <button
              onClick={() => { playKeySound(); setCurrentField('pin') }}
              className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all ${
                currentField === 'pin'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    PIN
                  </span>
                  <div className="flex gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className={`w-2.5 h-2.5 rounded-full border-2 transition-all ${
                        i < pin.length ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                      }`} />
                    ))}
                  </div>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                  currentField === 'pin' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-200'
                }`} />
              </div>
            </button>
          </div>

          {/* Status message — only shown when meaningful */}
          {statusMessage && (
            <div className={`px-3 py-2 rounded-lg text-xs font-medium text-center mb-3 ${
              statusMessage.includes('Welcome')
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-50 text-slate-600 border border-slate-200'
            }`}>
              {statusMessage}
            </div>
          )}

          {/* Keypad */}
          <Keypad
            onDigit={inputNumber}
            onBackspace={backspace}
            onClear={clearField}
            onSubmit={login}
            submitLabel="Sign In →"
            submitDisabled={!employeeId || !pin}
          />
        </div>
      </div>
    </div>
  )
}

export default Login
