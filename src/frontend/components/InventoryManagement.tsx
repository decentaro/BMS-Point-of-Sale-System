import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpDown, Package, Clock, CheckCircle2, XCircle,
  ChevronDown, Plus, Search, CalendarDays, X,
  ClipboardList, Layers, AlertTriangle, ScanBarcode
} from 'lucide-react'
import { Button } from './ui/button'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import SessionGuard from './SessionGuard'
import SessionStatus from './SessionStatus'
import ApiClient from '../utils/ApiClient'
import { useBusinessSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import SessionManager from '../utils/SessionManager'
import { formatDateSync } from '../utils/dateFormat'
import PageHeader from './ui/PageHeader'

interface Product {
  id: number
  name: string
  barcode: string
  stockQuantity: number
  cost: number
  price: number
}

interface StockAdjustment {
  id: number
  product: Product
  adjustmentType: string
  quantityChange: number
  quantityBefore: number
  quantityAfter: number
  reason: string
  notes?: string
  adjustedByEmployee: { name: string }
  costImpact: number
  adjustmentDate: string
  requiresApproval: boolean
  isApproved: boolean
  approvedByEmployee?: { name: string }
}

interface ProductBatch {
  id: number
  product: Product
  batchNumber: string
  quantity: number
  expirationDate?: string
  manufacturingDate?: string
  supplier?: string
  expiryStatus: string
  daysUntilExpiry?: number
}

const InventoryManagement: React.FC = () => {
  const navigate = useNavigate()
  useBusinessSettings()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState('adjustments')
  
  // Stock Adjustments State
  const [products, setProducts] = useState<Product[]>([])
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [pendingAdjustments, setPendingAdjustments] = useState<StockAdjustment[]>([])
  
  // Expiring Products State
  const [expiringBatches, setExpiringBatches] = useState<ProductBatch[]>([])
  
  // Form States
  const [selectedProduct, setSelectedProduct] = useState('')
  const [selectedProductObj, setSelectedProductObj] = useState<Product | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [adjustmentType, setAdjustmentType] = useState('')
  const [quantityChange, setQuantityChange] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  // Modal keyboard state
  type FormKeys = 'productSearch' | 'quantityChange' | 'reason' | 'notes'
  const [kbOpen, setKbOpen] = useState<boolean>(false)
  const [kbType, setKbType] = useState<KeyboardType>('qwerty')
  const [kbTitle, setKbTitle] = useState<string>('')
  const [kbTarget, setKbTarget] = useState<FormKeys>('productSearch')

  const openKb = (target: FormKeys, type: KeyboardType, title: string) => {
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
    setKbOpen(true)
  }

  const applyKb = (val: string) => {
    switch (kbTarget) {
      case 'productSearch':
        setProductSearch(val)
        setShowProductDropdown(true)
        setSelectedProductObj(null)
        setSelectedProduct('')
        break
      case 'quantityChange':
        setQuantityChange(val)
        break
      case 'reason':
        setReason(val)
        break
      case 'notes':
        setNotes(val)
        break
    }
    setKbOpen(false)
  }

  const goBack = () => {
    // Check user role from session manager
    const session = SessionManager.getCurrentSession()
    if (session) {
      // Navigate based on role
      if (session.role === 'Manager') {
        navigate('/manager')
      } else if (session.role === 'Inventory') {
        navigate('/inventory-dashboard')
      } else {
        navigate('/login')
      }
    } else {
      navigate('/login')
    }
  }

  // Load data
  useEffect(() => {
    loadProducts()
    loadAdjustments()
    loadPendingAdjustments()
    loadExpiringProducts()
  }, [])

  const loadProducts = async () => {
    try {
      const data = await ApiClient.getJson('/products')
      setProducts(data)
    } catch (error) {
      console.error('Failed to load products:', error)
    }
  }

  const loadAdjustments = async () => {
    try {
      const data = await ApiClient.getJson('/stockadjustments')
      setAdjustments(data.slice(0, 50))
    } catch (error) {
      console.error('Failed to load adjustments:', error)
    }
  }

  const loadPendingAdjustments = async () => {
    try {
      const data = await ApiClient.getJson('/stockadjustments/pending-approval')
      setPendingAdjustments(data)
    } catch (error) {
      console.error('Failed to load pending adjustments:', error)
    }
  }

  const loadExpiringProducts = async () => {
    try {
      const data = await ApiClient.getJson('/products/expiring?days=365')
      setExpiringBatches(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to load expiring products:', error)
      setExpiringBatches([])
    }
  }

  // Filter products based on search
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    product.barcode.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 8) // Show max 8 results

  const handleProductSelect = (product: Product) => {
    setSelectedProductObj(product)
    setSelectedProduct(product.id.toString())
    setProductSearch(product.name)
    setShowProductDropdown(false)
  }

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (!selectedProductObj) {
      showToast('Please select a valid product', 'warning')
      setLoading(false)
      return
    }

    try {
      const adjustmentData = {
        productId: selectedProductObj.id,
        adjustmentType,
        quantityChange: parseInt(quantityChange),
        reason,
        notes: notes || undefined,
        referenceNumber: undefined
      }

      await ApiClient.post('/stockadjustments', adjustmentData)
      
      showToast('Stock adjustment created successfully', 'success')
      setSelectedProduct('')
      setSelectedProductObj(null)
      setProductSearch('')
      setAdjustmentType('')
      setQuantityChange('')
      setReason('')
      setNotes('')
      
      await loadProducts()
      await loadAdjustments()
      await loadPendingAdjustments()

      await ApiClient.logActivity(
        'Created stock adjustment',
        `Product: ${selectedProductObj.name}, Change: ${quantityChange}`,
        'StockAdjustment'
      )
    } catch (error: any) {
      showToast('Failed to create adjustment. Please try again.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleApproveAdjustment = async (adjustmentId: number) => {
    try {
      await ApiClient.put(`/stockadjustments/${adjustmentId}/approve`, {})
      showToast('Stock adjustment approved and applied', 'success')
      await loadProducts()
      await loadPendingAdjustments()
      await loadAdjustments()
    } catch (error: any) {
      showToast('Failed to approve adjustment. Please try again.', 'error')
    }
  }

  const getExpiryBadgeColor = (status: string) => {
    switch (status) {
      case 'CRITICAL': return 'bg-red-100 text-red-800'
      case 'WARNING': return 'bg-orange-100 text-orange-800'
      case 'CAUTION': return 'bg-yellow-100 text-yellow-800'
      case 'GOOD': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return formatDateSync(dateString)
  }

  const getAdjustmentTypeDisplay = (type: string) => {
    switch (type) {
      case 'DAMAGE': return 'Damage'
      case 'THEFT': return 'Theft'
      case 'EXPIRED': return 'Expired'
      case 'FOUND': return 'Found'
      case 'CORRECTION': return 'Correction'
      case 'RETURN': return 'Return to Stock'
      default: return type
    }
  }

  // Shared input class
  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent'

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-xs font-semibold text-slate-600 mb-1">{children}</label>
  )

  const SectionHeader = ({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: number }) => (
    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-emerald-100">
        <Icon className="w-4 h-4 text-emerald-600" />
      </span>
      <span className="text-sm font-semibold text-slate-700">{title}</span>
      {count !== undefined && (
        <span className="ml-auto text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  )

  // Product search dropdown shared across tabs
  const ProductSearchField = () => (
    <div className="relative">
      <FieldLabel>Product</FieldLabel>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <HybridInput
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          value={productSearch}
          onChange={setProductSearch}
          onTouchKeyboard={() => openKb('productSearch', 'qwerty', 'Search Product')}
          placeholder="Search by name or barcode..."
        />
      </div>
      {showProductDropdown && productSearch && filteredProducts.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filteredProducts.map(product => (
            <div
              key={product.id}
              onClick={() => handleProductSelect(product)}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-emerald-50 border-b border-slate-50 last:border-b-0"
            >
              <ScanBarcode className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-slate-800">{product.name}</div>
                <div className="text-xs text-slate-500">{product.barcode} • Stock: {product.stockQuantity}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {selectedProductObj && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="font-medium text-emerald-800">{selectedProductObj.name}</span>
          <span className="text-emerald-600 text-xs ml-auto">Stock: {selectedProductObj.stockQuantity}</span>
        </div>
      )}
    </div>
  )

  const tabs = [
    { key: 'adjustments', label: 'Stock Adjustments', Icon: ArrowUpDown },
    { key: 'expiring',    label: 'Expiring Products', Icon: Clock         },
    { key: 'counting',   label: 'Physical Counting',  Icon: ClipboardList },
  ]

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
        <PageHeader
          title="Advanced Inventory"
          subtitle="Stock adjustments & tracking"
          onBack={goBack}
          right={<SessionStatus />}
        />

        {/* Tabs */}
        <div className="border-b border-slate-200 bg-white px-4">
          <div className="flex gap-1">
            {tabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === key
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 px-4 pb-4 pt-4 overflow-y-auto bg-slate-50">
          <div className="space-y-4 max-w-4xl mx-auto">

          {/* ── Stock Adjustments Tab ── */}
          {activeTab === 'adjustments' && (
            <>
              {/* Create Adjustment Form */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                <SectionHeader icon={ArrowUpDown} title="Create Stock Adjustment" />
                <form onSubmit={handleCreateAdjustment} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ProductSearchField />
                    <div>
                      <FieldLabel>Adjustment Type</FieldLabel>
                      <div className="relative">
                        <select
                          value={adjustmentType}
                          onChange={(e) => setAdjustmentType(e.target.value)}
                          className={`${inputCls} appearance-none pr-8`}
                          required
                        >
                          <option value="">Select adjustment type</option>
                          <option value="DAMAGE">Damage</option>
                          <option value="THEFT">Theft</option>
                          <option value="EXPIRED">Expired</option>
                          <option value="FOUND">Found / Discovered</option>
                          <option value="CORRECTION">Correction</option>
                          <option value="RETURN">Return to Stock</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Quantity Change</FieldLabel>
                      <HybridInput
                        type="number"
                        className={inputCls}
                        value={quantityChange}
                        onChange={setQuantityChange}
                        onTouchKeyboard={() => openKb('quantityChange', 'numeric', 'Quantity Change')}
                        placeholder="Enter positive or negative number"
                      />
                      <p className="text-xs text-slate-400 mt-1">Use negative numbers to remove stock</p>
                    </div>
                    <div>
                      <FieldLabel>Reason</FieldLabel>
                      <HybridInput
                        className={inputCls}
                        value={reason}
                        onChange={setReason}
                        onTouchKeyboard={() => openKb('reason', 'qwerty', 'Adjustment Reason')}
                        placeholder="Required: explain the adjustment"
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Additional Notes (Optional)</FieldLabel>
                    <HybridInput
                      className={inputCls}
                      value={notes}
                      onChange={setNotes}
                      onTouchKeyboard={() => openKb('notes', 'qwerty', 'Additional Notes')}
                      placeholder="Optional: add any extra details"
                    />
                  </div>

                  <div className="flex gap-2 pt-1 border-t border-slate-100">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      {loading ? 'Creating…' : 'Create Adjustment'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-300 text-slate-600 hover:bg-slate-50 gap-1.5 text-sm"
                      onClick={() => {
                        setSelectedProduct(''); setSelectedProductObj(null); setProductSearch('')
                        setAdjustmentType(''); setQuantityChange(''); setReason(''); setNotes('')
                      }}
                    >
                      <X className="w-4 h-4" />Clear
                    </Button>
                  </div>
                </form>
              </div>

              {/* Pending Approvals */}
              {pendingAdjustments.length > 0 && (
                <div className="bg-white rounded-lg border border-amber-200 shadow-sm p-4">
                  <SectionHeader icon={AlertTriangle} title="Pending Approvals" count={pendingAdjustments.length} />
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                    {pendingAdjustments.map(adj => (
                      <li key={adj.id} className="flex items-start gap-3 px-4 py-3 bg-amber-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{adj.product.name}</p>
                          <p className="text-xs text-slate-600">
                            {getAdjustmentTypeDisplay(adj.adjustmentType)}: <span className="font-medium">{adj.quantityChange > 0 ? '+' : ''}{adj.quantityChange} units</span>
                          </p>
                          <p className="text-xs text-slate-500">{adj.reason}</p>
                          <p className="text-xs text-slate-400">
                            Cost: <span className={adj.costImpact < 0 ? 'text-red-600' : 'text-emerald-600'}>{adj.costImpact.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                            {' · '}{adj.adjustedByEmployee.name} · {formatDate(adj.adjustmentDate)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleApproveAdjustment(adj.id)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs flex-shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />Approve
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recent Adjustments */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                <SectionHeader icon={Layers} title="Recent Stock Adjustments" />
                {adjustments.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-2">
                    <ArrowUpDown className="w-8 h-8 text-slate-200" />
                    <p className="text-sm text-slate-400">No adjustments found</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                    {adjustments.slice(0, 10).map(adj => (
                      <li key={adj.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{adj.product.name}</p>
                          <p className="text-xs text-slate-600">
                            {getAdjustmentTypeDisplay(adj.adjustmentType)}: <span className="font-medium">{adj.quantityChange > 0 ? '+' : ''}{adj.quantityChange} units</span>
                            {' · '}Stock: {adj.quantityBefore} → {adj.quantityAfter}
                          </p>
                          <p className="text-xs text-slate-500">{adj.reason}</p>
                          <p className="text-xs text-slate-400">{adj.adjustedByEmployee.name} · {formatDate(adj.adjustmentDate)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-semibold ${adj.costImpact < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {adj.costImpact.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          </p>
                          {adj.requiresApproval && (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium mt-1 ${
                              adj.isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {adj.isApproved
                                ? <><CheckCircle2 className="w-3 h-3" />Approved</>
                                : <><AlertTriangle className="w-3 h-3" />Pending</>
                              }
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {/* ── Expiring Products Tab ── */}
          {activeTab === 'expiring' && (
            <>
              {/* Add Product Batch Form */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                <SectionHeader icon={CalendarDays} title="Add Product Batch" />
                <div className="space-y-4">
                  <ProductSearchField />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <FieldLabel>Manufacturing Date</FieldLabel>
                      <input
                        type="date"
                        className={inputCls}
                        onChange={(e) => setAdjustmentType(e.target.value)}
                      />
                    </div>
                    <div>
                      <FieldLabel>Expiry Date</FieldLabel>
                      <input
                        type="date"
                        className={inputCls}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </div>
                    <div>
                      <FieldLabel>Supplier Lot Number</FieldLabel>
                      <input
                        placeholder="Supplier's lot number"
                        className={inputCls}
                        onClick={() => { setKbTarget('notes'); setKbType('qwerty'); setKbTitle('Supplier Lot Number'); setKbOpen(true) }}
                        value={notes}
                        readOnly
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Quantity</FieldLabel>
                      <input
                        placeholder="Enter quantity"
                        className={inputCls}
                        onClick={() => { setKbTarget('quantityChange'); setKbType('decimal'); setKbTitle('Quantity'); setKbOpen(true) }}
                        value={quantityChange}
                        readOnly
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button
                        onClick={async () => {
                          if (!selectedProductObj || !quantityChange) {
                            showToast('Please select a product and enter quantity', 'warning')
                            return
                          }
                          const today = new Date()
                          const dateStr = today.getFullYear().toString() +
                                         (today.getMonth() + 1).toString().padStart(2, '0') +
                                         today.getDate().toString().padStart(2, '0')
                          const timeStr = today.getHours().toString().padStart(2, '0') +
                                         today.getMinutes().toString().padStart(2, '0') +
                                         today.getSeconds().toString().padStart(2, '0')
                          const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
                          const autoBatchNumber = `BATCH-${dateStr}-${timeStr}-${randomSuffix}`
                          try {
                            await ApiClient.post(`/products/${selectedProductObj.id}/batches`, {
                              batchNumber: autoBatchNumber,
                              quantity: parseInt(quantityChange),
                              costPerUnit: selectedProductObj.cost || 0,
                              receivedDate: new Date().toISOString(),
                              expirationDate: reason ? new Date(reason).toISOString() : null,
                              manufacturingDate: adjustmentType ? new Date(adjustmentType).toISOString() : null,
                              supplier: 'Manual Entry',
                              lotNumber: notes || null
                            })
                            showToast(`Batch added successfully. Batch #${autoBatchNumber}`, 'success')
                            setProductSearch(''); setReason(''); setQuantityChange(''); setAdjustmentType(''); setNotes('')
                            setSelectedProductObj(null); setSelectedProduct(''); setShowProductDropdown(false)
                            await loadExpiringProducts(); await loadProducts()
                          } catch (error: any) { showToast('Failed to add batch. Please try again.', 'error') }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-sm"
                      >
                        <Plus className="w-4 h-4" />Add Batch
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-slate-300 text-slate-600 hover:bg-slate-50 gap-1.5 text-sm"
                        onClick={() => {
                          setProductSearch(''); setSelectedProductObj(null); setSelectedProduct('')
                          setReason(''); setQuantityChange(''); setAdjustmentType(''); setNotes('')
                        }}
                      >
                        <X className="w-4 h-4" />Clear
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Batches List */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                <SectionHeader icon={Package} title="Product Batches" />
                {expiringBatches.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-2">
                    <Package className="w-8 h-8 text-slate-200" />
                    <p className="text-sm text-slate-400">No product batches found</p>
                    <p className="text-xs text-slate-400">Add batches above to track inventory by batch numbers</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 overflow-hidden">
                    {expiringBatches.map(batch => (
                      <li key={batch.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{batch.product.name}</p>
                          <p className="text-xs text-slate-600">
                            Batch: <span className="font-mono">{batch.batchNumber}</span> · Qty: {batch.quantity}
                          </p>
                          <p className="text-xs text-slate-500">
                            Supplier: {batch.supplier || 'N/A'} · Expires: {batch.expirationDate ? formatDate(batch.expirationDate) : 'No expiry'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${getExpiryBadgeColor(batch.expiryStatus)}`}>
                            {batch.expiryStatus}
                          </span>
                          {batch.daysUntilExpiry !== undefined && (
                            <span className="text-xs text-slate-400">{batch.daysUntilExpiry}d left</span>
                          )}
                          {batch.expiryStatus === 'CRITICAL' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-300 hover:bg-red-50 text-xs gap-1"
                              onClick={() => {
                                setSelectedProduct(batch.product.id.toString())
                                setAdjustmentType('EXPIRED')
                                setQuantityChange(`-${batch.quantity}`)
                                setReason(`Expired batch: ${batch.batchNumber}`)
                                setActiveTab('adjustments')
                              }}
                            >
                              <XCircle className="w-3 h-3" />Mark Expired
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {/* ── Physical Counting Tab ── */}
          {activeTab === 'counting' && (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
              <SectionHeader icon={ClipboardList} title="Physical Inventory Count" />
              <div className="space-y-4">
                <ProductSearchField />

                <div>
                  <FieldLabel>Actual Count</FieldLabel>
                  <input
                    placeholder="Enter actual count"
                    className={inputCls}
                    onClick={() => { setKbTarget('quantityChange'); setKbType('decimal'); setKbTitle('Actual Count'); setKbOpen(true) }}
                    value={quantityChange}
                    readOnly
                  />
                </div>

                {selectedProductObj && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-700">{selectedProductObj.name}</p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-white border border-slate-200 rounded-lg p-2">
                        <p className="text-xs text-slate-500">System Stock</p>
                        <p className="text-lg font-bold text-slate-700">{selectedProductObj.stockQuantity}</p>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-2">
                        <p className="text-xs text-slate-500">Actual Count</p>
                        <p className="text-lg font-bold text-emerald-600">{quantityChange || '—'}</p>
                      </div>
                      <div className={`border rounded-lg p-2 ${
                        quantityChange
                          ? parseInt(quantityChange) - selectedProductObj.stockQuantity === 0
                            ? 'bg-emerald-50 border-emerald-200'
                            : parseInt(quantityChange) - selectedProductObj.stockQuantity < 0
                              ? 'bg-red-50 border-red-200'
                              : 'bg-blue-50 border-blue-200'
                          : 'bg-white border-slate-200'
                      }`}>
                        <p className="text-xs text-slate-500">Difference</p>
                        <p className={`text-lg font-bold ${
                          quantityChange
                            ? parseInt(quantityChange) - selectedProductObj.stockQuantity === 0
                              ? 'text-emerald-600'
                              : parseInt(quantityChange) - selectedProductObj.stockQuantity < 0
                                ? 'text-red-600'
                                : 'text-blue-600'
                            : 'text-slate-400'
                        }`}>
                          {quantityChange
                            ? (parseInt(quantityChange) - selectedProductObj.stockQuantity > 0 ? '+' : '')
                              + (parseInt(quantityChange) - selectedProductObj.stockQuantity)
                            : '—'
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={async () => {
                          if (!quantityChange) return
                          const diff = parseInt(quantityChange) - selectedProductObj.stockQuantity
                          if (diff === 0) { showToast('No adjustment needed — counts match', 'info'); return }
                          try {
                            await ApiClient.post('/stockadjustments', {
                              productId: selectedProductObj.id,
                              adjustmentType: 'CORRECTION',
                              quantityChange: diff,
                              reason: 'Physical count adjustment'
                            })
                            showToast('Stock adjusted based on physical count', 'success')
                            setProductSearch(''); setQuantityChange(''); setSelectedProductObj(null); setSelectedProduct('')
                            await loadProducts(); await loadAdjustments()
                          } catch (error: any) { showToast('Failed to create adjustment. Please try again.', 'error') }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-sm"
                      >
                        <CheckCircle2 className="w-4 h-4" />Apply Count
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-slate-300 text-slate-600 hover:bg-slate-50 gap-1.5 text-sm"
                        onClick={() => {
                          setProductSearch(''); setSelectedProductObj(null); setSelectedProduct(''); setQuantityChange('')
                        }}
                      >
                        <X className="w-4 h-4" />Clear
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          </div>
        </main>

        {/* Modal Keyboard */}
        <ModalKeyboard
          open={kbOpen}
          type={kbType}
          title={kbTitle}
          initialValue={
            kbTarget === 'productSearch' ? productSearch :
            kbTarget === 'quantityChange' ? quantityChange :
            kbTarget === 'reason' ? reason :
            kbTarget === 'notes' ? notes : ''
          }
          onSubmit={applyKb}
          onClose={() => setKbOpen(false)}
        />
      </div>
    </SessionGuard>
  )
}

export default InventoryManagement