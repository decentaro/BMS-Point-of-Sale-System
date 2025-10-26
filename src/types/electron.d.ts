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
  
  printReceipt: (receiptHtml: string, logoPath?: string) => Promise<{
    success: boolean
    message: string
  }>

  // Utility
  setScale: (scale: number) => boolean
  debug: () => string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}