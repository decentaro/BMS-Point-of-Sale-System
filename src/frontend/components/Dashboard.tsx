import React from 'react'
import { useNavigate } from 'react-router-dom'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'

const Dashboard: React.FC = () => {
  const navigate = useNavigate()

  React.useEffect(() => {
    // Get current user from session manager
    const session = SessionManager.getCurrentSession()
    
    if (!session) {
      // No user logged in, redirect to login
      navigate('/login')
      return
    }

    const userRole = session.role || 'Cashier'

    // Role-based navigation
    switch (userRole.toLowerCase()) {
      case 'manager':
        navigate('/manager')
        break
      case 'cashier':
        navigate('/pos') // Cashiers go directly to POS
        break
      case 'inventory':
        navigate('/inventory-dashboard') // Inventory users go to inventory dashboard
        break
      default:
        // Fallback for unknown roles - treat as cashier
        navigate('/pos')
        break
    }
  }, [navigate])

  // Show loading while redirecting
  return (
    <SessionGuard>
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600">Loading dashboard...</div>
        </div>
      </div>
    </SessionGuard>
  )
}

export default Dashboard