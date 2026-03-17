import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package, Search, ScanBarcode, Plus, Save, Trash2,
  X, ChevronDown, Tag, AlertTriangle, Edit2
} from 'lucide-react'
import { Button } from './ui/button'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import { formatCurrency } from '../utils/formatCurrency'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import { SystemSettings } from '../types/SystemSettings'
import ApiClient from '../utils/ApiClient'
import PageHeader from './ui/PageHeader'
import { useToast } from '../contexts/ToastContext'

// Product interface matching the API model
interface Product {
  id: number
  barcode: string
  name: string
  description?: string
  price: number
  cost: number
  stockQuantity: number
  minStockLevel: number
  variant?: string
  brand?: string
  category?: string
  imageUrl?: string
  unit: string
  isActive: boolean
  createdDate: string
  lastUpdated: string
}


const Inventory: React.FC = () => {
  const navigate = useNavigate()
  const { showToast } = useToast()

  // Session and role validation handled by SessionGuard wrapper

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

  // State management
  const [products, setProducts] = React.useState<Product[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [, setSystemSettings] = React.useState<SystemSettings | null>(null)
  const [availableCategories, setAvailableCategories] = React.useState<string[]>([])
  const [selectedCategoryFilter, setSelectedCategoryFilter] = React.useState<string>('')
  
  // Modal keyboard state and product form management
  type FormKeys = 'barcode'|'name'|'variant'|'brand'|'category'|'qty'|'low'|'cost'|'price'|'search'
  const [kbOpen, setKbOpen] = React.useState<boolean>(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('numeric')
  const [kbTitle, setKbTitle] = React.useState<string>('')
  const [kbTarget, setKbTarget] = React.useState<FormKeys>('barcode')
  const [form, setForm] = React.useState<Record<FormKeys, string>>({
    barcode: '', name: '', variant: '', brand: '', category: '', qty: '', low: '', cost: '', price: '', search: ''
  })
  const [selectedProduct, setSelectedProduct] = React.useState<number | null>(null)
  const [isEditing, setIsEditing] = React.useState<boolean>(false)
  const [upcImageUrl, setUpcImageUrl] = React.useState<string | null>(null)
  const [isSearching, setIsSearching] = React.useState<boolean>(false)
  const [viewingProduct, setViewingProduct] = React.useState<Product | null>(null)
  const [showDeleteModal, setShowDeleteModal] = React.useState<boolean>(false)
  
  // Barcode scanner detection
  const [scanBuffer, setScanBuffer] = React.useState<string>('')
  const [scanTimeout, setScanTimeout] = React.useState<NodeJS.Timeout | null>(null)

  const openKb = (target: FormKeys, type: KeyboardType, title: string) => {
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
    setKbOpen(true)
  }

  const applyKb = (val: string) => {
    setForm((f) => ({ ...f, [kbTarget]: val }))
    setKbOpen(false)
  }

  // Load system settings to get available categories
  const loadSystemSettings = async () => {
    try {
      const settings = await ApiClient.getSettings<SystemSettings>('system')
      setSystemSettings(settings)
        
      // Extract categories from settings
      if (settings.productCategories) {
        const categories = settings.productCategories
          .split(',')
          .map((cat: string) => cat.trim())
          .filter((cat: string) => cat.length > 0)
        setAvailableCategories(categories)
      }
    } catch (err) {
      console.error('Error loading system settings:', err)
      // Continue without categories if settings can't be loaded
    }
  }

  // Load products from API
  const loadProducts = async () => {
    try {
      setLoading(true)
      const data = await ApiClient.getProducts()
      console.log('Loaded products:', data) // Debug: see product data
      data.forEach((product: Product, index: number) => {
        console.log(`Product ${index + 1} imageUrl:`, product.imageUrl) // Debug each image URL
      })
      setProducts(data)
    } catch (err) {
      showToast('Failed to load products: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error')
      console.error('Error loading products:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load products and system settings on component mount
  React.useEffect(() => {
    loadSystemSettings()
    loadProducts()
  }, [])

  // Barcode scanner detection
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if keyboard modal is open or if typing in an input field
      if (kbOpen || (e.target as HTMLElement).tagName === 'INPUT') return
      
      // Clear previous timeout
      if (scanTimeout) {
        clearTimeout(scanTimeout)
      }
      
      // Add character to scan buffer
      if (e.key.length === 1) { // Only single characters, not special keys
        setScanBuffer(prev => prev + e.key)
      }
      
      // Set timeout to process scan (barcode scanners are very fast)
      const timeout = setTimeout(() => {
        const fullBarcode = scanBuffer + e.key
        if (fullBarcode.length >= 5) { // Minimum barcode length
          // Remove 'Enter' from the end if present (barcode scanners often send Enter)
          const cleanBarcode = fullBarcode.replace(/Enter$/, '')
          if (cleanBarcode.length >= 5) {
            setForm(prev => ({ ...prev, barcode: cleanBarcode }))
            console.log('Barcode scanned:', cleanBarcode)
          }
        }
        setScanBuffer('')
      }, 100) // 100ms timeout
      
      setScanTimeout(timeout)
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (scanTimeout) clearTimeout(scanTimeout)
    }
  }, [kbOpen, scanBuffer, scanTimeout])

  // Search by barcode - first check local database, then UPC database
  const searchByBarcode = async (barcode: string) => {
    if (!barcode.trim()) return
    
    setIsSearching(true)
    try {
      // First, try to find in local database
      try {
        const product = await ApiClient.getJson<Product>(`/products/barcode/${encodeURIComponent(barcode)}`, true)
        console.log('Found product in local database:', product)
        selectProduct(product)
        // Clear barcode field after successful scan
        setForm(prev => ({ ...prev, barcode: '' }))
        return
      } catch (error: any) {
        // If not found locally, try UPC Item Database
        if (error.message?.includes('404') || error.status === 404) {
          console.log('Product not found locally, checking UPC database...')
          await searchUPCDatabase(barcode)
          // Don't clear barcode field here - user might want to add new product with this barcode
        } else {
          throw error
        }
      }
    } catch (err) {
      // Don't clear barcode field on error - user might want to manually add product with this barcode
      showToast('Barcode search failed: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error')
      console.error('Error searching by barcode:', err)
    } finally {
      setIsSearching(false)
    }
  }

  // Search UPC Item Database for product info
  const searchUPCDatabase = async (barcode: string) => {
    try {
      const response = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`)
      
      if (!response.ok) {
        throw new Error('UPC database request failed')
      }
      
      const data = await response.json()
      console.log('UPC Database response:', data)
      
      if (data.code === 'OK' && data.items && data.items.length > 0) {
        const item = data.items[0]
        console.log('UPC Item details:', item)
        console.log('Available images:', item.images)
        console.log('Item properties:', Object.keys(item))
        
        // Extract image URL from UPC data (prefer working HTTPS images)
        let imageUrl = null
        if (item.images && item.images.length > 0) {
          // Filter out obviously broken/old URLs and prefer reliable domains
          const reliableDomains = ['walmart.com', 'amazon.com', 'target.com', 'walgreens.com']
          const workingImages = item.images.filter((img: string) => {
            // Skip obviously broken URLs
            if (img.includes('spin_prod_ec_') || img.includes('rpx/i/s/i/spin')) return false
            // Prefer reliable domains
            return reliableDomains.some(domain => img.includes(domain)) || img.startsWith('https://')
          })
          
          if (workingImages.length > 0) {
            imageUrl = workingImages[0]
          } else {
            // Last resort - try first HTTPS image
            const httpsImages = item.images.filter((img: string) => img.startsWith('https://'))
            imageUrl = httpsImages.length > 0 ? httpsImages[0] : null
          }
        }
        console.log('All available images:', item.images)
        console.log('Filtered working images:', item.images.filter((img: string) => {
          if (img.includes('spin_prod_ec_') || img.includes('rpx/i/s/i/spin')) return false
          const reliableDomains = ['walmart.com', 'amazon.com', 'target.com', 'walgreens.com']
          return reliableDomains.some(domain => img.includes(domain)) || img.startsWith('https://')
        }))
        console.log('Selected image URL:', imageUrl)
        setUpcImageUrl(imageUrl)
        
        // Populate form with UPC data for new product creation
        setForm({
          ...form,
          barcode: barcode,
          name: item.title || '',
          variant: item.size || '',
          brand: item.brand || '',
          category: item.category || '',
          qty: '', // Let user enter stock quantity
          low: '5', // Default low stock alert
          cost: '', // Let user enter cost
          price: '' // Let user enter price
        })
        
        setSelectedProduct(null) // Clear selection since this is a new product
        setIsEditing(false) // Set to add mode
          
        console.log('Product info populated from UPC database')
      } else {
        showToast('Barcode "' + barcode + '" not found in UPC database', 'warning')
      }
    } catch (err) {
      showToast('UPC database search failed: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error')
      console.error('Error searching UPC database:', err)
    }
  }

  // Product action handlers
  const handleAdd = async () => {
    try {
      const productData = {
        barcode: form.barcode,
        name: form.name,
        variant: form.variant || null,
        brand: form.brand || null,
        category: form.category || null,
        stockQuantity: parseInt(form.qty) || 0,
        minStockLevel: parseInt(form.low) || 5,
        cost: parseFloat(form.cost) || 0,
        price: parseFloat(form.price) || 0,
        unit: 'pcs',
        isActive: true,
        imageUrl: upcImageUrl // Include image from UPC database
      }
      
      await ApiClient.postJson('/products', productData)
      
      await loadProducts() // Reload products
      clearForm()
      showToast('Product added successfully', 'success')
    } catch (err) {
      showToast('Failed to add product: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error')
      console.error('Error adding product:', err)
    }
  }

  const handleSave = async () => {
    if (selectedProduct !== null) {
      try {
        // Find the current product to preserve fields not in the form
        const currentProduct = products.find(p => p.id === selectedProduct)
        console.log('Current product before save:', currentProduct) // Debug
        console.log('Current product imageUrl:', currentProduct?.imageUrl) // Debug
        
        const productData = {
          id: selectedProduct,
          barcode: form.barcode,
          name: form.name,
          description: currentProduct?.description || '',
          price: parseFloat(form.price) || 0,
          cost: parseFloat(form.cost) || 0,
          stockQuantity: parseInt(form.qty) || 0,
          minStockLevel: parseInt(form.low) || 5,
          variant: form.variant || null,
          brand: form.brand || null,
          category: form.category || null,
          imageUrl: currentProduct?.imageUrl || null,
          unit: currentProduct?.unit || 'pcs',
          isActive: currentProduct?.isActive !== undefined ? currentProduct.isActive : true,
          createdDate: currentProduct?.createdDate || new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        }
        
        console.log('Saving product data:', productData) // Debug
        
        await ApiClient.put(`/products/${selectedProduct}`, productData)
        
        console.log('Save successful') // Debug
        
        await loadProducts() // Reload products
        setIsEditing(false)
        } catch (err) {
        showToast('Failed to save product: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error')
        console.error('Error saving product:', err)
      }
    }
  }

  const handleDelete = () => {
    if (selectedProduct !== null) {
      setShowDeleteModal(true)
    }
  }

  const handleConfirmDelete = async () => {
    setShowDeleteModal(false)
    if (selectedProduct === null) return
    try {
      await ApiClient.delete(`/products/${selectedProduct}`)
      await loadProducts()
      clearForm()
      setSelectedProduct(null)
      setIsEditing(false)
    } catch (err) {
      showToast('Failed to delete product: ' + (err instanceof Error ? err.message : 'Unknown error'), 'error')
      console.error('Error deleting product:', err)
    }
  }

  const clearForm = () => {
    setForm({
      barcode: '', name: '', variant: '', brand: '', category: '', qty: '', low: '', cost: '', price: '', search: ''
    })
    setSelectedProduct(null)
    setIsEditing(false)
    setUpcImageUrl(null) // Clear UPC image URL
  }

  const selectProduct = (product: Product) => {
    console.log('Selected product:', product) // Debug
    console.log('Product imageUrl:', product.imageUrl) // Debug
    setSelectedProduct(product.id)
    setForm({
      ...form,
      barcode: product.barcode,
      name: product.name,
      variant: product.variant || '',
      brand: product.brand || '',
      category: product.category || '',
      qty: product.stockQuantity.toString(),
      low: product.minStockLevel.toString(),
      cost: product.cost.toString(),
      price: product.price.toString()
    })
    setIsEditing(true)
  }

  const viewProduct = (product: Product) => {
    setViewingProduct(product)
  }

  const closeProductModal = () => {
    setViewingProduct(null)
  }

  // Filter products based on search and category
  const filteredProducts = React.useMemo(() => {
    let filtered = products
    
    // Apply search filter
    if (form.search.trim()) {
      const search = form.search.toLowerCase()
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(search) ||
        p.barcode.toLowerCase().includes(search) ||
        p.brand?.toLowerCase().includes(search) ||
        p.category?.toLowerCase().includes(search)
      )
    }
    
    // Apply category filter
    if (selectedCategoryFilter) {
      filtered = filtered.filter(p => p.category === selectedCategoryFilter)
    }
    
    return filtered
  }, [products, form.search, selectedCategoryFilter])

  const inputCls = 'w-full h-8 px-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent'
  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">{children}</label>
  )

  const stockStatus = (p: Product) => {
    if (p.stockQuantity === 0)                     return { label: 'Out of Stock', cls: 'bg-red-100 text-red-700' }
    if (p.stockQuantity <= p.minStockLevel)        return { label: 'Low Stock',    cls: 'bg-amber-100 text-amber-700' }
    return                                                { label: `Qty: ${p.stockQuantity}`, cls: 'bg-emerald-100 text-emerald-700' }
  }

  return (
    <SessionGuard requiredPermission="inventory.view">
      <div className="w-full h-full flex flex-col bg-white overflow-hidden">
        <PageHeader
          title="Inventory"
          subtitle="Manage products"
          onBack={goBack}
          right={<SessionStatus />}
        />

        <main className="flex-1 p-2 bg-slate-50 overflow-hidden">
          <div className="h-full flex gap-2">

            {/* ── Left: product list ── */}
            <div className="h-full flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm min-h-0 flex-[2] min-w-96">

              {/* List header */}
              <div className="p-2 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100">
                      <Package className="w-3.5 h-3.5 text-emerald-600" />
                    </span>
                    <span className="text-sm font-semibold text-slate-700">Products</span>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">
                    {loading ? 'Loading…' : `${filteredProducts.length} shown`}
                  </span>
                </div>
                <div className="flex gap-1">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                    <HybridInput
                      placeholder="Search products…"
                      className="w-full h-8 pl-6 pr-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      value={form.search}
                      onChange={(value) => setForm({...form, search: value})}
                      onTouchKeyboard={() => openKb('search', 'qwerty', 'Search Products')}
                    />
                  </div>
                  {/* Category filter */}
                  <div className="relative">
                    <select
                      className="h-8 pl-2 pr-6 text-xs border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={selectedCategoryFilter}
                      onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    >
                      <option value="">All</option>
                      {availableCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <Tag className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Product grid */}
              <div className="flex-1 overflow-y-auto p-1.5 min-h-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-1.5" style={{gridAutoRows: 'max-content'}}>
                  {loading ? (
                    <div className="col-span-full flex flex-col items-center py-10 gap-2 text-slate-400">
                      <Package className="w-8 h-8 opacity-30" />
                      <span className="text-sm">Loading products…</span>
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center py-10 gap-2 text-slate-400">
                      <Package className="w-8 h-8 opacity-30" />
                      <span className="text-sm">{form.search ? 'No products match your search.' : 'No products available.'}</span>
                    </div>
                  ) : (
                    filteredProducts.map((product) => {
                      const ss = stockStatus(product)
                      const isSelected = selectedProduct === product.id
                      return (
                        <div
                          key={product.id}
                          className={`rounded-lg bg-white transition text-left overflow-hidden border relative group cursor-pointer h-32 sm:h-36 lg:h-32 xl:h-36 flex flex-col ${
                            isSelected
                              ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-sm'
                              : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                          }`}
                          onClick={() => viewProduct(product)}
                        >
                          {/* Edit button on hover */}
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); selectProduct(product) }}
                              className="inline-flex items-center gap-0.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded shadow"
                            >
                              <Edit2 className="w-2.5 h-2.5" />Edit
                            </button>
                          </div>

                          {/* Image area */}
                          <div className="w-full flex-1 bg-slate-50 flex items-center justify-center overflow-hidden">
                            {product.imageUrl && product.imageUrl.trim() !== '' ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="max-w-full max-h-full object-contain"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                  const sib = e.currentTarget.nextElementSibling as HTMLElement | null
                                  if (sib) sib.style.display = 'flex'
                                }}
                              />
                            ) : null}
                            <div
                              className="w-full h-full items-center justify-center"
                              style={{ display: product.imageUrl && product.imageUrl.trim() !== '' ? 'none' : 'flex' }}
                            >
                              <Package className="w-8 h-8 text-slate-200" />
                            </div>
                          </div>

                          {/* Info footer */}
                          <div className="p-1.5 border-t border-slate-100 flex flex-col gap-0.5">
                            <p className="text-[10px] font-semibold text-slate-800 line-clamp-1 leading-tight" title={product.name}>{product.name}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-700">{formatCurrency(product.price)}</span>
                              <span className={`text-[9px] font-semibold px-1 py-0.5 rounded ${ss.cls}`}>{ss.label}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* ── Right: product form ── */}
            <div className="overflow-hidden bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col flex-1 w-full lg:w-96">

              {/* Form header */}
              <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-emerald-100">
                  <Package className="w-4 h-4 text-emerald-600" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {isEditing ? `Edit: ${form.name || 'Product'}` : 'Add New Product'}
                  </p>
                  <p className="text-xs text-slate-400">{isEditing ? 'Update product details below' : 'Fill in details to add a product'}</p>
                </div>
              </div>

              {/* Scrollable fields */}
              <div className="p-2 flex-1 overflow-y-auto">
                <form className="grid grid-cols-1 md:grid-cols-2 gap-2">

                  {/* Barcode */}
                  <div className="col-span-full">
                    <FieldLabel>Barcode</FieldLabel>
                    <div className="flex gap-1">
                      <div className="relative flex-1">
                        <ScanBarcode className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                        <HybridInput
                          className="w-full h-8 pl-6 pr-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                          placeholder="Scan or type barcode"
                          value={form.barcode}
                          onChange={(value) => setForm({...form, barcode: value})}
                          onTouchKeyboard={() => openKb('barcode', 'qwerty', 'Barcode')}
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={() => searchByBarcode(form.barcode)}
                        disabled={!form.barcode.trim() || isSearching}
                        className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 gap-1"
                      >
                        {isSearching ? (
                          <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Finding…</>
                        ) : (
                          <><Search className="w-3 h-3" />Find</>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Name + Variant */}
                  <div>
                    <FieldLabel>Product Name</FieldLabel>
                    <HybridInput className={inputCls} placeholder="Product name" value={form.name}
                      onChange={(v) => setForm({...form, name: v})} onTouchKeyboard={() => openKb('name', 'qwerty', 'Product Name')} />
                  </div>
                  <div>
                    <FieldLabel>Variant / Size</FieldLabel>
                    <HybridInput className={inputCls} placeholder="e.g. 500ml, Large" value={form.variant}
                      onChange={(v) => setForm({...form, variant: v})} onTouchKeyboard={() => openKb('variant', 'qwerty', 'Variant / Size')} />
                  </div>

                  {/* Brand + Category */}
                  <div>
                    <FieldLabel>Brand</FieldLabel>
                    <HybridInput className={inputCls} placeholder="Brand" value={form.brand}
                      onChange={(v) => setForm({...form, brand: v})} onTouchKeyboard={() => openKb('brand', 'qwerty', 'Brand')} />
                  </div>
                  <div>
                    <FieldLabel>Category</FieldLabel>
                    {availableCategories.length > 0 ? (
                      <div className="relative">
                        <select
                          className={`${inputCls} appearance-none pr-6`}
                          value={form.category}
                          onChange={(e) => setForm({...form, category: e.target.value})}
                        >
                          <option value="">Select category…</option>
                          {availableCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                      </div>
                    ) : (
                      <HybridInput className={inputCls} placeholder="Category" value={form.category}
                        onChange={(v) => setForm({...form, category: v})} onTouchKeyboard={() => openKb('category', 'qwerty', 'Category')} />
                    )}
                  </div>

                  {/* Qty + Low Stock */}
                  <div>
                    <FieldLabel>Quantity</FieldLabel>
                    <HybridInput type="decimal" className={inputCls} placeholder="0" value={form.qty}
                      onChange={(v) => setForm({...form, qty: v})} onTouchKeyboard={() => openKb('qty', 'decimal', 'Quantity')} />
                  </div>
                  <div>
                    <FieldLabel>Low Stock Alert</FieldLabel>
                    <HybridInput type="decimal" className={inputCls} placeholder="5" value={form.low}
                      onChange={(v) => setForm({...form, low: v})} onTouchKeyboard={() => openKb('low', 'decimal', 'Low Stock Alert')} />
                  </div>

                  {/* Cost + Price */}
                  <div>
                    <FieldLabel>Cost Price</FieldLabel>
                    <HybridInput type="decimal" className={inputCls} placeholder="0.00" value={form.cost}
                      onChange={(v) => setForm({...form, cost: v})} onTouchKeyboard={() => openKb('cost', 'decimal', 'Cost Price')} />
                  </div>
                  <div>
                    <FieldLabel>Selling Price</FieldLabel>
                    <HybridInput type="decimal" className={inputCls} placeholder="0.00" value={form.price}
                      onChange={(v) => setForm({...form, price: v})} onTouchKeyboard={() => openKb('price', 'decimal', 'Selling Price')} />
                  </div>

                  {/* UPC image preview */}
                  {upcImageUrl && (
                    <div className="col-span-full">
                      <FieldLabel>Product Image Preview</FieldLabel>
                      <div className="w-full h-20 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                        <img
                          src={upcImageUrl}
                          alt="Product preview"
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            const placeholder = `https://via.placeholder.com/200x200/f1f5f9/64748b?text=${encodeURIComponent(form.name || 'Product')}`
                            e.currentTarget.src = placeholder
                            setUpcImageUrl(placeholder)
                          }}
                        />
                      </div>
                    </div>
                  )}
                </form>
              </div>

              {/* Fixed action bar */}
              <div className="px-2 py-2 border-t border-slate-100 bg-white flex gap-1.5 flex-shrink-0">
                <Button size="sm" onClick={handleAdd} disabled={isEditing}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs">
                  <Plus className="w-3.5 h-3.5" />Add
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!isEditing || selectedProduct === null}
                  className="bg-[hsl(215,65%,30%)] hover:bg-[hsl(215,65%,24%)] text-white gap-1 text-xs">
                  <Save className="w-3.5 h-3.5" />{isEditing ? 'Save Changes' : 'Save'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDelete} disabled={selectedProduct === null}
                  className="border-red-300 text-red-600 hover:bg-red-50 gap-1 text-xs">
                  <Trash2 className="w-3.5 h-3.5" />Delete
                </Button>
                <Button variant="outline" size="sm" onClick={clearForm}
                  className="border-slate-300 text-slate-600 hover:bg-slate-50 gap-1 text-xs">
                  <X className="w-3.5 h-3.5" />Clear
                </Button>
              </div>
            </div>

            <ModalKeyboard open={kbOpen} type={kbType} title={kbTitle} initialValue={form[kbTarget] || ''} onSubmit={applyKb} onClose={() => setKbOpen(false)} />
          </div>
        </main>

        {/* Product Detail Modal */}
        {viewingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={closeProductModal} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-auto">

              {/* Modal header */}
              <div className="bg-[hsl(215,65%,30%)] px-4 py-3 flex items-center justify-between rounded-t-xl">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/20">
                    <Package className="w-4 h-4 text-white" />
                  </span>
                  <span className="text-white font-semibold text-sm">Product Details</span>
                </div>
                <button onClick={closeProductModal} className="text-white/70 hover:text-white transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4">
                {/* Image */}
                <div className="w-full h-44 bg-slate-50 border border-slate-100 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                  {viewingProduct.imageUrl && viewingProduct.imageUrl.trim() !== '' ? (
                    <img src={viewingProduct.imageUrl} alt={viewingProduct.name} className="max-w-full max-h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-300">
                      <Package className="w-10 h-10" />
                      <span className="text-xs">No Image</span>
                    </div>
                  )}
                </div>

                {/* Name + description */}
                <div className="mb-3">
                  <h3 className="font-semibold text-slate-900">{viewingProduct.name}</h3>
                  {viewingProduct.description && <p className="text-xs text-slate-500 mt-0.5">{viewingProduct.description}</p>}
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Barcode',        value: <span className="font-mono text-xs">{viewingProduct.barcode}</span> },
                    { label: 'Brand',           value: viewingProduct.brand || 'N/A' },
                    { label: 'Category',        value: viewingProduct.category || 'N/A' },
                    { label: 'Variant',         value: viewingProduct.variant || 'N/A' },
                    { label: 'Selling Price',   value: <span className="font-semibold text-emerald-700">{formatCurrency(viewingProduct.price)}</span> },
                    { label: 'Cost Price',      value: formatCurrency(viewingProduct.cost) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
                      <div className="text-xs text-slate-800">{value}</div>
                    </div>
                  ))}
                </div>

                {/* Stock status */}
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mb-4 ${
                  viewingProduct.stockQuantity === 0 ? 'bg-red-50 border border-red-100' :
                  viewingProduct.stockQuantity <= viewingProduct.minStockLevel ? 'bg-amber-50 border border-amber-100' :
                  'bg-emerald-50 border border-emerald-100'
                }`}>
                  {viewingProduct.stockQuantity === 0 || viewingProduct.stockQuantity <= viewingProduct.minStockLevel
                    ? <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${viewingProduct.stockQuantity === 0 ? 'text-red-500' : 'text-amber-500'}`} />
                    : <Package className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  }
                  <div>
                    <p className="text-xs font-semibold text-slate-700">
                      {viewingProduct.stockQuantity} {viewingProduct.unit} in stock
                    </p>
                    <p className="text-[10px] text-slate-500">Low stock alert at {viewingProduct.minStockLevel} {viewingProduct.unit}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <Button
                    onClick={() => { selectProduct(viewingProduct); closeProductModal() }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-sm"
                  >
                    <Edit2 className="w-4 h-4" />Edit Product
                  </Button>
                  <Button variant="outline" onClick={closeProductModal}
                    className="flex-1 border-slate-300 text-slate-600 hover:bg-slate-50 text-sm">
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Product Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">Delete Product</h2>
                    <p className="text-xs text-slate-500">This action cannot be undone</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-slate-600">Are you sure you want to delete this product? It will be marked as inactive and hidden from the POS.</p>
              </div>
              <div className="flex gap-3 px-6 pb-5">
                <Button
                  variant="outline"
                  className="flex-1 border-slate-300 text-slate-600"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleConfirmDelete}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />Delete Product
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SessionGuard>
  )
}

export default Inventory