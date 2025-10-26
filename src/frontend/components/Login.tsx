import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionManager from '../utils/SessionManager'
import { useKeyboardSound } from '../utils/useKeyboardSound'
import ApiClient from '../utils/ApiClient'

type Role = 'Cashier' | 'Inventory' | 'Manager'
type CurrentField = 'employeeId' | 'pin'

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { businessSettings, loading } = useBusinessSettings()
  const { playKeySound } = useKeyboardSound()
  const [currentField, setCurrentField] = useState<CurrentField>('employeeId')
  const [employeeId, setEmployeeId] = useState('')
  const [pin, setPin] = useState('')
  const [selectedRole, setSelectedRole] = useState<Role>('Cashier')
  const [statusMessage, setStatusMessage] = useState('Please sign in')
  
  // Debug: Check if Electron API is available
  React.useEffect(() => {
    console.log('Electron API availability:', {
      electronAPI: !!window.electronAPI,
      validateLogin: !!window.electronAPI?.validateLogin,
      debug: window.electronAPI?.debug?.()
    })
  }, [])

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

  // Update status message based on current field
  React.useEffect(() => {
    if (currentField === 'employeeId') {
      setStatusMessage('Enter your Employee ID')
    } else if (currentField === 'pin') {
      setStatusMessage('Enter your PIN')
    }
  }, [currentField])

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
      
      // Check if Electron API is available, otherwise fallback to direct HTTP
      let result
      if (window.electronAPI?.validateLogin) {
        console.log('Using Electron API for login')
        result = await window.electronAPI.validateLogin(employeeId, pin, selectedRole)
      } else {
        console.log('Electron API not available, using direct HTTP fallback')
        // Fallback to direct API call if Electron API is not available
        result = await ApiClient.postJson('/auth/login', { employeeId, pin, selectedRole }, false)
      }

      if (result.success && result.data?.employee) {
        const employeeRole = result.data.employee.role || (result.data.employee.isManager ? 'Manager' : 'Cashier')

        setStatusMessage(`Welcome ${result.data.employee.name}!`)

        // Create secure session
        await SessionManager.createSession({
          id: result.data.employee.id,
          employeeId: result.data.employee.employeeId,
          name: result.data.employee.name,
          role: employeeRole,
          isManager: result.data.employee.isManager || employeeRole === 'Manager'
        })

        // Navigate based on role
        setTimeout(() => {
          switch (employeeRole) {
            case 'Manager':
              navigate('/manager')
              break
            case 'Cashier':
              navigate('/manager')  // Cashiers also go to main dashboard
              break
            case 'Inventory':
              navigate('/inventory-dashboard')
              break
            default:
              setStatusMessage('Unknown role - contact administrator')
          }
        }, 1000)
      } else {
        const errorMessage = result.message || 'Invalid Employee ID or PIN'
        alert(`Login Failed!\n\n${errorMessage}\n\nPlease check your credentials and try again.`)
        clearAll()
        setStatusMessage('Please sign in')
      }
    } catch (error) {
      console.error('Login error:', error)
      alert(`Login Failed!\n\nLogin failed - Please try again\n\nPlease check your connection and try again.`)
      setStatusMessage('Please sign in')
    }
  }

  return (
    <div className="w-screen h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex overflow-hidden">
      {/* Left Panel - Login Form */}
      <div className="flex flex-col p-3 flex-[2] min-w-80">
        <div className="bg-white rounded-lg shadow-lg border border-slate-200 flex-1 flex flex-col p-4 max-w-none">
          <div className="mb-3 text-center">
            <h1 className="text-xl font-bold text-slate-900">
              {loading ? 'Loading...' : (businessSettings.businessName || 'Business Login')}
            </h1>
            <p className="text-xs text-slate-600">Sign in to continue</p>
          </div>

          <div className="flex-1 space-y-3">
            {/* Role Selection */}
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2 block text-center">Role</label>
              <div className="grid grid-cols-3 gap-2 w-full">
                {(['Cashier', 'Inventory', 'Manager'] as Role[]).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      playKeySound()
                      setSelectedRole(role)
                    }}
                    className={`
                      py-2 rounded border text-sm font-medium transition-all
                      ${selectedRole === role
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                      }
                    `}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {/* Employee ID */}
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2 block">Employee ID</label>
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
                    w-full h-10 px-3 text-sm font-mono bg-white border-2 rounded 
                    transition-all cursor-pointer
                    ${currentField === 'employeeId'
                      ? 'border-blue-500 ring-1 ring-blue-100'
                      : 'border-slate-200'
                    }
                  `}
                />
                {currentField === 'employeeId' && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>
            </div>

            {/* PIN */}
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2 block">PIN</label>
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
                    w-full h-10 px-3 text-sm font-mono bg-white border-2 rounded 
                    transition-all cursor-pointer
                    ${currentField === 'pin'
                      ? 'border-blue-500 ring-1 ring-blue-100'
                      : 'border-slate-200'
                    }
                  `}
                />
                {currentField === 'pin' && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Status */}
            <div className={`
              p-2 rounded text-center text-xs font-medium
              ${statusMessage.includes('Welcome') ? 'bg-green-50 text-green-700 border border-green-200' :
                'bg-blue-50 text-blue-700 border border-blue-200'
              }
            `}>
              {statusMessage}
            </div>

            {/* Currently Entering */}
            <div className="text-center">
              <span className="text-xs text-slate-500">Entering: </span>
              <span className="text-xs font-semibold text-blue-600">
                {currentField === 'employeeId' ? 'Employee ID' : 'PIN'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Keypad */}
      <div className="flex flex-col p-3 flex-1 min-w-72 max-w-sm">
        <div className="bg-white rounded-lg shadow-lg border border-slate-200 flex-1 p-4 flex flex-col">
          <h3 className="text-base font-semibold text-slate-800 mb-3 text-center">Keypad</h3>
          <div className="grid grid-cols-3 gap-2 flex-1 content-center">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => inputNumber(num.toString())}
                className="aspect-square bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded text-base font-medium text-slate-700 transition-all min-h-[2.5rem] flex items-center justify-center"
              >
                {num}
              </button>
            ))}
            <button
              onClick={clearCurrentField}
              className="aspect-square bg-red-50 hover:bg-red-100 active:bg-red-200 border border-red-200 rounded text-xs font-medium text-red-700 transition-all min-h-[2.5rem] flex items-center justify-center"
            >
              Clear
            </button>
            <button
              onClick={() => inputNumber('0')}
              className="aspect-square bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded text-base font-medium text-slate-700 transition-all min-h-[2.5rem] flex items-center justify-center"
            >
              0
            </button>
            <button
              onClick={backspace}
              className="aspect-square bg-orange-50 hover:bg-orange-100 active:bg-orange-200 border border-orange-200 rounded text-base font-medium text-orange-700 transition-all min-h-[2.5rem] flex items-center justify-center"
            >
              ⌫
            </button>
          </div>
          <button
            onClick={login}
            className="mt-3 h-12 w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded text-sm font-semibold transition-all"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  )
}

export default Login