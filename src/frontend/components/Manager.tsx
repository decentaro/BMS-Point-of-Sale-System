import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionGuard from './SessionGuard'
import SessionStatus from './SessionStatus'
import SessionManager from '../utils/SessionManager'

const Manager: React.FC = () => {
  const navigate = useNavigate()
  const { businessSettings, loading } = useBusinessSettings()

  // Get current user role from session
  const session = SessionManager.getCurrentSession()
  const userRole = session?.role || 'Cashier'

  const goBack = () => {
    // Users should use SessionStatus logout instead of back button
    // navigate('/login')
  }

  return (
    <SessionGuard>
      <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header with improved styling */}
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
            {userRole === 'Cashier' ? 'Cashier Dashboard' : 'Manager Dashboard'}
          </p>
        </div>
        <SessionStatus />
      </header>

      {/* Main content area */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {/* Main Actions Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* POS - Primary action */}
            <Button
              onClick={() => navigate('/pos')}
              className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
            >
              <span className="font-semibold">Point of Sale</span>
              <span className="text-xs opacity-80">Start selling</span>
            </Button>

            {/* Sales History */}
            <Button
              onClick={() => navigate('/sales-history')}
              className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
            >
              <span className="font-semibold">Sales History</span>
              <span className="text-xs opacity-80">View transactions</span>
            </Button>

            {/* Returns & Refunds */}
            <Button
              onClick={() => navigate('/returns')}
              className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
            >
              <span className="font-semibold">Returns</span>
              <span className="text-xs opacity-80">Process refunds</span>
            </Button>
          </div>

          {/* Manager-only sections */}
          {userRole === 'Manager' && (
            <>
              {/* Management Tools */}
              <div>
                <h2 className="text-lg font-semibold text-slate-700 mb-4">
                  Management Tools
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  
                  <Button
                    onClick={() => navigate('/inventory')}
                    className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
                  >
                    <span className="font-semibold">Basic Inventory</span>
                    <span className="text-xs opacity-80">Add/edit products</span>
                  </Button>

                  <Button
                    onClick={() => navigate('/inventory-management')}
                    className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
                  >
                    <span className="font-semibold">Advanced Inventory</span>
                    <span className="text-xs opacity-80">Adjustments & tracking</span>
                  </Button>

                  <Button
                    onClick={() => navigate('/employees')}
                    className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
                  >
                    <span className="font-semibold">Employees</span>
                    <span className="text-xs opacity-80">Manage staff</span>
                  </Button>

                  <Button
                    onClick={() => navigate('/tax-settings')}
                    className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
                  >
                    <span className="font-semibold">Tax Settings</span>
                    <span className="text-xs opacity-80">Configure taxes</span>
                  </Button>
                </div>
              </div>

              {/* System & Reports */}
              <div>
                <h2 className="text-lg font-semibold text-slate-700 mb-4">
                  System & Reports
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  
                  <Button 
                    onClick={() => navigate('/system-settings')}
                    className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
                  >
                    <span className="font-semibold">System Settings</span>
                    <span className="text-xs opacity-80">Preferences</span>
                  </Button>

                  <Button 
                    onClick={() => navigate('/reports')}
                    className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
                  >
                    <span className="font-semibold">Reports</span>
                    <span className="text-xs opacity-80">Analytics</span>
                  </Button>

                  <Button 
                    onClick={() => navigate('/user-activity')}
                    className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
                  >
                    <span className="font-semibold">User Activity</span>
                    <span className="text-xs opacity-80">Audit Trail</span>
                  </Button>

                  <Button 
                    onClick={() => navigate('/admin')}
                    className="h-16 bg-slate-600 hover:bg-slate-700 text-white flex-col gap-1"
                  >
                    <span className="font-semibold">Admin Panel</span>
                    <span className="text-xs opacity-80">Technical settings</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      </div>
    </SessionGuard>
  )
}

export default Manager