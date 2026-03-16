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
import AdminPanel from './components/AdminPanel'
import { SettingsProvider } from './contexts/SettingsContext'
import { ToastProvider } from './contexts/ToastContext'
import ToastContainer from './components/ui/ToastContainer'

// Design canvas dimensions — all components are authored at this size.
const DESIGN_W = 1024
const DESIGN_H = 640

function App() {
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
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/pos" element={<POS />} />
                <Route path="/manager" element={<Manager />} />
                <Route path="/employees" element={<Employees />} />
                <Route path="/tax-settings" element={<TaxSettings />} />
                <Route path="/system-settings" element={<SystemSettings />} />
                <Route path="/sales-history" element={<SalesHistory />} />
                <Route path="/returns" element={<Returns />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/user-activity" element={<UserActivity />} />
                <Route path="/inventory-management" element={<InventoryManagement />} />
                <Route path="/inventory-dashboard" element={<InventoryDashboard />} />
                <Route path="/admin" element={<AdminPanel />} />
              </Routes>
            </div>
          </div>
        </Router>
      </ToastProvider>
    </SettingsProvider>
  )
}

export default App
