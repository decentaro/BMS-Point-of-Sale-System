import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import ApiClient from '../utils/ApiClient'

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

  // Get user context for API headers
  const getUserHeaders = () => {
    return SessionManager.getUserHeaders()
  }

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
    console.log('applyKb called with value:', val, 'isResettingPin:', isResettingPin)
    
    if (isResettingPin) {
      // Handle PIN reset
      console.log('Handling PIN reset, value length:', val.length)
      if (!val || val.length < 4 || val.length > 6 || !/^\d+$/.test(val)) {
        alert('PIN must be 4-6 digits')
        setKbOpen(false)
        setIsResettingPin(false)
        return
      }
      
      try {
        const employee = employees.find(emp => emp.id === selectedEmployee)
        if (!employee) {
          console.log('No employee found for selectedEmployee:', selectedEmployee)
          setKbOpen(false)
          setIsResettingPin(false)
          return
        }

        console.log('Updating employee PIN for:', employee.name)
        const updatedEmployee = {
          ...employee,
          pin: val
        }

        await ApiClient.put(`/employees/${selectedEmployee}`, updatedEmployee)

        console.log('PIN reset successful, reloading employees')
        await loadEmployees() // Refresh the list
        setForm(prev => ({ ...prev, pin: val })) // Update form to show new PIN
        alert('PIN reset successfully')
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to reset PIN')
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
      console.log('Loaded employees:', data)
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
      alert('Please fill in all required fields')
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
      console.log('Employee created successfully')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create employee')
      console.error('Error creating employee:', err)
    }
  }

  // Save (update) employee
  const saveEmployee = async () => {
    if (!selectedEmployee) {
      alert('Please select an employee to update')
      return
    }

    if (!form.name.trim() || !form.employeeId.trim() || !form.pin.trim()) {
      alert('Please fill in all required fields')
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
      alert(err instanceof Error ? err.message : 'Failed to update employee')
      console.error('Error updating employee:', err)
    }
  }

  // Deactivate employee
  const deactivateEmployee = async () => {
    if (!selectedEmployee) {
      alert('Please select an employee to deactivate')
      return
    }

    const employee = employees.find(emp => emp.id === selectedEmployee)
    if (!employee) {
      alert('Employee not found')
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
      alert(err instanceof Error ? err.message : `Failed to ${action} employee`)
      console.error(`Error ${action}ing employee:`, err)
    }
  }

  // Reset employee PIN
  const resetPin = () => {
    console.log('resetPin called, selectedEmployee:', selectedEmployee)
    if (!selectedEmployee) {
      alert('Please select an employee to reset PIN')
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

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
      {/* Top */}
      <header className="h-14 px-4 border-b flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => navigate('/manager')}>← Back</Button>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-emerald-600">Employees</h1>
          <p className="text-[10px] text-muted-foreground">Manage employees</p>
        </div>
        <SessionStatus />
      </header>

      {/* Body */}
      <main className="flex-1 p-2 bg-slate-50 overflow-hidden">
        <div className="h-full grid grid-cols-[320px_1fr] gap-2">
          {/* Left: list */}
          <div className="overflow-hidden bg-white rounded-lg shadow-sm">
            <div className="p-0 h-full">
              <div className="h-full flex flex-col">
                <div className="p-2 bg-white">
                  <HybridInput
                    placeholder="Search employees..."
                    className="w-full h-9 px-3 text-sm border rounded mb-2"
                    value={form.search}
                    onChange={(value) => setForm(prev => ({ ...prev, search: value }))}
                    onTouchKeyboard={() => openKb('search', 'qwerty', 'Search Employees')}
                  />
                  <label className="flex items-center text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={showInactive}
                      onChange={(e) => setShowInactive(e.target.checked)}
                      className="mr-2"
                    />
                    Show inactive employees
                  </label>
                </div>
                <div className="flex-1 overflow-auto">
                  {loading ? (
                    <div className="text-center py-8 text-sm text-slate-500">Loading employees...</div>
                  ) : error ? (
                    <div className="text-center py-8 text-sm text-red-500">{error}</div>
                  ) : filteredEmployees.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-500">
                      {form.search ? 'No employees found matching your search.' : 'No employees available.'}
                    </div>
                  ) : (
                    <ul>
                      {filteredEmployees.map((employee) => (
                        <li 
                          key={employee.id} 
                          className={`px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer ${
                            selectedEmployee === employee.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                          }`}
                          onClick={() => selectEmployee(employee)}
                        >
                          <div className={`font-medium ${!employee.isActive ? 'text-slate-400' : ''}`}>
                            {employee.name} {!employee.isActive ? '(Inactive)' : ''}
                          </div>
                          <div className={`text-xs ${!employee.isActive ? 'text-slate-400' : 'text-slate-600'}`}>
                            ID: {employee.employeeId} • {employee.role}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: details form */}
          <div className="overflow-hidden bg-white rounded-lg shadow-sm">
            <div className="p-3">
              <form className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold">Name</label>
                  <HybridInput 
                    className="w-full h-9 px-3 text-sm border rounded" 
                    placeholder="First Name" 
                    value={form.name} 
                    onChange={(value) => setForm(prev => ({ ...prev, name: value }))}
                    onTouchKeyboard={() => openKb('name', 'qwerty', 'Employee Name')} 
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Employee ID</label>
                  <HybridInput 
                    type="number"
                    className="w-full h-9 px-3 text-sm border rounded" 
                    placeholder="e.g. 0004" 
                    value={form.employeeId} 
                    onChange={(value) => setForm(prev => ({ ...prev, employeeId: value }))}
                    onTouchKeyboard={() => openKb('employeeId', 'numeric', 'Employee ID')} 
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">PIN</label>
                  <HybridInput 
                    type="number"
                    className="w-full h-9 px-3 text-sm border rounded" 
                    placeholder="••••" 
                    value={form.pin ? '••••' : ''} 
                    onChange={(value) => setForm(prev => ({ ...prev, pin: value }))}
                    onTouchKeyboard={() => { setForm(prev => ({ ...prev, pin: '' })); openKb('pin', 'numeric', 'Employee PIN', true); }} 
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Role</label>
                  <select 
                    className="w-full h-9 px-2 text-sm border rounded"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                  >
                    <option value="Cashier">Cashier</option>
                    <option value="Inventory">Inventory</option>
                    <option value="Manager">Manager</option>
                  </select>
                </div>
                <div className="col-span-2 flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="border-green-500 text-green-700 hover:bg-green-50 text-xs" onClick={addEmployee}>Add</Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs" onClick={saveEmployee}>Save</Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className={`text-xs ${
                      selectedEmployee && employees.find(emp => emp.id === selectedEmployee)?.isActive === false
                        ? 'border-green-500 text-green-700 hover:bg-green-50'
                        : 'border-red-500 text-red-700 hover:bg-red-50'
                    }`}
                    onClick={deactivateEmployee}
                  >
                    {selectedEmployee && employees.find(emp => emp.id === selectedEmployee)?.isActive === false
                      ? 'Activate'
                      : 'Deactivate'
                    }
                  </Button>
                  <Button variant="outline" size="sm" className="border-gray-500 text-gray-700 hover:bg-gray-50 text-xs" onClick={clearForm}>Clear</Button>
                  <Button variant="outline" size="sm" className="border-orange-500 text-orange-700 hover:bg-orange-50 text-xs" onClick={resetPin}>Reset PIN</Button>
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
