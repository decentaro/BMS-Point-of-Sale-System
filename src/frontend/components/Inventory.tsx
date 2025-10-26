import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import { Card, CardContent } from './ui/card'
import { formatCurrency } from '../utils/formatCurrency'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import { SystemSettings } from '../types/SystemSettings'
import ApiClient from '../utils/ApiClient'

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
  const [systemSettings, setSystemSettings] = React.useState<SystemSettings | null>(null)
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
      alert(`Failed to load products!\n${err instanceof Error ? err.message : 'Unknown error'}\n\nPlease check your connection and try again.`)
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
      alert(`Failed to search by barcode!\n${err instanceof Error ? err.message : 'Unknown error'}\n\nPlease try again.`)
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
        alert(`Product not found!\n\nBarcode "${barcode}" not found in UPC database.\n\nPlease check the barcode or add the product manually.`)
      }
    } catch (err) {
      alert(`Failed to search UPC database!\n${err instanceof Error ? err.message : 'Unknown error'}\n\nPlease check your internet connection and try again.`)
      console.error('Error searching UPC database:', err)
    }
  }

  // Get user context for API headers
  const getUserHeaders = () => {
    const currentUser = sessionStorage.getItem('currentUser')
    if (currentUser) {
      const user = JSON.parse(currentUser)
      return {
        'X-User-Id': user.id?.toString() || '0',
        'X-User-Name': user.name || user.employeeId || 'Unknown'
      }
    }
    return {
      'X-User-Id': '0',
      'X-User-Name': 'Unknown'
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
      alert('Product added successfully!\n\nThe new product has been added to your inventory.')
    } catch (err) {
      alert(`Failed to add product!\n${err instanceof Error ? err.message : 'Unknown error'}\n\nPlease check all fields and try again.`)
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
        alert(`Failed to save product!\n${err instanceof Error ? err.message : 'Unknown error'}\n\nPlease check all fields and try again.`)
        console.error('Error saving product:', err)
      }
    }
  }

  const handleDelete = async () => {
    if (selectedProduct !== null && window.confirm('Are you sure you want to delete this product?')) {
      try {
        await ApiClient.delete(`/products/${selectedProduct}`)
        
        await loadProducts() // Reload products
        clearForm()
        setSelectedProduct(null)
        setIsEditing(false)
        } catch (err) {
        alert(`Failed to delete product!\n${err instanceof Error ? err.message : 'Unknown error'}\n\nPlease try again.`)
        console.error('Error deleting product:', err)
      }
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

  return (
    <SessionGuard requiredPermission="inventory.view">
      <div className="w-screen h-screen flex flex-col bg-white overflow-hidden">
      {/* Top */}
      <header className="h-14 px-4 border-b flex items-center justify-between flex-shrink-0">
        <Button variant="outline" size="sm" onClick={goBack}>← Back</Button>
        <div className="text-center">
          <h1 className="text-xl font-semibold text-emerald-600">Inventory</h1>
          <p className="text-[10px] text-muted-foreground">Manage products</p>
        </div>
        <SessionStatus />
      </header>

      {/* Body: split panel like Employees */}
      <main className="flex-1 p-2 bg-slate-50 overflow-hidden">
        <div className="h-full flex gap-2">
          {/* Left: product list & filters inside white container */}
          <div className="h-full flex flex-col bg-white rounded-lg shadow-sm min-h-0 flex-[2] min-w-96">
            <div className="sticky top-0 z-10 p-1 bg-white">
              <div className="grid grid-cols-[1fr_auto] gap-1 mb-1">
                <HybridInput 
                  placeholder="Search products..." 
                  className="w-full h-8 px-2 text-sm border rounded" 
                  value={form.search} 
                  onChange={(value) => setForm({...form, search: value})}
                  onTouchKeyboard={() => openKb('search', 'qwerty', 'Search Products')} 
                />
                <select 
                  className="h-8 px-2 text-xs border rounded"
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                >
                  <option value="">All categories</option>
                  {availableCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="text-[10px] text-slate-500 px-1">
                {loading ? 'Loading...' : `${filteredProducts.length} products`}
              </div>
            </div>
            {/* Full-height scrollable grid of product cards (2 columns) */}
            <div className="flex-1 overflow-y-auto p-1 min-h-0">
              <div className="grid grid-cols-5 gap-1" style={{gridAutoRows: 'max-content'}}>
                {loading ? (
                  <div className="col-span-5 text-center py-8 text-sm text-slate-500">Loading products...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="col-span-5 text-center py-8 text-sm text-slate-500">
                    {form.search ? 'No products found matching your search.' : 'No products available.'}
                  </div>
                ) : (
                  filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className={`rounded-md bg-white hover:shadow-sm transition text-left overflow-hidden border relative group ${
                        selectedProduct === product.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'
                      }`}
                      style={{height: '110px', cursor: 'pointer'}} // Fixed height for consistent grid
                      onClick={() => viewProduct(product)}
                    >
                      {/* Action buttons (appear on hover) */}
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            selectProduct(product)
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-2 py-1 rounded shadow"
                        >
                          Edit
                        </button>
                      </div>
                      
                      {/* Image placeholder */}
                      <div className="w-full bg-slate-100 flex items-center justify-center overflow-hidden" style={{height: '60px'}}>
                        {product.imageUrl && product.imageUrl.trim() !== '' ? (
                          <img 
                            src={product.imageUrl} 
                            alt={product.name} 
                            className="max-w-full max-h-full object-contain" 
                            onLoad={() => console.log(`Image loaded for ${product.name}:`, product.imageUrl)}
                            onError={(e) => {
                              console.log(`Image failed to load for ${product.name}:`, product.imageUrl)
                              e.currentTarget.style.display = 'none'
                              e.currentTarget.nextElementSibling!.style.display = 'flex'
                            }}
                          />
                        ) : (console.log(`No image URL for ${product.name}:`, product.imageUrl), null)}
                        <div className="text-[10px] text-slate-400 text-center" style={{display: product.imageUrl && product.imageUrl.trim() !== '' ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%'}}>
                          Image
                        </div>
                      </div>
                      <div className="p-1" style={{height: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
                        <div className="text-xs font-medium text-slate-900 truncate" title={product.name}>{product.name}</div>
                        <div className="text-[10px] text-slate-600">{formatCurrency(product.price)}</div>
                        <div className={`text-[10px] ${product.stockQuantity === 0 ? 'text-red-600 font-semibold' : product.stockQuantity <= product.minStockLevel ? 'text-orange-600 font-semibold' : 'text-slate-600'}`}>
                          {product.stockQuantity === 0 ? 'Out of Stock' : product.stockQuantity <= product.minStockLevel ? 'Low Stock' : `Qty: ${product.stockQuantity}`}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right: product form inside white container */}
          <div className="overflow-hidden bg-white rounded-lg shadow-sm flex flex-col flex-1 min-w-80 max-w-md">
            {/* Scrollable fields */}
            <div className="p-2 flex-1 overflow-y-auto" style={{maxHeight: 'calc(100% - 60px)'}}>
              <form className="grid grid-cols-2 gap-2 text-xs">
                {/* Barcode first (full width) */}
                <div className="col-span-2">
                  <label className="text-[10px] font-semibold">Barcode</label>
                  <div className="flex gap-1">
                    <HybridInput 
                      className="flex-1 h-8 px-2 text-xs border rounded" 
                      placeholder="Scan or type barcode" 
                      value={form.barcode} 
                      onChange={(value) => setForm({...form, barcode: value})}
                      onTouchKeyboard={() => openKb('barcode', 'qwerty', 'Barcode')} 
                    />
                    <Button 
                      size="sm" 
                      onClick={() => searchByBarcode(form.barcode)}
                      disabled={!form.barcode.trim() || isSearching}
                      className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                    >
                      {isSearching ? (
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Finding...</span>
                        </div>
                      ) : (
                        'Find'
                      )}
                    </Button>
                  </div>
                </div>

                {/* Product Name | Variant / Size (side by side) */}
                <div>
                  <label className="text-[10px] font-semibold">Product Name</label>
                  <HybridInput 
                    className="w-full h-8 px-2 text-xs border rounded" 
                    placeholder="Product name" 
                    value={form.name} 
                    onChange={(value) => setForm({...form, name: value})}
                    onTouchKeyboard={() => openKb('name', 'qwerty', 'Product Name')} 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold">Variant / Size</label>
                  <HybridInput 
                    className="w-full h-8 px-2 text-xs border rounded" 
                    placeholder="e.g. 500ml, Large, 16GB" 
                    value={form.variant} 
                    onChange={(value) => setForm({...form, variant: value})}
                    onTouchKeyboard={() => openKb('variant', 'qwerty', 'Variant / Size')} 
                  />
                </div>

                {/* Brand and Category */}
                <div>
                  <label className="text-[10px] font-semibold">Brand</label>
                  <HybridInput 
                    className="w-full h-8 px-2 text-xs border rounded" 
                    placeholder="Brand" 
                    value={form.brand} 
                    onChange={(value) => setForm({...form, brand: value})}
                    onTouchKeyboard={() => openKb('brand', 'qwerty', 'Brand')} 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold">Category</label>
                  {availableCategories.length > 0 ? (
                    <select 
                      className="w-full h-8 px-2 text-xs border rounded"
                      value={form.category}
                      onChange={(e) => setForm({...form, category: e.target.value})}
                    >
                      <option value="">Select category...</option>
                      {availableCategories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  ) : (
                    <HybridInput 
                      className="w-full h-8 px-2 text-xs border rounded" 
                      placeholder="Category (set up categories in System Settings)" 
                      value={form.category} 
                      onChange={(value) => setForm({...form, category: value})}
                      onTouchKeyboard={() => openKb('category', 'qwerty', 'Category')} 
                    />
                  )}
                </div>

                {/* Quantity and Low Stock Alert */}
                <div>
                  <label className="text-[10px] font-semibold">Quantity</label>
                  <HybridInput 
                    type="decimal"
                    className="w-full h-8 px-2 text-xs border rounded" 
                    placeholder="0" 
                    value={form.qty} 
                    onChange={(value) => setForm({...form, qty: value})}
                    onTouchKeyboard={() => openKb('qty', 'decimal', 'Quantity')} 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold">Low Stock Alert</label>
                  <HybridInput 
                    type="decimal"
                    className="w-full h-8 px-2 text-xs border rounded" 
                    placeholder="5" 
                    value={form.low} 
                    onChange={(value) => setForm({...form, low: value})}
                    onTouchKeyboard={() => openKb('low', 'decimal', 'Low Stock Alert')} 
                  />
                </div>

                {/* Cost Price and Selling Price */}
                <div>
                  <label className="text-[10px] font-semibold">Cost Price</label>
                  <HybridInput 
                    type="decimal"
                    className="w-full h-8 px-2 text-xs border rounded" 
                    placeholder="0.00" 
                    value={form.cost} 
                    onChange={(value) => setForm({...form, cost: value})}
                    onTouchKeyboard={() => openKb('cost', 'decimal', 'Cost Price')} 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold">Selling Price</label>
                  <HybridInput 
                    type="decimal"
                    className="w-full h-8 px-2 text-xs border rounded" 
                    placeholder="0.00" 
                    value={form.price} 
                    onChange={(value) => setForm({...form, price: value})}
                    onTouchKeyboard={() => openKb('price', 'decimal', 'Selling Price')} 
                  />
                </div>

                {/* UPC Image Preview */}
                {upcImageUrl && (
                  <div className="col-span-2">
                    <label className="text-[10px] font-semibold">Product Image Preview</label>
                    <div className="w-full h-20 bg-slate-100 border rounded flex items-center justify-center overflow-hidden">
                      <img 
                        src={upcImageUrl} 
                        alt="Product preview" 
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => {
                          console.log('UPC image failed to load:', upcImageUrl)
                          // Try to use a placeholder or default image
                          const placeholder = `https://via.placeholder.com/200x200/f1f5f9/64748b?text=${encodeURIComponent(form.name || 'Product')}`
                          console.log('Trying placeholder:', placeholder)
                          e.currentTarget.src = placeholder
                          setUpcImageUrl(placeholder)
                        }}
                        onLoad={() => console.log('UPC image loaded successfully:', upcImageUrl)}
                      />
                      <div className="text-[10px] text-slate-400" style={{display: 'none'}}>
                        Image failed to load
                      </div>
                    </div>
                  </div>
                )}

              </form>
            </div>
            {/* Fixed action bar */}
            <div className="p-2 border-t bg-white flex gap-2 justify-end flex-shrink-0" style={{height: '60px', alignItems: 'center'}}>
              <Button variant="outline" onClick={handleAdd} disabled={isEditing} size="sm" className="border-green-500 text-green-700 hover:bg-green-50">Add</Button>
              <Button onClick={handleSave} disabled={!isEditing || selectedProduct === null} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                {isEditing ? 'Save Changes' : 'Save'}
              </Button>
              <Button variant="outline" onClick={handleDelete} disabled={selectedProduct === null} size="sm" className="border-red-500 text-red-700 hover:bg-red-50">Delete</Button>
              <Button variant="outline" onClick={clearForm} size="sm" className="border-gray-500 text-gray-700 hover:bg-gray-50">Clear</Button>
            </div>
          </div>
          <ModalKeyboard open={kbOpen} type={kbType} title={kbTitle} initialValue={form[kbTarget] || ''} onSubmit={applyKb} onClose={() => setKbOpen(false)} />
        </div>
      </main>

      
      {/* Product Detail Modal */}
      {viewingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeProductModal} />
          <div className="relative bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-auto">
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Product Details</h2>
                <button
                  onClick={closeProductModal}
                  className="text-slate-400 hover:text-slate-600 text-xl font-bold"
                >
                  ×
                </button>
              </div>
              
              {/* Product Image */}
              <div className="w-full h-48 bg-slate-100 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                {viewingProduct.imageUrl && viewingProduct.imageUrl.trim() !== '' ? (
                  <img 
                    src={viewingProduct.imageUrl} 
                    alt={viewingProduct.name} 
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-slate-400 text-sm">No Image Available</div>
                )}
              </div>
              
              {/* Product Information */}
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1">{viewingProduct.name}</h3>
                  <p className="text-sm text-slate-600">{viewingProduct.description || 'No description available'}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-slate-700">Barcode:</span>
                    <div className="text-slate-600">{viewingProduct.barcode}</div>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Brand:</span>
                    <div className="text-slate-600">{viewingProduct.brand || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Category:</span>
                    <div className="text-slate-600">{viewingProduct.category || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Variant:</span>
                    <div className="text-slate-600">{viewingProduct.variant || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Price:</span>
                    <div className="text-slate-600 font-semibold">{formatCurrency(viewingProduct.price)}</div>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Cost:</span>
                    <div className="text-slate-600">{formatCurrency(viewingProduct.cost)}</div>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Stock:</span>
                    <div className={`font-medium ${viewingProduct.stockQuantity <= viewingProduct.minStockLevel ? 'text-red-600' : 'text-green-600'}`}>
                      {viewingProduct.stockQuantity} {viewingProduct.unit}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Low Stock Alert:</span>
                    <div className="text-slate-600">{viewingProduct.minStockLevel} {viewingProduct.unit}</div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-2 pt-4 border-t">
                  <Button 
                    onClick={() => {
                      selectProduct(viewingProduct)
                      closeProductModal()
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Edit Product
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={closeProductModal}
                    className="flex-1"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      </div>
    </SessionGuard>
  )
}

export default Inventory