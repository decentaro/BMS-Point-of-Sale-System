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

function App() {
  return (
    <SettingsProvider>
      <Router>
      <div className="w-screen h-screen overflow-hidden bg-slate-50">
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
      </Router>
    </SettingsProvider>
  )
}

export default App