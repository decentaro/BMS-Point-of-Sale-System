import React, { useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Inventory from './components/Inventory'
import POS from './components/POS'
import Manager from './components/Manager'
import Employees from './components/Employees'
import TaxSettings from './components/TaxSettings'
import SystemSettings from './components/SystemSettings'
import SalesHistory from './components/SalesHistory'
import Returns from './components/Returns'
import Reports from './components/Reports'
import UserActivity from './components/UserActivity'
import InventoryManagement from './components/InventoryManagement'
import InventoryDashboard from './components/InventoryDashboard'
import CashierDashboard from './components/CashierDashboard'
import CashierInventoryDashboard from './components/CashierInventoryDashboard'
import AdminPanel from './components/AdminPanel'
import SessionGuard from './components/SessionGuard'
import { SettingsProvider } from './contexts/SettingsContext'
import { ToastProvider } from './contexts/ToastContext'
import ToastContainer from './components/ui/ToastContainer'

// Router-level auth guard — catches any route that loses its component-level SessionGuard.
// Components still carry their own guards for role enforcement; this is a safety net.
function ProtectedRoute({
  element,
  requiredRole,
  requiredPermission,
}: {
  element: React.ReactElement
  requiredRole?: string
  requiredPermission?: string
}) {
  return (
    <SessionGuard requiredRole={requiredRole} requiredPermission={requiredPermission}>
      {element}
    </SessionGuard>
  )
}

// Design canvas dimensions — all components are authored at this size.
const DESIGN_W = 1024
const DESIGN_H = 640

function App() {
  useEffect(() => {
    const applyCursor = () => {
      const show = localStorage.getItem('bms-show-cursor') !== 'false'
      document.body.classList.toggle('cursor-enabled', show)
    }

    applyCursor()

    // Re-apply if another tab/window updates the setting
    window.addEventListener('storage', applyCursor)
    // Re-apply on custom event fired by AdminPanel toggle
    window.addEventListener('bms:cursor-changed', applyCursor)
    return () => {
      window.removeEventListener('storage', applyCursor)
      window.removeEventListener('bms:cursor-changed', applyCursor)
    }
  }, [])

  useEffect(() => {
    const updateScale = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight

      // Uniform scale — take the smaller axis so the canvas always fits inside
      // the viewport without distortion. The other axis may have a narrow
      // letterbox strip, which the .app-viewport background fills.
      const root = document.documentElement
      root.style.setProperty('--app-scale-x', String(vw / DESIGN_W))
      root.style.setProperty('--app-scale-y', String(vh / DESIGN_H))
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  return (
    <SettingsProvider>
      <ToastProvider>
        <Router>
          {/*
            app-viewport  — full 100vw × 100vh outer shell
            app-root      — 1024×640 canvas, CSS-transformed to fill the viewport.
                            All position:fixed children inside here are positioned
                            relative to this canvas (not the raw viewport) because
                            CSS transform creates a new containing block for fixed elements.
          */}
          <div className="app-viewport">
            <div className="app-root">
              <ToastContainer />
              <Routes>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} />} />
                <Route path="/inventory" element={<ProtectedRoute element={<Inventory />} requiredPermission="inventory.view" />} />
                <Route path="/pos" element={<ProtectedRoute element={<POS />} />} />
                <Route path="/manager" element={<ProtectedRoute element={<Manager />} requiredRole="Manager" />} />
                <Route path="/employees" element={<ProtectedRoute element={<Employees />} requiredRole="Manager" />} />
                <Route path="/tax-settings" element={<ProtectedRoute element={<TaxSettings />} requiredRole="Manager" />} />
                <Route path="/system-settings" element={<ProtectedRoute element={<SystemSettings />} requiredRole="Manager" />} />
                <Route path="/sales-history" element={<ProtectedRoute element={<SalesHistory />} />} />
                <Route path="/returns" element={<ProtectedRoute element={<Returns />} />} />
                <Route path="/reports" element={<ProtectedRoute element={<Reports />} requiredRole="Manager" />} />
                <Route path="/user-activity" element={<ProtectedRoute element={<UserActivity />} requiredRole="Manager" />} />
                <Route path="/inventory-management" element={<ProtectedRoute element={<InventoryManagement />} requiredPermission="inventory.adjust" />} />
                <Route path="/inventory-dashboard" element={<ProtectedRoute element={<InventoryDashboard />} requiredRole="Inventory" />} />
                <Route path="/cashier-dashboard" element={<ProtectedRoute element={<CashierDashboard />} requiredRole="Cashier" />} />
                <Route path="/cashier-inventory" element={<ProtectedRoute element={<CashierInventoryDashboard />} requiredRole="Cashier" />} />
                <Route path="/admin" element={<ProtectedRoute element={<AdminPanel />} requiredPermission="admin.view" />} />
              </Routes>
            </div>
          </div>
        </Router>
      </ToastProvider>
    </SettingsProvider>
  )
}

export default App
