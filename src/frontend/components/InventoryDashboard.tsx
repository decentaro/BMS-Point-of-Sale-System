import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import SessionStatus from './SessionStatus'

const InventoryDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { businessSettings, loading } = useBusinessSettings()

  // Get current user role from session
  const session = SessionManager.getCurrentSession()
  const userRole = session?.role || 'Inventory'

  return (
    <SessionGuard requiredRole="Inventory">
      <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        {/* Header */}
        <header className="h-14 px-4 border-b flex items-center justify-between">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              SessionManager.clearSession()
              navigate('/login')
            }} 
            className="hover:bg-slate-50 text-red-600 border-red-300 hover:bg-red-50"
          >
            Logout
          </Button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-emerald-600">
              {loading ? 'Loading...' : (businessSettings.businessName || 'Business Name')}
            </h1>
            <p className="text-xs text-slate-600 font-medium">
              Inventory Dashboard
            </p>
          </div>
          <SessionStatus />
        </header>

        {/* Main content area */}
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Main Actions Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              
              {/* Basic Inventory */}
              <Button
                onClick={() => navigate('/inventory')}
                className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
              >
                <span className="font-semibold">Basic Inventory</span>
                <span className="text-xs opacity-80">Add/edit products</span>
              </Button>

              {/* Advanced Inventory */}
              <Button
                onClick={() => navigate('/inventory-management')}
                className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
              >
                <span className="font-semibold">Advanced Inventory</span>
                <span className="text-xs opacity-80">Adjustments & tracking</span>
              </Button>

            </div>

          </div>
        </main>

      </div>
    </SessionGuard>
  )
}

export default InventoryDashboard