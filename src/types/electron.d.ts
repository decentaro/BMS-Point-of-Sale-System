export interface OfflineReturn {
  id: string
  timestamp: string
  transactionId: string
  returnData: {
    originalSaleId: number
    processedByEmployeeId: number
    managerPin: string | null
    notes: string
    returnItems: {
      originalSaleItemId: number
      returnQuantity: number
      lineTotal: number
      condition: string
      reason: string
    }[]
  }
}

export interface FailedReturn {
  id: string
  failedAt: string
  error: string
  httpStatus?: number
  transactionId: string
  returnData: OfflineReturn['returnData']
}

export interface OfflineAdjustment {
  id: string
  timestamp: string
  productName: string
  adjustmentData: {
    productId: number
    adjustmentType: string
    quantityChange: number
    reason: string
    notes?: string
    referenceNumber?: string
  }
}

export interface FailedAdjustment {
  id: string
  failedAt: string
  error: string
  httpStatus?: number
  productName: string
  adjustmentData: OfflineAdjustment['adjustmentData']
}

export interface FailedSale {
  id: string
  failedAt: string
  error: string
  httpStatus?: number
  saleData: OfflineTransaction['saleData']
  receiptData: OfflineTransaction['receiptData']
}

export interface OfflineTransaction {
  id: string
  timestamp: string
  idempotencyKey?: string
  saleData: {
    employeeId: number
    subtotal: number
    taxRate: number
    taxAmount: number
    discountAmount: number
    discountReason?: string
    total: number
    amountPaid: number
    change: number
    paymentMethod: string
    items: { productId: number; quantity: number; unitPrice: number; lineTotal: number }[]
  }
  receiptData: {
    subtotal: number
    taxAmount: number
    secondaryTaxAmount: number
    taxLabel: string
    secondaryTaxLabel: string
    discountAmount: number
    discountPercent: number
    discountReason: string
    finalTotal: number
    amountPaid: number
    changeAmount: number
    paymentMethod: string
    cart: any[]
    transactionId: string
    cashierName: string
    saleDate: string
  }
}

export interface ElectronAPI {
  // Authentication
  validateLogin: (employeeId: string, pin: string, selectedRole?: string) => Promise<any>
  validateManagerPin: (pin: string) => Promise<any>
  
  // Employee operations
  getAllEmployees: () => Promise<any>
  createEmployee: (employeeData: any) => Promise<any>
  updateEmployee: (id: number, employeeData: any) => Promise<any>
  deleteEmployee: (id: number) => Promise<any>
  
  // Product operations
  getAllProducts: () => Promise<any>
  getProduct: (id: number) => Promise<any>
  getProductByBarcode: (barcode: string) => Promise<any>
  getLowStockProducts: () => Promise<any>
  createProduct: (productData: any) => Promise<any>
  updateProduct: (id: number, productData: any) => Promise<any>
  updateProductStock: (id: number, newQuantity: number) => Promise<any>
  deleteProduct: (id: number) => Promise<any>
  
  // File system operations
  openPath: (path: string) => Promise<{ success: boolean; error?: string }>
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[]; error?: string }>
  readFile: (filePath: string) => Promise<Buffer>
  
  // Hardware status checking
  checkBarcodeScanner: () => Promise<{
    active: boolean
    lastScan?: string
    description: string
  }>
  checkPrinter: () => Promise<{
    connected: boolean
    model?: string
    port?: string
    description: string
  }>
  checkDatabase: () => Promise<{
    connected: boolean
    latency?: number
    description: string
  }>
  openCashDrawer: () => Promise<{
    success: boolean
    message: string
  }>
  
  printReceipt: (receiptHtml: string, logoPath?: string, businessName?: string) => Promise<{
    success: boolean
    message: string
  }>

  // API configuration
  getApiConfig: () => Promise<{ baseUrl: string; timeout?: number }>
  setApiConfig: (config: { baseUrl: string }) => Promise<void>

  // Setup wizard
  checkSetup: () => Promise<{ configured: boolean; reason?: string }>
  saveEnv: (credentials: {
    dbUser: string
    dbPassword: string
    dbHost: string
    dbPort?: string
    dbName?: string
  }) => Promise<{ success: boolean; error?: string }>
  testDbConnection: (host: string, port?: string, user?: string, password?: string, database?: string) => Promise<{ reachable: boolean; error?: string }>
  relaunchApp: () => Promise<void>

  // JWT token management
  setAuthToken: (token: string) => void
  clearAuthToken: () => void

  // Utility
  setScale: (scale: number) => boolean
  debug: () => string

  // Connectivity
  onConnectivityChange: (callback: (data: { online: boolean }) => void) => void
  getConnectivity: () => Promise<{ online: boolean }>

  // Offline queue
  queueTransaction: (transaction: OfflineTransaction) => Promise<{ success: boolean }>
  getQueue: () => Promise<OfflineTransaction[]>
  removeFromQueue: (id: string) => Promise<{ success: boolean }>

  // Product cache
  saveProductCache: (products: any[]) => Promise<{ success: boolean }>
  getProductCache: () => Promise<{ products: any[]; savedAt: string } | null>

  // Adjustment queue
  queueAdjustment: (adjustment: OfflineAdjustment) => Promise<{ success: boolean }>
  getAdjustmentQueue: () => Promise<OfflineAdjustment[]>
  removeFromAdjustmentQueue: (id: string) => Promise<{ success: boolean }>

  // Failed sales log
  logFailedSale: (entry: FailedSale) => Promise<{ success: boolean }>
  getFailedSales: () => Promise<FailedSale[]>
  clearFailedSales: () => Promise<{ success: boolean }>

  // Failed adjustments log
  logFailedAdjustment: (entry: FailedAdjustment) => Promise<{ success: boolean }>
  getFailedAdjustments: () => Promise<FailedAdjustment[]>
  clearFailedAdjustments: () => Promise<{ success: boolean }>

  // Return queue
  queueReturn: (ret: OfflineReturn) => Promise<{ success: boolean }>
  getReturnQueue: () => Promise<OfflineReturn[]>
  removeFromReturnQueue: (id: string) => Promise<{ success: boolean }>

  // Failed returns log
  logFailedReturn: (entry: FailedReturn) => Promise<{ success: boolean }>
  getFailedReturns: () => Promise<FailedReturn[]>
  clearFailedReturns: () => Promise<{ success: boolean }>
}

// Electron extends the browser File API with a `path` property
export interface ElectronFile extends File {
  path: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}