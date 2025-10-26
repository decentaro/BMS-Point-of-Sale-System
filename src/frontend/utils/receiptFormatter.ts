import { SystemSettings } from '../types/SystemSettings'

// Simple currency formatting - no symbol, just the amount
const formatCurrency = (amount: number): string => {
  return amount.toFixed(2)
}

// Date/time formatting helpers to match SharedReceiptRenderer
const formatDateSync = (date: string | Date) => {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString()
}

const formatTime = (date: string | Date) => {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString()
}

// Text receipt formatter that mirrors SharedReceiptRenderer exactly
export const generateTextReceipt = (saleData: any, settings: SystemSettings) => {
  
  // Paper width locked to 48 characters for 80mm thermal printer
  const paperWidth = 48  // Fixed for optimal 80mm thermal printing
  const divider = '='.repeat(paperWidth)
  const dashedLine = '-'.repeat(paperWidth)
  
  // Helper function to center text manually with spaces - More reliable than ESC/POS centering
  const centerText = (text: string) => {
    // Calculate padding for true visual centering based on paper width
    const cleanText = text.replace(/📍|📞/g, '') // Remove emojis for length calc
    const textLength = cleanText.length
    const padding = Math.max(0, Math.floor((paperWidth - textLength) / 2))
    const centeredText = ' '.repeat(padding) + text
    return centeredText + '\n'
  }
  
  // Remove ESC/POS commands - just use manual centering for everything
  const escposCenterText = (text: string) => {
    return centerText(text)
  }
  
  // Helper function for two-column layout - SMART WRAPPING like preview template
  const twoColumn = (left: string, right: string) => {
    const rightStr = right.toString()
    const availableLeft = paperWidth - rightStr.length - 1
    
    // If left text fits, use single line
    if (left.length <= availableLeft) {
      return left.padEnd(availableLeft) + ' ' + rightStr
    }
    
    // Smart wrapping: break at natural word boundaries
    const words = left.split(' ')
    let currentLine = ''
    let result = ''
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      
      if (testLine.length <= availableLeft) {
        currentLine = testLine
      } else {
        if (currentLine) {
          result += currentLine + '\n'
          currentLine = word
        } else {
          // Single word too long, just use it
          result += word + '\n'
          currentLine = ''
        }
      }
    }
    
    // Add final line with right-aligned price
    if (currentLine) {
      result += currentLine.padEnd(availableLeft) + ' ' + rightStr
    } else {
      result += ' '.repeat(availableLeft) + ' ' + rightStr
    }
    
    return result
  }

  // Parse date and time from receipt data
  const currentDate = saleData.saleDate ? 
    formatDateSync(saleData.saleDate) : 
    formatDateSync(new Date())
  
  const currentTime = saleData.saleDate ?
    formatTime(saleData.saleDate) :
    formatTime(new Date())

  let receipt = ''
  
  // DEBUG: Log which template is being used
  console.log('🔥 RECEIPT DEBUG - Template:', settings.receiptTemplateLayout)
  console.log('🔥 RECEIPT DEBUG - Logo path:', settings.businessLogoPath)
  console.log('🔥 RECEIPT DEBUG - Show barcode:', settings.showReceiptBarcode)
  
  // Switch based on receipt template layout (matching SharedReceiptRenderer)
  switch (settings.receiptTemplateLayout) {
    case 'Compact':
      return generateCompactTextReceipt(saleData, settings, paperWidth, centerText, twoColumn, currentDate, currentTime)
    case 'Detailed':
      return generateDetailedTextReceipt(saleData, settings, paperWidth, centerText, twoColumn, currentDate, currentTime, divider, dashedLine)
    default: // Standard
      return generateStandardTextReceipt(saleData, settings, paperWidth, centerText, twoColumn, currentDate, currentTime, divider, dashedLine)
  }
}

// Compact Template - EXACTLY matching SharedReceiptRenderer compact
const generateCompactTextReceipt = (saleData: any, settings: SystemSettings, paperWidth: number, centerText: Function, twoColumn: Function, currentDate: string, currentTime: string) => {
  let receipt = ''
  
  // Business name will be added dynamically by main.js from tax settings
  receipt += '[LOGO PLACEHOLDER]\n\n'
  
  // Header - EXACTLY like SharedReceiptRenderer line 87-102
  if (settings.receiptHeaderText) {
    receipt += centerText(settings.receiptHeaderText)
  }
  if (settings.storeLocation) {
    receipt += centerText(settings.storeLocation)
  }
  if (settings.phoneNumber) {
    receipt += centerText(settings.phoneNumber)
  }
  
  // Transaction Info - Condensed - EXACTLY like line 105-108
  receipt += '\n' + centerText(`${currentDate} ${currentTime}`) + '\n'
  receipt += centerText(saleData.transactionId) + '\n\n'
  
  // Items - EXACTLY like your preview with barcode and name on same line
  saleData.cart.forEach((item: any) => {
    // Calculate barcodeEnd exactly like Standard template
    const barcodeEnd = item.product.barcode && item.product.barcode.length > 5 
      ? item.product.barcode.slice(-5) 
      : item.product.barcode || '00000'
    
    // Line 1: #barcode + product name on left, total price on right
    const leftText = `#${barcodeEnd} ${item.product.name}`
    const rightText = formatCurrency(item.total)
    receipt += twoColumn(leftText, rightText) + '\n'
    
    // Line 2: Indented quantity x unit price  
    receipt += `  ${item.quantity} x ${formatCurrency(item.product.price)}` + '\n'
  })
  
  // EXACTLY like line 123: border-t border-gray-400 pt-1 mt-1
  receipt += '-'.repeat(paperWidth) + '\n'
  
  // Discount and Total - EXACTLY like line 124-143
  if (saleData.discountAmount > 0) {
    receipt += twoColumn(`Discount (${saleData.discountPercent}%):`, `-${formatCurrency(saleData.discountAmount)}`) + '\n'
  }
  receipt += twoColumn('TOTAL:', formatCurrency(saleData.finalTotal)) + '\n'
  receipt += twoColumn('Paid:', formatCurrency(saleData.amountPaid)) + '\n'
  if (saleData.changeAmount > 0) {
    receipt += twoColumn('Change:', formatCurrency(saleData.changeAmount)) + '\n'
  }
  
  // Footer - EXACTLY like line 147-149
  receipt += '\n' + '-'.repeat(paperWidth) + '\n'
  receipt += centerText(settings.receiptFooterText || 'Thank you for your business!')
  
  // Transaction Barcode - EXACTLY like line 152-162: displayValue={false} means NO text
  if (settings.showReceiptBarcode) {
    receipt += '\n'
    // POS-80 compatible barcode commands
    const barcodeData = saleData.transactionId
    
    // Method 1: Standard CODE128 with proper setup for POS-80
    receipt += '\x1D\x68\x64'  // Set barcode height to 100 dots
    receipt += '\x1D\x77\x02'  // Set barcode width (2 = medium)
    receipt += '\x1D\x48\x00'  // Do not print HRI characters (displayValue=false)
    receipt += '\x1D\x6B\x49' + String.fromCharCode(barcodeData.length) + barcodeData + '\n'
    
    // Fallback: Add text-based barcode pattern for visual recognition
    const barcodePattern = '||| || ||| | || || ||| | || || |||'
    receipt += centerText(barcodePattern)
  }
  
  // Add proper paper feed
  receipt += '\n\n\n\n'
  
  return receipt
}

// Standard Template - EXACTLY matches SharedReceiptRenderer standard line by line
const generateStandardTextReceipt = (saleData: any, settings: SystemSettings, paperWidth: number, centerText: Function, twoColumn: Function, currentDate: string, currentTime: string, divider: string, dashedLine: string) => {
  let receipt = ''
  
  // Line 169-178: Business Logo - Raw placeholder for main.js to replace
  // Business name will be added dynamically by main.js from tax settings
  receipt += '[LOGO PLACEHOLDER]\n\n'
  
  
  // Line 180-185: Receipt Header
  if (settings.receiptHeaderText) {
    receipt += centerText(settings.receiptHeaderText)
  }
  
  // Line 186-190: Store Location  
  if (settings.storeLocation) {
    receipt += centerText(settings.storeLocation)
  }
  
  // Line 192-197: Phone Number
  if (settings.phoneNumber) {
    receipt += centerText(settings.phoneNumber)
  }
  
  // Line 199-223: Transaction Info
  receipt += '\n' + dashedLine + '\n'
  receipt += twoColumn('Date:', currentDate) + '\n'
  receipt += twoColumn('Time:', currentTime) + '\n'
  receipt += twoColumn('Transaction:', saleData.transactionId) + '\n'
  receipt += twoColumn('Payment:', saleData.paymentMethod) + '\n'
  if (saleData.cashierName) {
    receipt += twoColumn('Cashier:', saleData.cashierName) + '\n'
  }

  // Line 225-246: Items - EXACTLY like SharedReceiptRenderer
  receipt += '\n' + dashedLine + '\n'
  saleData.cart.forEach((item: any) => {
    // Line 228-230: barcodeEnd calculation
    const barcodeEnd = item.product.barcode && item.product.barcode.length > 5 
      ? item.product.barcode.slice(-5) 
      : item.product.barcode || '00000'
    
    // Line 234-238: flex justify-between items-start with flex-1 pr-2 break-words
    const leftText = `#${barcodeEnd} ${item.product.name}`
    const rightText = formatCurrency(item.total)
    receipt += twoColumn(leftText, rightText) + '\n'
    
    // Line 240-242: text-xs text-gray-600 ml-2 indented
    receipt += `  ${item.quantity} x ${formatCurrency(item.product.price)}` + '\n'
  })

  // Line 248-249: Totals section
  receipt += '\n' + dashedLine + '\n'
  
  // Line 250-253: Subtotal
  receipt += twoColumn('Subtotal:', formatCurrency(saleData.subtotal)) + '\n'
  
  // Line 255-261: Tax - Always show on Standard template
  if (saleData.taxAmount > 0) {
    receipt += twoColumn(`${saleData.taxLabel}:`, formatCurrency(saleData.taxAmount)) + '\n'
  }
  
  // Line 263-268: Secondary Tax
  if (saleData.secondaryTaxAmount > 0) {
    receipt += twoColumn(`${saleData.secondaryTaxLabel}:`, formatCurrency(saleData.secondaryTaxAmount)) + '\n'
  }

  // Line 270-276: Discount
  if (saleData.discountAmount > 0) {
    receipt += twoColumn(`Discount (${saleData.discountPercent}%):`, `-${formatCurrency(saleData.discountAmount)}`) + '\n'
  }

  // Line 278-282: Total with border
  receipt += '-'.repeat(paperWidth) + '\n'
  receipt += twoColumn('TOTAL:', formatCurrency(saleData.finalTotal)) + '\n'
  receipt += '-'.repeat(paperWidth) + '\n'

  // Line 284-287: Payment Details  
  receipt += twoColumn('Amount Paid:', formatCurrency(saleData.amountPaid)) + '\n'
  if (saleData.changeAmount > 0) {
    receipt += twoColumn('Change:', formatCurrency(saleData.changeAmount)) + '\n'
  }

  // Items Sold
  receipt += '\n' + dashedLine + '\n'
  const totalItems = saleData.cart.reduce((total: number, item: any) => total + item.quantity, 0)
  receipt += twoColumn('Items Sold:', totalItems.toString()) + '\n'

  // Return Policy
  if (settings.enableReturns && settings.returnTimeLimitDays) {
    receipt += '\n' + dashedLine + '\n'
    receipt += centerText('RETURN POLICY')
    // Split into multiple lines and center them
    receipt += centerText(`Returns accepted within ${settings.returnTimeLimitDays} day${settings.returnTimeLimitDays !== 1 ? 's' : ''}`)
    receipt += centerText('with receipt')
  }

  // Receipt Footer
  receipt += '\n' + dashedLine + '\n'
  receipt += centerText(settings.receiptFooterText || 'Thank you for your business!')

  // Transaction Barcode - EXACTLY like line 327-337: displayValue={false}
  if (settings.showReceiptBarcode) {
    receipt += '\n'
    // Try multiple ESC/POS barcode formats for POS-80 compatibility
    const barcodeData = saleData.transactionId
    
    // Method 1: Standard CODE128 with proper setup
    receipt += '\x1D\x68\x64'  // Set barcode height to 100 dots
    receipt += '\x1D\x77\x02'  // Set barcode width (2 = medium)
    receipt += '\x1D\x48\x00'  // Do not print HRI characters (displayValue=false)
    receipt += '\x1D\x6B\x49' + String.fromCharCode(barcodeData.length) + barcodeData + '\n'
  }
  
  // Add proper paper feed
  receipt += '\n\n\n\n'
  
  return receipt
}

// Detailed Template - Comprehensive layout (mirrors SharedReceiptRenderer detailed)  
const generateDetailedTextReceipt = (saleData: any, settings: SystemSettings, paperWidth: number, centerText: Function, twoColumn: Function, currentDate: string, currentTime: string, divider: string, dashedLine: string) => {
  let receipt = ''
  
  // Business name will be added dynamically by main.js from tax settings
  receipt += '[LOGO PLACEHOLDER]\n\n'
  
  // Enhanced Header - EXACTLY like line 355-370
  if (settings.receiptHeaderText) {
    receipt += centerText(settings.receiptHeaderText)
  }
  if (settings.storeLocation) {
    receipt += centerText(`📍 ${settings.storeLocation}`)
  }
  if (settings.phoneNumber) {
    receipt += centerText(`📞 ${settings.phoneNumber}`)
  }
  
  // Detailed Transaction Info
  receipt += '\n' + divider + '\n'
  receipt += centerText('TRANSACTION DETAILS')
  receipt += divider + '\n'
  receipt += twoColumn('Date:', currentDate) + '\n'
  receipt += twoColumn('Time:', currentTime) + '\n'
  receipt += twoColumn('Transaction ID:', saleData.transactionId) + '\n'
  receipt += twoColumn('Payment Method:', saleData.paymentMethod) + '\n'
  if (saleData.cashierName) {
    receipt += twoColumn('Cashier:', saleData.cashierName) + '\n'
  }

  // Detailed Items Table
  receipt += '\n' + divider + '\n'
  receipt += centerText('ITEMS PURCHASED') 
  receipt += divider + '\n'
  
  saleData.cart.forEach((item: any, index: number) => {
    const barcodeEnd = item.product.barcode && item.product.barcode.length > 5 
      ? item.product.barcode.slice(-5) 
      : item.product.barcode || '00000'
    
    if (index > 0) receipt += dashedLine + '\n'
    receipt += twoColumn(item.product.name, formatCurrency(item.total)) + '\n'
    receipt += `Barcode: #${item.product.barcode || barcodeEnd}` + '\n'
    receipt += `Quantity: ${item.quantity} × Unit Price: ${formatCurrency(item.product.price)}` + '\n'
  })

  // Totals
  receipt += '\n' + divider + '\n'
  receipt += twoColumn('Subtotal:', formatCurrency(saleData.subtotal)) + '\n'
  
  if (saleData.taxAmount > 0) {
    receipt += twoColumn(`${saleData.taxLabel}:`, formatCurrency(saleData.taxAmount)) + '\n'
  }
  if (saleData.secondaryTaxAmount > 0) {
    receipt += twoColumn(`${saleData.secondaryTaxLabel}:`, formatCurrency(saleData.secondaryTaxAmount)) + '\n'
  }

  if (saleData.discountAmount > 0) {
    receipt += twoColumn(`Discount (${saleData.discountPercent}%):`, `-${formatCurrency(saleData.discountAmount)}`) + '\n'
  }

  receipt += '-'.repeat(paperWidth) + '\n'
  receipt += twoColumn('TOTAL:', formatCurrency(saleData.finalTotal)) + '\n'
  receipt += '-'.repeat(paperWidth) + '\n'

  receipt += twoColumn('Amount Paid:', formatCurrency(saleData.amountPaid)) + '\n'
  if (saleData.changeAmount > 0) {
    receipt += twoColumn('Change:', formatCurrency(saleData.changeAmount)) + '\n'
  }
  const totalItems = saleData.cart.reduce((total: number, item: any) => total + item.quantity, 0)
  receipt += twoColumn('Items Sold:', totalItems.toString()) + '\n'

  // Return Policy
  if (settings.enableReturns && settings.returnTimeLimitDays) {
    receipt += '\n' + divider + '\n'
    receipt += centerText('RETURN POLICY')
    receipt += centerText(`• Returns accepted within ${settings.returnTimeLimitDays} day${settings.returnTimeLimitDays !== 1 ? 's' : ''}`)
    receipt += centerText('• Original receipt required')
    receipt += centerText('• Items must be in original condition')
  }

  // Enhanced Footer
  receipt += '\n' + dashedLine + '\n'
  if (settings.receiptFooterText) {
    receipt += centerText(settings.receiptFooterText) + '\n'
  } else {
    receipt += centerText('Thank you for your business!')
    receipt += centerText('Please keep this receipt for your records')
  }

  // Transaction Barcode - EXACTLY like SharedReceiptRenderer: displayValue={false}
  if (settings.showReceiptBarcode) {
    receipt += '\n'
    // ESC/POS barcode commands for CODE128 - no text (displayValue={false})
    const barcodeData = saleData.transactionId
    const barcodeCommand = '\x1D\x6B\x49' + String.fromCharCode(barcodeData.length) + barcodeData
    receipt += barcodeCommand + '\n'
  }
  
  // Add proper paper feed  
  receipt += '\n\n\n\n'
  
  return receipt
}