import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import SessionGuard from './SessionGuard'
import SessionStatus from './SessionStatus'
import ApiClient from '../utils/ApiClient'
import { useBusinessSettings } from '../contexts/SettingsContext'
import SessionManager from '../utils/SessionManager'
import { formatDateSync } from '../utils/dateFormat'

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
  const { businessSettings } = useBusinessSettings()
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
      alert('Please select a valid product')
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
      
      alert('Stock adjustment created successfully!')
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
      alert(`Failed to create stock adjustment!\n\n${error.message || 'Unknown error'}\n\nPlease try again.`)
    } finally {
      setLoading(false)
    }
  }

  const handleApproveAdjustment = async (adjustmentId: number) => {
    try {
      await ApiClient.put(`/stockadjustments/${adjustmentId}/approve`, {})
      alert('Stock adjustment approved and applied!')
      await loadProducts()
      await loadPendingAdjustments()
      await loadAdjustments()
    } catch (error: any) {
      alert(`Failed to approve adjustment!\n\n${error.message || 'Unknown error'}\n\nPlease try again.`)
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

  return (
    <SessionGuard requiredRole="Manager">
      <div className="w-full h-full flex flex-col bg-white">
        {/* Header */}
        <header className="h-14 px-4 border-b flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={goBack} className="hover:bg-slate-50">
            ← Back
          </Button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-emerald-600">
              {businessSettings.businessName || 'Business Name'}
            </h1>
            <p className="text-xs text-slate-600 font-medium">
              Advanced Inventory Management
            </p>
          </div>
          <SessionStatus />
        </header>

        {/* Tabs */}
        <div className="border-b bg-white">
          <div className="flex space-x-8 px-6">
            {[
              { key: 'adjustments', label: 'Stock Adjustments' },
              { key: 'expiring', label: 'Expiring Products' },
              { key: 'counting', label: 'Physical Counting' }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`py-3 border-b-2 font-medium text-sm ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 px-6 pb-6 overflow-y-auto">
          <div className="pt-6">

          {/* Stock Adjustments Tab */}
          {activeTab === 'adjustments' && (
            <div className="space-y-6">
              {/* Create Adjustment Form */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold mb-4">Create Stock Adjustment</h2>
                <form onSubmit={handleCreateAdjustment} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                      <label htmlFor="product" className="block text-sm font-medium text-gray-700 mb-1">
                        Product
                      </label>
                      <HybridInput
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer"
                        value={productSearch}
                        onChange={setProductSearch}
                        onTouchKeyboard={() => openKb('productSearch', 'qwerty', 'Search Product')}
                        placeholder="Search by product name or barcode..."
                      />
                      
                      {showProductDropdown && productSearch && filteredProducts.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredProducts.map(product => (
                            <div
                              key={product.id}
                              onClick={() => handleProductSelect(product)}
                              className="px-3 py-2 cursor-pointer hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                            >
                              <div className="font-medium text-gray-900">{product.name}</div>
                              <div className="text-sm text-gray-500">
                                Barcode: {product.barcode} • Stock: {product.stockQuantity}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {selectedProductObj && (
                        <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-sm">
                          <strong>Selected:</strong> {selectedProductObj.name} (Stock: {selectedProductObj.stockQuantity})
                        </div>
                      )}
                    </div>

                    <div>
                      <label htmlFor="adjustmentType" className="block text-sm font-medium text-gray-700 mb-1">
                        Adjustment Type
                      </label>
                      <select 
                        id="adjustmentType"
                        value={adjustmentType} 
                        onChange={(e) => setAdjustmentType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        required
                      >
                        <option value="">Select adjustment type</option>
                        <option value="DAMAGE">Damage</option>
                        <option value="THEFT">Theft</option>
                        <option value="EXPIRED">Expired</option>
                        <option value="FOUND">Found/Discovered</option>
                        <option value="CORRECTION">Correction</option>
                        <option value="RETURN">Return to Stock</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="quantityChange" className="block text-sm font-medium text-gray-700 mb-1">
                        Quantity Change
                      </label>
                      <HybridInput
                        type="number"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer"
                        value={quantityChange}
                        onChange={setQuantityChange}
                        onTouchKeyboard={() => openKb('quantityChange', 'numeric', 'Quantity Change')}
                        placeholder="Enter positive or negative number"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use negative numbers to remove stock
                      </p>
                    </div>

                    <div>
                      <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
                        Reason
                      </label>
                      <HybridInput
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer"
                        value={reason}
                        onChange={setReason}
                        onTouchKeyboard={() => openKb('reason', 'qwerty', 'Adjustment Reason')}
                        placeholder="Required: explain the adjustment"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                      Additional Notes (Optional)
                    </label>
                    <HybridInput
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none cursor-pointer"
                      value={notes}
                      onChange={setNotes}
                      onTouchKeyboard={() => openKb('notes', 'qwerty', 'Additional Notes')}
                      placeholder="Optional: Add any additional details about this adjustment"
                    />
                  </div>

                  <div className="flex space-x-3 pt-2">
                    <Button 
                      type="submit" 
                      disabled={loading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium"
                    >
                      {loading ? 'Creating...' : 'Create Adjustment'}
                    </Button>
                    
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSelectedProduct('')
                        setSelectedProductObj(null)
                        setProductSearch('')
                        setAdjustmentType('')
                        setQuantityChange('')
                        setReason('')
                        setNotes('')
                      }}
                      className="px-6 py-2 rounded-lg font-medium"
                    >
                      Clear Form
                    </Button>
                  </div>
                </form>
              </div>

              {/* Pending Approvals */}
              {pendingAdjustments.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h2 className="text-lg font-semibold mb-4">Pending Approvals ({pendingAdjustments.length})</h2>
                  <div className="space-y-3">
                    {pendingAdjustments.map(adjustment => (
                      <div key={adjustment.id} className="p-4 border rounded-lg bg-orange-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{adjustment.product.name}</h4>
                            <p className="text-sm text-gray-600">
                              {getAdjustmentTypeDisplay(adjustment.adjustmentType)}: {adjustment.quantityChange > 0 ? '+' : ''}{adjustment.quantityChange} units
                            </p>
                            <p className="text-sm text-gray-600">
                              Reason: {adjustment.reason}
                            </p>
                            <p className="text-sm text-gray-600">
                              Cost Impact: {adjustment.costImpact.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                            </p>
                            <p className="text-xs text-gray-500">
                              By: {adjustment.adjustedByEmployee.name} • {formatDate(adjustment.adjustmentDate)}
                            </p>
                          </div>
                          <Button 
                            size="sm"
                            onClick={() => handleApproveAdjustment(adjustment.id)}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            Approve
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Adjustments */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold mb-4">Recent Stock Adjustments</h2>
                <div className="space-y-3">
                  {adjustments.slice(0, 10).map(adjustment => (
                    <div key={adjustment.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{adjustment.product.name}</h4>
                          <p className="text-sm text-gray-600">
                            {getAdjustmentTypeDisplay(adjustment.adjustmentType)}: {adjustment.quantityChange > 0 ? '+' : ''}{adjustment.quantityChange} units
                          </p>
                          <p className="text-sm text-gray-600">
                            Stock: {adjustment.quantityBefore} → {adjustment.quantityAfter}
                          </p>
                          <p className="text-sm text-gray-600">
                            Reason: {adjustment.reason}
                          </p>
                          <p className="text-xs text-gray-500">
                            By: {adjustment.adjustedByEmployee.name} • {formatDate(adjustment.adjustmentDate)}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-medium ${adjustment.costImpact < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {adjustment.costImpact.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                          </div>
                          {adjustment.requiresApproval && (
                            <div className={`text-xs px-2 py-1 rounded mt-1 ${
                              adjustment.isApproved ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                            }`}>
                              {adjustment.isApproved ? 'Approved' : 'Pending'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Expiring Products Tab */}
          {activeTab === 'expiring' && (
            <div className="space-y-6">
              {/* Add Product Batch Form */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold mb-4">Add Product Batch</h2>
                <div className="grid grid-cols-1 gap-4">
                  <div className="relative">
                    <label htmlFor="expiring-product" className="block text-sm font-medium text-gray-700 mb-1">
                      Product
                    </label>
                    <input 
                      id="expiring-product"
                      placeholder="Search by product name or barcode..." 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer" 
                      onClick={() => { 
                        setKbTarget('productSearch'); 
                        setKbType('qwerty'); 
                        setKbTitle('Product Search'); 
                        setKbOpen(true);
                        setShowProductDropdown(true);
                      }} 
                      value={productSearch} 
                      readOnly 
                    />
                    
                    {showProductDropdown && productSearch && filteredProducts.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredProducts.map(product => (
                          <div
                            key={product.id}
                            onClick={() => handleProductSelect(product)}
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="font-medium text-gray-900">{product.name}</div>
                            <div className="text-sm text-gray-500">
                              Barcode: {product.barcode} • Stock: {product.stockQuantity}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {selectedProductObj && (
                      <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-sm">
                        <strong>Selected:</strong> {selectedProductObj.name} (Stock: {selectedProductObj.stockQuantity})
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="manufacturing-date" className="block text-sm font-medium text-gray-700 mb-1">
                        Manufacturing Date
                      </label>
                      <input 
                        id="manufacturing-date"
                        type="date" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" 
                        onChange={(e) => setAdjustmentType(e.target.value)} 
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="expiry-date" className="block text-sm font-medium text-gray-700 mb-1">
                        Expiry Date
                      </label>
                      <input 
                        id="expiry-date"
                        type="date" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" 
                        onChange={(e) => setReason(e.target.value)} 
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="lot-number" className="block text-sm font-medium text-gray-700 mb-1">
                        Supplier Lot Number
                      </label>
                      <input 
                        id="lot-number"
                        placeholder="Supplier's lot number" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer" 
                        onClick={() => { setKbTarget('notes'); setKbType('qwerty'); setKbTitle('Supplier Lot Number'); setKbOpen(true) }} 
                        value={notes} 
                        readOnly 
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label htmlFor="batch-quantity" className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity
                    </label>
                    <input 
                      id="batch-quantity"
                      placeholder="Enter quantity" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer" 
                      onClick={() => { setKbTarget('quantityChange'); setKbType('decimal'); setKbTitle('Quantity'); setKbOpen(true) }} 
                      value={quantityChange} 
                      readOnly 
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    <Button 
                      onClick={async () => {
                        if (!selectedProductObj || !quantityChange) {
                          alert('Please select a product and enter quantity')
                          return
                        }
                        
                        // Generate unique batch number automatically
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
                          alert(`Product batch added successfully!\n\nBatch Number: ${autoBatchNumber}`)
                          setProductSearch(''); setReason(''); setQuantityChange(''); setAdjustmentType(''); setNotes(''); setSelectedProductObj(null); setSelectedProduct('')
                          setShowProductDropdown(false)
                          await loadExpiringProducts()
                          await loadProducts()
                        } catch (error: any) { alert(`Failed to add batch!\n\n${error.message || 'Unknown error'}\n\nPlease try again.`) }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium"
                    >
                      Add Batch
                    </Button>
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setProductSearch('')
                        setSelectedProductObj(null)
                        setSelectedProduct('')
                        setReason('')
                        setQuantityChange('')
                        setAdjustmentType('')
                        setNotes('')
                      }}
                      className="px-6 py-2 rounded-lg font-medium"
                    >
                      Clear Form
                    </Button>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold mb-4">Product Batches (All)</h2>
                {expiringBatches.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 text-lg font-medium">No product batches found</p>
                    <p className="text-gray-500 text-sm mt-2">Add batches above to track inventory by batch numbers</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expiringBatches.map(batch => (
                      <div key={batch.id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{batch.product.name}</h4>
                            <p className="text-sm text-gray-600">
                              Batch: {batch.batchNumber} • Qty: {batch.quantity}
                            </p>
                            <p className="text-sm text-gray-600">
                              Supplier: {batch.supplier || 'N/A'}
                            </p>
                            <p className="text-sm text-gray-600">
                              Expires: {batch.expirationDate ? formatDate(batch.expirationDate) : 'No expiry'}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className={`text-xs px-3 py-1 rounded-full font-medium ${getExpiryBadgeColor(batch.expiryStatus)}`}>
                              {batch.expiryStatus}
                            </div>
                            {batch.daysUntilExpiry !== undefined && (
                              <p className="text-xs text-gray-500 mt-1">
                                {batch.daysUntilExpiry} days left
                              </p>
                            )}
                            
                            {batch.expiryStatus === 'CRITICAL' && (
                              <Button 
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-300 hover:bg-red-50 mt-2"
                                onClick={() => {
                                  setSelectedProduct(batch.product.id.toString())
                                  setAdjustmentType('EXPIRED')
                                  setQuantityChange(`-${batch.quantity}`)
                                  setReason(`Expired batch: ${batch.batchNumber}`)
                                  setActiveTab('adjustments')
                                }}
                              >
                                Mark as Expired
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Physical Counting Tab */}
          {activeTab === 'counting' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold mb-4">Physical Inventory Count</h2>
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <div className="relative">
                    <label htmlFor="counting-product" className="block text-sm font-medium text-gray-700 mb-1">
                      Product
                    </label>
                    <input 
                      id="counting-product"
                      placeholder="Search by product name or barcode..." 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer" 
                      onClick={() => { 
                        setKbTarget('productSearch'); 
                        setKbType('qwerty'); 
                        setKbTitle('Product Search'); 
                        setKbOpen(true);
                        setShowProductDropdown(true);
                      }} 
                      value={productSearch} 
                      readOnly 
                    />
                    
                    {showProductDropdown && productSearch && filteredProducts.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {filteredProducts.map(product => (
                          <div
                            key={product.id}
                            onClick={() => handleProductSelect(product)}
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="font-medium text-gray-900">{product.name}</div>
                            <div className="text-sm text-gray-500">
                              Barcode: {product.barcode} • Stock: {product.stockQuantity}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {selectedProductObj && (
                      <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-sm">
                        <strong>Selected:</strong> {selectedProductObj.name} (Stock: {selectedProductObj.stockQuantity})
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label htmlFor="actual-count" className="block text-sm font-medium text-gray-700 mb-1">
                      Actual Count
                    </label>
                    <input 
                      id="actual-count"
                      placeholder="Enter actual count" 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer" 
                      onClick={() => { setKbTarget('quantityChange'); setKbType('decimal'); setKbTitle('Actual Count'); setKbOpen(true) }} 
                      value={quantityChange} 
                      readOnly 
                    />
                  </div>
                </div>
                {selectedProductObj && (
                  <div className="bg-blue-50 p-4 rounded-lg mb-4">
                    <h3 className="font-medium">{selectedProductObj.name}</h3>
                    <p>System Stock: {selectedProductObj.stockQuantity}</p>
                    <p>Actual Count: {quantityChange || '0'}</p>
                    <p>Difference: {quantityChange ? (parseInt(quantityChange) - selectedProductObj.stockQuantity) : 0}</p>
                    <div className="flex space-x-3 mt-2">
                      <Button 
                        onClick={async () => {
                          if (!quantityChange) return
                          const diff = parseInt(quantityChange) - selectedProductObj.stockQuantity
                          if (diff === 0) { alert('No adjustment needed - counts match!'); return }
                          try {
                            await ApiClient.post('/stockadjustments', {
                              productId: selectedProductObj.id,
                              adjustmentType: 'CORRECTION',
                              quantityChange: diff,
                              reason: 'Physical count adjustment'
                            })
                            alert('Stock adjusted based on physical count!')
                            setProductSearch(''); setQuantityChange(''); setSelectedProductObj(null); setSelectedProduct('')
                            await loadProducts(); await loadAdjustments()
                          } catch (error: any) { alert(`Failed to create adjustment!\n\n${error.message || 'Unknown error'}\n\nPlease try again.`) }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium"
                      >
                        Apply Count
                      </Button>
                      
                      <Button 
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setProductSearch('')
                          setSelectedProductObj(null)
                          setSelectedProduct('')
                          setQuantityChange('')
                        }}
                        className="px-6 py-2 rounded-lg font-medium"
                      >
                        Clear Form
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