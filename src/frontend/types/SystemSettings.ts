// Shared SystemSettings interface used across all components
// This ensures consistent receipt template settings throughout the application
export interface SystemSettings {
  // Business Information
  businessName?: string
  storeLocation?: string
  phoneNumber?: string
  
  // Receipt Content
  receiptHeaderText?: string
  receiptFooterText?: string
  businessLogoPath?: string
  
  // Receipt Formatting
  receiptPaperSize: string        // '58mm' | '80mm'
  receiptFontSize: string         // 'Small' | 'Medium' | 'Large'
  receiptTemplateLayout: string   // 'Compact' | 'Standard' | 'Detailed'
  showReceiptBarcode: boolean
  showReceiptPreview?: boolean
  
  // Returns Policy
  enableReturns?: boolean
  returnTimeLimitDays?: number
  
  // Product Management
  productCategories?: string
  
  // Full system settings (optional properties for components that need them)
  id?: number
  dateFormat?: string
  decimalSeparator?: string
  thousandsSeparator?: string
  autoLogoutMinutes?: number
  defaultPaymentMethod?: string
  availablePaymentMethods?: string
  soundEffectsEnabled?: boolean
  requireManagerApprovalForDiscount?: boolean
  theme?: string
  fontScaling?: number
  printReceiptAutomatically?: boolean
  receiptCopies?: number
  emailReceiptEnabled?: boolean
  defaultReceiptEmail?: string
  requireReceiptForReturns?: boolean
  requireManagerApprovalForReturns?: boolean
  restockReturnedItems?: boolean
}