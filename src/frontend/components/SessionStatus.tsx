import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import SessionManager from '../utils/SessionManager'
import { formatDateSync, formatTime } from '../utils/dateFormat'

interface SessionStatusProps {
  showLogout?: boolean
}

const SessionStatus: React.FC<SessionStatusProps> = ({ showLogout = false }) => {
  const navigate = useNavigate()
  const [timeLeft, setTimeLeft] = useState(0)
  const [showWarning, setShowWarning] = useState(false)
  const [warningShown, setWarningShown] = useState(false)
  const [session, setSession] = useState(SessionManager.getCurrentSession())
  const [currentTime, setCurrentTime] = useState(new Date())

  // Update current time
  const updateCurrentTime = () => {
    setCurrentTime(new Date())
  }

  const handleLogout = useCallback(() => {
    SessionManager.clearSession()
    navigate('/login')
  }, [navigate])

  const handleExtendSession = useCallback(() => {
    SessionManager.extendSession()
    setShowWarning(false)
    setWarningShown(false) // Allow warning to show again if needed
  }, [])

  // Initialize with correct time immediately
  useEffect(() => {
    const currentSession = SessionManager.getCurrentSession()
    if (currentSession) {
      const minutes = SessionManager.getTimeUntilExpiry()
      setTimeLeft(minutes)
      setSession(currentSession)
    }
    // Set initial time
    updateCurrentTime()
  }, [])

  useEffect(() => {
    const updateTimer = setInterval(() => {
      const currentSession = SessionManager.getCurrentSession()
      
      if (!currentSession) {
        clearInterval(updateTimer)
        return
      }

      const minutes = SessionManager.getTimeUntilExpiry()
      setTimeLeft(minutes)
      setSession(currentSession)
      // Update current time every second
      updateCurrentTime()
      
      // Show warning if 5 minutes or less (only once per session)
      setWarningShown(prev => {
        if (minutes <= 5 && minutes > 0 && !prev) {
          setShowWarning(true)
          return true
        } else if (minutes > 5) {
          return false // Reset if session extended
        }
        return prev
      })
      
      // Auto logout if expired
      if (minutes === 0) {
        handleLogout()
      }
    }, 1000)

    return () => clearInterval(updateTimer)
  }, [handleLogout])

  if (!session) return null

  // Format current date and time for POS display using centralized formatting
  const formatDateForPOS = (date: Date) => {
    return formatDateSync(date)
  }

  const formatTimeForPOS = (date: Date) => {
    return formatTime(date)
  }

  return (
    <div className="relative">
      {/* Session Info in Header */}
      <div className="text-xs text-slate-600 text-center">
        <div className="flex items-center justify-center space-x-2">
          <span>{formatDateForPOS(currentTime)}</span>
          <span className="text-slate-400">•</span>
          <span>{formatTimeForPOS(currentTime)}</span>
        </div>
        <div className="flex items-center justify-center space-x-2">
          <span className="font-medium">{session.role}</span>
          <span className="text-slate-400">•</span>
          <span className={timeLeft <= 5 ? 'text-orange-600 font-medium' : ''}>
            {timeLeft}min
          </span>
          {showLogout && (
            <button
              onClick={handleLogout}
              className="text-red-600 hover:text-red-800 font-medium"
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* Expiry Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <div className="text-center">
              <div className="text-orange-500 text-4xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Session Expiring Soon
              </h3>
              <p className="text-gray-600 mb-6">
                Your session will expire in {timeLeft} minutes. 
                Do you want to extend your session?
              </p>
              <div className="flex space-x-4">
                <button
                  onClick={handleExtendSession}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Extend Session
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400"
                >
                  Logout Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SessionStatus