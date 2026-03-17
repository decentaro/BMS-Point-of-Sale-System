import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
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
import { useToast } from '../contexts/ToastContext'
import PageHeader from './ui/PageHeader'
import {
  ShoppingCart, Search, Package, Trash2, X, ChevronDown,
  Banknote, CreditCard, Percent, Shield, Tag
} from 'lucide-react'

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
  const { showToast } = useToast()


  // State management
  const [products, setProducts] = React.useState<Product[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [searchQuery, setSearchQuery] = React.useState<string>('')

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
      showToast('Failed to load products. Please refresh.', 'error')
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
    try {
      const response = await (window as any).electronAPI.validateManagerPin(pin)

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
        showToast('Invalid manager PIN. Discount not applied.', 'error')
        setShowManagerPinPrompt(false)
        setPendingDiscountPercent(0)
        setKbOpen(false)
      }
    } catch (error) {
      console.error('Error validating manager PIN:', error)
      showToast('Error validating manager PIN. Please try again.', 'error')
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
    } catch (err) {
      console.error('Error searching by barcode:', err)
      showToast('Product not found: ' + barcode, 'warning')
    }
  }

  // Cart management
  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id)

    // Check stock limits before updating cart
    if (existingItem) {
      if (existingItem.quantity >= product.stockQuantity) {
        showToast(`Cannot add more ${product.name}. Only ${product.stockQuantity} available in stock.`, 'warning')
        return
      }
    } else {
      if (product.stockQuantity <= 0) {
        showToast(`${product.name} is out of stock.`, 'warning')
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
      showToast(`Cannot set quantity to ${newQuantity}. Only ${product.stockQuantity} available in stock for ${product.name}.`, 'warning')
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
      showToast('Cart is empty', 'warning')
      return
    }

    if (parseFloat(amountPaid) < finalTotal) {
      showToast('Insufficient payment amount', 'warning')
      return
    }

    setIsProcessingPayment(true)
    try {
      const session = SessionManager.getCurrentSession()
      if (!session) {
        showToast('No user logged in', 'error')
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

      // Prepare sale data for receipt
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
      setShowPaymentModal(false)

      if (systemSettings?.showReceiptPreview) {
        // Show preview first, let user choose to print
        setShowReceiptPreview(true)
      } else if (systemSettings?.printReceiptAutomatically !== false) {
        // Auto-print fire-and-forget — don't block cart clear on printer response
        const receiptText = generateTextReceipt(previewSaleData, systemSettings!)
        window.electronAPI.printReceipt(receiptText, systemSettings?.businessLogoPath)
          .catch((err: unknown) => console.error('Auto-print error:', err))
        handlePaymentSuccess(sale.transactionId)
      } else {
        handlePaymentSuccess(sale.transactionId)
      }

      // Reload products to update inventory
      await loadProducts()

    } catch (err) {
      showToast('Payment failed. Please try again.', 'error')
      console.error('Payment error:', err)
    } finally {
      setIsProcessingPayment(false)
    }
  }

  // Handle payment success (common logic)
  const handlePaymentSuccess = (transactionId: string) => {
    clearCart()
    setShowPaymentModal(false)
    setShowReceiptPreview(false)
    setCompletedSale(null)
    showToast(`Payment successful! | ID: ${transactionId} | Change: ${formatCurrency(changeAmount)}`)
  }

  // Receipt preview actions
  const handlePrintReceipt = () => {
    if (!completedSale || !systemSettings) {
      showToast('Missing receipt data or system settings', 'error')
      return
    }

    // Fire-and-forget — clear cart immediately, print in background
    const receiptText = generateTextReceipt(completedSale, systemSettings)
    window.electronAPI.printReceipt(receiptText, systemSettings?.businessLogoPath)
      .catch((err: unknown) => console.error('Print error:', err))
    handlePaymentSuccess(completedSale?.transactionId || 'Unknown')
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
    const session = SessionManager.getCurrentSession()
    if (session) {
      navigate('/manager')
    } else {
      navigate('/login')
    }
  }

  // Payment method icon helper
  const PaymentIcon = ({ method }: { method: string }) => {
    const m = method.toLowerCase()
    if (m.includes('card')) return <CreditCard className="w-3 h-3" />
    if (m.includes('cash')) return <Banknote className="w-3 h-3" />
    return <Tag className="w-3 h-3" />
  }

  return (
    <SessionGuard>
      <div className="w-full h-full flex flex-col bg-white overflow-hidden">

      {/* Top */}
      <PageHeader
        title="Point of Sale"
        subtitle="Sell items"
        onBack={goBack}
        right={<SessionStatus />}
      />

      {/* Body: left products, right cart/totals */}
      <main className="flex-1 p-2 bg-slate-50 overflow-hidden">
        <div className="h-full flex flex-col lg:flex-row gap-2">

          {/* ── Left: product grid ── */}
          <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm flex-1 lg:flex-[3] overflow-hidden">

            {/* Search bar */}
            <div className="p-3 border-b border-slate-100 bg-white flex-shrink-0">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <HybridInput
                    placeholder="Search products..."
                    className="w-full pl-8 pr-3 h-9 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onTouchKeyboard={() => openKb('search', 'qwerty', 'Search Products')}
                  />
                </div>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="h-9 px-3 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400">
                {loading ? 'Loading products…' : `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''} shown`}
              </div>
            </div>

            {/* Product cards grid */}
            <div className="flex-1 overflow-y-auto p-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
                {loading ? (
                  <div className="col-span-full text-center py-12 text-sm text-slate-400">Loading products…</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-sm text-slate-400">
                    {searchQuery ? 'No products match your search.' : 'No products available.'}
                  </div>
                ) : (
                  filteredProducts.map((product) => {
                    const cartItem = cart.find(item => item.product.id === product.id)
                    const quantityInCart = cartItem ? cartItem.quantity : 0
                    const isOutOfStock = product.stockQuantity === 0
                    const isLowStock = product.stockQuantity > 0 && product.stockQuantity <= product.minStockLevel
                    const inCart = quantityInCart > 0

                    return (
                      <div
                        key={product.id}
                        className={`rounded-lg bg-white transition text-left overflow-hidden border cursor-pointer relative h-32 sm:h-36 md:h-40 lg:h-32 xl:h-36 ${
                          isOutOfStock
                            ? 'border-red-200 bg-red-50 cursor-not-allowed opacity-70'
                            : inCart
                              ? 'border-emerald-400 ring-2 ring-emerald-300 shadow-md'
                              : isLowStock
                                ? 'border-amber-300 bg-amber-50 hover:border-amber-400 hover:shadow-sm'
                                : 'border-slate-200 hover:border-emerald-300 hover:shadow-sm'
                        }`}
                        onClick={() => !isOutOfStock && addToCart(product)}
                      >
                        {/* Minus button */}
                        {quantityInCart > 0 && !isOutOfStock && (
                          <div
                            className="absolute top-1 left-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center z-10 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation()
                              updateCartItemQuantity(product.id, quantityInCart - 1)
                            }}
                          >
                            −
                          </div>
                        )}

                        {/* Quantity badge */}
                        {quantityInCart > 0 && (
                          <div className="absolute top-1 right-1 bg-emerald-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center z-10">
                            {quantityInCart}
                          </div>
                        )}

                        {/* Out of Stock Banner */}
                        {isOutOfStock && (
                          <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-center py-1 z-20 rounded-t-lg">
                            <div className="text-[10px] font-bold tracking-wide">OUT OF STOCK</div>
                          </div>
                        )}

                        {/* Low Stock Banner */}
                        {isLowStock && !isOutOfStock && (
                          <div className="absolute top-0 left-0 right-0 bg-amber-500 text-white text-center py-1 z-20 rounded-t-lg">
                            <div className="text-[10px] font-bold tracking-wide">LOW STOCK</div>
                          </div>
                        )}

                        {/* Product image */}
                        <div className="w-full h-[70px] sm:h-[85px] bg-slate-50 flex items-center justify-center overflow-hidden">
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
                            <Package className="w-7 h-7 text-slate-200" />
                          </div>
                        </div>

                        {/* Product info */}
                        <div className="p-1.5 flex flex-col justify-between">
                          <div className="text-xs font-medium text-slate-800 line-clamp-2 leading-tight" title={product.name}>
                            {product.name}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="text-[11px] text-emerald-600 font-bold">{formatCurrency(product.price)}</div>
                            <div className={`text-[10px] font-medium ${
                              isOutOfStock ? 'text-red-500' : isLowStock ? 'text-amber-600' : 'text-slate-400'
                            }`}>
                              {product.stockQuantity}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* ── Right: cart and payment ── */}
          <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm w-full lg:w-80 xl:w-96 overflow-hidden">

            {/* Cart header — navy */}
            <div
              className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
              style={{ background: 'hsl(215,65%,30%)' }}
            >
              <ShoppingCart className="w-4 h-4 text-white" />
              <span className="text-sm font-semibold text-white flex-1">Cart</span>
              <span className="text-xs text-white/70">{cart.length} item{cart.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400 py-8">
                  <ShoppingCart className="w-8 h-8 text-slate-200" />
                  <span className="text-sm">Cart is empty</span>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {cart.map((item) => (
                    <div key={item.product.id} className="px-3 py-2.5">
                      {/* Product name */}
                      <div className="font-medium text-xs text-slate-800 truncate mb-1.5" title={item.product.name}>
                        {item.product.name}
                      </div>

                      {/* Price row */}
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                        <div className="text-[11px] text-slate-500">
                          {formatCurrency(item.product.price)} each
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-400">Qty</span>
                          <input
                            className="w-10 h-6 border border-slate-200 rounded px-1 text-center text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            value={item.quantity}
                            readOnly
                            onClick={() => openKb('cartQuantity', 'decimal', 'Edit Quantity', item.product.id)}
                          />
                        </div>
                        <div className="text-xs font-bold text-emerald-600">
                          {formatCurrency(item.total)}
                        </div>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals and payment */}
            <div className="border-t border-slate-100 p-3 bg-white flex-shrink-0">
              {/* Detailed totals */}
              <div className="space-y-1.5 text-sm mb-3">
                <div className="flex justify-between text-slate-600 text-xs">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {taxLabel && (
                  <div className="flex justify-between text-slate-600 text-xs">
                    <span>{taxLabel}</span>
                    <span>{formatCurrency(taxAmount)}</span>
                  </div>
                )}
                {secondaryTaxLabel && (
                  <div className="flex justify-between text-slate-600 text-xs">
                    <span>{secondaryTaxLabel}</span>
                    <span>{formatCurrency(secondaryTaxAmount)}</span>
                  </div>
                )}
                {discountPercent > 0 && (
                  <div className="flex justify-between text-red-500 text-xs">
                    <span>Discount ({discountPercent}%)</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t border-slate-100 pt-2 mt-1">
                  <span className="text-slate-800">Total</span>
                  <span className="text-emerald-600">{formatCurrency(finalTotal)}</span>
                </div>
              </div>

              {/* Tax exempt toggle */}
              {taxSettings?.enableTaxExemptions && (
                <div className="mb-3">
                  <Button
                    variant={isExempt ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsExempt(!isExempt)}
                    className={`text-xs w-full ${isExempt ? 'bg-amber-500 hover:bg-amber-600 border-amber-500' : ''}`}
                  >
                    {isExempt ? 'Tax Exempt Active' : 'Apply Tax Exemption'}
                  </Button>
                </div>
              )}

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearCart}
                  disabled={cart.length === 0}
                  className="text-slate-600 border-slate-200 text-xs"
                >
                  Clear Cart
                </Button>
                <Button
                  size="sm"
                  disabled={cart.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                  onClick={() => { window.electronAPI?.openCashDrawer().catch(() => {}); setShowPaymentModal(true) }}
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
        onClose={() => setKbOpen(false)}
      />

      {/* ── Payment Modal ── */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">

            {/* Modal header — navy */}
            <div
              className="flex items-center justify-between px-5 py-4 rounded-t-xl"
              style={{ background: 'hsl(215,65%,30%)' }}
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-white" />
                <h2 className="text-base font-semibold text-white">Payment</h2>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-white/70 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Order Summary */}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Order Summary</div>
                <div className="text-sm space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {taxLabel && (
                    <div className="flex justify-between text-slate-600">
                      <span>{taxLabel}</span>
                      <span>{formatCurrency(taxAmount)}</span>
                    </div>
                  )}
                  {discountPercent > 0 && (
                    <div className="flex justify-between text-red-500">
                      <span>Discount ({discountPercent}%)</span>
                      <span>-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-2 mt-1">
                    <span className="text-slate-800">Total</span>
                    <span className="text-emerald-600">{formatCurrency(finalTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Discount Section */}
              <div className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Percent className="w-3.5 h-3.5 text-slate-500" />
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Discount</label>
                  {systemSettings?.requireManagerApprovalForDiscount && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      <Shield className="w-2.5 h-2.5" /> Manager Required
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-1.5 mb-2">
                  {[10, 20, 30, 40, 50].map((percent) => {
                    const handleDiscountClick = () => {
                      const session = SessionManager.getCurrentSession()
                      if (session) {
                        if (systemSettings?.requireManagerApprovalForDiscount && session.role !== 'Manager') {
                          setPendingDiscountPercent(percent)
                          setShowManagerPinPrompt(true)
                          openKb('managerPin', 'decimal', 'Enter Manager PIN for Discount Approval')
                          return
                        }
                      }
                      setDiscountPercent(percent)
                      setTimeout(() => {
                        openKb('discountReason', 'qwerty', 'Discount Reason (Optional)')
                      }, 100)
                    }
                    return (
                      <button
                        key={percent}
                        onClick={handleDiscountClick}
                        className={`h-8 rounded-lg text-xs font-semibold border transition ${
                          discountPercent === percent
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-600'
                        }`}
                      >
                        {percent}%
                      </button>
                    )
                  })}
                </div>
                {discountPercent > 0 && (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-2 text-xs">
                    <div className="flex justify-between text-red-600 font-medium">
                      <span>{discountPercent}% discount applied</span>
                      <span>-{formatCurrency(discountAmount)}</span>
                    </div>
                    {discountReason && (
                      <div className="text-slate-500 mt-0.5">Reason: {discountReason}</div>
                    )}
                    <button
                      onClick={() => { setDiscountPercent(0); setDiscountReason('') }}
                      className="text-red-500 hover:text-red-700 mt-1 text-[11px] underline"
                    >
                      Remove discount
                    </button>
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                  Payment Method
                </label>
                <div className="relative">
                  <select
                    className="w-full appearance-none pl-3 pr-8 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 bg-white"
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
                        <>
                          <option value="Cash">Cash</option>
                          <option value="Card">Card</option>
                          <option value="ETF/Digital">ETF/Digital</option>
                        </>
                      )
                    }
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Amount Paid */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                  Amount Paid
                </label>
                <div className="relative">
                  <PaymentIcon method={paymentMethod} />
                  <HybridInput
                    className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                    placeholder={`Enter amount (min ${formatCurrency(finalTotal)})`}
                    value={amountPaid}
                    type="decimal"
                    onChange={setAmountPaid}
                    onTouchKeyboard={() => openKb('amountPaid', 'decimal', 'Amount Paid')}
                    onEnter={() => {
                      if (parseFloat(amountPaid || '0') >= finalTotal) {
                        processPayment()
                      }
                    }}
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <PaymentIcon method={paymentMethod} />
                  </div>
                </div>
                {parseFloat(amountPaid || '0') >= finalTotal && (
                  <div className="flex items-center gap-1 text-emerald-600 text-sm mt-1.5 font-medium">
                    <span>Change: {formatCurrency(changeAmount)}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 border-slate-200 text-slate-600"
                  onClick={() => setShowPaymentModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  onClick={processPayment}
                  disabled={parseFloat(amountPaid || '0') < finalTotal || isProcessingPayment}
                >
                  {isProcessingPayment ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing…
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
