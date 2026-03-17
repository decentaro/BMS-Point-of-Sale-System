import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Printer, ChevronLeft, ChevronRight, Clock,
  Receipt, Banknote, CreditCard, RotateCcw, TrendingUp, ShoppingBag, AlertTriangle, X
} from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import ReceiptPreview from './ReceiptPreview'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import PageHeader from './ui/PageHeader'
import { SectionLoader } from './ui/LoadingSpinner'
import { SystemSettings } from '../types/SystemSettings'
import ApiClient from '../utils/ApiClient'
import DateDisplay from './DateDisplay'
import { formatDateSync } from '../utils/dateFormat'
import { generateTextReceipt } from '../utils/receiptFormatter'
import { formatCurrency } from '../utils/formatCurrency'
import { useToast } from '../contexts/ToastContext'
import SessionManager from '../utils/SessionManager'

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
  const { showToast } = useToast()

  // State management
  const [sales, setSales] = React.useState<Sale[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [searchQuery, setSearchQuery] = React.useState<string>('')
  const [dateFilter, setDateFilter] = React.useState<string>('today')
  const [returns, setReturns] = React.useState<any[]>([])
  
  // Receipt preview state
  const [showReceiptPreview, setShowReceiptPreview] = React.useState<boolean>(false)
  const [selectedSale, setSelectedSale] = React.useState<Sale | null>(null)

  // Reprint warning modal state
  const [showReprintWarning, setShowReprintWarning] = React.useState<boolean>(false)
  const [reprintWarningSale, setReprintWarningSale] = React.useState<Sale | null>(null)
  const [systemSettings, setSystemSettings] = React.useState<SystemSettings | null>(null)
  const [taxSettings, setTaxSettings] = React.useState<any>(null)

  // Pagination
  const PAGE_SIZE = 10
  const [page, setPage] = React.useState<number>(1)

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

  // Load sales and returns in parallel, merge, then set state once
  const loadSales = async () => {
    try {
      setLoading(true)

      const [salesData, returnsData] = await Promise.all([
        ApiClient.getJson<Sale[]>('/sales'),
        ApiClient.getJson<any[]>('/returns').catch(() => [] as any[])
      ])

      const sales = Array.isArray(salesData) ? salesData : []
      const returns = Array.isArray(returnsData) ? returnsData : []

      setReturns(returns)

      const enhancedSales = sales.map(sale => {
        const saleReturns = returns.filter(r => r.originalSaleId === sale.id)
        if (saleReturns.length === 0) return sale

        const totalReturnedItems = saleReturns.reduce((sum, ret) =>
          sum + ret.returnItems.reduce((itemSum: number, item: any) => itemSum + item.returnQuantity, 0), 0)
        const totalOriginalItems = sale.saleItems.reduce((sum, item) => sum + item.quantity, 0)
        const totalRefundAmount = saleReturns.reduce((sum, ret) => sum + ret.totalRefundAmount, 0)
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
      showToast('Failed to load sales. Please refresh.', 'error')
      console.error('Error loading sales:', err)
    } finally {
      setLoading(false)
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

  // Reset to page 1 whenever filters change
  React.useEffect(() => { setPage(1) }, [searchQuery, dateFilter])

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / PAGE_SIZE))
  const paginatedSales = filteredSales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const getPageItems = (): (number | null)[] => {
    const items: (number | null)[] = []
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
        items.push(i)
      } else if (items[items.length - 1] !== null) {
        items.push(null)
      }
    }
    return items
  }

  // Handle reprint receipt
  const handleReprintReceipt = (sale: Sale) => {
    if (!systemSettings || !taxSettings) {
      showToast('System settings not loaded. Please try again.', 'warning')
      return
    }

    // Show warning modal for returned transactions
    if (sale.hasReturns) {
      setReprintWarningSale(sale)
      setShowReprintWarning(true)
      return
    }

    setSelectedSale(sale)
    setShowReceiptPreview(true)
  }

  const handleConfirmReprint = () => {
    if (!reprintWarningSale) return
    setShowReprintWarning(false)
    setSelectedSale(reprintWarningSale)
    setReprintWarningSale(null)
    setShowReceiptPreview(true)
  }

  // Receipt preview actions
  const handlePrintReceipt = async () => {
    try {
      if (!selectedSale || !systemSettings) {
        showToast('Missing receipt data or system settings', 'error')
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

      // Build returned quantity map for selectedSale
      const reprintReturnedQtyMap: Record<number, number> = {}
      if (selectedSale.hasReturns) {
        const saleReturns = returns.filter((r: any) => r.originalSaleId === selectedSale.id)
        saleReturns.forEach((ret: any) => {
          ret.returnItems.forEach((item: any) => {
            const id = item.originalSaleItemId
            reprintReturnedQtyMap[id] = (reprintReturnedQtyMap[id] || 0) + item.returnQuantity
          })
        })
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
          total: item.lineTotal,
          returnedQuantity: reprintReturnedQtyMap[item.id] || 0
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
        changeAmount: selectedSale.change || 0,
        isReturn: selectedSale.hasReturns === true
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
        showToast('Receipt reprinted successfully.', 'success')
      } else {
        showToast('Failed to reprint receipt. Check printer connection.', 'error')
      }
    } catch (error) {
      console.error('Error reprinting receipt:', error)
      showToast('Failed to reprint receipt', 'error')
    }
    
    setShowReceiptPreview(false)
    setSelectedSale(null)
  }

  const handleClosePreview = () => {
    setShowReceiptPreview(false)
    setSelectedSale(null)
  }

  const goBack = () => {
    navigate(SessionManager.getDashboardRoute())
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

  const paymentMeta = (method: string) => {
    switch (method) {
      case 'Cash':   return { Icon: Banknote,    bg: 'bg-emerald-100', text: 'text-emerald-700' }
      case 'Card':   return { Icon: CreditCard,  bg: 'bg-blue-100',    text: 'text-blue-700'    }
      default:       return { Icon: ShoppingBag, bg: 'bg-purple-100',  text: 'text-purple-700'  }
    }
  }

  return (
    <SessionGuard>
      <div className="w-full h-full flex flex-col bg-white">
        <PageHeader
          title="Sales History"
          subtitle="View and reprint receipts"
          onBack={goBack}
          right={<SessionStatus />}
        />

        {/* Body */}
        <main className="flex-1 px-4 pb-4 overflow-y-auto bg-slate-50">
          {loading ? (
            <SectionLoader message="Loading sales history..." />
          ) : (
            <div className="pt-4 max-w-6xl mx-auto space-y-4">

              {/* KPI cards */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { icon: TrendingUp, label: 'Total Revenue',    value: formatCurrency(filteredSales.reduce((s, sale) => s + sale.total, 0)), color: 'emerald' },
                  { icon: Receipt,    label: 'Transactions',     value: filteredSales.length,                                                  color: 'navy'    },
                  { icon: RotateCcw, label: 'Returns',           value: filteredSales.filter(s => s.hasReturns).length,                        color: 'emerald' },
                  { icon: Banknote,  label: 'Avg Sale',          value: filteredSales.length > 0 ? formatCurrency(filteredSales.reduce((s, sale) => s + sale.total, 0) / filteredSales.length) : formatCurrency(0), color: 'navy' },
                ].map(({ icon: Icon, label, value, color }) => (
                  <Card key={label} className="border-slate-200 shadow-sm">
                    <CardContent className="p-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${color === 'emerald' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                        <Icon className={`w-4 h-4 ${color === 'emerald' ? 'text-emerald-600' : 'text-[hsl(215,65%,30%)]'}`} />
                      </div>
                      <div className={`text-2xl font-bold ${color === 'emerald' ? 'text-emerald-600' : 'text-[hsl(215,65%,30%)]'}`}>{value}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Filters */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        <Search className="w-3.5 h-3.5" /> Search
                      </label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <HybridInput
                          className="w-full pl-8 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                          value={searchQuery}
                          onChange={setSearchQuery}
                          placeholder="Transaction ID, cashier…"
                          onTouchKeyboard={() => openKb('search', 'qwerty', 'Search Sales')}
                        />
                      </div>
                    </div>
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
                  </div>
                </CardContent>
              </Card>

              {/* Sales table */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-0">
                  {filteredSales.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-2">
                      <Receipt className="w-10 h-10 text-slate-200" />
                      <p className="text-sm text-slate-400">No sales found for the selected criteria.</p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Transaction</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cashier</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Items</th>
                              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {paginatedSales.map((sale) => {
                              const pm = paymentMeta(sale.paymentMethod)
                              const PayIcon = pm.Icon
                              return (
                                <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <p className="text-sm text-slate-700"><DateDisplay date={sale.saleDate} /></p>
                                    <p className="text-xs text-slate-400"><DateDisplay date={sale.saleDate} includeTime /></p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-xs font-mono text-slate-600">…{sale.transactionId.slice(-8)}</span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-700">
                                    {sale.employee?.name || sale.employee?.employeeId || 'Unknown'}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className="text-sm font-medium text-slate-700">
                                      {sale.saleItems.reduce((sum, item) => sum + item.quantity, 0)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${pm.bg} ${pm.text}`}>
                                      <PayIcon className="w-3 h-3" />
                                      {sale.paymentMethod}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {sale.hasReturns ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                          sale.returnInfo?.isPartial
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-red-100 text-red-700'
                                        }`}>
                                          <RotateCcw className="w-3 h-3" />
                                          {sale.returnInfo?.isPartial ? 'Partial Return' : 'Returned'}
                                        </span>
                                        <span className="text-xs text-slate-400">{formatCurrency(sale.returnInfo?.refundAmount || 0)} refunded</span>
                                      </div>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                                        Completed
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="text-sm font-semibold text-slate-800">{formatCurrency(sale.total)}</span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReprintReceipt(sale)}
                                      className={`gap-1 text-xs ${
                                        sale.hasReturns
                                          ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                                      }`}
                                      title={sale.hasReturns ? 'This transaction has been returned' : 'Reprint receipt'}
                                    >
                                      <Printer className="w-3 h-3" />Reprint
                                    </Button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination bar */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                          <p className="text-xs text-slate-500">
                            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredSales.length)} of {filteredSales.length}
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setPage(p => Math.max(1, p - 1))}
                              disabled={page === 1}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            {getPageItems().map((item, idx) =>
                              item === null ? (
                                <span key={`ellipsis-${idx}`} className="px-1 text-slate-400 text-sm">…</span>
                              ) : (
                                <button
                                  key={item}
                                  onClick={() => setPage(item)}
                                  className={`w-8 h-8 rounded-lg text-sm font-medium ${
                                    item === page
                                      ? 'bg-emerald-600 text-white'
                                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {item}
                                </button>
                              )
                            )}
                            <button
                              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                              disabled={page === totalPages}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

            </div>
          )}
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

      {/* Reprint Warning Modal */}
      {showReprintWarning && reprintWarningSale?.returnInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Reprint Warning</h2>
                  <p className="text-xs text-slate-500">
                    {reprintWarningSale.returnInfo.isPartial ? 'Partial return on record' : 'Full return on record'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowReprintWarning(false); setReprintWarningSale(null) }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-3">
              <div className={`rounded-lg p-4 text-sm space-y-1.5 ${
                reprintWarningSale.returnInfo.isPartial
                  ? 'bg-amber-50 border border-amber-200'
                  : 'bg-red-50 border border-red-200'
              }`}>
                <p className={`font-semibold text-xs uppercase tracking-wide ${
                  reprintWarningSale.returnInfo.isPartial ? 'text-amber-700' : 'text-red-700'
                }`}>
                  {reprintWarningSale.returnInfo.isPartial
                    ? 'This transaction has been partially returned'
                    : 'This transaction has been fully returned'}
                </p>
                <div className={`space-y-1 text-xs ${
                  reprintWarningSale.returnInfo.isPartial ? 'text-amber-800' : 'text-red-800'
                }`}>
                  <p><span className="font-medium">Return ID:</span> {reprintWarningSale.returnInfo.returnId}</p>
                  <p><span className="font-medium">Return Date:</span> {formatDateSync(reprintWarningSale.returnInfo.returnDate)}</p>
                  {reprintWarningSale.returnInfo.isPartial && (
                    <p><span className="font-medium">Items Returned:</span> {reprintWarningSale.returnInfo.returnedItems} of {reprintWarningSale.returnInfo.totalItems}</p>
                  )}
                  <p><span className="font-medium">Refund Amount:</span> {formatCurrency(reprintWarningSale.returnInfo.refundAmount)}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                This receipt is for reference only. The customer has already received their refund. Reprinting may lead to duplicate refund requests.
              </p>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 pb-5">
              <Button
                variant="outline"
                className="flex-1 border-slate-300 text-slate-600"
                onClick={() => { setShowReprintWarning(false); setReprintWarningSale(null) }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={handleConfirmReprint}
              >
                <Printer className="w-4 h-4 mr-1.5" />
                Reprint Anyway
              </Button>
            </div>
          </div>
        </div>
      )}

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
              cart: (() => {
                const previewReturnedQtyMap: Record<number, number> = {}
                if (selectedSale.hasReturns) {
                  returns.filter((r: any) => r.originalSaleId === selectedSale.id).forEach((ret: any) => {
                    ret.returnItems.forEach((ri: any) => {
                      previewReturnedQtyMap[ri.originalSaleItemId] = (previewReturnedQtyMap[ri.originalSaleItemId] || 0) + ri.returnQuantity
                    })
                  })
                }
                return selectedSale.saleItems.map(item => ({
                  product: {
                    id: item.productId,
                    name: item.productName,
                    price: item.unitPrice,
                    barcode: item.productBarcode
                  },
                  quantity: item.quantity,
                  total: item.lineTotal,
                  returnedQuantity: previewReturnedQtyMap[item.id] || 0
                }))
              })(),
              transactionId: selectedSale.transactionId,
              cashierName: selectedSale.employee.name || selectedSale.employee.employeeId,
              saleDate: selectedSale.saleDate,
              isReturn: selectedSale.hasReturns === true
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