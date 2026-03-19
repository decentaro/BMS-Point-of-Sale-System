import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Delete } from 'lucide-react'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionManager from '../utils/SessionManager'
import { useKeyboardSound } from '../utils/useKeyboardSound'
import ApiClient from '../utils/ApiClient'
import { useToast } from '../contexts/ToastContext'

type CurrentField = 'employeeId' | 'pin'

const Login: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { businessSettings, loading } = useBusinessSettings()
  const { playKeySound } = useKeyboardSound()
  const { showToast } = useToast()
  const [currentField, setCurrentField] = useState<CurrentField>('employeeId')
  const [employeeId, setEmployeeId] = useState('')
  const [pin, setPin] = useState('')
  const [statusMessage, setStatusMessage] = useState('Please sign in')
  const [pendingEmployee, setPendingEmployee] = useState<{ id: number; name: string; role: string; isManager: boolean; token: string; landingPage: string } | null>(null)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinChangeStep, setPinChangeStep] = useState<'new' | 'confirm'>('new')

  const inputNumber = (num: string) => {
    playKeySound()
    if (currentField === 'employeeId') {
      if (employeeId.length < 10) {
        setEmployeeId(employeeId + num)
      }
    } else if (currentField === 'pin') {
      if (pin.length < 6) {
        setPin(pin + num)
      }
    }
  }

  React.useEffect(() => {
    if (currentField === 'employeeId') {
      setStatusMessage('Enter your Employee ID')
    } else if (currentField === 'pin') {
      setStatusMessage('Enter your PIN')
    }
  }, [currentField])

  React.useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('reason') === 'expired') {
      showToast('Your session has expired. Please log in again.', 'warning')
    }
  }, [location.search, showToast])

  const backspace = () => {
    playKeySound()
    if (currentField === 'employeeId' && employeeId.length > 0) {
      setEmployeeId(employeeId.slice(0, -1))
    } else if (currentField === 'pin' && pin.length > 0) {
      setPin(pin.slice(0, -1))
    }
  }

  const clearCurrentField = () => {
    playKeySound()
    if (currentField === 'employeeId') {
      setEmployeeId('')
      setStatusMessage('Employee ID field cleared')
    } else if (currentField === 'pin') {
      setPin('')
      setStatusMessage('PIN field cleared')
    }
  }

  const clearAll = () => {
    setEmployeeId('')
    setPin('')
    setCurrentField('employeeId')
    setStatusMessage('All fields cleared')
  }

  const login = async () => {
    if (!employeeId || !pin) {
      setStatusMessage('Please enter both Employee ID and PIN')
      return
    }

    try {
      setStatusMessage('Validating credentials...')

      let result
      if (window.electronAPI?.validateLogin) {
        result = await window.electronAPI.validateLogin(employeeId, pin, undefined)
      } else {
        result = await ApiClient.postJson('/auth/login', { employeeId, pin }, false)
      }

      if (result.success && result.data?.employee) {
        setStatusMessage(`Welcome ${result.data.employee.name}!`)

        if (result.data?.token) {
          SessionManager.setToken(result.data.token)
        }

        const fullRole = result.data.employee.role || (result.data.employee.isManager ? 'Manager' : 'Cashier')

        await SessionManager.createSession({
          id: result.data.employee.id,
          employeeId: result.data.employee.employeeId,
          name: result.data.employee.name,
          role: fullRole,
          isManager: result.data.employee.isManager || fullRole.includes('Manager')
        })

        const roles = fullRole.split(',').map((r: string) => r.trim())
        const hasCashier = roles.includes('Cashier')
        const hasInventory = roles.includes('Inventory')
        const landingPage = roles.includes('Manager')
          ? '/manager'
          : hasCashier && hasInventory
          ? '/cashier-inventory'
          : hasCashier
          ? '/cashier-dashboard'
          : hasInventory
          ? '/inventory-dashboard'
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
          setStatusMessage('Please set a new PIN')
          return
        }

        window.dispatchEvent(new CustomEvent('bms:logged-in'))
        setTimeout(() => navigate(landingPage), 1000)
      } else {
        const isLockout = result.message?.toLowerCase().includes('locked')
        const errorMessage = isLockout ? result.message : 'Invalid Employee ID or PIN'
        showToast(errorMessage, 'error')
        clearAll()
        setStatusMessage('Please sign in')
      }
    } catch (error) {
      console.error('Login error:', error)
      showToast('Login failed. Please check your connection and try again.', 'error')
      setStatusMessage('Please sign in')
    }
  }

  const handlePinChangeInput = (num: string) => {
    playKeySound()
    if (pinChangeStep === 'new') {
      if (newPin.length < 6) setNewPin(prev => prev + num)
    } else {
      if (confirmPin.length < 6) setConfirmPin(prev => prev + num)
    }
  }

  const handlePinChangeBackspace = () => {
    playKeySound()
    if (pinChangeStep === 'new') setNewPin(prev => prev.slice(0, -1))
    else setConfirmPin(prev => prev.slice(0, -1))
  }

  const handlePinChangeSubmit = async () => {
    if (!pendingEmployee) return
    if (pinChangeStep === 'new') {
      if (newPin.length < 4) { showToast('PIN must be at least 4 digits', 'warning'); return }
      setPinChangeStep('confirm')
      return
    }
    if (newPin !== confirmPin) {
      showToast('PINs do not match. Try again.', 'error')
      setNewPin('')
      setConfirmPin('')
      setPinChangeStep('new')
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
      setNewPin('')
      setConfirmPin('')
      setPinChangeStep('new')
    }
  }

  if (pendingEmployee) {
    const currentPinValue = pinChangeStep === 'new' ? newPin : confirmPin
    const label = pinChangeStep === 'new' ? 'Enter new PIN' : 'Confirm new PIN'
    return (
      <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 w-80 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mb-4">
            <span className="text-2xl">🔐</span>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-1">Set a new PIN</h2>
          <p className="text-sm text-slate-500 mb-4">Your default PIN must be changed before you can continue.</p>
          <p className="text-sm font-medium text-slate-700 mb-2">{label}</p>
          <div className="flex justify-center gap-2 mb-6">
            {[0,1,2,3,4,5].map(i => (
              <div key={i} className={`w-3 h-3 rounded-full border-2 ${i < currentPinValue.length ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key) => (
              <button
                key={key}
                onClick={() => key === '⌫' ? handlePinChangeBackspace() : key ? handlePinChangeInput(key) : undefined}
                disabled={!key}
                className={`h-12 rounded-lg font-semibold text-lg transition-colors ${
                  key === '⌫' ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                  : key ? 'bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-200'
                  : 'invisible'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
          <button
            onClick={handlePinChangeSubmit}
            disabled={currentPinValue.length < 4}
            className="w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pinChangeStep === 'new' ? 'Next' : 'Set PIN'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col lg:flex-row overflow-hidden">
      {/* Left Panel - Login Form */}
      <div className="flex flex-col p-3 flex-1 lg:flex-[2]">
        <div className="bg-white rounded-xl shadow-md border border-slate-200 flex-1 flex flex-col p-5 max-w-none">
          {/* Brand */}
          <div className="mb-4 text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 mb-2">
              <span className="text-white font-bold text-lg">
                {loading ? '?' : (businessSettings.businessName?.[0] || 'B')}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              {loading ? 'Loading...' : (businessSettings.businessName || 'Business Login')}
            </h1>
            <p className="text-xs text-slate-500">Sign in to continue</p>
          </div>

          <div className="flex-1 space-y-3">
            {/* Employee ID */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">
                Employee ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={employeeId}
                  placeholder="Enter Employee ID"
                  onClick={() => {
                    playKeySound()
                    setCurrentField('employeeId')
                  }}
                  readOnly
                  className={`
                    w-full h-10 px-3 text-sm font-mono bg-white border-2 rounded-lg
                    transition-all cursor-pointer
                    ${currentField === 'employeeId'
                      ? 'border-emerald-500 ring-2 ring-emerald-100'
                      : 'border-slate-200 hover:border-slate-300'
                    }
                  `}
                />
                {currentField === 'employeeId' && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                )}
              </div>
            </div>

            {/* PIN */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5 block">
                PIN
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={'●'.repeat(pin.length)}
                  placeholder="Enter PIN"
                  onClick={() => {
                    playKeySound()
                    setCurrentField('pin')
                  }}
                  readOnly
                  className={`
                    w-full h-10 px-3 text-sm font-mono bg-white border-2 rounded-lg
                    transition-all cursor-pointer
                    ${currentField === 'pin'
                      ? 'border-emerald-500 ring-2 ring-emerald-100'
                      : 'border-slate-200 hover:border-slate-300'
                    }
                  `}
                />
                {currentField === 'pin' && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                )}
              </div>
            </div>

            {/* Status */}
            <div
              className={`
                px-3 py-2 rounded-lg text-center text-xs font-medium border
                ${statusMessage.includes('Welcome')
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
                }
              `}
            >
              {statusMessage}
            </div>

            {/* Active field indicator */}
            <div className="text-center">
              <span className="text-[10px] text-slate-400">Entering: </span>
              <span className="text-[10px] font-semibold text-emerald-600">
                {currentField === 'employeeId' ? 'Employee ID' : 'PIN'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Keypad */}
      <div className="flex flex-col p-3 flex-1 lg:max-w-sm">
        <div className="bg-white rounded-xl shadow-md border border-slate-200 flex-1 p-4 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 text-center">Keypad</h3>
          <div className="grid grid-cols-3 gap-2 flex-1 content-center">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => inputNumber(num.toString())}
                className="aspect-square bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded-lg text-base font-semibold text-slate-700 transition-all min-h-[2.5rem] flex items-center justify-center"
              >
                {num}
              </button>
            ))}
            <button
              onClick={clearCurrentField}
              className="aspect-square bg-red-50 hover:bg-red-100 active:bg-red-200 border border-red-200 rounded-lg text-xs font-semibold text-red-600 transition-all min-h-[2.5rem] flex items-center justify-center"
            >
              CLR
            </button>
            <button
              onClick={() => inputNumber('0')}
              className="aspect-square bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded-lg text-base font-semibold text-slate-700 transition-all min-h-[2.5rem] flex items-center justify-center"
            >
              0
            </button>
            <button
              onClick={backspace}
              className="aspect-square bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-200 rounded-lg text-base font-medium text-amber-700 transition-all min-h-[2.5rem] flex items-center justify-center"
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={login}
            className="mt-3 h-12 w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-sm font-semibold transition-all shadow-sm"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  )
}

export default Login
