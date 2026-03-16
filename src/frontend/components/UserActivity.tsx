import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, DollarSign, FileText, Edit, RefreshCcw } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import ApiClient from '../utils/ApiClient'
import DateDisplay from './DateDisplay'
import { formatDateForFile, formatDateSync, formatTime } from '../utils/dateFormat'
import PageHeader from './ui/PageHeader'
import { SectionLoader } from './ui/LoadingSpinner'

interface UserActivityDto {
  id: number
  userId: number
  userName: string
  action: string
  details?: string
  entityType?: string
  entityId?: number
  actionType?: string
  ipAddress?: string
  timestamp: string
}

interface UserActivityResponse {
  activities: UserActivityDto[]
  totalCount: number
}

interface ActivityTypeSummary {
  actionType: string
  count: number
}

interface UserActivityCount {
  userId: number
  userName: string
  activityCount: number
}

interface UserActivitySummary {
  totalActivities: number
  uniqueUsers: number
  activityTypes: ActivityTypeSummary[]
  topUsers: UserActivityCount[]
}


const UserActivity: React.FC = () => {
  const navigate = useNavigate()

  // Session and role validation handled by SessionGuard wrapper

  // State management
  const [loading, setLoading] = React.useState<boolean>(true)
  const [activities, setActivities] = React.useState<UserActivityDto[]>([])
  const [summary, setSummary] = React.useState<UserActivitySummary | null>(null)
  const [dateFilter, setDateFilter] = React.useState<string>('today')
  const [actionTypeFilter, setActionTypeFilter] = React.useState<string>('all')

  // Load activities from API
  const loadActivities = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      // Calculate date range based on filter
      const now = new Date()
      let startDate: Date | null = null
      
      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
      }
      
      if (startDate) {
        params.append('startDate', startDate.toISOString())
      }
      
      if (actionTypeFilter && actionTypeFilter !== 'all') {
        params.append('actionType', actionTypeFilter)
      }
      
      params.append('limit', '500')
      
      const [activitiesData, summaryData] = await Promise.all([
        ApiClient.getJson<UserActivityResponse>(`/useractivity?${params}`),
        ApiClient.getJson<UserActivitySummary>(`/useractivity/summary?${params}`)
      ])
      
      setActivities(activitiesData.activities)
      setSummary(summaryData)
    } catch (err) {
      console.error('Error loading user activities:', err)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    loadActivities()
  }, [dateFilter, actionTypeFilter])

  // Export to CSV
  const exportToCSV = () => {
    const csvData = []
    
    csvData.push('Timestamp,User,Action,Action Type,Entity,Details,IP Address')
    
    activities.forEach(activity => {
      const date = new Date(activity.timestamp)
      const formattedDate = formatDateSync(date)
      const formattedTime = formatTime(date)
      const timestamp = `${formattedDate} ${formattedTime}`
      const details = (activity.details || '').replace(/,/g, ';')
      const entity = activity.entityType ? `${activity.entityType}${activity.entityId ? ` (ID: ${activity.entityId})` : ''}` : ''
      
      csvData.push(`${timestamp},${activity.userName},${activity.action},${activity.actionType || 'Unknown'},${entity},${details},${activity.ipAddress || ''}`)
    })
    
    const csvContent = csvData.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `user-activity-${formatDateForFile(new Date())}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const goBack = () => {
    navigate('/manager')
  }

  const getActionTypeIcon = (actionType: string): React.ReactNode => {
    switch (actionType?.toLowerCase()) {
      case 'login': return <FileText className="w-4 h-4" />
      case 'logout': return <FileText className="w-4 h-4" />
      case 'create': return <Plus className="w-4 h-4" />
      case 'update': return <Edit className="w-4 h-4" />
      case 'delete': return <Trash2 className="w-4 h-4" />
      case 'sale': return <DollarSign className="w-4 h-4" />
      case 'return': return <RefreshCcw className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return {
      date: formatDateSync(date),
      time: formatTime(date)
    }
  }

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
      <PageHeader
        title="User Activity"
        subtitle="System audit trail and user actions"
        onBack={goBack}
        right={<SessionStatus />}
      />

      {/* Body */}
      <main className="flex-1 px-6 pb-6 overflow-y-auto bg-slate-50">
        {loading ? (
          <SectionLoader message="Loading user activities..." />
        ) : (
        <div className="pt-6">
          <div className="max-w-6xl mx-auto space-y-6">

          {/* Export Button */}
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={exportToCSV}
              className="text-emerald-600 border-emerald-600 hover:bg-emerald-50"
            >
              Export CSV
            </Button>
          </div>

          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600">{summary.totalActivities}</div>
                  <div className="text-sm text-emerald-700">Total Activities</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600">{summary.uniqueUsers}</div>
                  <div className="text-sm text-emerald-700">Active Users</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600">{summary.activityTypes.length}</div>
                  <div className="text-sm text-emerald-700">Action Types</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600">
                    {summary.topUsers.length > 0 ? summary.topUsers[0].activityCount : 0}
                  </div>
                  <div className="text-sm text-emerald-700">Most Active</div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Time Period</label>
                  <select 
                    className="w-full p-3 border rounded-lg"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  >
                    <option value="today">Today</option>
                    <option value="week">Last 7 days</option>
                    <option value="month">Last 30 days</option>
                    <option value="all">All time</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Action Type</label>
                  <select 
                    className="w-full p-3 border rounded-lg"
                    value={actionTypeFilter}
                    onChange={(e) => setActionTypeFilter(e.target.value)}
                  >
                    <option value="all">All Actions</option>
                    <option value="LOGIN">Login</option>
                    <option value="LOGOUT">Logout</option>
                    <option value="SALE">Sales</option>
                    <option value="RETURN">Returns</option>
                    <option value="CREATE">Create</option>
                    <option value="UPDATE">Update</option>
                    <option value="DELETE">Delete</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activities List */}
          <Card>
            <CardContent className="p-0">
              {activities.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No activities found for the selected criteria.
                </div>
              ) : (
                <div className="space-y-2 p-4">
                  {activities.map((activity) => {
                    const { date, time } = formatTimestamp(activity.timestamp)
                    return (
                      <div key={activity.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                        <div className="flex items-start space-x-3">
                          <div className="text-lg">{getActionTypeIcon(activity.actionType || '')}</div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium text-sm">{activity.userName}</span>
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded">
                                {activity.actionType || 'Unknown'}
                              </span>
                            </div>
                            <div className="text-sm text-gray-700 mb-1">{activity.action}</div>
                            {activity.details && (
                              <div className="text-xs text-gray-500 mb-1">{activity.details}</div>
                            )}
                            {activity.entityType && (
                              <div className="text-xs text-gray-400">
                                {activity.entityType}{activity.entityId ? ` (ID: ${activity.entityId})` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-xs text-gray-500 ml-4">
                          <div>{date}</div>
                          <div>{time}</div>
                          {activity.ipAddress && (
                            <div className="text-gray-400">{activity.ipAddress}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          </div>
        </div>
        )}
      </main>
      </div>
    </SessionGuard>
  )
}

export default UserActivity