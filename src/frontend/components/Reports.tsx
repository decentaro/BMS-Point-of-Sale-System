import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { formatCurrency } from '../utils/formatCurrency'
import SessionGuard from './SessionGuard'
import SessionStatus from './SessionStatus'
import SessionManager from '../utils/SessionManager'
import ApiClient from '../utils/ApiClient'
import { formatDateForFile } from '../utils/dateFormat'

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

  // Load all summaries
  const loadTodaySummary = async () => {
    try {
      const data = await ApiClient.getJson('/sales/today')
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
      const data = await ApiClient.getJson('/sales/this-week')
      setWeekSummary(data)
    } catch (err) {
      console.error('Error loading week summary:', err)
    }
  }

  const loadMonthSummary = async () => {
    try {
      const data = await ApiClient.getJson('/sales/this-month')
      setMonthSummary(data)
    } catch (err) {
      console.error('Error loading month summary:', err)
    }
  }

  const loadTopProducts = async () => {
    try {
      const data = await ApiClient.getJson(`/sales/top-products?days=${topProductsDays}`)
      setTopProducts(data)
    } catch (err) {
      console.error('Error loading top products:', err)
    }
  }

  const loadPaymentBreakdown = async () => {
    try {
      const data = await ApiClient.getJson('/sales/payment-breakdown?period=month')
      setPaymentBreakdown(data)
    } catch (err) {
      console.error('Error loading payment breakdown:', err)
    }
  }

  const loadTaxSummary = async () => {
    try {
      const data = await ApiClient.getJson('/sales/tax-summary?period=month')
      setTaxSummary(data)
    } catch (err) {
      console.error('Error loading tax summary:', err)
    }
  }

  const loadEmployeePerformance = async () => {
    try {
      const data = await ApiClient.getJson('/sales/employee-performance?period=month')
      setEmployeePerformance(data)
    } catch (err) {
      console.error('Error loading employee performance:', err)
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
        loadEmployeePerformance()
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

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600">Loading reports...</div>
        </div>
      </div>
    )
  }

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
      {/* Header */}
      <header className="h-14 px-4 border-b flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={goBack}>← Back</Button>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-emerald-600">Sales Reports</h1>
          <p className="text-[10px] text-muted-foreground">
            Business analytics and performance data
          </p>
        </div>
        <SessionStatus />
      </header>

      {/* Body */}
      <main className="flex-1 px-6 pb-6 overflow-y-auto bg-slate-50">
        <div className="pt-6">
          <div className="max-w-6xl mx-auto space-y-6">

          {/* Export Button Row */}
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

          {/* Today's Summary */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Today's Performance</h2>
              
              {todaySummary ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{todaySummary.totalSales}</div>
                    <div className="text-sm text-emerald-700">Total Sales</div>
                  </div>
                  
                  <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{formatCurrency(todaySummary.totalRevenue)}</div>
                    <div className="text-sm text-emerald-700">Revenue</div>
                  </div>
                  
                  <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{formatCurrency(todaySummary.totalTax)}</div>
                    <div className="text-sm text-emerald-700">Tax Collected</div>
                  </div>
                  
                  <div className="p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{formatCurrency(todaySummary.totalDiscounts)}</div>
                    <div className="text-sm text-emerald-700">Discounts Given</div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  No sales data for today
                </div>
              )}
            </CardContent>
          </Card>

          {/* Week and Month Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-md font-semibold mb-4">This Week</h3>
                {weekSummary ? (
                  <div className="space-y-3">
                    <div className="text-xs text-gray-600 mb-3">{weekSummary.period}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{weekSummary.totalSales}</div>
                        <div className="text-xs text-emerald-700">Sales</div>
                      </div>
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{formatCurrency(weekSummary.totalRevenue)}</div>
                        <div className="text-xs text-emerald-700">Revenue</div>
                      </div>
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{formatCurrency(weekSummary.totalTax)}</div>
                        <div className="text-xs text-emerald-700">Tax</div>
                      </div>
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{formatCurrency(weekSummary.totalDiscounts)}</div>
                        <div className="text-xs text-emerald-700">Discounts</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-sm">No weekly data</div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-md font-semibold mb-4">This Month</h3>
                {monthSummary ? (
                  <div className="space-y-3">
                    <div className="text-xs text-gray-600 mb-3">{monthSummary.period}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{monthSummary.totalSales}</div>
                        <div className="text-xs text-emerald-700">Sales</div>
                      </div>
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{formatCurrency(monthSummary.totalRevenue)}</div>
                        <div className="text-xs text-emerald-700">Revenue</div>
                      </div>
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{formatCurrency(monthSummary.totalTax)}</div>
                        <div className="text-xs text-emerald-700">Tax</div>
                      </div>
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{formatCurrency(monthSummary.totalDiscounts)}</div>
                        <div className="text-xs text-emerald-700">Discounts</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-sm">No monthly data</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Products */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-semibold">Top Selling Products</h3>
                
                {/* Time Range Filter */}
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-600">Last</span>
                  <select 
                    className="text-sm border rounded px-2 py-1"
                    value={topProductsDays}
                    onChange={(e) => setTopProductsDays(parseInt(e.target.value))}
                  >
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                  </select>
                </div>
              </div>
              
              {topProducts.length > 0 ? (
                <div className="space-y-3">
                  {topProducts.map((product, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="bg-emerald-100 text-emerald-700 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{product.productName}</div>
                          <div className="text-xs text-gray-600">
                            {product.transactionCount} transaction{product.transactionCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm">{product.totalQuantitySold} sold</div>
                        <div className="text-xs text-emerald-600">{formatCurrency(product.totalRevenue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-sm">No sales data found</div>
                  <div className="text-xs text-gray-400">for the selected time period</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Methods & Business Insights */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Payment Method Breakdown */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-md font-semibold mb-4">Payment Methods</h3>
                {paymentBreakdown ? (
                  <div className="space-y-3">
                    <div className="text-xs text-gray-600 mb-3">{paymentBreakdown.period}</div>
                    {paymentBreakdown.paymentMethods.map((method, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium text-sm">{method.paymentMethod}</div>
                          <div className="text-xs text-gray-600">{method.totalSales} transactions</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-sm text-emerald-600">{formatCurrency(method.totalRevenue)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-sm">No payment data</div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tax Summary */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-md font-semibold mb-4">Tax Summary</h3>
                {taxSummary ? (
                  <div className="space-y-3">
                    <div className="text-xs text-gray-600 mb-3">{taxSummary.period}</div>
                    <div className="space-y-2">
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{formatCurrency(taxSummary.totalTaxCollected)}</div>
                        <div className="text-xs text-emerald-700">Total Tax Collected</div>
                      </div>
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{taxSummary.averageTaxRate.toFixed(3)}%</div>
                        <div className="text-xs text-emerald-700">Average Tax Rate</div>
                      </div>
                      <div className="p-3 text-center">
                        <div className="text-lg font-bold text-emerald-600">{formatCurrency(taxSummary.totalRevenue)}</div>
                        <div className="text-xs text-emerald-700">Taxable Revenue</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-sm">No tax data</div>
                  </div>
                )}
              </CardContent>
            </Card>
            
          </div>

          {/* Employee Performance */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-md font-semibold mb-4">Employee Performance (This Month)</h3>
              {employeePerformance.length > 0 ? (
                <div className="space-y-3">
                  {employeePerformance.map((employee, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="bg-emerald-100 text-emerald-700 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{employee.employeeName}</div>
                          <div className="text-xs text-gray-600">
                            {employee.totalSales} sales
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm text-emerald-600">{formatCurrency(employee.totalRevenue)}</div>
                        <div className="text-xs text-gray-600">Avg: {formatCurrency(employee.averageTransactionValue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-sm">No employee data</div>
                </div>
              )}
            </CardContent>
          </Card>

          </div>
        </div>
      </main>
      </div>
    </SessionGuard>
  )
}

export default Reports