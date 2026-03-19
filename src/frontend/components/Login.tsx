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
  }, [])

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
