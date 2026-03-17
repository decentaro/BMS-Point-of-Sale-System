import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { formatCurrency } from '../utils/formatCurrency'
import SessionGuard from './SessionGuard'
import SessionStatus from './SessionStatus'
import ApiClient from '../utils/ApiClient'
import { formatDateForFile } from '../utils/dateFormat'
import PageHeader from './ui/PageHeader'
import { SectionLoader } from './ui/LoadingSpinner'
import {
  Download, ChevronRight, TrendingUp, ShoppingCart, Banknote,
  Percent, Users, RotateCcw, PackageX, ShoppingBag, Receipt,
  CreditCard, Tag, Trophy, CalendarDays
} from 'lucide-react'

interface SalesSummary {
  period: string
  totalSales: number
  totalRevenue: number
  totalTax: number
  totalDiscounts: number
}

interface TopProduct {
  productName: string
  totalQuantitySold: number
  totalRevenue: number
  transactionCount: number
}

interface PaymentMethodSummary {
  paymentMethod: string
  totalSales: number
  totalRevenue: number
}

interface PaymentBreakdown {
  period: string
  paymentMethods: PaymentMethodSummary[]
}

interface TaxSummary {
  period: string
  totalSales: number
  totalRevenue: number
  totalTaxCollected: number
  averageTaxRate: number
}

interface EmployeePerformance {
  employeeName: string
  totalSales: number
  totalRevenue: number
  averageTransactionValue: number
}

interface ReturnsSummary {
  period: string
  totalReturns: number
  totalRefundAmount: number
  totalItemsReturned: number
  returnsByReason: { reason: string; count: number; totalRefund: number }[]
  topReturnedProducts: { productName: string; returnQuantity: number; totalRefund: number }[]
}


const Reports: React.FC = () => {
  const navigate = useNavigate()

  // Session and role validation handled by SessionGuard wrapper

  // State management
  const [loading, setLoading] = React.useState<boolean>(true)
  const [todaySummary, setTodaySummary] = React.useState<SalesSummary | null>(null)
  const [weekSummary, setWeekSummary] = React.useState<SalesSummary | null>(null)
  const [monthSummary, setMonthSummary] = React.useState<SalesSummary | null>(null)
  const [topProducts, setTopProducts] = React.useState<TopProduct[]>([])
  const [topProductsDays, setTopProductsDays] = React.useState<number>(7)
  const [paymentBreakdown, setPaymentBreakdown] = React.useState<PaymentBreakdown | null>(null)
  const [taxSummary, setTaxSummary] = React.useState<TaxSummary | null>(null)
  const [employeePerformance, setEmployeePerformance] = React.useState<EmployeePerformance[]>([])
  const [returnsSummary, setReturnsSummary] = React.useState<ReturnsSummary | null>(null)
  const [returnsPeriod, setReturnsPeriod] = React.useState<string>('today')

  // Load all summaries
  const loadTodaySummary = async () => {
    try {
      const data = await ApiClient.getJson<SalesSummary>('/sales/today')
      setTodaySummary({
        period: 'Today',
        totalSales: data.totalSales,
        totalRevenue: data.totalRevenue,
        totalTax: data.totalTax,
        totalDiscounts: data.totalDiscounts
      })
    } catch (err) {
      console.error('Error loading today summary:', err)
    }
  }

  const loadWeekSummary = async () => {
    try {
      const data = await ApiClient.getJson<SalesSummary>('/sales/this-week')
      setWeekSummary(data)
    } catch (err) {
      console.error('Error loading week summary:', err)
    }
  }

  const loadMonthSummary = async () => {
    try {
      const data = await ApiClient.getJson<SalesSummary>('/sales/this-month')
      setMonthSummary(data)
    } catch (err) {
      console.error('Error loading month summary:', err)
    }
  }

  const loadTopProducts = async () => {
    try {
      const data = await ApiClient.getJson<TopProduct[]>(`/sales/top-products?days=${topProductsDays}`)
      setTopProducts(data)
    } catch (err) {
      console.error('Error loading top products:', err)
    }
  }

  const loadPaymentBreakdown = async () => {
    try {
      const data = await ApiClient.getJson<PaymentBreakdown>('/sales/payment-breakdown?period=month')
      setPaymentBreakdown(data)
    } catch (err) {
      console.error('Error loading payment breakdown:', err)
    }
  }

  const loadTaxSummary = async () => {
    try {
      const data = await ApiClient.getJson<TaxSummary>('/sales/tax-summary?period=month')
      setTaxSummary(data)
    } catch (err) {
      console.error('Error loading tax summary:', err)
    }
  }

  const loadEmployeePerformance = async () => {
    try {
      const data = await ApiClient.getJson<EmployeePerformance[]>('/sales/employee-performance?period=month')
      setEmployeePerformance(data)
    } catch (err) {
      console.error('Error loading employee performance:', err)
    }
  }

  const loadReturnsSummary = async (period = returnsPeriod) => {
    try {
      const data = await ApiClient.getJson<ReturnsSummary>(`/returns/summary?period=${period}`)
      setReturnsSummary(data)
    } catch (err) {
      console.error('Error loading returns summary:', err)
    }
  }

  // Load all reports data
  const loadReports = async () => {
    try {
      setLoading(true)
      await Promise.all([
        loadTodaySummary(),
        loadWeekSummary(),
        loadMonthSummary(),
        loadTopProducts(),
        loadPaymentBreakdown(),
        loadTaxSummary(),
        loadEmployeePerformance(),
        loadReturnsSummary()
      ])
    } catch (err) {
      console.error('Error loading reports:', err)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    loadReports()
  }, [])

  React.useEffect(() => {
    if (!loading) {
      loadTopProducts()
    }
  }, [topProductsDays])

  React.useEffect(() => {
    if (!loading) {
      loadReturnsSummary(returnsPeriod)
    }
  }, [returnsPeriod])

  const goBack = () => {
    navigate('/manager')
  }

  // CSV Export functionality
  const exportToCSV = () => {
    const csvData = []
    
    // Add headers
    csvData.push('Report Type,Period,Total Sales,Total Revenue,Total Tax,Total Discounts')
    
    // Add today's data
    if (todaySummary) {
      csvData.push(`Today's Performance,${todaySummary.period},${todaySummary.totalSales},${todaySummary.totalRevenue},${todaySummary.totalTax},${todaySummary.totalDiscounts}`)
    }
    
    // Add week's data
    if (weekSummary) {
      csvData.push(`This Week,${weekSummary.period},${weekSummary.totalSales},${weekSummary.totalRevenue},${weekSummary.totalTax},${weekSummary.totalDiscounts}`)
    }
    
    // Add month's data
    if (monthSummary) {
      csvData.push(`This Month,${monthSummary.period},${monthSummary.totalSales},${monthSummary.totalRevenue},${monthSummary.totalTax},${monthSummary.totalDiscounts}`)
    }
    
    // Add payment breakdown
    if (paymentBreakdown) {
      csvData.push('')
      csvData.push(`Payment Method Breakdown (${paymentBreakdown.period})`)
      csvData.push('Payment Method,Sales Count,Revenue')
      paymentBreakdown.paymentMethods.forEach(method => {
        csvData.push(`${method.paymentMethod},${method.totalSales},${method.totalRevenue}`)
      })
    }
    
    // Add tax summary
    if (taxSummary) {
      csvData.push('')
      csvData.push(`Tax Summary (${taxSummary.period})`)
      csvData.push('Period,Total Sales,Total Revenue,Tax Collected,Average Tax Rate')
      csvData.push(`${taxSummary.period},${taxSummary.totalSales},${taxSummary.totalRevenue},${taxSummary.totalTaxCollected},${taxSummary.averageTaxRate.toFixed(3)}%`)
    }
    
    // Add employee performance
    if (employeePerformance.length > 0) {
      csvData.push('')
      csvData.push('Employee Performance (This Month)')
      csvData.push('Employee Name,Total Sales,Total Revenue,Average Transaction Value')
      employeePerformance.forEach(employee => {
        csvData.push(`${employee.employeeName.replace(/,/g, ';')},${employee.totalSales},${employee.totalRevenue},${employee.averageTransactionValue.toFixed(2)}`)
      })
    }
    
    // Add returns summary
    if (returnsSummary) {
      csvData.push('')
      csvData.push(`Returns Summary (${returnsSummary.period})`)
      csvData.push(`Total Returns,${returnsSummary.totalReturns}`)
      csvData.push(`Total Refunded,${returnsSummary.totalRefundAmount}`)
      csvData.push(`Total Items Returned,${returnsSummary.totalItemsReturned}`)
      if (returnsSummary.returnsByReason.length > 0) {
        csvData.push('')
        csvData.push('Returns by Reason')
        csvData.push('Reason,Items Returned,Total Refund')
        returnsSummary.returnsByReason.forEach(r => {
          csvData.push(`${r.reason.replace(/,/g, ';')},${r.count},${r.totalRefund}`)
        })
      }
      if (returnsSummary.topReturnedProducts.length > 0) {
        csvData.push('')
        csvData.push('Most Returned Products')
        csvData.push('Product,Qty Returned,Total Refund')
        returnsSummary.topReturnedProducts.forEach(p => {
          csvData.push(`${p.productName.replace(/,/g, ';')},${p.returnQuantity},${p.totalRefund}`)
        })
      }
    }

    // Add top products
    csvData.push('')
    csvData.push('Top Products (Last ' + topProductsDays + ' days)')
    csvData.push('Rank,Product Name,Quantity Sold,Revenue,Transactions')
    
    topProducts.forEach((product, index) => {
      csvData.push(`${index + 1},${product.productName.replace(/,/g, ';')},${product.totalQuantitySold},${product.totalRevenue},${product.transactionCount}`)
    })
    
    // Create CSV blob and download
    const csvContent = csvData.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `sales-report-${formatDateForFile(new Date())}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const StyledSelect = ({ value, onChange, children }: {
    value: string | number; onChange: (v: string) => void; children: React.ReactNode
  }) => (
    <div className="relative">
      <select
        className="appearance-none border border-slate-300 rounded-lg pl-3 pr-8 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {children}
      </select>
      <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 rotate-90 pointer-events-none" />
    </div>
  )

  const SectionHeader = ({ icon: Icon, label, color = 'emerald' }: {
    icon: React.ElementType; label: string; color?: 'emerald' | 'navy' | 'red'
  }) => {
    const cls = {
      emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      navy:    'text-[hsl(215,65%,30%)] bg-slate-50 border-slate-200',
      red:     'text-red-600 bg-red-50 border-red-200',
    }[color]
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cls} mb-4`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm font-semibold tracking-wide uppercase">{label}</span>
      </div>
    )
  }

  const StatTile = ({ value, label, icon: Icon, color = 'emerald' }: {
    value: string | number; label: string; icon: React.ElementType; color?: 'emerald' | 'navy' | 'red'
  }) => {
    const iconBg  = { emerald: 'bg-emerald-50',              navy: 'bg-slate-100',   red: 'bg-red-50'    }[color]
    const iconCls = { emerald: 'text-emerald-600',           navy: 'text-[hsl(215,65%,30%)]', red: 'text-red-600' }[color]
    const valCls  = { emerald: 'text-emerald-600',           navy: 'text-[hsl(215,65%,30%)]', red: 'text-red-600' }[color]
    const lblCls  = { emerald: 'text-emerald-700/70',        navy: 'text-slate-500',  red: 'text-red-700/70' }[color]
    return (
      <div className="flex flex-col items-center justify-center p-4 rounded-lg border border-slate-100 bg-white gap-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconCls}`} />
        </div>
        <div className={`text-2xl font-bold leading-none ${valCls}`}>{value}</div>
        <div className={`text-xs font-medium text-center ${lblCls}`}>{label}</div>
      </div>
    )
  }

  const EmptyState = ({ icon: Icon, message }: { icon: React.ElementType; message: string }) => (
    <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
      <Icon className="w-7 h-7 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
        <PageHeader
          title="Sales Reports"
          subtitle="Business analytics and performance data"
          onBack={goBack}
          right={<SessionStatus />}
        />

        <main className="flex-1 overflow-y-auto bg-slate-50">
          {loading ? (
            <SectionLoader message="Loading reports..." />
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

              {/* ── Today's Performance ────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <SectionHeader icon={TrendingUp} label="Today's Performance" color="emerald" />
                  {todaySummary ? (
                    <div className="grid grid-cols-4 gap-3">
                      <StatTile icon={ShoppingCart} value={todaySummary.totalSales}                     label="Total Sales"     color="emerald" />
                      <StatTile icon={Banknote}     value={formatCurrency(todaySummary.totalRevenue)}   label="Revenue"        color="navy"    />
                      <StatTile icon={Receipt}      value={formatCurrency(todaySummary.totalTax)}       label="Tax Collected"  color="emerald" />
                      <StatTile icon={Tag}          value={formatCurrency(todaySummary.totalDiscounts)} label="Discounts Given" color="navy"   />
                    </div>
                  ) : (
                    <EmptyState icon={ShoppingCart} message="No sales data for today" />
                  )}
                </CardContent>
              </Card>

              {/* ── Week & Month ───────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-5">
                {/* This Week */}
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="p-5">
                    <SectionHeader icon={CalendarDays} label="This Week" color="navy" />
                    {weekSummary ? (
                      <>
                        <p className="text-xs text-slate-400 mb-3">{weekSummary.period}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <StatTile icon={ShoppingCart} value={weekSummary.totalSales}                   label="Sales"     color="emerald" />
                          <StatTile icon={Banknote}     value={formatCurrency(weekSummary.totalRevenue)} label="Revenue"   color="navy"    />
                          <StatTile icon={Receipt}      value={formatCurrency(weekSummary.totalTax)}     label="Tax"       color="emerald" />
                          <StatTile icon={Tag}          value={formatCurrency(weekSummary.totalDiscounts)} label="Discounts" color="navy"  />
                        </div>
                      </>
                    ) : (
                      <EmptyState icon={CalendarDays} message="No weekly data" />
                    )}
                  </CardContent>
                </Card>

                {/* This Month */}
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="p-5">
                    <SectionHeader icon={CalendarDays} label="This Month" color="emerald" />
                    {monthSummary ? (
                      <>
                        <p className="text-xs text-slate-400 mb-3">{monthSummary.period}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <StatTile icon={ShoppingCart} value={monthSummary.totalSales}                   label="Sales"     color="emerald" />
                          <StatTile icon={Banknote}     value={formatCurrency(monthSummary.totalRevenue)} label="Revenue"   color="navy"    />
                          <StatTile icon={Receipt}      value={formatCurrency(monthSummary.totalTax)}     label="Tax"       color="emerald" />
                          <StatTile icon={Tag}          value={formatCurrency(monthSummary.totalDiscounts)} label="Discounts" color="navy"  />
                        </div>
                      </>
                    ) : (
                      <EmptyState icon={CalendarDays} message="No monthly data" />
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── Returns & Refunds ──────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50">
                      <RotateCcw className="w-4 h-4 text-red-600 flex-shrink-0" />
                      <span className="text-sm font-semibold tracking-wide uppercase text-red-600">Returns &amp; Refunds</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Period:</span>
                      <StyledSelect value={returnsPeriod} onChange={setReturnsPeriod}>
                        <option value="today">Today</option>
                        <option value="week">Last 7 days</option>
                        <option value="month">Last 30 days</option>
                        <option value="all">All time</option>
                      </StyledSelect>
                    </div>
                  </div>

                  {returnsSummary ? (
                    <div className="space-y-4">
                      {/* KPI row */}
                      <div className="grid grid-cols-3 gap-3">
                        <StatTile icon={RotateCcw}  value={returnsSummary.totalReturns}                      label="Return Transactions" color="red" />
                        <StatTile icon={Banknote}   value={formatCurrency(returnsSummary.totalRefundAmount)} label="Total Refunded"      color="red" />
                        <StatTile icon={PackageX}   value={returnsSummary.totalItemsReturned}                label="Items Returned"      color="red" />
                      </div>

                      {/* Net revenue */}
                      {(monthSummary || weekSummary || todaySummary) && returnsPeriod !== 'all' && (
                        (() => {
                          const base = returnsPeriod === 'today' ? todaySummary : returnsPeriod === 'week' ? weekSummary : monthSummary
                          if (!base) return null
                          const net = base.totalRevenue - returnsSummary.totalRefundAmount
                          return (
                            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-1">
                              <div className="flex justify-between items-center text-slate-700">
                                <span>Gross Revenue ({returnsSummary.period})</span>
                                <span className="font-semibold">{formatCurrency(base.totalRevenue)}</span>
                              </div>
                              <div className="flex justify-between items-center text-red-600">
                                <span>Returns / Refunds</span>
                                <span className="font-semibold">− {formatCurrency(returnsSummary.totalRefundAmount)}</span>
                              </div>
                              <div className="flex justify-between items-center font-bold border-t border-amber-300 pt-1 text-emerald-700">
                                <span>Net Revenue</span>
                                <span>{formatCurrency(net)}</span>
                              </div>
                            </div>
                          )
                        })()
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        {/* By Reason */}
                        {returnsSummary.returnsByReason.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">By Reason</p>
                            <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                              {returnsSummary.returnsByReason.map((r, i) => (
                                <div key={i} className="flex justify-between items-center px-3 py-2 bg-white hover:bg-slate-50 text-sm">
                                  <span className="text-slate-700 truncate pr-2">{r.reason || 'Not specified'}</span>
                                  <span className="text-red-600 font-medium whitespace-nowrap text-xs">{r.count} · {formatCurrency(r.totalRefund)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Most Returned Products */}
                        {returnsSummary.topReturnedProducts.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Most Returned</p>
                            <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                              {returnsSummary.topReturnedProducts.map((p, i) => (
                                <div key={i} className="flex justify-between items-center px-3 py-2 bg-white hover:bg-slate-50 text-sm">
                                  <span className="text-slate-700 truncate pr-2">{p.productName}</span>
                                  <span className="text-red-600 font-medium whitespace-nowrap text-xs">{p.returnQuantity} · {formatCurrency(p.totalRefund)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {returnsSummary.totalReturns === 0 && (
                        <EmptyState icon={RotateCcw} message="No returns for this period" />
                      )}
                    </div>
                  ) : (
                    <EmptyState icon={RotateCcw} message="No returns data" />
                  )}
                </CardContent>
              </Card>

              {/* ── Top Selling Products ───────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50">
                      <Trophy className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-sm font-semibold tracking-wide uppercase text-emerald-600">Top Selling Products</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Last</span>
                      <StyledSelect value={topProductsDays} onChange={v => setTopProductsDays(parseInt(v))}>
                        <option value={7}>7 days</option>
                        <option value={30}>30 days</option>
                        <option value={90}>90 days</option>
                      </StyledSelect>
                    </div>
                  </div>

                  {topProducts.length > 0 ? (
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                      {topProducts.map((product, index) => (
                        <div key={index} className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-slate-50 transition-colors">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            index === 0 ? 'bg-amber-100 text-amber-700' :
                            index === 1 ? 'bg-slate-200 text-slate-600' :
                            index === 2 ? 'bg-orange-100 text-orange-700' :
                                          'bg-emerald-50 text-emerald-700'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{product.productName}</p>
                            <p className="text-xs text-slate-400">{product.transactionCount} transaction{product.transactionCount !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold text-slate-700">{product.totalQuantitySold} sold</p>
                            <p className="text-xs text-emerald-600 font-medium">{formatCurrency(product.totalRevenue)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={ShoppingBag} message="No sales data for the selected period" />
                  )}
                </CardContent>
              </Card>

              {/* ── Payment Methods & Tax Summary ──────────────────── */}
              <div className="grid grid-cols-2 gap-5">
                {/* Payment Methods */}
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="p-5">
                    <SectionHeader icon={CreditCard} label="Payment Methods" color="navy" />
                    {paymentBreakdown ? (
                      <>
                        <p className="text-xs text-slate-400 mb-3">{paymentBreakdown.period}</p>
                        <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                          {paymentBreakdown.paymentMethods.map((method, index) => (
                            <div key={index} className="flex items-center justify-between px-3 py-2.5 bg-white hover:bg-slate-50 transition-colors">
                              <div>
                                <p className="text-sm font-medium text-slate-800">{method.paymentMethod}</p>
                                <p className="text-xs text-slate-400">{method.totalSales} transactions</p>
                              </div>
                              <p className="text-sm font-semibold text-emerald-600">{formatCurrency(method.totalRevenue)}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <EmptyState icon={CreditCard} message="No payment data" />
                    )}
                  </CardContent>
                </Card>

                {/* Tax Summary */}
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="p-5">
                    <SectionHeader icon={Percent} label="Tax Summary" color="emerald" />
                    {taxSummary ? (
                      <>
                        <p className="text-xs text-slate-400 mb-3">{taxSummary.period}</p>
                        <div className="space-y-2">
                          <StatTile icon={Receipt} value={formatCurrency(taxSummary.totalTaxCollected)} label="Total Tax Collected" color="emerald" />
                          <StatTile icon={Percent} value={`${taxSummary.averageTaxRate.toFixed(3)}%`}  label="Average Tax Rate"   color="navy"    />
                          <StatTile icon={Banknote} value={formatCurrency(taxSummary.totalRevenue)}    label="Taxable Revenue"    color="emerald" />
                        </div>
                      </>
                    ) : (
                      <EmptyState icon={Percent} message="No tax data" />
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── Employee Performance ───────────────────────────── */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-5">
                  <SectionHeader icon={Users} label="Employee Performance — This Month" color="navy" />
                  {employeePerformance.length > 0 ? (
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                      {employeePerformance.map((employee, index) => (
                        <div key={index} className="flex items-center gap-3 px-3 py-2.5 bg-white hover:bg-slate-50 transition-colors">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            index === 0 ? 'bg-amber-100 text-amber-700' :
                            index === 1 ? 'bg-slate-200 text-slate-600' :
                            index === 2 ? 'bg-orange-100 text-orange-700' :
                                          'bg-slate-100 text-slate-500'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">{employee.employeeName}</p>
                            <p className="text-xs text-slate-400">{employee.totalSales} sales</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold text-emerald-600">{formatCurrency(employee.totalRevenue)}</p>
                            <p className="text-xs text-slate-400">Avg {formatCurrency(employee.averageTransactionValue)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={Users} message="No employee data" />
                  )}
                </CardContent>
              </Card>

            </div>
          )}
        </main>
      </div>
    </SessionGuard>
  )
}

export default Reports