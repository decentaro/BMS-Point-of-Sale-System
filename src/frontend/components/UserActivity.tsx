import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, DollarSign, FileText, Edit, RefreshCcw,
  LogIn, LogOut, Activity, Users, Layers, TrendingUp,
  Download, ChevronRight, ChevronLeft, Clock, Tag
} from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import ApiClient from '../utils/ApiClient'
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

  const PAGE_SIZE = 10

  // State management
  const [loading, setLoading] = React.useState<boolean>(true)
  const [activities, setActivities] = React.useState<UserActivityDto[]>([])
  const [totalCount, setTotalCount] = React.useState<number>(0)
  const [page, setPage] = React.useState<number>(1)
  const [summary, setSummary] = React.useState<UserActivitySummary | null>(null)
  const [dateFilter, setDateFilter] = React.useState<string>('today')
  const [actionTypeFilter, setActionTypeFilter] = React.useState<string>('all')

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const buildDateParams = () => {
    const params = new URLSearchParams()
    const now = new Date()
    let startDate: Date | null = null
    switch (dateFilter) {
      case 'today': startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break
      case 'week':  startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break
      case 'month': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break
    }
    if (startDate) params.append('startDate', startDate.toISOString())
    if (actionTypeFilter !== 'all') params.append('actionType', actionTypeFilter)
    return params
  }

  const loadActivities = async (targetPage: number) => {
    try {
      setLoading(true)
      const params = buildDateParams()
      params.append('limit', String(PAGE_SIZE))
      params.append('offset', String((targetPage - 1) * PAGE_SIZE))

      const activitiesData = await ApiClient.getJson<UserActivityResponse>(`/useractivity?${params}`)
      setActivities(activitiesData.activities)
      setTotalCount(activitiesData.totalCount)
    } catch (err) {
      console.error('Error loading user activities:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    try {
      const params = buildDateParams()
      const summaryData = await ApiClient.getJson<UserActivitySummary>(`/useractivity/summary?${params}`)
      setSummary(summaryData)
    } catch (err) {
      console.error('Error loading summary:', err)
    }
  }

  // Reset to page 1 and reload both when filters change
  React.useEffect(() => {
    setPage(1)
    loadSummary()
    loadActivities(1)
  }, [dateFilter, actionTypeFilter])

  // Load only the activity page when page changes (summary stays)
  React.useEffect(() => {
    loadActivities(page)
  }, [page])

  // Export to CSV — fetches all records (no pagination limit)
  const exportToCSV = async () => {
    try {
      const params = buildDateParams()
      params.append('limit', '10000')
      const data = await ApiClient.getJson<UserActivityResponse>(`/useractivity?${params}`)

      const rows = ['Timestamp,User,Action,Action Type,Entity,Details,IP Address']
      data.activities.forEach(activity => {
        const date = new Date(activity.timestamp)
        const timestamp = `${formatDateSync(date)} ${formatTime(date)}`
        const details = (activity.details || '').replace(/,/g, ';')
        const entity = activity.entityType ? `${activity.entityType}${activity.entityId ? ` (ID: ${activity.entityId})` : ''}` : ''
        rows.push(`${timestamp},${activity.userName},${activity.action},${activity.actionType || 'Unknown'},${entity},${details},${activity.ipAddress || ''}`)
      })

      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.setAttribute('href', URL.createObjectURL(blob))
      link.setAttribute('download', `user-activity-${formatDateForFile(new Date())}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('Error exporting CSV:', err)
    }
  }

  const goBack = () => {
    navigate('/manager')
  }

  const getPageItems = (): (number | null)[] => {
    const items: (number | null)[] = []
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
        items.push(i)
      } else if (items[items.length - 1] !== null) {
        items.push(null) // null = ellipsis
      }
    }
    return items
  }

  type ActionMeta = { icon: React.ElementType; iconCls: string; bgCls: string; badgeCls: string }
  const getActionMeta = (actionType: string): ActionMeta => {
    switch (actionType?.toLowerCase()) {
      case 'login':   return { icon: LogIn,      iconCls: 'text-emerald-600', bgCls: 'bg-emerald-50',  badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
      case 'logout':  return { icon: LogOut,     iconCls: 'text-slate-500',   bgCls: 'bg-slate-100',   badgeCls: 'bg-slate-100   text-slate-600   border-slate-200'   }
      case 'create':  return { icon: Plus,       iconCls: 'text-blue-600',    bgCls: 'bg-blue-50',     badgeCls: 'bg-blue-100    text-blue-700    border-blue-200'    }
      case 'update':  return { icon: Edit,       iconCls: 'text-amber-600',   bgCls: 'bg-amber-50',    badgeCls: 'bg-amber-100   text-amber-700   border-amber-200'   }
      case 'delete':  return { icon: Trash2,     iconCls: 'text-red-600',     bgCls: 'bg-red-50',      badgeCls: 'bg-red-100     text-red-700     border-red-200'     }
      case 'sale':    return { icon: DollarSign, iconCls: 'text-emerald-600', bgCls: 'bg-emerald-50',  badgeCls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
      case 'return':  return { icon: RefreshCcw, iconCls: 'text-orange-600',  bgCls: 'bg-orange-50',   badgeCls: 'bg-orange-100  text-orange-700  border-orange-200'  }
      default:        return { icon: FileText,   iconCls: 'text-slate-400',   bgCls: 'bg-slate-100',   badgeCls: 'bg-slate-100   text-slate-500   border-slate-200'   }
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return {
      date: formatDateSync(date),
      time: formatTime(date)
    }
  }

  const StyledSelect = ({ value, onChange, children }: {
    value: string; onChange: (v: string) => void; children: React.ReactNode
  }) => (
    <div className="relative">
      <select
        className="w-full appearance-none border border-slate-300 rounded-lg px-3 py-2.5 pr-9 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90 pointer-events-none" />
    </div>
  )

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
        <PageHeader
          title="User Activity"
          subtitle="System audit trail and user actions"
          onBack={goBack}
          right={<SessionStatus />}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50">
          {loading ? (
            <SectionLoader message="Loading user activities..." />
          ) : (
            <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

              {/* Export */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToCSV}
                  className="gap-2 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
              </div>

              {/* Summary Cards */}
              {summary && (
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { icon: Activity,   label: 'Total Activities', value: summary.totalActivities,                                          color: 'emerald' },
                    { icon: Users,      label: 'Active Users',     value: summary.uniqueUsers,                                              color: 'navy'    },
                    { icon: Layers,     label: 'Action Types',     value: summary.activityTypes.length,                                     color: 'emerald' },
                    { icon: TrendingUp, label: 'Most Active',      value: summary.topUsers.length > 0 ? summary.topUsers[0].activityCount : 0, color: 'navy' },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <Card key={label} className="border-slate-200 shadow-sm">
                      <CardContent className="p-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                          color === 'emerald' ? 'bg-emerald-50' : 'bg-slate-100'
                        }`}>
                          <Icon className={`w-4 h-4 ${color === 'emerald' ? 'text-emerald-600' : 'text-[hsl(215,65%,30%)]'}`} />
                        </div>
                        <div className={`text-2xl font-bold ${color === 'emerald' ? 'text-emerald-600' : 'text-[hsl(215,65%,30%)]'}`}>
                          {value}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Filters */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <Clock className="w-3.5 h-3.5" /> Time Period
                      </label>
                      <StyledSelect value={dateFilter} onChange={setDateFilter}>
                        <option value="today">Today</option>
                        <option value="week">Last 7 days</option>
                        <option value="month">Last 30 days</option>
                        <option value="all">All time</option>
                      </StyledSelect>
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <Tag className="w-3.5 h-3.5" /> Action Type
                      </label>
                      <StyledSelect value={actionTypeFilter} onChange={setActionTypeFilter}>
                        <option value="all">All Actions</option>
                        <option value="LOGIN">Login</option>
                        <option value="LOGOUT">Logout</option>
                        <option value="SALE">Sales</option>
                        <option value="RETURN">Returns</option>
                        <option value="CREATE">Create</option>
                        <option value="UPDATE">Update</option>
                        <option value="DELETE">Delete</option>
                      </StyledSelect>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Activities List */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-0">
                  {activities.length === 0 ? (
                    <div className="py-14 flex flex-col items-center gap-2 text-slate-400">
                      <Activity className="w-8 h-8 opacity-40" />
                      <p className="text-sm">No activities found for the selected criteria.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {activities.map((activity) => {

                        const { date, time } = formatTimestamp(activity.timestamp)
                        const meta = getActionMeta(activity.actionType || '')
                        const Icon = meta.icon
                        return (
                          <div key={activity.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                            {/* Icon */}
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${meta.bgCls}`}>
                              <Icon className={`w-4 h-4 ${meta.iconCls}`} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className="text-sm font-semibold text-slate-800">{activity.userName}</span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${meta.badgeCls}`}>
                                  {activity.actionType || 'Unknown'}
                                </span>
                                {activity.entityType && (
                                  <span className="text-[10px] text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">
                                    {activity.entityType}{activity.entityId ? ` #${activity.entityId}` : ''}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-slate-600 truncate">{activity.action}</p>
                              {activity.details && (
                                <p className="text-xs text-slate-400 mt-0.5 truncate">{activity.details}</p>
                              )}
                            </div>

                            {/* Timestamp */}
                            <div className="flex-shrink-0 text-right">
                              <p className="text-xs text-slate-500">{date}</p>
                              <p className="text-xs font-medium text-slate-700">{time}</p>
                              {activity.ipAddress && (
                                <p className="text-[10px] text-slate-400 mt-0.5">{activity.ipAddress}</p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs text-slate-500">
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} activities
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1 || loading}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>

                    {/* Page number pills */}
                    {getPageItems().map((item, idx) =>
                      item === null ? (
                        <span key={`ellipsis-${idx}`} className="text-xs text-slate-400 px-1">…</span>
                      ) : (
                        <Button
                          key={item}
                          variant="outline"
                          size="sm"
                          onClick={() => setPage(item)}
                          disabled={loading}
                          className={`h-8 w-8 p-0 text-xs font-medium ${
                            page === item
                              ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                              : 'text-slate-700'
                          }`}
                        >
                          {item}
                        </Button>
                      )
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages || loading}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

            </div>
          )}
        </main>
      </div>
    </SessionGuard>
  )
}

export default UserActivity