import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import SessionGuard from './SessionGuard'
import { formatCurrency } from '../utils/formatCurrency'
import SessionStatus from './SessionStatus'
import SessionManager from '../utils/SessionManager'
import ApiClient from '../utils/ApiClient'
import DateDisplay from './DateDisplay'
import { formatDateSync } from '../utils/dateFormat'

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


  // State management
  const [systemSettings, setSystemSettings] = React.useState<SystemSettings | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  
  // Search state
  const [searchTransactionId, setSearchTransactionId] = React.useState<string>('')
  const [originalSale, setOriginalSale] = React.useState<Sale | null>(null)
  const [searchLoading, setSearchLoading] = React.useState<boolean>(false)
  
  // Return processing state
  const [returnItems, setReturnItems] = React.useState<ReturnItem[]>([])
  const [returnReason, setReturnReason] = React.useState<string>('')
  const [managerPin, setManagerPin] = React.useState<string>('')
  const [showManagerPinModal, setShowManagerPinModal] = React.useState<boolean>(false)
  const [processingReturn, setProcessingReturn] = React.useState<boolean>(false)

  // Modal keyboard state
  const [kbOpen, setKbOpen] = React.useState<boolean>(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('qwerty')
  const [kbTitle, setKbTitle] = React.useState<string>('')
  const [kbTarget, setKbTarget] = React.useState<'search' | 'managerPin' | 'returnQuantity'>('search')
  const [editingItemId, setEditingItemId] = React.useState<number | null>(null)

  const openKb = (target: 'search' | 'managerPin' | 'returnQuantity', type: KeyboardType, title: string, itemId?: number) => {
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
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

  // Load system settings
  const loadSystemSettings = async () => {
    try {
      setLoading(true)
      const settings = await ApiClient.getSettings<any>('system')
      setSystemSettings(settings)
      
      // Check if returns are enabled
      if (!settings.enableReturns) {
        alert('Returns system is disabled. Please enable it in System Settings.')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load system settings')
    } finally {
      setLoading(false)
    }
  }

  // Search for original sale by transaction ID (last 8 digits)
  const searchSaleByTransactionId = async () => {
    if (!searchTransactionId.trim()) {
      alert('Please enter a transaction ID')
      return
    }

    try {
      setSearchLoading(true)
      
      const allSales = await ApiClient.getJson('/sales')
      
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
        alert(errorMsg)
        setOriginalSale(null)
        return
      }

      // Check return time limit
      if (systemSettings?.returnTimeLimitDays) {
        const saleDate = new Date(foundSale.saleDate)
        const daysSinceSale = Math.floor((Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysSinceSale > systemSettings.returnTimeLimitDays) {
          alert(`This transaction is ${daysSinceSale} days old. Returns are only allowed within ${systemSettings.returnTimeLimitDays} days.`)
          setOriginalSale(null)
          return
        }
      }

      // Check if this transaction has already been fully returned
      try {
        const existingReturns = await ApiClient.getJson('/returns')
        const existingReturn = existingReturns.find(r => r.originalSaleId === foundSale.id)
        
        if (existingReturn) {
          // Calculate total returned vs original quantities
          const totalOriginalQuantities = foundSale.saleItems.reduce((sum, item) => sum + item.quantity, 0)
          const totalReturnedQuantities = existingReturn.returnItems.reduce((sum, item) => sum + item.returnQuantity, 0)
          
          if (totalReturnedQuantities >= totalOriginalQuantities) {
            // Transaction already fully returned - show existing return record
            alert(`This transaction has already been returned.\n\nReturn ID: ${existingReturn.returnId}\nReturn Date: ${formatDateSync(existingReturn.returnDate)}\nRefund Amount: ${formatCurrency(existingReturn.totalRefundAmount)}\nProcessed by: ${existingReturn.processedByEmployee.name}`)
            setSearchTransactionId('')
            return
          } else {
            // Partial return exists - could allow additional returns here
            alert(`This transaction has been partially returned.\n\nExisting Return ID: ${existingReturn.returnId}\nPreviously Returned: ${totalReturnedQuantities} of ${totalOriginalQuantities} items\nRefund Amount: ${formatCurrency(existingReturn.totalRefundAmount)}`)
          }
        }
      } catch (error) {
        // Returns might not exist yet - that's okay
        console.log('No existing returns found (expected for new setup)')
      }

      setOriginalSale(foundSale)
      
      // Initialize return items
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
      alert(err instanceof Error ? err.message : 'Failed to search for transaction')
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
        alert('Please select at least one item to return')
        return
      }

      // Check if all items have reasons
      const missingReasons = itemsToReturn.filter(item => !item.reason)
      if (missingReasons.length > 0) {
        alert('Please select a return reason for all items')
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
        alert('User session expired. Please log in again.')
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
      const returnRecord = await ApiClient.postJson('/returns', returnRequest)

      alert(`Return processed successfully!\nReturn ID: ${returnRecord.returnId}\nTotal refund: ${formatCurrency(returnTotal)}`)
      
      // Reset form
      setOriginalSale(null)
      setReturnItems([])
      setSearchTransactionId('')
      setManagerPin('')
      
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to process return')
    } finally {
      setProcessingReturn(false)
    }
  }

  // Load settings on mount
  React.useEffect(() => {
    loadSystemSettings()
  }, [])

  const goBack = () => {
    navigate('/manager')
  }

  // Show loading state
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600">Loading returns system...</div>
        </div>
      </div>
    )
  }

  // Show error if returns disabled
  if (!systemSettings?.enableReturns) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold mb-2">Returns System Disabled</h2>
          <p className="text-gray-600 mb-4">The returns system is currently disabled.</p>
          <p className="text-sm text-gray-500 mb-6">Enable it in System Settings to process returns.</p>
          <Button onClick={goBack}>← Back to Dashboard</Button>
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
          <h1 className="text-xl font-semibold text-emerald-600">Returns & Refunds</h1>
          <p className="text-[10px] text-muted-foreground">
            Process customer returns • {systemSettings.returnTimeLimitDays}-day policy
          </p>
        </div>
        <SessionStatus />
      </header>

      {/* Body */}
      <main className="flex-1 p-4 bg-slate-50 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-4">
          

          {/* Step 1: Search Transaction */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Step 1: Find Original Transaction</h2>
              
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2">Transaction ID (scan receipt barcode or enter last 8 digits)</label>
                  <HybridInput 
                    className="w-full p-3 border rounded-lg"
                    value={searchTransactionId}
                    onChange={setSearchTransactionId}
                    placeholder="Enter last 8 digits from receipt (e.g. 12345678)"
                    onTouchKeyboard={() => openKb('search', 'qwerty', 'Transaction ID (scan or enter last 8 digits)')}
                  />
                  {systemSettings.requireReceiptForReturns && (
                    <p className="text-xs text-orange-600 mt-1">⚠️ Receipt required for returns</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">💡 Only enter the last 8 digits of the transaction ID from your receipt</p>
                </div>
                
                <Button 
                  onClick={searchSaleByTransactionId}
                  disabled={searchLoading || !searchTransactionId.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {searchLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Searching...
                    </div>
                  ) : (
                    'Find Transaction'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Original Sale Details (show when sale found) */}
          {originalSale && (
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-4">Step 2: Original Transaction Details</h2>
                
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Transaction:</span>
                      <div className="font-mono">...{originalSale.transactionId.slice(-8)}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Date:</span>
                      <div><DateDisplay date={originalSale.saleDate} /></div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Cashier:</span>
                      <div>{originalSale.employee.name}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Total:</span>
                      <div className="font-semibold">{formatCurrency(originalSale.total)}</div>
                    </div>
                  </div>
                </div>

                <h3 className="font-medium mb-3">Select Items to Return:</h3>
                
                <div className="space-y-2">
                  {originalSale.saleItems.map((item, index) => {
                    const returnItem = returnItems.find(r => r.saleItemId === item.id)
                    if (!returnItem) return null

                    return (
                      <div key={item.id} className="border rounded-lg p-3 bg-white">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{item.productName}</div>
                            <div className="text-sm text-gray-600">
                              Original: {item.quantity} × {formatCurrency(item.unitPrice)} = {formatCurrency(item.lineTotal)}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            {/* Return Quantity */}
                            <div>
                              <label className="block text-xs font-medium mb-1">Return Qty</label>
                              <HybridInput 
                                type="decimal"
                                className="w-16 p-2 border rounded text-center"
                                value={returnItem.returnQuantity}
                                onChange={(value) => updateReturnQuantity(item.id, value)}
                                onTouchKeyboard={() => openKb('returnQuantity', 'decimal', `Return Quantity (Max: ${item.quantity})`, item.id)}
                              />
                            </div>

                            {/* Condition */}
                            {systemSettings.allowDefectiveItemReturns && (
                              <div>
                                <label className="block text-xs font-medium mb-1">Condition</label>
                                <select 
                                  className="p-2 border rounded text-xs"
                                  value={returnItem.condition}
                                  onChange={(e) => setReturnItems(prev => prev.map(r => 
                                    r.saleItemId === item.id ? { ...r, condition: e.target.value as 'good' | 'defective' } : r
                                  ))}
                                >
                                  <option value="good">Good</option>
                                  <option value="defective">Defective</option>
                                </select>
                              </div>
                            )}

                            {/* Return Reason */}
                            <div>
                              <label className="block text-xs font-medium mb-1">Reason</label>
                              <select 
                                className="p-2 border rounded text-xs"
                                value={returnItem.reason}
                                onChange={(e) => setReturnItems(prev => prev.map(r => 
                                  r.saleItemId === item.id ? { ...r, reason: e.target.value } : r
                                ))}
                              >
                                <option value="">Select reason...</option>
                                {systemSettings.returnReasons.split(',').map(reason => (
                                  <option key={reason.trim()} value={reason.trim()}>{reason.trim()}</option>
                                ))}
                              </select>
                            </div>

                            {/* Line Total */}
                            <div className="text-right">
                              <div className="text-xs text-gray-600">Refund</div>
                              <div className="font-semibold">{formatCurrency(returnItem.lineTotal)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Return Summary */}
                {returnTotal > 0 && (
                  <div className="mt-6 bg-emerald-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-semibold">Total Refund Amount:</div>
                        <div className="text-sm text-gray-600">
                          {returnItems.filter(item => item.returnQuantity > 0).length} item(s) selected
                        </div>
                      </div>
                      <div className="text-xl font-bold text-emerald-600">
                        {formatCurrency(returnTotal)}
                      </div>
                    </div>
                    
                    {needsManagerApproval && (
                      <div className="mt-2 text-sm text-orange-600">
                        ⚠️ Manager approval required for this return
                      </div>
                    )}
                  </div>
                )}

                {/* Process Return Button */}
                {returnTotal > 0 && (
                  <div className="mt-6 flex justify-end">
                    <Button 
                      onClick={processReturn}
                      disabled={processingReturn}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {processingReturn ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Processing...
                        </div>
                      ) : (
                        `Process Return - ${formatCurrency(returnTotal)}`
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Manager PIN Modal */}
      {showManagerPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Manager Approval Required</h3>
              <p className="text-sm text-gray-600 mb-4">
                This return requires manager approval. Please enter manager PIN.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Manager PIN</label>
                <HybridInput 
                  type="number"
                  className="w-full p-3 border rounded-lg"
                  value={managerPin}
                  onChange={setManagerPin}
                  placeholder="Enter manager PIN"
                  onTouchKeyboard={() => openKb('managerPin', 'numeric', 'Manager PIN')}
                />
              </div>

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowManagerPinModal(false)
                    setManagerPin('')
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    setShowManagerPinModal(false)
                    processReturn()
                  }}
                  disabled={!managerPin}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Approve Return
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
        initialValue={
          kbTarget === 'search' ? searchTransactionId :
          kbTarget === 'managerPin' ? '' :
          kbTarget === 'returnQuantity' && editingItemId ? 
            returnItems.find(item => item.saleItemId === editingItemId)?.returnQuantity.toString() || '0' : ''
        }
        onSubmit={applyKb} 
        onClose={() => setKbOpen(false)} 
      />
      </div>
    </SessionGuard>
  )
}

export default Returns