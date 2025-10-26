import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import ReceiptPreview from './ReceiptPreview'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import { SystemSettings } from '../types/SystemSettings'
import ApiClient from '../utils/ApiClient'
import DateDisplay from './DateDisplay'
import { formatDateForFile, formatDateSync } from '../utils/dateFormat'
import { generateTextReceipt } from '../utils/receiptFormatter'
import { formatCurrency } from '../utils/formatCurrency'

// Sale interface matching the API model
interface Sale {
  id: number
  transactionId: string
  saleDate: string
  status: string
  subtotal: number
  taxAmount: number
  taxRate: number
  discountAmount: number
  discountReason?: string
  total: number
  amountPaid: number
  change: number
  paymentMethod: string
  notes?: string
  employeeId: number
  employee: {
    id: number
    employeeId: string
    name: string
    role: string
  }
  saleItems: SaleItem[]
  // Return status fields
  hasReturns?: boolean
  returnInfo?: {
    returnId: string
    returnDate: string
    refundAmount: number
    isPartial: boolean
    returnedItems: number
    totalItems: number
  }
}

interface SaleItem {
  id: number
  productId: number
  productName: string
  productBarcode: string
  quantity: number
  unitPrice: number
  lineTotal: number
  product: {
    id: number
    name: string
    barcode: string
    price: number
  }
}



const SalesHistory: React.FC = () => {
  const navigate = useNavigate()

  // State management
  const [sales, setSales] = React.useState<Sale[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [searchQuery, setSearchQuery] = React.useState<string>('')
  const [dateFilter, setDateFilter] = React.useState<string>('today')
  const [returns, setReturns] = React.useState<any[]>([])
  const [loadingReturns, setLoadingReturns] = React.useState<boolean>(false)
  
  // Receipt preview state
  const [showReceiptPreview, setShowReceiptPreview] = React.useState<boolean>(false)
  const [selectedSale, setSelectedSale] = React.useState<Sale | null>(null)
  const [systemSettings, setSystemSettings] = React.useState<SystemSettings | null>(null)
  const [taxSettings, setTaxSettings] = React.useState<any>(null)

  // Modal keyboard state
  const [kbOpen, setKbOpen] = React.useState<boolean>(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('qwerty')
  const [kbTitle, setKbTitle] = React.useState<string>('')
  const [kbTarget, setKbTarget] = React.useState<'search'>('search')

  const openKb = (target: 'search', type: KeyboardType, title: string) => {
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
    setKbOpen(true)
  }

  const applyKb = (val: string) => {
    if (kbTarget === 'search') {
      setSearchQuery(val)
    }
    setKbOpen(false)
  }

  // Load sales from API based on current date filter
  const loadSales = async () => {
    try {
      setLoading(true)
      const endpoint = '/sales'
      const salesData = await ApiClient.getJson<Sale[]>(endpoint, false)
      
      // Always expect an array from /sales endpoint
      if (Array.isArray(salesData)) {
        setSales(salesData)
      } else {
        setSales([])
      }
      
      // Load returns data after sales are loaded
      await loadReturnsData(Array.isArray(salesData) ? salesData : [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sales'
      alert(`Failed to load sales history!\n\n${errorMessage}\n\nPlease check your connection and try again.`)
      console.error('Error loading sales:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load returns data and match with sales
  const loadReturnsData = async (salesData: Sale[]) => {
    try {
      setLoadingReturns(true)
      const returnsData = await ApiClient.getJson<any[]>('/returns', false)
      setReturns(returnsData)
      
      // Enhance sales data with return information
      const enhancedSales = salesData.map(sale => {
        const saleReturns = returnsData.filter(returnRecord => returnRecord.originalSaleId === sale.id)
        
        if (saleReturns.length === 0) {
          return sale // No returns for this sale
        }

        // Calculate return totals
        const totalReturnedItems = saleReturns.reduce((sum, ret) => 
          sum + ret.returnItems.reduce((itemSum, item) => itemSum + item.returnQuantity, 0), 0)
        const totalOriginalItems = sale.saleItems.reduce((sum, item) => sum + item.quantity, 0)
        const totalRefundAmount = saleReturns.reduce((sum, ret) => sum + ret.totalRefundAmount, 0)
        
        // Get the most recent return for display
        const mostRecentReturn = saleReturns.sort((a, b) => 
          new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime())[0]
        
        return {
          ...sale,
          hasReturns: true,
          returnInfo: {
            returnId: mostRecentReturn.returnId,
            returnDate: mostRecentReturn.returnDate,
            refundAmount: totalRefundAmount,
            isPartial: totalReturnedItems < totalOriginalItems,
            returnedItems: totalReturnedItems,
            totalItems: totalOriginalItems
          }
        }
      })
      
      setSales(enhancedSales)
      
    } catch (err) {
      console.error('Error loading returns data:', err)
      // Don't show error to user since returns are optional
    } finally {
      setLoadingReturns(false)
    }
  }

  // Load system settings for receipt preview
  const loadSystemSettings = async () => {
    try {
      const settings = await ApiClient.getSettings<SystemSettings>('system')
      setSystemSettings(settings)
    } catch (err) {
      console.error('Error loading system settings:', err)
    }
  }

  // Load tax settings for consistent labels
  const loadTaxSettings = async () => {
    try {
      try {
        const data = await ApiClient.getSettings<any>('tax')
        setTaxSettings(data)
      } catch (error) {
        console.log('Tax settings not found')
        // Use default settings if none found
        setTaxSettings({
          enableTax: true,
          taxName: 'Sales Tax',
          taxRate: 10,
          enableSecondaryTax: false,
          secondaryTaxName: 'Service Tax',
          secondaryTaxRate: 5,
          enableTaxExemptions: false
        })
      }
    } catch (err) {
      console.error('Error loading tax settings:', err)
      // Use default settings on error
      setTaxSettings({
        enableTax: true,
        taxName: 'Sales Tax',
        taxRate: 10,
        enableSecondaryTax: false,
        secondaryTaxName: 'Service Tax',
        secondaryTaxRate: 5,
        enableTaxExemptions: false
      })
    }
  }

  // Load sales on component mount and when date filter changes
  React.useEffect(() => {
    loadSales()
  }, [dateFilter])

  React.useEffect(() => {
    loadSystemSettings()
    loadTaxSettings()
  }, [])

  // Filter sales based on search query and date filter
  const filteredSales = React.useMemo(() => {
    // Ensure sales is always an array
    if (!Array.isArray(sales)) {
      return []
    }
    
    let filtered = sales

    // Date filter - handle all date ranges client-side
    if (dateFilter === 'today') {
      const today = new Date()
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)
      
      filtered = filtered.filter(sale => {
        const saleDate = new Date(sale.saleDate)
        return saleDate >= startOfToday && saleDate < endOfToday
      })
    } else if (dateFilter === 'week') {
      const today = new Date()
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      filtered = filtered.filter(sale => {
        const saleDate = new Date(sale.saleDate)
        return saleDate >= weekAgo
      })
    } else if (dateFilter === 'month') {
      const today = new Date()
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      
      filtered = filtered.filter(sale => {
        const saleDate = new Date(sale.saleDate)
        return saleDate >= monthAgo
      })
    }
    // 'all' shows everything - no filtering needed

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(sale =>
        sale.transactionId.toLowerCase().includes(query) ||
        sale.employee.name.toLowerCase().includes(query) ||
        sale.employee.employeeId.toLowerCase().includes(query) ||
        sale.paymentMethod.toLowerCase().includes(query)
      )
    }

    return filtered.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime())
  }, [sales, searchQuery, dateFilter])

  // Handle reprint receipt
  const handleReprintReceipt = (sale: Sale) => {
    if (!systemSettings || !taxSettings) {
      alert('System settings not loaded. Please try again.')
      return
    }

    // Show warning for returned transactions
    if (sale.hasReturns) {
      const returnInfo = sale.returnInfo!
      const returnMessage = returnInfo.isPartial 
        ? `⚠️ CAUTION: This transaction has been PARTIALLY RETURNED\n\n` +
          `Return ID: ${returnInfo.returnId}\n` +
          `Return Date: ${formatDateSync(returnInfo.returnDate)}\n` +
          `Items Returned: ${returnInfo.returnedItems} of ${returnInfo.totalItems}\n` +
          `Refund Amount: ${formatCurrency(returnInfo.refundAmount)}\n\n` +
          `This receipt is for reference only. Customer has already received partial refund.`
        : `⚠️ CAUTION: This transaction has been FULLY RETURNED\n\n` +
          `Return ID: ${returnInfo.returnId}\n` +
          `Return Date: ${formatDateSync(returnInfo.returnDate)}\n` +
          `Refund Amount: ${formatCurrency(returnInfo.refundAmount)}\n\n` +
          `This receipt is for reference only. Customer has already received full refund.`
      
      const confirmReprint = confirm(
        `${returnMessage}\n\n` +
        `Do you still want to reprint this receipt?\n\n` +
        `⚠️ WARNING: Reprinting may lead to duplicate refund requests!`
      )
      
      if (!confirmReprint) {
        return
      }
    }

    // Calculate proper tax labels using the same logic as POS
    let taxLabel = ''
    let secondaryTaxLabel = ''
    
    if (taxSettings && taxSettings.enableTax && sale.taxAmount > 0) {
      // Calculate the tax rate from the actual tax amount
      const calculatedTaxRate = sale.subtotal > 0 ? (sale.taxAmount / sale.subtotal) * 100 : taxSettings.taxRate
      taxLabel = `${taxSettings.taxName} (${calculatedTaxRate.toFixed(3)}%)`
      
      // Secondary tax if enabled (not currently stored separately, but prepare for future)
      if (taxSettings.enableSecondaryTax) {
        secondaryTaxLabel = `${taxSettings.secondaryTaxName} (${taxSettings.secondaryTaxRate}%)`
      }
    } else if (sale.taxAmount === 0 && taxSettings?.enableTaxExemptions) {
      taxLabel = 'Tax Exempt'
    } else if (!taxSettings?.enableTax) {
      taxLabel = 'No Tax'
    }

    // Convert sale to receipt preview format
    const receiptData = {
      subtotal: sale.subtotal,
      taxAmount: sale.taxAmount,
      secondaryTaxAmount: 0, // Not stored separately in current schema
      taxLabel: taxLabel,
      secondaryTaxLabel: secondaryTaxLabel,
      discountAmount: sale.discountAmount,
      discountPercent: (sale.subtotal + sale.taxAmount) > 0 ? Math.round((sale.discountAmount / (sale.subtotal + sale.taxAmount)) * 100) : 0,
      discountReason: sale.discountReason || '',
      finalTotal: sale.total,
      amountPaid: sale.amountPaid,
      changeAmount: sale.change,
      paymentMethod: sale.paymentMethod,
      cart: sale.saleItems.map(item => ({
        product: {
          id: item.productId,
          name: item.productName,
          price: item.unitPrice,
          barcode: item.productBarcode
        },
        quantity: item.quantity,
        total: item.lineTotal
      })),
      transactionId: sale.transactionId,
      cashierName: sale.employee.name || sale.employee.employeeId,
      saleDate: sale.saleDate
    }

    setSelectedSale(sale)
    setShowReceiptPreview(true)
  }

  // Receipt preview actions
  const handlePrintReceipt = async () => {
    try {
      if (!selectedSale || !systemSettings) {
        alert('❌ Missing receipt data or system settings')
        return
      }

      // Calculate proper tax labels using the same logic as preview
      let taxLabel = ''
      let secondaryTaxLabel = ''
      
      if (taxSettings && taxSettings.enableTax && selectedSale.taxAmount > 0) {
        // Use the same tax rate format as POS
        taxLabel = `${taxSettings.taxName} (${taxSettings.taxRate}%)`
        
        // Secondary tax if enabled (not currently stored separately, but prepare for future)
        if (taxSettings.enableSecondaryTax) {
          secondaryTaxLabel = `${taxSettings.secondaryTaxName} (${taxSettings.secondaryTaxRate}%)`
        }
      } else if (selectedSale.taxAmount === 0 && taxSettings?.enableTaxExemptions) {
        taxLabel = 'Tax Exempt'
      } else if (!taxSettings?.enableTax) {
        taxLabel = 'No Tax'
      }

      // Convert selectedSale format to match POS receipt format
      const reprintSaleData = {
        transactionId: selectedSale.transactionId,
        saleDate: selectedSale.saleDate,
        cashierName: selectedSale.employee?.name,
        paymentMethod: selectedSale.paymentMethod,
        cart: selectedSale.saleItems.map((item: SaleItem) => ({
          product: {
            id: item.productId,
            name: item.productName,
            price: item.unitPrice,
            barcode: item.productBarcode || '00000'
          },
          quantity: item.quantity,
          total: item.lineTotal
        })),
        subtotal: selectedSale.subtotal,
        discountAmount: selectedSale.discountAmount || 0,
        discountPercent: (selectedSale.subtotal + selectedSale.taxAmount) > 0 ? Math.round((selectedSale.discountAmount / (selectedSale.subtotal + selectedSale.taxAmount)) * 100) : 0,
        discountReason: selectedSale.discountReason || '',
        taxAmount: selectedSale.taxAmount || 0,
        taxLabel: taxLabel,
        secondaryTaxAmount: 0,
        secondaryTaxLabel: secondaryTaxLabel,
        finalTotal: selectedSale.total,
        amountPaid: selectedSale.amountPaid,
        changeAmount: selectedSale.change || 0
      }

      // Generate receipt using receiptFormatter (no custom overrides)
      let receiptText = generateTextReceipt(reprintSaleData, systemSettings)
      
      // Add REPRINT header using same logic as receiptFormatter
      const paperWidth = systemSettings.receiptPaperSize === '58mm' ? 32 : 48
      const centerText = (text: string) => {
        const cleanText = text.replace(/📍|📞/g, '') // Remove emojis for length calc
        const textLength = cleanText.length
        const padding = Math.max(0, Math.floor((paperWidth - textLength) / 2))
        const centeredText = ' '.repeat(padding) + text
        return centeredText + '\n'
      }
      
      receiptText = centerText('*** REPRINT ***') + '\n' + receiptText

      const result = await window.electronAPI.printReceipt(receiptText)
      
      if (result.success) {
        alert('✅ ' + result.message)
      } else {
        alert('❌ ' + result.message)
      }
    } catch (error) {
      console.error('Error reprinting receipt:', error)
      alert('❌ Failed to reprint receipt')
    }
    
    setShowReceiptPreview(false)
    setSelectedSale(null)
  }

  const handleClosePreview = () => {
    setShowReceiptPreview(false)
    setSelectedSale(null)
  }

  const goBack = () => {
    navigate('/manager')
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600">Loading sales history...</div>
        </div>
      </div>
    )
  }

  return (
    <SessionGuard>
      <div className="w-full h-full flex flex-col bg-white">
      {/* Header */}
      <header className="h-14 px-4 border-b flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={goBack}>← Back</Button>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-emerald-600">Sales History</h1>
          <p className="text-[10px] text-muted-foreground">View and reprint receipts</p>
        </div>
        <SessionStatus />
      </header>

      {/* Body */}
      <main className="flex-1 px-6 pb-6 overflow-y-auto bg-slate-50">
        <div className="pt-6">
          <div className="max-w-6xl mx-auto space-y-6">
          

          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Search */}
                <div>
                  <label className="block text-sm font-medium mb-2">Search</label>
                  <HybridInput 
                    className="w-full p-3 border rounded-lg"
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Transaction ID, cashier name..."
                    onTouchKeyboard={() => openKb('search', 'qwerty', 'Search Sales')}
                  />
                </div>

                {/* Date Filter */}
                <div>
                  <label className="block text-sm font-medium mb-2">Date Range</label>
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

                {/* Summary */}
                <div className="flex flex-col justify-center">
                  <div className="text-sm text-gray-600">
                    <div>Total Sales: {filteredSales.length}</div>
                    <div>Total Revenue: {formatCurrency(filteredSales.reduce((sum, sale) => sum + sale.total, 0))}</div>
                  </div>
                </div>
                
              </div>
            </CardContent>
          </Card>

          {/* Sales List */}
          <Card>
            <CardContent className="p-0">
              {filteredSales.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No sales found for the selected criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-3 text-sm font-medium text-gray-700">Date</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-700">Transaction ID</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-700">Cashier</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-700">Items</th>
                        <th className="text-left p-3 text-sm font-medium text-gray-700">Payment</th>
                        <th className="text-center p-3 text-sm font-medium text-gray-700">Status</th>
                        <th className="text-right p-3 text-sm font-medium text-gray-700">Total</th>
                        <th className="text-center p-3 text-sm font-medium text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.map((sale) => (
                        <tr key={sale.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 text-sm">
                            <DateDisplay date={sale.saleDate} />
                            <br />
                            <span className="text-xs text-gray-500">
                              <DateDisplay date={sale.saleDate} includeTime />
                            </span>
                          </td>
                          <td className="p-3 text-sm font-mono">
                            {sale.transactionId}
                          </td>
                          <td className="p-3 text-sm">
                            {sale.employee?.name || sale.employee?.employeeId || 'Unknown Employee'}
                          </td>
                          <td className="p-3 text-sm">
                            {sale.saleItems.reduce((sum, item) => sum + item.quantity, 0)}
                          </td>
                          <td className="p-3 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              sale.paymentMethod === 'Cash' ? 'bg-green-100 text-green-800' :
                              sale.paymentMethod === 'Card' ? 'bg-blue-100 text-blue-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {sale.paymentMethod}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {sale.hasReturns ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  sale.returnInfo?.isPartial ? 
                                    'bg-orange-100 text-orange-800' : 
                                    'bg-red-100 text-red-800'
                                }`}>
                                  {sale.returnInfo?.isPartial ? 'Partial Return' : 'Returned'}
                                </span>
                                <div className="text-xs text-gray-500" title={`Return ID: ${sale.returnInfo?.returnId}\nRefund: ${formatCurrency(sale.returnInfo?.refundAmount || 0)}\nReturned: ${sale.returnInfo?.returnedItems}/${sale.returnInfo?.totalItems} items`}>
                                  {formatCurrency(sale.returnInfo?.refundAmount || 0)} refunded
                                </div>
                              </div>
                            ) : (
                              <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">
                                Completed
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-sm text-right font-semibold">
                            {formatCurrency(sale.total)}
                          </td>
                          <td className="p-3 text-center">
                            <Button 
                              size="sm" 
                              variant={sale.hasReturns ? "destructive" : "outline"}
                              onClick={() => handleReprintReceipt(sale)}
                              className="text-xs px-2 py-1"
                              title={sale.hasReturns ? "This transaction has been returned" : "Reprint receipt"}
                            >
                              Reprint
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          </div>
        </div>
      </main>

      {/* Modal Keyboard */}
      <ModalKeyboard 
        open={kbOpen} 
        type={kbType} 
        title={kbTitle} 
        initialValue={searchQuery} 
        onSubmit={applyKb} 
        onClose={() => setKbOpen(false)} 
      />

      {/* Receipt Preview Modal */}
      {selectedSale && systemSettings && taxSettings && (() => {
        // Calculate proper tax labels using the same logic as POS
        let taxLabel = ''
        let secondaryTaxLabel = ''
        
        if (taxSettings && taxSettings.enableTax && selectedSale.taxAmount > 0) {
          // Use the same tax rate format as POS
          taxLabel = `${taxSettings.taxName} (${taxSettings.taxRate}%)`
          
          // Secondary tax if enabled (not currently stored separately, but prepare for future)
          if (taxSettings.enableSecondaryTax) {
            secondaryTaxLabel = `${taxSettings.secondaryTaxName} (${taxSettings.secondaryTaxRate}%)`
          }
        } else if (selectedSale.taxAmount === 0 && taxSettings?.enableTaxExemptions) {
          taxLabel = 'Tax Exempt'
        } else if (!taxSettings?.enableTax) {
          taxLabel = 'No Tax'
        }

        return (
          <ReceiptPreview
            isOpen={showReceiptPreview}
            saleData={{
              subtotal: selectedSale.subtotal,
              taxAmount: selectedSale.taxAmount,
              secondaryTaxAmount: 0,
              taxLabel: taxLabel,
              secondaryTaxLabel: secondaryTaxLabel,
              discountAmount: selectedSale.discountAmount,
              discountPercent: (selectedSale.subtotal + selectedSale.taxAmount) > 0 ? Math.round((selectedSale.discountAmount / (selectedSale.subtotal + selectedSale.taxAmount)) * 100) : 0,
              discountReason: selectedSale.discountReason || '',
              finalTotal: selectedSale.total,
              amountPaid: selectedSale.amountPaid,
              changeAmount: selectedSale.change,
              paymentMethod: selectedSale.paymentMethod,
              cart: selectedSale.saleItems.map(item => ({
                product: {
                  id: item.productId,
                  name: item.productName,
                  price: item.unitPrice,
                  barcode: item.productBarcode
                },
                quantity: item.quantity,
                total: item.lineTotal
              })),
              transactionId: selectedSale.transactionId,
              cashierName: selectedSale.employee.name || selectedSale.employee.employeeId,
              saleDate: selectedSale.saleDate
            }}
            systemSettings={systemSettings}
            onPrint={handlePrintReceipt}
            onSkip={handleClosePreview}
            onBack={handleClosePreview}
          />
        )
      })()}
      </div>
    </SessionGuard>
  )
}

export default SalesHistory