import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Boxes, LogOut } from 'lucide-react'
import { Button } from './ui/button'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import SessionStatus from './SessionStatus'

const InventoryDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { businessSettings, loading } = useBusinessSettings()

  return (
    <SessionGuard requiredRole="Inventory">
      <div className="w-full h-full flex flex-col bg-slate-50">
        {/* Header */}
        <header className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              SessionManager.clearSession()
              navigate('/login')
            }}
            className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </Button>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-emerald-600 leading-tight">
              {loading ? '—' : (businessSettings.businessName || 'Business Name')}
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">Inventory Dashboard</p>
          </div>

          <SessionStatus />
        </header>

        {/* Main content */}
        <main className="flex-1 px-5 py-5 overflow-y-auto">
          <div className="max-w-md mx-auto">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
              Inventory Tools
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/inventory')}
                className="h-[80px] flex flex-col items-center justify-center gap-1.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-teal-300 hover:bg-teal-50 transition-all duration-150 active:scale-[0.97]"
              >
                <Package className="w-6 h-6 text-teal-600" />
                <span className="text-[13px] font-semibold text-slate-800">Basic Inventory</span>
                <span className="text-[10px] text-slate-400">Add / edit products</span>
              </button>

              <button
                onClick={() => navigate('/inventory-management')}
                className="h-[80px] flex flex-col items-center justify-center gap-1.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-teal-300 hover:bg-teal-50 transition-all duration-150 active:scale-[0.97]"
              >
                <Boxes className="w-6 h-6 text-teal-600" />
                <span className="text-[13px] font-semibold text-slate-800">Advanced Inventory</span>
                <span className="text-[10px] text-slate-400">Adjustments & tracking</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    </SessionGuard>
  )
}

export default InventoryDashboard
