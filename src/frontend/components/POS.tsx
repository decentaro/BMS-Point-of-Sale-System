import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import { formatCurrency } from '../utils/formatCurrency'
import ReceiptPreview from './ReceiptPreview'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import HybridInput from './HybridInput'
import { SystemSettings } from '../types/SystemSettings'
import ApiClient from '../utils/ApiClient'
import { generateTextReceipt } from '../utils/receiptFormatter'

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

// Cart item interface
interface CartItem {
  product: Product
  quantity: number
  total: number
}


const POS: React.FC = () => {
  const navigate = useNavigate()


  // State management
  const [products, setProducts] = React.useState<Product[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [searchQuery, setSearchQuery] = React.useState<string>('')
  
  // Alert debounce to prevent multiple alerts
  const alertTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  
  // Tax settings from API
  const [taxSettings, setTaxSettings] = React.useState<any>(null)
  const [discountPercent, setDiscountPercent] = React.useState<number>(0)
  const [discountReason, setDiscountReason] = React.useState<string>('')
  const [isExempt, setIsExempt] = React.useState<boolean>(false)
  
  // Payment state
  const [showPaymentModal, setShowPaymentModal] = React.useState<boolean>(false)
  const [amountPaid, setAmountPaid] = React.useState<string>('')
  const [paymentMethod, setPaymentMethod] = React.useState<string>('Cash')
  const [isProcessingPayment, setIsProcessingPayment] = React.useState<boolean>(false)
  
  // Receipt preview state
  const [showReceiptPreview, setShowReceiptPreview] = React.useState<boolean>(false)
  const [completedSale, setCompletedSale] = React.useState<any>(null)
  const [systemSettings, setSystemSettings] = React.useState<SystemSettings | null>(null)

  // Modal keyboard state
  const [kbOpen, setKbOpen] = React.useState<boolean>(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('qwerty')
  const [kbTitle, setKbTitle] = React.useState<string>('')
  const [kbTarget, setKbTarget] = React.useState<'search' | 'discount' | 'discountReason' | 'amountPaid' | 'managerPin' | 'cartQuantity'>('search')
  const [editingCartItemId, setEditingCartItemId] = React.useState<number | null>(null)
  
  // Barcode scanner state
  const [scanBuffer, setScanBuffer] = React.useState<string>('')
  const [scanTimeout, setScanTimeout] = React.useState<NodeJS.Timeout | null>(null)
  
  // Manager approval state
  const [pendingDiscountPercent, setPendingDiscountPercent] = React.useState<number>(0)
  const [showManagerPinPrompt, setShowManagerPinPrompt] = React.useState<boolean>(false)

  // Load products from API
  const loadProducts = async () => {
    try {
      setLoading(true)
      const data = await ApiClient.getJson('/products')
      setProducts(data.filter((p: Product) => p.isActive))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load products'
      alert(`Failed to load products!\n\n${errorMessage}\n\nPlease check your connection and try again.`)
      console.error('Error loading products:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load tax settings from API
  const loadTaxSettings = async () => {
    try {
      const data = await ApiClient.getJson('/tax-settings')
      setTaxSettings(data)
    } catch (error) {
      // Tax settings might not exist - use defaults
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

  // Load system settings
  const loadSystemSettings = async () => {
    try {
      const settings = await ApiClient.getJson('/system-settings')
      setSystemSettings(settings)
    } catch (err) {
      console.error('Error loading system settings:', err)
    }
  }

  // Validate manager PIN for discount approval
  const validateManagerPin = async (pin: string) => {
    console.log('Validating manager PIN:', pin)
    try {
      // Find a manager in the system to validate PIN against
      const response = await (window as any).electronAPI.validateManagerPin(pin)
      console.log('Manager PIN validation response:', response)
      
      if (response.success) {
        // PIN is valid, apply the pending discount
        setDiscountPercent(pendingDiscountPercent)
        setShowManagerPinPrompt(false)
        setPendingDiscountPercent(0)
        setKbOpen(false)
        
        // Ask for reason after successful manager approval
        setTimeout(() => {
          openKb('discountReason', 'qwerty', 'Discount Reason (Optional)')
        }, 500)
      } else {
        alert('Invalid manager PIN. Discount not applied.')
        setShowManagerPinPrompt(false)
        setPendingDiscountPercent(0)
        setKbOpen(false)
      }
    } catch (error) {
      console.error('Error validating manager PIN:', error)
      alert('Error validating manager PIN. Please try again.')
      setShowManagerPinPrompt(false)
      setPendingDiscountPercent(0)
      setKbOpen(false)
    }
  }

  // Load data on component mount
  React.useEffect(() => {
    loadProducts()
    loadTaxSettings()
    loadSystemSettings()
  }, [])

  // Update default payment method when system settings load
  React.useEffect(() => {
    if (systemSettings?.defaultPaymentMethod) {
      setPaymentMethod(systemSettings.defaultPaymentMethod)
    }
  }, [systemSettings])

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
            searchByBarcode(cleanBarcode)
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

  // Cleanup alert timeout on component unmount
  React.useEffect(() => {
    return () => {
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current)
      }
    }
  }, [])

  // Keyboard handling
  const openKb = (target: 'search' | 'discount' | 'discountReason' | 'amountPaid' | 'managerPin' | 'cartQuantity', type: KeyboardType, title: string, cartItemId?: number) => {
    if (target === 'cartQuantity' && cartItemId) {
      setEditingCartItemId(cartItemId)
    }
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
    setKbOpen(true)
  }

  const applyKb = (val: string) => {
    if (kbTarget === 'search') {
      setSearchQuery(val)
    } else if (kbTarget === 'discount') {
      const percent = parseFloat(val)
      if (!isNaN(percent) && percent >= 0 && percent <= 100) {
        // Check if manager approval is required and user is not a manager
        const session = SessionManager.getCurrentSession()
        if (session) {
          if (systemSettings?.requireManagerApprovalForDiscount && session.role !== 'Manager') {
            // Store pending discount and ask for manager PIN
            setPendingDiscountPercent(percent)
            setShowManagerPinPrompt(true)
            openKb('managerPin', 'decimal', 'Enter Manager PIN for Discount Approval')
            return
          }
        }
        
        setDiscountPercent(percent)
        // After setting discount percent, ask for reason
        setTimeout(() => {
          openKb('discountReason', 'qwerty', 'Discount Reason (Optional)')
        }, 100)
      }
    } else if (kbTarget === 'discountReason') {
      setDiscountReason(val)
    } else if (kbTarget === 'amountPaid') {
      setAmountPaid(val)
    } else if (kbTarget === 'managerPin') {
      // Validate manager PIN
      validateManagerPin(val)
    } else if (kbTarget === 'cartQuantity') {
      // Update cart item quantity
      const quantity = parseFloat(val) || 0
      if (editingCartItemId && quantity > 0) {
        updateCartItemQuantity(editingCartItemId, quantity)
      }
      setEditingCartItemId(null)
    }
    setKbOpen(false)
  }

  // Search by barcode and add to cart
  const searchByBarcode = async (barcode: string) => {
    if (!barcode.trim()) return
    
    try {
      const product = await ApiClient.getJson(`/products/barcode/${encodeURIComponent(barcode)}`)
      addToCart(product)
      console.log(`Product added: ${product.name}`)
    } catch (err) {
      console.error('Error searching by barcode:', err)
      alert(`Product with barcode "${barcode}" not found`)
    }
  }

  // Debounced alert function to prevent multiple alerts
  const showDebouncedAlert = (message: string) => {
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current)
    }
    alertTimeoutRef.current = setTimeout(() => {
      alert(message)
      alertTimeoutRef.current = null
    }, 100)
  }

  // Cart management
  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id)
    
    // Check stock limits before updating cart
    if (existingItem) {
      if (existingItem.quantity >= product.stockQuantity) {
        showDebouncedAlert(`Cannot add more ${product.name}. Only ${product.stockQuantity} available in stock.`)
        return
      }
    } else {
      if (product.stockQuantity <= 0) {
        showDebouncedAlert(`${product.name} is out of stock.`)
        return
      }
    }

    // Update cart if validation passes
    setCart(currentCart => {
      const existingItem = currentCart.find(item => item.product.id === product.id)
      if (existingItem) {
        return currentCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * product.price }
            : item
        )
      } else {
        return [...currentCart, { product, quantity: 1, total: product.price }]
      }
    })
  }

  const updateCartItemQuantity = (productId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId)
      return
    }
    
    // Find the product to check stock limits
    const product = products.find(p => p.id === productId)
    if (product && newQuantity > product.stockQuantity) {
      showDebouncedAlert(`Cannot set quantity to ${newQuantity}. Only ${product.stockQuantity} available in stock for ${product.name}.`)
      return
    }
    
    setCart(currentCart =>
      currentCart.map(item =>
        item.product.id === productId
          ? { ...item, quantity: newQuantity, total: newQuantity * item.product.price }
          : item
      )
    )
  }

  const removeFromCart = (productId: number) => {
    setCart(currentCart => currentCart.filter(item => item.product.id !== productId))
  }

  const clearCart = () => {
    setCart([])
    setDiscountPercent(0)
    setDiscountReason('')
    setAmountPaid('')
  }

  // Process payment
  const processPayment = async () => {
    if (cart.length === 0) {
      alert('Cart is empty')
      return
    }
    
    if (parseFloat(amountPaid) < finalTotal) {
      alert('Insufficient payment amount')
      return
    }

    setIsProcessingPayment(true)
    try {
      const session = SessionManager.getCurrentSession()
      if (!session) {
        alert('No user logged in')
        return
      }
      
      const saleData = {
        employeeId: session.id,
        subtotal: subtotal,
        taxRate: taxSettings?.taxRate || 0,
        taxAmount: taxAmount + secondaryTaxAmount,
        discountAmount: discountAmount,
        discountReason: discountReason,
        total: finalTotal,
        amountPaid: parseFloat(amountPaid),
        change: changeAmount,
        paymentMethod: paymentMethod,
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.product.price,
          lineTotal: item.total
        }))
      }

      const sale = await ApiClient.postJson('/sales', saleData)
      
      // Extend session for this business action (completing sale)
      SessionManager.extendForBusinessAction('Sale completed')
      
      // Check if receipt preview is enabled
      console.log('SystemSettings:', systemSettings)
      console.log('Show receipt preview?', systemSettings?.showReceiptPreview)
      
      if (systemSettings?.showReceiptPreview) {
        // Get current user for cashier name
        // session is already defined above
        
        // Prepare sale data for preview
        const previewSaleData = {
          subtotal: subtotal,
          taxAmount: taxAmount,
          secondaryTaxAmount: secondaryTaxAmount,
          taxLabel: taxLabel,
          secondaryTaxLabel: secondaryTaxLabel,
          discountAmount: discountAmount,
          discountPercent: discountPercent,
          discountReason: discountReason,
          finalTotal: finalTotal,
          amountPaid: parseFloat(amountPaid),
          changeAmount: changeAmount,
          paymentMethod: paymentMethod,
          cart: cart,
          transactionId: sale.transactionId,
          cashierName: session.name || session.employeeId || 'Unknown Cashier',
          saleDate: sale.saleDate
        }
        
        setCompletedSale(previewSaleData)
        setShowReceiptPreview(true)
        setShowPaymentModal(false)
      } else {
        // Original flow - direct success
        handlePaymentSuccess(sale.transactionId)
      }
      
      // Reload products to update inventory
      await loadProducts()
      
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to process payment')
      console.error('Payment error:', err)
    } finally {
      setIsProcessingPayment(false)
    }
  }

  // Handle payment success (common logic)
  const handlePaymentSuccess = (transactionId: string) => {
    alert(`Payment successful!\nTransaction ID: ${transactionId}\nChange: ${formatCurrency(changeAmount)}`)
    clearCart()
    setShowPaymentModal(false)
    setShowReceiptPreview(false)
    setCompletedSale(null)
  }

  // Receipt preview actions
  const handlePrintReceipt = async () => {
    try {
      if (!completedSale || !systemSettings) {
        alert('❌ Missing receipt data or system settings')
        return
      }

      // Generate plain text receipt respecting system settings
      const receiptText = generateTextReceipt(completedSale, systemSettings)

      const result = await window.electronAPI.printReceipt(receiptText, systemSettings?.businessLogoPath)
      
      if (result.success) {
        alert('✅ ' + result.message)
        handlePaymentSuccess(completedSale?.transactionId || 'Unknown')
      } else {
        alert('❌ ' + result.message)
      }
    } catch (error) {
      console.error('Error printing receipt:', error)
      alert('❌ Failed to print receipt')
    }
  }

  const handleSkipPrint = () => {
    handlePaymentSuccess(completedSale?.transactionId || 'Unknown')
  }

  const handleBackToPayment = () => {
    setShowReceiptPreview(false)
    setShowPaymentModal(true)
  }

  // Calculate totals using stored tax settings
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0)
  
  // Calculate tax based on stored settings
  let taxAmount = 0
  let secondaryTaxAmount = 0
  let taxLabel = ''
  let secondaryTaxLabel = ''
  
  if (taxSettings && taxSettings.enableTax && !isExempt) {
    // Primary tax
    taxAmount = (subtotal * taxSettings.taxRate) / 100
    taxLabel = `${taxSettings.taxName} (${taxSettings.taxRate}%)`
    
    // Secondary tax if enabled
    if (taxSettings.enableSecondaryTax) {
      secondaryTaxAmount = (subtotal * taxSettings.secondaryTaxRate) / 100
      secondaryTaxLabel = `${taxSettings.secondaryTaxName} (${taxSettings.secondaryTaxRate}%)`
    }
  } else if (isExempt && taxSettings?.enableTaxExemptions) {
    taxAmount = 0
    taxLabel = 'Tax Exempt'
  } else if (!taxSettings?.enableTax) {
    taxAmount = 0
    taxLabel = 'No Tax'
  }
  
  const totalBeforeDiscount = subtotal + taxAmount + secondaryTaxAmount
  const discountAmount = (totalBeforeDiscount * discountPercent) / 100
  const finalTotal = Math.max(0, totalBeforeDiscount - discountAmount)
  const changeAmount = Math.max(0, parseFloat(amountPaid || '0') - finalTotal)

  // Filter products based on search
  const filteredProducts = React.useMemo(() => {
    if (!searchQuery.trim()) return products
    const search = searchQuery.toLowerCase()
    return products.filter(p => 
      p.name.toLowerCase().includes(search) ||
      p.barcode.toLowerCase().includes(search) ||
      p.brand?.toLowerCase().includes(search) ||
      p.category?.toLowerCase().includes(search)
    )
  }, [products, searchQuery])

  const goBack = () => {
    // Check user role from session storage
    const session = SessionManager.getCurrentSession()
    if (session) {
      // Both managers and cashiers go to dashboard
      navigate('/manager')
    } else {
      navigate('/login')
    }
  }

  return (
    <SessionGuard>
      <div className="w-screen h-screen flex flex-col bg-white overflow-hidden">
      {/* Top */}
      <header className="h-14 px-4 border-b flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={goBack}>← Back</Button>
        <div className="text-center">
          <h1 className="text-base font-semibold text-emerald-600">Point of Sale</h1>
          <p className="text-[10px] text-muted-foreground">Sell items</p>
        </div>
        <SessionStatus />
      </header>

      {/* Body: left products, right cart/totals */}
      <main className="flex-1 p-2 bg-slate-50 overflow-hidden">
        <div className="h-full flex gap-2">
          {/* Left: product grid */}
          <div className="h-full flex flex-col bg-white rounded-lg shadow-sm min-w-96" style={{ flex: '460' }}>
            {/* Search and scanner */}
            <div className="p-2 bg-white border-b">
              <div className="mb-2">
                <HybridInput 
                  placeholder="Search products..." 
                  className="w-full h-8 px-2 text-sm border rounded" 
                  value={searchQuery} 
                  onChange={setSearchQuery}
                  onTouchKeyboard={() => openKb('search', 'qwerty', 'Search Products')}
                />
              </div>
              <div className="text-[10px] text-slate-500">
                {loading ? 'Loading...' : `${filteredProducts.length} products`}
              </div>
            </div>
            
            {/* Product cards grid */}
            <div className="flex-1 overflow-y-auto p-2">
              <div className="grid grid-cols-5 gap-2">
                {loading ? (
                  <div className="col-span-full text-center py-8 text-sm text-slate-500">Loading products...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="col-span-full text-center py-8 text-sm text-slate-500">
                    {searchQuery ? 'No products found matching your search.' : 'No products available.'}
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const cartItem = cart.find(item => item.product.id === product.id)
                    const quantityInCart = cartItem ? cartItem.quantity : 0
                    const isOutOfStock = product.stockQuantity === 0
                    const isLowStock = product.stockQuantity > 0 && product.stockQuantity <= product.minStockLevel
                    
                    return (
                      <div
                        key={product.id}
                        className={`rounded-md hover:shadow-sm transition text-left overflow-hidden border cursor-pointer relative ${
                          isOutOfStock 
                            ? 'bg-gray-100 border-gray-300 cursor-not-allowed' 
                            : isLowStock 
                              ? 'bg-orange-50 border-orange-200 hover:border-orange-400' 
                              : 'bg-white border-slate-200 hover:border-blue-300'
                        }`}
                        style={{height: '100px'}}
                        onClick={() => !isOutOfStock && addToCart(product)}
                      >
                        {/* Minus button - hide if out of stock */}
                        {quantityInCart > 0 && !isOutOfStock && (
                          <div 
                            className="absolute top-1 left-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center z-10 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation() // Prevent triggering the card's onClick
                              updateCartItemQuantity(product.id, quantityInCart - 1)
                            }}
                          >
                            −
                          </div>
                        )}
                        
                        {/* Quantity badge */}
                        {quantityInCart > 0 && (
                          <div className="absolute top-1 right-1 bg-blue-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center z-10">
                            {quantityInCart}
                          </div>
                        )}
                        
                        {/* Out of Stock Banner */}
                        {isOutOfStock && (
                          <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-center py-1 z-20 rounded-t-md">
                            <div className="text-[10px] font-bold">OUT OF STOCK</div>
                          </div>
                        )}
                        
                        {/* Low Stock Banner */}
                        {isLowStock && (
                          <div className="absolute top-0 left-0 right-0 bg-orange-500 text-white text-center py-1 z-20 rounded-t-md">
                            <div className="text-[10px] font-bold">LOW STOCK</div>
                          </div>
                        )}
                        
                        {/* Product image */}
                        <div className="w-full bg-slate-100 flex items-center justify-center overflow-hidden" style={{height: '60px'}}>
                          {product.imageUrl && product.imageUrl.trim() !== '' ? (
                            <img 
                              src={product.imageUrl} 
                              alt={product.name} 
                              className="max-w-full max-h-full object-contain" 
                            />
                          ) : (
                            <div className="text-[10px] text-slate-400 text-center">Image</div>
                          )}
                        </div>
                        
                        {/* Product info */}
                        <div className="p-1" style={{height: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'}}>
                          <div className="text-xs font-medium text-slate-900 truncate" title={product.name}>{product.name}</div>
                          <div className="text-[10px] text-blue-600 font-semibold">{formatCurrency(product.price)}</div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right: cart and payment */}
          <div className="h-full flex flex-col bg-white rounded-lg shadow-sm min-w-80 max-w-sm" style={{ flex: '310' }}>
            {/* Cart items */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-2 border-b bg-white flex-shrink-0">
                <h3 className="text-sm font-semibold">Cart ({cart.length} items)</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-1">
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-500">Cart is empty</div>
                ) : (
                  <div className="space-y-1">
                    {cart.map((item) => (
                      <div key={item.product.id} className="bg-slate-50 rounded p-2 text-xs">
                        {/* Product name (truncated) */}
                        <div className="font-medium truncate mb-1" title={item.product.name}>
                          {item.product.name}
                        </div>
                        
                        {/* Price, Quantity, Total, Remove - in a clear grid */}
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1 items-center text-xs">
                          <div className="text-slate-600">
                            {formatCurrency(item.product.price)} each
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-500">Qty:</span>
                            <input 
                              className="w-10 h-6 border rounded px-1 text-center text-xs font-semibold cursor-pointer" 
                              value={item.quantity}
                              readOnly
                              onClick={() => openKb('cartQuantity', 'decimal', 'Edit Quantity', item.product.id)}
                            />
                          </div>
                          <div className="font-bold text-blue-600">
                            {formatCurrency(item.total)}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 w-6 p-0 text-red-500 hover:bg-red-50" 
                            onClick={() => removeFromCart(item.product.id)}
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Totals and payment */}
            <div className="p-3 border-t bg-white">
              {/* Detailed totals */}
              <div className="space-y-2 text-sm mb-3">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {taxLabel && (
                  <div className="flex justify-between">
                    <span>{taxLabel}:</span>
                    <span>{formatCurrency(taxAmount)}</span>
                  </div>
                )}
                {secondaryTaxLabel && (
                  <div className="flex justify-between">
                    <span>{secondaryTaxLabel}:</span>
                    <span>{formatCurrency(secondaryTaxAmount)}</span>
                  </div>
                )}
                {discountPercent > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount ({discountPercent}%):</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span className="text-blue-600">{formatCurrency(finalTotal)}</span>
                </div>
              </div>

              {/* Manager controls - only show tax exempt if enabled */}
              {taxSettings?.enableTaxExemptions && (
                <div className="mb-3">
                  <Button 
                    variant={isExempt ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsExempt(!isExempt)}
                    className="text-xs w-full"
                  >
                    {isExempt ? 'Tax Exempt Sale' : 'Apply Tax'}
                  </Button>
                </div>
              )}
                
  
              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={clearCart} disabled={cart.length === 0}>Clear Cart</Button>
                <Button 
                  size="sm" 
                  disabled={cart.length === 0} 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => setShowPaymentModal(true)}
                >
                  Pay {formatCurrency(finalTotal)}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
      <ModalKeyboard 
        open={kbOpen} 
        type={kbType} 
        title={kbTitle} 
        initialValue={
          kbTarget === 'search' ? searchQuery :
          kbTarget === 'discount' ? discountPercent.toString() :
          kbTarget === 'discountReason' ? discountReason :
          kbTarget === 'amountPaid' ? amountPaid :
          kbTarget === 'managerPin' ? '' :
          kbTarget === 'cartQuantity' && editingCartItemId ? 
            cart.find(item => item.product.id === editingCartItemId)?.quantity.toString() || '' : ''
        }
        masked={kbTarget === 'managerPin'}
        onSubmit={applyKb} 
        onClose={() => {
          console.log('Closing keyboard modal')
          setKbOpen(false)
        }} 
      />

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPaymentModal(false)} />
          <div className="relative bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Payment</h2>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-xl font-bold"
                >
                  ×
                </button>
              </div>
              
              {/* Order Summary */}
              <div className="bg-slate-50 rounded p-3 mb-4">
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{taxLabel}:</span>
                    <span>{formatCurrency(taxAmount)}</span>
                  </div>
                  {discountPercent > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount ({discountPercent}%):</span>
                      <span>-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg border-t pt-1">
                    <span>Total:</span>
                    <span className="text-blue-600">{formatCurrency(finalTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Discount Section - Manager Only */}
              <div className="mb-4 border-t pt-3">
                <div className="mb-2">
                  <label className="text-sm font-medium">Discount (Manager)</label>
                </div>
                <div className="grid grid-cols-5 gap-1 mb-2">
                  {[10, 20, 30, 40, 50].map((percent) => {
                    const handleDiscountClick = () => {
                      // Check if manager approval is required and user is not a manager
                      const session = SessionManager.getCurrentSession()
                      if (session) {
                        if (systemSettings?.requireManagerApprovalForDiscount && session.role !== 'Manager') {
                          // Store pending discount and ask for manager PIN
                          setPendingDiscountPercent(percent)
                          setShowManagerPinPrompt(true)
                          openKb('managerPin', 'decimal', 'Enter Manager PIN for Discount Approval')
                          return
                        }
                      }
                      
                      setDiscountPercent(percent)
                      // Ask for reason after selecting discount
                      setTimeout(() => {
                        openKb('discountReason', 'qwerty', 'Discount Reason (Optional)')
                      }, 100)
                    }
                    
                    return (
                      <Button 
                        key={percent}
                        variant={discountPercent === percent ? "default" : "outline"}
                        size="sm"
                        onClick={handleDiscountClick}
                        className="text-xs h-8"
                      >
                        {percent}%
                      </Button>
                    )
                  })}
                </div>
                {discountPercent > 0 && (
                  <div className="bg-red-50 p-2 rounded text-sm">
                    <div className="flex justify-between">
                      <span>{discountPercent}% Discount:</span>
                      <span className="text-red-600">-{formatCurrency(discountAmount)}</span>
                    </div>
                    {discountReason && (
                      <div className="text-xs text-gray-600 mt-1">
                        Reason: {discountReason}
                      </div>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setDiscountPercent(0)
                        setDiscountReason('')
                      }}
                      className="text-xs mt-1 h-6 text-red-600"
                    >
                      Remove Discount
                    </Button>
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Payment Method</label>
                <select 
                  className="w-full p-2 border rounded" 
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {systemSettings?.availablePaymentMethods ? 
                    systemSettings.availablePaymentMethods.split(',').map((method: string) => {
                      const trimmedMethod = method.trim()
                      return trimmedMethod ? (
                        <option key={trimmedMethod} value={trimmedMethod}>{trimmedMethod}</option>
                      ) : null
                    }) : (
                      // Fallback options if settings not loaded
                      <>
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
                        <option value="ETF/Digital">ETF/Digital</option>
                      </>
                    )
                  }
                </select>
              </div>

              {/* Amount Paid */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Amount Paid</label>
                <HybridInput
                  className="w-full p-2 border rounded" 
                  placeholder="Enter amount"
                  value={amountPaid}
                  type="decimal"
                  onChange={setAmountPaid}
                  onTouchKeyboard={() => openKb('amountPaid', 'decimal', 'Amount Paid')}
                  onEnter={() => {
                    // Auto-complete payment if amount is sufficient
                    if (parseFloat(amountPaid || '0') >= finalTotal) {
                      handleCompletePayment()
                    }
                  }}
                />
                {parseFloat(amountPaid || '0') >= finalTotal && (
                  <div className="text-green-600 text-sm mt-1">
                    Change: {formatCurrency(changeAmount)}
                  </div>
                )}
              </div>


              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowPaymentModal(false)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={processPayment}
                  disabled={parseFloat(amountPaid || '0') < finalTotal || isProcessingPayment}
                >
                  {isProcessingPayment ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Processing...</span>
                    </div>
                  ) : (
                    'Complete Payment'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Preview Modal */}
      {completedSale && systemSettings && (
        <ReceiptPreview
          isOpen={showReceiptPreview}
          saleData={completedSale}
          systemSettings={systemSettings}
          onPrint={handlePrintReceipt}
          onSkip={handleSkipPrint}
          onBack={handleBackToPayment}
        />
      )}
      </div>
    </SessionGuard>
  )
}

export default POS