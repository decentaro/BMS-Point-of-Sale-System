import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Info, Search, Receipt, RotateCcw,
  CheckCircle2, Printer, Shield, ChevronDown, ScanBarcode
} from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import SessionGuard from './SessionGuard'
import { formatCurrency } from '../utils/formatCurrency'
import SessionStatus from './SessionStatus'
import SessionManager from '../utils/SessionManager'
import ApiClient from '../utils/ApiClient'
import { useToast } from '../contexts/ToastContext'
import DateDisplay from './DateDisplay'
import { formatDateSync } from '../utils/dateFormat'
import PageHeader from './ui/PageHeader'
import { SectionLoader } from './ui/LoadingSpinner'

// Sale interface matching the API model
interface Sale {
  id: number
  transactionId: string
  saleDate: string
  status: string
  subtotal: number
  taxAmount: number
  discountAmount: number
  total: number
  amountPaid: number
  change: number
  paymentMethod: string
  employeeId: number
  employee: {
    id: number
    employeeId: string
    name: string
    role: string
  }
  saleItems: SaleItem[]
}

interface SaleItem {
  id: number
  productId: number
  productName: string
  productBarcode: string
  quantity: number
  unitPrice: number
  lineTotal: number
  returnedQuantity?: number
  product: {
    id: number
    name: string
    barcode: string
    price: number
  }
}

interface SystemSettings {
  enableReturns: boolean
  requireReceiptForReturns: boolean
  requireManagerApprovalForReturns: boolean
  restockReturnedItems: boolean
  allowDefectiveItemReturns: boolean
  returnTimeLimitDays: number
  returnManagerApprovalAmount: number
  returnReasons: string
}

interface ReturnItem {
  saleItemId: number
  productId: number
  productName: string
  originalQuantity: number
  returnQuantity: number
  unitPrice: number
  lineTotal: number
  condition: 'good' | 'defective'
  reason: string
}


const Returns: React.FC = () => {
  const navigate = useNavigate()
  const { showToast } = useToast()

  // State management
  const [systemSettings, setSystemSettings] = React.useState<SystemSettings | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  
  // Search state
  const [searchTransactionId, setSearchTransactionId] = React.useState<string>('')
  const [originalSale, setOriginalSale] = React.useState<Sale | null>(null)
  const [searchLoading, setSearchLoading] = React.useState<boolean>(false)
  
  // Return processing state
  const [returnItems, setReturnItems] = React.useState<ReturnItem[]>([])
  const [managerPin, setManagerPin] = React.useState<string>('')
  const [showManagerPinModal, setShowManagerPinModal] = React.useState<boolean>(false)
  const [processingReturn, setProcessingReturn] = React.useState<boolean>(false)

  const [lastReturnRecord, setLastReturnRecord] = React.useState<any>(null)
  // Map of saleItemId -> already-returned quantity from previous returns
  const [alreadyReturnedQty, setAlreadyReturnedQty] = React.useState<Record<number, number>>({})

  // Modal keyboard state
  const [kbOpen, setKbOpen] = React.useState<boolean>(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('qwerty')
  const [kbTitle, setKbTitle] = React.useState<string>('')
  const [kbMasked, setKbMasked] = React.useState<boolean>(false)
  const [kbTarget, setKbTarget] = React.useState<'search' | 'managerPin' | 'returnQuantity'>('search')
  const [editingItemId, setEditingItemId] = React.useState<number | null>(null)

  const openKb = (target: 'search' | 'managerPin' | 'returnQuantity', type: KeyboardType, title: string, itemId?: number, masked: boolean = false) => {
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
    setKbMasked(masked)
    if (itemId !== undefined) setEditingItemId(itemId)
    setKbOpen(true)
  }

  const applyKb = (val: string) => {
    if (kbTarget === 'search') {
      setSearchTransactionId(val)
    } else if (kbTarget === 'managerPin') {
      setManagerPin(val)
    } else if (kbTarget === 'returnQuantity' && editingItemId !== null) {
      const quantity = parseInt(val) || 0
      setReturnItems(prev => prev.map(item => 
        item.saleItemId === editingItemId 
          ? { ...item, returnQuantity: Math.min(quantity, item.originalQuantity), lineTotal: Math.min(quantity, item.originalQuantity) * item.unitPrice }
          : item
      ))
    }
    setKbOpen(false)
  }

  const updateReturnQuantity = (saleItemId: number, value: string) => {
    const quantity = parseInt(value) || 0
    setReturnItems(prev => prev.map(ri =>
      ri.saleItemId === saleItemId
        ? { ...ri, returnQuantity: Math.min(quantity, ri.originalQuantity), lineTotal: Math.min(quantity, ri.originalQuantity) * ri.unitPrice }
        : ri
    ))
  }

  // Load system settings
  const loadSystemSettings = async () => {
    try {
      setLoading(true)
      const settings = await ApiClient.getSettings<any>('system')
      setSystemSettings(settings)
      
      // Check if returns are enabled
      if (!settings.enableReturns) {
        showToast('Returns system is disabled. Enable it in System Settings.', 'warning')
      }
    } catch (err) {
      showToast('Failed to load settings. Please refresh.', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Search for original sale by transaction ID (last 8 digits)
  const searchSaleByTransactionId = async () => {
    if (!searchTransactionId.trim()) {
      showToast('Please enter a transaction ID', 'warning')
      return
    }

    try {
      setSearchLoading(true)
      
      const allSales = await ApiClient.getJson<Sale[]>('/sales')
      
      // Search by full transaction ID or last 8 digits
      const searchTerm = searchTransactionId.trim()
      const foundSale = allSales.find((sale: Sale) => {
        // First try exact match (for barcode scanning)
        if (sale.transactionId === searchTerm) {
          return true
        }
        // Then try last 8 digits match (for manual entry)
        const last8 = sale.transactionId.slice(-8)
        return last8 === searchTerm
      })
      
      if (!foundSale) {
        // Determine if user entered full transaction ID or just last 8 digits
        const isFullTransactionId = searchTerm.includes('TXN-') || searchTerm.length > 8
        const errorMsg = isFullTransactionId 
          ? `Transaction ID "${searchTerm}" not found`
          : `Transaction ID ending in "${searchTerm}" not found`
        showToast(errorMsg, 'error')
        setOriginalSale(null)
        return
      }

      // Check return time limit
      if (systemSettings?.returnTimeLimitDays) {
        const saleDate = new Date(foundSale.saleDate)
        const daysSinceSale = Math.floor((Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysSinceSale > systemSettings.returnTimeLimitDays) {
          showToast(`Return window expired. Transaction is ${daysSinceSale} days old (limit: ${systemSettings.returnTimeLimitDays} days)`, 'warning')
          setOriginalSale(null)
          return
        }
      }

      // Check if this transaction has already been fully/partially returned
      let returnedQtyMap: Record<number, number> = {}
      try {
        const existingReturns = await ApiClient.getJson('/returns')
        const existingReturn = (existingReturns as any[]).find((r: any) => r.originalSaleId === foundSale.id)

        if (existingReturn) {
          // Build a map of saleItemId -> already returned quantity
          ;(existingReturn.returnItems as any[]).forEach((ri: any) => {
            const key = ri.originalSaleItemId ?? ri.saleItemId
            returnedQtyMap[key] = (returnedQtyMap[key] || 0) + ri.returnQuantity
          })

          const totalOriginalQuantities = foundSale.saleItems.reduce((sum, item) => sum + item.quantity, 0)
          const totalReturnedQuantities = existingReturn.returnItems.reduce((sum: number, item: any) => sum + item.returnQuantity, 0)

          if (totalReturnedQuantities >= totalOriginalQuantities) {
            showToast(`Transaction already fully returned. Return ID: ${existingReturn.returnId}`, 'info')
            setSearchTransactionId('')
            return
          } else {
            showToast(`Transaction partially returned. Return ID: ${existingReturn.returnId}`, 'info')
          }
        }
      } catch (error) {
        // Returns might not exist yet - that's okay
        console.log('No existing returns found (expected for new setup)')
      }

      setAlreadyReturnedQty(returnedQtyMap)
      setOriginalSale(foundSale)

      // Initialize return items — cap max qty by what's still returnable
      const items: ReturnItem[] = foundSale.saleItems.map(item => ({
        saleItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        originalQuantity: item.quantity,
        returnQuantity: 0,
        unitPrice: item.unitPrice,
        lineTotal: 0,
        condition: 'good',
        reason: ''
      }))
      setReturnItems(items)
      
    } catch (err) {
      showToast('Transaction search failed. Please try again.', 'error')
    } finally {
      setSearchLoading(false)
    }
  }

  // Calculate totals
  const returnTotal = returnItems.reduce((sum, item) => sum + item.lineTotal, 0)
  const needsManagerApproval = systemSettings?.requireManagerApprovalForReturns || 
    (systemSettings?.returnManagerApprovalAmount && returnTotal > systemSettings.returnManagerApprovalAmount)

  // Process return
  const processReturn = async () => {
    try {
      setProcessingReturn(true)
      
      // Validate return items
      const itemsToReturn = returnItems.filter(item => item.returnQuantity > 0)
      if (itemsToReturn.length === 0) {
        showToast('Please select at least one item to return', 'warning')
        return
      }

      // Check if all items have reasons
      const missingReasons = itemsToReturn.filter(item => !item.reason)
      if (missingReasons.length > 0) {
        showToast('Please select a return reason for all items', 'warning')
        return
      }

      // Manager approval if needed
      if (needsManagerApproval && !managerPin) {
        setShowManagerPinModal(true)
        return
      }

      // Get current user for processing
      const session = SessionManager.getCurrentSession()
      
      if (!session) {
        showToast('Session expired. Please log in again.', 'error')
        return
      }

      if (!originalSale) {
        showToast('No sale selected for return.', 'error')
        return
      }

      // Prepare return request
      const returnRequest = {
        originalSaleId: originalSale.id,
        processedByEmployeeId: session.id,
        managerPin: needsManagerApproval ? managerPin : null,
        notes: `Return processed on ${formatDateSync(new Date())}`,
        returnItems: itemsToReturn.map(item => ({
          originalSaleItemId: item.saleItemId,
          returnQuantity: item.returnQuantity,
          lineTotal: item.lineTotal,
          condition: item.condition,
          reason: item.reason
        }))
      }

      // Call API to process return
      const returnRecord = await ApiClient.postJson<{ returnId: string; totalRefundAmount: number }>('/returns', returnRequest)

      showToast(`Return processed successfully. ID: ${returnRecord.returnId} | Refund: ${formatCurrency(returnTotal)}`, 'success')

      setLastReturnRecord(returnRecord)

      // Reset form
      setOriginalSale(null)
      setReturnItems([])
      setSearchTransactionId('')
      setManagerPin('')
      setAlreadyReturnedQty({})
      
    } catch (err) {
      showToast('Failed to process return. Please try again.', 'error')
    } finally {
      setProcessingReturn(false)
    }
  }

  // Load settings on mount
  React.useEffect(() => {
    loadSystemSettings()
  }, [])

  const goBack = () => {
    navigate(SessionManager.getDashboardRoute())
  }

  const printReturnReceipt = async (returnRecord: any) => {
    try {
      const paperWidth = 48
      const dashedLine = '-'.repeat(paperWidth)
      const centerText = (text: string) => {
        const padding = Math.max(0, Math.floor((paperWidth - text.length) / 2))
        return ' '.repeat(padding) + text + '\n'
      }
      const twoCol = (left: string, right: string) => {
        const rightStr = right.toString()
        const leftWidth = paperWidth - rightStr.length - 1
        return left.substring(0, leftWidth).padEnd(leftWidth) + ' ' + rightStr + '\n'
      }

      let receipt = centerText('*** RETURN RECEIPT ***') + '\n'
      receipt += centerText(new Date(returnRecord.returnDate).toLocaleDateString())
      receipt += centerText(new Date(returnRecord.returnDate).toLocaleTimeString())
      receipt += '\n' + dashedLine + '\n'
      receipt += twoCol('Return ID:', returnRecord.returnId)
      if (returnRecord.originalSale?.transactionId) {
        receipt += twoCol('Original TXN:', returnRecord.originalSale.transactionId)
      }
      receipt += '\n' + dashedLine + '\n'
      receipt += centerText('RETURNED ITEMS')
      receipt += dashedLine + '\n'
      returnRecord.returnItems?.forEach((item: any) => {
        receipt += twoCol(item.productName, formatCurrency(item.lineTotal))
        receipt += `  ${item.returnQuantity} x ${formatCurrency(item.unitPrice)}  [${item.condition}]\n`
        receipt += `  Reason: ${item.reason}\n`
      })
      receipt += '\n' + dashedLine + '\n'
      receipt += twoCol('TOTAL REFUND:', formatCurrency(returnRecord.totalRefundAmount))
      receipt += '\n' + centerText('Thank you')
      receipt += '\n\n\n\n'

      const result = await window.electronAPI.printReceipt(receipt)
      if (!result.success) {
        showToast('Failed to print return receipt.', 'error')
      }
    } catch (error) {
      console.error('Error printing return receipt:', error)
      showToast('Failed to print return receipt', 'error')
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent'

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-xs font-semibold text-slate-600 mb-1">{children}</label>
  )

  const StepHeader = ({ step, icon: Icon, title }: { step: number; icon: React.ElementType; title: string }) => (
    <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex-shrink-0">{step}</span>
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-emerald-100">
        <Icon className="w-4 h-4 text-emerald-600" />
      </span>
      <span className="text-sm font-semibold text-slate-700">{title}</span>
    </div>
  )

  return (
    <SessionGuard>
      <div className="w-full h-full flex flex-col bg-white">
        <PageHeader
          title="Returns & Refunds"
          subtitle={loading ? 'Loading...' : systemSettings ? `Process customer returns • ${systemSettings.returnTimeLimitDays}-day policy` : 'Process customer returns'}
          onBack={goBack}
          right={<SessionStatus />}
        />

        {/* Body */}
        <main className="flex-1 px-4 pb-4 overflow-y-auto bg-slate-50">
          {loading ? (
            <SectionLoader message="Loading returns system..." />
          ) : !systemSettings?.enableReturns ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </span>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Returns System Disabled</h2>
              <p className="text-sm text-slate-500 mb-1">The returns system is currently disabled.</p>
              <p className="text-xs text-slate-400 mb-6">Enable it in System Settings to process returns.</p>
              <Button onClick={goBack} className="bg-emerald-600 hover:bg-emerald-700 text-white">Back to Dashboard</Button>
            </div>
          ) : (
            <div className="pt-4 max-w-4xl mx-auto space-y-4">

              {/* Step 1: Find Transaction */}
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-4">
                  <StepHeader step={1} icon={Search} title="Find Original Transaction" />

                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <FieldLabel>Transaction ID</FieldLabel>
                      <div className="relative">
                        <ScanBarcode className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        <HybridInput
                          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          value={searchTransactionId}
                          onChange={setSearchTransactionId}
                          placeholder="Scan barcode or enter last 8 digits (e.g. 12345678)"
                          onTouchKeyboard={() => openKb('search', 'qwerty', 'Transaction ID (scan or enter last 8 digits)')}
                        />
                      </div>
                      <div className="mt-1.5 flex flex-col gap-0.5">
                        {systemSettings.requireReceiptForReturns && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />Receipt required for returns
                          </p>
                        )}
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Info className="w-3 h-3 flex-shrink-0" />Enter the last 8 digits of the transaction ID from the receipt
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={searchSaleByTransactionId}
                      disabled={searchLoading || !searchTransactionId.trim()}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 flex-shrink-0"
                    >
                      {searchLoading ? (
                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Searching…</>
                      ) : (
                        <><Search className="w-4 h-4" />Find Transaction</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Step 2: Transaction details + item selection */}
              {originalSale && (
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="p-4">
                    <StepHeader step={2} icon={Receipt} title="Original Transaction Details" />

                    {/* Transaction meta */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      {[
                        { label: 'Transaction', value: <span className="font-mono text-xs">…{originalSale.transactionId.slice(-8)}</span> },
                        { label: 'Date',        value: <DateDisplay date={originalSale.saleDate} /> },
                        { label: 'Cashier',     value: originalSale.employee.name },
                        { label: 'Original Total', value: <span className="font-semibold text-emerald-700">{formatCurrency(originalSale.total)}</span> },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                          <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                          <div className="text-sm text-slate-800">{value}</div>
                        </div>
                      ))}
                    </div>

                    <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Select Items to Return</p>

                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden mb-4">
                      {originalSale.saleItems.map((item) => {
                        const returnItem = returnItems.find(r => r.saleItemId === item.id)
                        if (!returnItem) return null
                        const prevReturned = alreadyReturnedQty[item.id] || 0
                        const fullyReturned = prevReturned >= item.quantity
                        const partiallyReturned = prevReturned > 0 && !fullyReturned
                        const remainingQty = item.quantity - prevReturned
                        return (
                          <li key={item.id} className={`px-4 py-3 ${fullyReturned ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'}`}>
                            <div className="flex items-center gap-4 flex-wrap">
                              {/* Product info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className={`text-sm font-semibold ${fullyReturned ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                    {item.productName}
                                  </p>
                                  {fullyReturned && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-semibold">
                                      <CheckCircle2 className="w-3 h-3" />Already Returned
                                    </span>
                                  )}
                                  {partiallyReturned && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                                      <AlertTriangle className="w-3 h-3" />{prevReturned} of {item.quantity} returned
                                    </span>
                                  )}
                                </div>
                                <p className={`text-xs ${fullyReturned ? 'text-slate-400' : 'text-slate-500'}`}>
                                  Original: {item.quantity} × {formatCurrency(item.unitPrice)} = {formatCurrency(item.lineTotal)}
                                  {partiallyReturned && <span className="ml-2 text-amber-600">• {remainingQty} remaining</span>}
                                </p>
                              </div>

                              {fullyReturned ? (
                                /* Fully returned — show locked state */
                                <div className="flex-shrink-0 text-xs text-slate-400 italic">No further returns allowed</div>
                              ) : (
                                <>
                                  {/* Return Qty */}
                                  <div className="flex-shrink-0">
                                    <FieldLabel>Return Qty</FieldLabel>
                                    <HybridInput
                                      type="decimal"
                                      className="w-16 px-2 py-1.5 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                      value={returnItem.returnQuantity.toString()}
                                      onChange={(value) => updateReturnQuantity(item.id, value)}
                                      onTouchKeyboard={() => openKb('returnQuantity', 'decimal', `Return Quantity (Max: ${remainingQty})`, item.id)}
                                    />
                                  </div>

                                  {/* Condition */}
                                  {systemSettings.allowDefectiveItemReturns && (
                                    <div className="flex-shrink-0">
                                      <FieldLabel>Condition</FieldLabel>
                                      <div className="relative">
                                        <select
                                          className="pl-2 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                          value={returnItem.condition}
                                          onChange={(e) => setReturnItems(prev => prev.map(r =>
                                            r.saleItemId === item.id ? { ...r, condition: e.target.value as 'good' | 'defective' } : r
                                          ))}
                                        >
                                          <option value="good">Good</option>
                                          <option value="defective">Defective</option>
                                        </select>
                                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                      </div>
                                    </div>
                                  )}

                                  {/* Reason */}
                                  <div className="flex-shrink-0">
                                    <FieldLabel>Reason</FieldLabel>
                                    <div className="relative">
                                      <select
                                        className="pl-2 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                        value={returnItem.reason}
                                        onChange={(e) => setReturnItems(prev => prev.map(r =>
                                          r.saleItemId === item.id ? { ...r, reason: e.target.value } : r
                                        ))}
                                      >
                                        <option value="">Select reason…</option>
                                        {systemSettings.returnReasons.split(',').map(reason => (
                                          <option key={reason.trim()} value={reason.trim()}>{reason.trim()}</option>
                                        ))}
                                      </select>
                                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                                    </div>
                                  </div>

                                  {/* Line refund */}
                                  <div className="text-right flex-shrink-0 min-w-[60px]">
                                    <p className="text-xs text-slate-500">Refund</p>
                                    <p className={`text-sm font-semibold ${returnItem.lineTotal > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                      {formatCurrency(returnItem.lineTotal)}
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>

                    {/* Return summary */}
                    {returnTotal > 0 && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 mb-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-700">Total Refund Amount</p>
                            <p className="text-xs text-slate-500">{returnItems.filter(i => i.returnQuantity > 0).length} item(s) selected</p>
                          </div>
                          <p className="text-xl font-bold text-emerald-600">{formatCurrency(returnTotal)}</p>
                        </div>
                        {needsManagerApproval && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            Manager approval required for this return
                          </div>
                        )}
                      </div>
                    )}

                    {/* Process Return button */}
                    {returnTotal > 0 && (
                      <div className="flex justify-end">
                        <Button
                          onClick={processReturn}
                          disabled={processingReturn}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        >
                          {processingReturn ? (
                            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Processing…</>
                          ) : (
                            <><RotateCcw className="w-4 h-4" />Process Return — {formatCurrency(returnTotal)}</>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Last return success card */}
              {lastReturnRecord && (
                <Card className="border-emerald-200 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-100">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-emerald-100">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </span>
                      <span className="text-sm font-semibold text-slate-700">Return Processed Successfully</span>
                    </div>
                    <div className="flex items-center gap-6 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 mb-4 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">Return ID</p>
                        <p className="font-mono font-semibold text-slate-800">{lastReturnRecord.returnId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Refund Amount</p>
                        <p className="font-semibold text-emerald-700">{formatCurrency(lastReturnRecord.totalRefundAmount)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => printReturnReceipt(lastReturnRecord)}
                        className="bg-[hsl(215,65%,30%)] hover:bg-[hsl(215,65%,24%)] text-white gap-1.5 text-sm"
                      >
                        <Printer className="w-4 h-4" />Print Return Receipt
                      </Button>
                      <Button variant="outline" className="border-slate-300 text-slate-600 hover:bg-slate-50 text-sm" onClick={() => setLastReturnRecord(null)}>
                        Dismiss
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

            </div>
          )}
        </main>

        {/* Manager PIN Modal */}
        {showManagerPinModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
              <div className="bg-[hsl(215,65%,30%)] px-5 py-4 flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/20">
                  <Shield className="w-4 h-4 text-white" />
                </span>
                <h3 className="text-white font-semibold text-sm">Manager Approval Required</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-slate-600 mb-4">This return requires manager approval. Please enter your manager PIN to proceed.</p>
                <div className="mb-4">
                  <FieldLabel>Manager PIN</FieldLabel>
                  <HybridInput
                    type="number"
                    className={inputCls}
                    value={managerPin ? '••••' : ''}
                    onChange={setManagerPin}
                    placeholder="Enter manager PIN"
                    onTouchKeyboard={() => openKb('managerPin', 'decimal', 'Manager PIN', undefined, true)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-slate-300 text-slate-600 hover:bg-slate-50"
                    onClick={() => { setShowManagerPinModal(false); setManagerPin('') }}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={!managerPin}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                    onClick={() => { setShowManagerPinModal(false); processReturn() }}
                  >
                    <CheckCircle2 className="w-4 h-4" />Approve Return
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Keyboard */}
        <ModalKeyboard
          open={kbOpen}
          type={kbType}
          title={kbTitle}
          masked={kbMasked}
          initialValue={
            kbTarget === 'search' ? searchTransactionId :
            kbTarget === 'managerPin' ? '' :
            kbTarget === 'returnQuantity' && editingItemId
              ? returnItems.find(item => item.saleItemId === editingItemId)?.returnQuantity.toString() || '0'
              : ''
          }
          onSubmit={applyKb}
          onClose={() => setKbOpen(false)}
        />
      </div>
    </SessionGuard>
  )
}

export default Returns