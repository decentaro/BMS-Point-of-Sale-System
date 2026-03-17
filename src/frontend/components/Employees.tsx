import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Search, Plus, Save, UserX, UserCheck,
  X, KeyRound, ChevronDown, Shield, ShoppingCart, Package
} from 'lucide-react'
import { Button } from './ui/button'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import ApiClient from '../utils/ApiClient'
import PageHeader from './ui/PageHeader'
import { useToast } from '../contexts/ToastContext'

// Employee interface matching the API model
interface Employee {
  id: number
  employeeId: string
  pin: string
  name: string
  role: string
  isManager: boolean
  isActive: boolean
  createdDate: string
}


const Employees: React.FC = () => {
  const navigate = useNavigate()
  const { showToast } = useToast()

  // Session and role validation handled by SessionGuard wrapper

  // State management
  const [employees, setEmployees] = React.useState<Employee[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedEmployee, setSelectedEmployee] = React.useState<number | null>(null)
  const [isEditing, setIsEditing] = React.useState<boolean>(false)
  const [showInactive, setShowInactive] = React.useState<boolean>(false)

  // Modal keyboard state for search and form inputs
  type FieldKeys = 'search' | 'name' | 'employeeId' | 'pin'
  const [kbOpen, setKbOpen] = React.useState<boolean>(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('qwerty')
  const [kbTitle, setKbTitle] = React.useState<string>('')
  const [kbTarget, setKbTarget] = React.useState<FieldKeys>('search')
  const [kbMasked, setKbMasked] = React.useState<boolean>(false)
  const [isResettingPin, setIsResettingPin] = React.useState<boolean>(false)
  const [form, setForm] = React.useState<Record<FieldKeys, string>>({
    search: '', name: '', employeeId: '', pin: ''
  })
  const [selectedRole, setSelectedRole] = React.useState<string>('Cashier')

  const openKb = (target: FieldKeys, type: KeyboardType, title: string, masked: boolean = false) => {
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
    setKbMasked(masked)
    setKbOpen(true)
  }

  const applyKb = async (val: string) => {
    if (isResettingPin) {
      // Handle PIN reset
      if (!val || val.length < 4 || val.length > 6 || !/^\d+$/.test(val)) {
        showToast('PIN must be 4–6 digits', 'warning')
        setKbOpen(false)
        setIsResettingPin(false)
        return
      }
      
      try {
        const employee = employees.find(emp => emp.id === selectedEmployee)
        if (!employee) {
          setKbOpen(false)
          setIsResettingPin(false)
          return
        }

        const updatedEmployee = {
          ...employee,
          pin: val
        }

        await ApiClient.put(`/employees/${selectedEmployee}`, updatedEmployee)

        await loadEmployees() // Refresh the list
        setForm(prev => ({ ...prev, pin: val })) // Update form to show new PIN
        showToast('PIN reset successfully', 'success')
      } catch (err) {
        showToast('Failed to reset PIN. Please try again.', 'error')
        console.error('Error resetting PIN:', err)
      }
      
      setIsResettingPin(false)
      setKbOpen(false)
      return
    }
    
    // Normal form input
    setForm((f) => ({ ...f, [kbTarget]: val }))
    setKbOpen(false)
  }

  // Load employees from API
  const loadEmployees = async () => {
    try {
      setLoading(true)
      const data = await ApiClient.getEmployees(showInactive)
      setEmployees(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load employees')
      console.error('Error loading employees:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load employees on component mount and when showInactive changes
  React.useEffect(() => {
    loadEmployees()
  }, [showInactive])

  // Select an employee for editing
  const selectEmployee = (employee: Employee) => {
    setSelectedEmployee(employee.id)
    setForm({
      search: form.search, // Keep search value
      name: employee.name,
      employeeId: employee.employeeId,
      pin: employee.pin
    })
    setSelectedRole(employee.role)
    setIsEditing(true)
  }

  // Clear form
  const clearForm = () => {
    setForm({
      search: form.search, // Keep search value
      name: '',
      employeeId: '',
      pin: ''
    })
    setSelectedRole('Cashier')
    setSelectedEmployee(null)
    setIsEditing(false)
  }

  // Add new employee
  const addEmployee = async () => {
    if (!form.name.trim() || !form.employeeId.trim() || !form.pin.trim()) {
      showToast('Please fill in all required fields', 'warning')
      return
    }

    try {
      const newEmployee = {
        employeeId: form.employeeId,
        pin: form.pin,
        name: form.name,
        role: selectedRole,
        isManager: selectedRole === 'Manager'
      }

      await ApiClient.postJson('/employees', newEmployee)

      await loadEmployees() // Refresh the list
      clearForm() // Clear the form
    } catch (err) {
      showToast('Failed to create employee. Please try again.', 'error')
      console.error('Error creating employee:', err)
    }
  }

  // Save (update) employee
  const saveEmployee = async () => {
    if (!selectedEmployee) {
      showToast('Please select an employee to update', 'warning')
      return
    }

    if (!form.name.trim() || !form.employeeId.trim() || !form.pin.trim()) {
      showToast('Please fill in all required fields', 'warning')
      return
    }

    try {
      const updatedEmployee = {
        id: selectedEmployee,
        employeeId: form.employeeId,
        pin: form.pin,
        name: form.name,
        role: selectedRole,
        isManager: selectedRole === 'Manager',
        createdDate: new Date().toISOString() // Will be ignored by API
      }

      await ApiClient.put(`/employees/${selectedEmployee}`, updatedEmployee)

      await loadEmployees() // Refresh the list
      clearForm() // Clear the form
      console.log('Employee updated successfully')
    } catch (err) {
      showToast('Failed to update employee. Please try again.', 'error')
      console.error('Error updating employee:', err)
    }
  }

  // Deactivate employee
  const deactivateEmployee = async () => {
    if (!selectedEmployee) {
      showToast('Please select an employee', 'warning')
      return
    }

    const employee = employees.find(emp => emp.id === selectedEmployee)
    if (!employee) {
      showToast('Employee not found', 'error')
      return
    }

    const action = employee.isActive ? 'deactivate' : 'activate'
    const actionText = employee.isActive ? 'deactivated' : 'activated'
    
    if (!confirm(`Are you sure you want to ${action} this employee?`)) {
      return
    }

    try {
      await ApiClient.put(`/employees/${selectedEmployee}/${action}`, null)

      await loadEmployees() // Refresh the list
      clearForm() // Clear the form
      console.log(`Employee ${actionText} successfully`)
    } catch (err) {
      showToast(`Failed to ${action} employee. Please try again.`, 'error')
      console.error(`Error ${action}ing employee:`, err)
    }
  }

  // Reset employee PIN
  const resetPin = () => {
    console.log('resetPin called, selectedEmployee:', selectedEmployee)
    if (!selectedEmployee) {
      showToast('Please select an employee to reset PIN', 'warning')
      return
    }

    console.log('Setting up PIN reset modal')
    setIsResettingPin(true)
    setKbTarget('pin')
    setKbType('numeric')
    setKbTitle('Enter New PIN (4-6 digits)')
    setKbMasked(true)
    setKbOpen(true)
  }

  // Filter employees based on search
  const filteredEmployees = React.useMemo(() => {
    if (!form.search.trim()) return employees
    const search = form.search.toLowerCase()
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(search) ||
      emp.employeeId.toLowerCase().includes(search) ||
      emp.role.toLowerCase().includes(search)
    )
  }, [employees, form.search])

  // Role meta: icon + colors for badges and list
  const roleMeta = (role: string) => {
    switch (role) {
      case 'Manager':  return { Icon: Shield,       bg: 'bg-amber-100',   text: 'text-amber-700',  border: 'border-amber-200'  }
      case 'Inventory': return { Icon: Package,     bg: 'bg-blue-100',    text: 'text-blue-700',   border: 'border-blue-200'   }
      default:          return { Icon: ShoppingCart, bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200'  }
    }
  }

  const inputCls = 'w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent'

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-xs font-semibold text-slate-600 mb-1">{children}</label>
  )

  const selectedEmp = employees.find(emp => emp.id === selectedEmployee)
  const isSelectedInactive = selectedEmp?.isActive === false

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
        <PageHeader
          title="Employees"
          subtitle="Manage employees"
          onBack={() => navigate('/manager')}
          right={<SessionStatus />}
        />

        {/* Body */}
        <main className="flex-1 p-2 bg-slate-50 overflow-hidden">
          <div className="h-full grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-2">

            {/* Left: employee list */}
            <div className="overflow-hidden bg-white rounded-lg border border-slate-200 shadow-sm max-h-80 lg:max-h-full flex flex-col">

              {/* List header */}
              <div className="px-3 pt-3 pb-2 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100">
                      <Users className="w-3.5 h-3.5 text-emerald-600" />
                    </span>
                    <span className="text-sm font-semibold text-slate-700">Employee List</span>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">{filteredEmployees.length} shown</span>
                </div>

                {/* Search */}
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <HybridInput
                    placeholder="Search employees..."
                    className="w-full h-8 pl-8 pr-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    value={form.search}
                    onChange={(value) => setForm(prev => ({ ...prev, search: value }))}
                    onTouchKeyboard={() => openKb('search', 'qwerty', 'Search Employees')}
                  />
                </div>

                {/* Show inactive toggle */}
                <button
                  type="button"
                  onClick={() => setShowInactive(v => !v)}
                  className="flex items-center gap-2 text-xs text-slate-600 select-none"
                >
                  <span className={`relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${showInactive ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                    <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out ${showInactive ? 'translate-x-3' : 'translate-x-0'}`} />
                  </span>
                  Show inactive employees
                </button>
              </div>

              {/* Employee rows */}
              <div className="flex-1 overflow-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-sm text-slate-400">Loading employees...</div>
                ) : error ? (
                  <div className="flex items-center justify-center py-12 text-sm text-red-500">{error}</div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <Users className="w-8 h-8 text-slate-200" />
                    <span className="text-sm text-slate-400">
                      {form.search ? 'No employees match your search.' : 'No employees available.'}
                    </span>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-50">
                    {filteredEmployees.map((employee) => {
                      const meta = roleMeta(employee.role)
                      const RoleIcon = meta.Icon
                      const isSelected = selectedEmployee === employee.id
                      const initials = employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                      return (
                        <li
                          key={employee.id}
                          onClick={() => selectEmployee(employee)}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-50 border-l-[3px] border-emerald-500'
                              : 'hover:bg-slate-50 border-l-[3px] border-transparent'
                          }`}
                        >
                          {/* Initials avatar */}
                          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            employee.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium truncate ${!employee.isActive ? 'text-slate-400' : 'text-slate-800'}`}>
                              {employee.name}
                              {!employee.isActive && <span className="ml-1 text-xs font-normal text-slate-400">(Inactive)</span>}
                            </div>
                            <div className="text-xs text-slate-500">ID: {employee.employeeId}</div>
                          </div>
                          {/* Role badge */}
                          <span className={`flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${meta.bg} ${meta.text} ${meta.border}`}>
                            <RoleIcon className="w-2.5 h-2.5" />
                            {employee.role}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Right: details form */}
            <div className="overflow-auto bg-white rounded-lg border border-slate-200 shadow-sm">
              <div className="p-4">
                {/* Section header */}
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-emerald-100">
                    <Users className="w-4 h-4 text-emerald-600" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {isEditing ? `Edit: ${selectedEmp?.name ?? ''}` : 'Add New Employee'}
                    </p>
                    <p className="text-xs text-slate-400">{isEditing ? 'Update employee details below' : 'Fill in the details to create a new employee'}</p>
                  </div>
                </div>

                <form className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="col-span-full">
                    <FieldLabel>Full Name</FieldLabel>
                    <HybridInput
                      className={inputCls}
                      placeholder="e.g. John Smith"
                      value={form.name}
                      onChange={(value) => setForm(prev => ({ ...prev, name: value }))}
                      onTouchKeyboard={() => openKb('name', 'qwerty', 'Employee Name')}
                    />
                  </div>

                  {/* Employee ID */}
                  <div>
                    <FieldLabel>Employee ID</FieldLabel>
                    <HybridInput
                      type="number"
                      className={inputCls}
                      placeholder="e.g. 0004"
                      value={form.employeeId}
                      onChange={(value) => setForm(prev => ({ ...prev, employeeId: value }))}
                      onTouchKeyboard={() => openKb('employeeId', 'numeric', 'Employee ID')}
                    />
                  </div>

                  {/* PIN */}
                  <div>
                    <FieldLabel>PIN</FieldLabel>
                    <HybridInput
                      type="number"
                      className={inputCls}
                      placeholder="••••"
                      value={form.pin ? '••••' : ''}
                      onChange={(value) => setForm(prev => ({ ...prev, pin: value }))}
                      onTouchKeyboard={() => { setForm(prev => ({ ...prev, pin: '' })); openKb('pin', 'numeric', 'Employee PIN', true) }}
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <FieldLabel>Role</FieldLabel>
                    <div className="relative">
                      <select
                        className={`${inputCls} appearance-none pr-8`}
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                      >
                        <option value="Cashier">Cashier</option>
                        <option value="Inventory">Inventory</option>
                        <option value="Manager">Manager</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="col-span-full pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                        onClick={addEmployee}
                      >
                        <Plus className="w-3.5 h-3.5" />Add
                      </Button>
                      <Button
                        size="sm"
                        className="bg-[hsl(215,65%,30%)] hover:bg-[hsl(215,65%,24%)] text-white text-xs gap-1.5"
                        onClick={saveEmployee}
                      >
                        <Save className="w-3.5 h-3.5" />Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`text-xs gap-1.5 ${
                          isSelectedInactive
                            ? 'border-emerald-400 text-emerald-700 hover:bg-emerald-50'
                            : 'border-red-300 text-red-600 hover:bg-red-50'
                        }`}
                        onClick={deactivateEmployee}
                      >
                        {isSelectedInactive
                          ? <><UserCheck className="w-3.5 h-3.5" />Activate</>
                          : <><UserX className="w-3.5 h-3.5" />Deactivate</>
                        }
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-slate-300 text-slate-600 hover:bg-slate-50 text-xs gap-1.5"
                        onClick={clearForm}
                      >
                        <X className="w-3.5 h-3.5" />Clear
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-amber-300 text-amber-700 hover:bg-amber-50 text-xs gap-1.5"
                        onClick={resetPin}
                      >
                        <KeyRound className="w-3.5 h-3.5" />Reset PIN
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </div>

          </div>
        </main>

        <ModalKeyboard
          open={kbOpen}
          type={kbType}
          title={kbTitle}
          initialValue={form[kbTarget] || ''}
          masked={kbMasked}
          onSubmit={applyKb}
          onClose={() => setKbOpen(false)}
        />
      </div>
    </SessionGuard>
  )
}

export default Employees
