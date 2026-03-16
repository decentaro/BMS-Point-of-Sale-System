import React from 'react'
import { useNavigate } from 'react-router-dom'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import { LoadingSpinner } from './ui/LoadingSpinner'

const Dashboard: React.FC = () => {
  const navigate = useNavigate()

  React.useEffect(() => {
    const session = SessionManager.getCurrentSession()

    if (!session) {
      navigate('/login')
      return
    }

    const userRole = session.role || 'Cashier'

    switch (userRole.toLowerCase()) {
      case 'manager':
        navigate('/manager')
        break
      case 'cashier':
        navigate('/pos')
        break
      case 'inventory':
        navigate('/inventory-dashboard')
        break
      default:
        navigate('/pos')
        break
    }
  }, [navigate])

  return (
    <SessionGuard>
      <div className="w-full h-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <LoadingSpinner size={40} className="mx-auto mb-3" />
          <div className="text-slate-500 font-medium text-sm">Loading dashboard...</div>
        </div>
      </div>
    </SessionGuard>
  )
}

export default Dashboard
