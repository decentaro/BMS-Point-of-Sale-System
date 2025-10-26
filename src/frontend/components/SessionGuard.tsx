import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SessionManager from '../utils/SessionManager'

interface SessionGuardProps {
  children: React.ReactNode
  requiredPermission?: string
  requiredRole?: string
}

const SessionGuard: React.FC<SessionGuardProps> = ({ 
  children, 
  requiredPermission, 
  requiredRole 
}) => {
  const navigate = useNavigate()
  const [isChecking, setIsChecking] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    const checkSession = () => {
      try {
        // Check if session is valid
        if (!SessionManager.isSessionValid()) {
          SessionManager.clearSession()
          navigate('/login')
          return
        }

        const session = SessionManager.getCurrentSession()
        if (!session) {
          navigate('/login')
          return
        }

        // Check role requirement
        if (requiredRole && session.role.toLowerCase() !== requiredRole.toLowerCase()) {
          alert(`Access denied. Required role: ${requiredRole}`)
          navigate('/login')
          return
        }

        // Check permission requirement
        if (requiredPermission && !SessionManager.hasPermission(requiredPermission)) {
          alert(`Access denied. Insufficient permissions.`)
          navigate('/manager') // Redirect to main dashboard
          return
        }

        setIsAuthorized(true)
      } catch (error) {
        console.error('Session check failed:', error)
        navigate('/login')
      } finally {
        setIsChecking(false)
      }
    }

    checkSession()
  }, [navigate, requiredPermission, requiredRole])

  if (isChecking) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking session...</p>
        </div>
      </div>
    )
  }

  if (!isAuthorized) {
    return null // Will redirect via useEffect
  }

  return <>{children}</>
}

export default SessionGuard