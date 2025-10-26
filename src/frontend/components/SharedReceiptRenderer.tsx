import React from 'react'
import Barcode from './Barcode'
import { SystemSettings } from '../types/SystemSettings'
import { formatDateSync, formatTime } from '../utils/dateFormat'

// Standardized receipt data format - ONE SOURCE OF TRUTH
export interface StandardReceiptData {
  transactionId: string
  saleDate: string // ISO string
  cashierName?: string
  paymentMethod: string
  cart: Array<{
    product: {
      id: number
      name: string
      price: number
      barcode: string
    }
    quantity: number
    total: number
  }>
  subtotal: number
  discountAmount: number
  discountPercent: number
  discountReason?: string
  taxAmount: number
  taxLabel: string
  secondaryTaxAmount?: number
  secondaryTaxLabel?: string
  finalTotal: number
  amountPaid: number
  changeAmount: number
}

interface SharedReceiptRendererProps {
  receiptData: StandardReceiptData
  systemSettings: SystemSettings
}

const SharedReceiptRenderer: React.FC<SharedReceiptRendererProps> = ({
  receiptData,
  systemSettings
}) => {
  // Simple currency formatting without symbol
  const formatCurrency = (amount: number): string => {
    return amount.toFixed(2)
  }

  // Parse date and time from receipt data
  const currentDate = receiptData.saleDate ? 
    formatDateSync(receiptData.saleDate) : 
    formatDateSync(new Date())
  
  const currentTime = receiptData.saleDate ?
    formatTime(receiptData.saleDate) :
    formatTime(new Date())

  // Paper width styling - locked to 80mm
  const paperWidth = 'w-80' // Fixed for 80mm thermal printing
  const fontSize = systemSettings.receiptFontSize === 'Small' ? 'text-xs' : 
                   systemSettings.receiptFontSize === 'Large' ? 'text-base' : 'text-sm'

  // Render different layouts based on template selection
  const renderReceiptContent = () => {
    switch (systemSettings.receiptTemplateLayout) {
      case 'Compact':
        return renderCompactTemplate()
      case 'Detailed':
        return renderDetailedTemplate()
      default: // Standard
        return renderStandardTemplate()
    }
  }

  // Compact Template - Minimal layout
  const renderCompactTemplate = () => (
    <div className={`mx-auto ${paperWidth} border border-gray-300 bg-white p-2 ${fontSize} font-mono`}>
      
      {/* Header */}
      {systemSettings.receiptHeaderText && (
        <div className="text-center font-bold mb-1 text-xs">
          {systemSettings.receiptHeaderText}
        </div>
      )}
      {systemSettings.storeLocation && (
        <div className="text-center text-xs mb-1">
          {systemSettings.storeLocation}
        </div>
      )}
      {systemSettings.phoneNumber && (
        <div className="text-center text-xs mb-1">
          {systemSettings.phoneNumber}
        </div>
      )}
      
      {/* Transaction Info - Condensed */}
      <div className="text-xs mb-1 text-center">
        <div>{currentDate} {currentTime}</div>
        <div>{receiptData.transactionId}</div>
      </div>
      
      {/* Items - Minimal */}
      {receiptData.cart.map((item, index) => (
        <div key={index} className="text-xs mb-1">
          <div className="flex justify-between">
            <span className="flex-1 pr-1 break-words">
              {item.product.name}
            </span>
            <span style={{whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-block', maxWidth: 'fit-content'}}>{item.quantity}x {formatCurrency(item.total)}</span>
          </div>
        </div>
      ))}
      
      {/* Discount and Total */}
      <div className="border-t border-gray-400 pt-1 mt-1">
        {receiptData.discountAmount > 0 && (
          <div className="text-xs text-red-600 mb-1" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span>Discount ({receiptData.discountPercent}%):</span>
            <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>-{formatCurrency(receiptData.discountAmount)}</span>
          </div>
        )}
        <div className="font-bold" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
          <span>TOTAL:</span>
          <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.finalTotal)}</span>
        </div>
        <div className="text-xs" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
          <span>Paid:</span>
          <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.amountPaid)}</span>
        </div>
        {receiptData.changeAmount > 0 && (
          <div className="text-xs" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span>Change:</span>
            <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.changeAmount)}</span>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="text-center text-xs mt-1 pt-1 border-t border-dashed border-gray-400">
        {systemSettings.receiptFooterText || 'Thank you for your business!'}
      </div>
      
      {/* Transaction Barcode at the very end */}
      {systemSettings.showReceiptBarcode && (
        <div className="mt-2 flex justify-center">
          <Barcode 
            value={receiptData.transactionId} 
            width={1} 
            height={20} 
            fontSize={6}
            displayValue={false}
          />
        </div>
      )}
    </div>
  )

  // Standard Template - Current layout
  const renderStandardTemplate = () => (
    <div className={`mx-auto ${paperWidth} border border-gray-300 bg-white p-3 ${fontSize} font-mono`}>
      
      {/* Receipt Header */}
      {systemSettings.receiptHeaderText && (
        <div className="text-center font-bold mb-2">
          {systemSettings.receiptHeaderText}
        </div>
      )}
      {systemSettings.storeLocation && (
        <div className="text-center text-xs mb-2">
          {systemSettings.storeLocation}
        </div>
      )}
      
      {/* Phone Number */}
      {systemSettings.phoneNumber && (
        <div className="text-center text-xs mb-2">
          {systemSettings.phoneNumber}
        </div>
      )}
      
      {/* Transaction Info */}
      <div className="border-t border-dashed border-gray-400 pt-2 mt-2">
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{currentDate}</span>
        </div>
        <div className="flex justify-between">
          <span>Time:</span>
          <span>{currentTime}</span>
        </div>
        <div className="flex justify-between">
          <span>Transaction:</span>
          <span>{receiptData.transactionId}</span>
        </div>
        <div className="flex justify-between">
          <span>Payment:</span>
          <span>{receiptData.paymentMethod}</span>
        </div>
        {receiptData.cashierName && (
          <div className="flex justify-between mb-2">
            <span>Cashier:</span>
            <span>{receiptData.cashierName}</span>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="border-t border-dashed border-gray-400 pt-2 mt-2">
        {receiptData.cart.map((item, index) => {
          const barcodeEnd = item.product.barcode.length > 5 
            ? item.product.barcode.slice(-5) 
            : item.product.barcode
          
          return (
            <div key={index} className="mb-2">
              <div className="flex justify-between items-start">
                <span className="flex-1 pr-2 break-words">
                  #{barcodeEnd} {item.product.name}
                </span>
                <span className="font-semibold" style={{whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-block', maxWidth: 'fit-content'}}>{formatCurrency(item.total)}</span>
              </div>
              <div className="text-xs text-gray-600 ml-2">
                {item.quantity} x {formatCurrency(item.product.price)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals */}
      <div className="border-t border-dashed border-gray-400 pt-2 mt-2">
        <div style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
          <span>Subtotal:</span>
          <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.subtotal)}</span>
        </div>
        
        {/* Tax - Always show on Standard template */}
        {receiptData.taxAmount > 0 && (
          <div style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span className="break-words">{receiptData.taxLabel}:</span>
            <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.taxAmount)}</span>
          </div>
        )}
        
        {receiptData.secondaryTaxAmount > 0 && (
          <div style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span>{receiptData.secondaryTaxLabel}:</span>
            <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.secondaryTaxAmount)}</span>
          </div>
        )}

        {/* Discount */}
        {receiptData.discountAmount > 0 && (
          <div className="text-red-600" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span>Discount ({receiptData.discountPercent}%):</span>
            <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>-{formatCurrency(receiptData.discountAmount)}</span>
          </div>
        )}

        {/* Total */}
        <div className="font-bold text-lg border-t border-gray-400 pt-1 mt-1" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
          <span>TOTAL:</span>
          <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.finalTotal)}</span>
        </div>

        {/* Payment Details */}
        <div className="mt-2" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
          <span>Amount Paid:</span>
          <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.amountPaid)}</span>
        </div>
        {receiptData.changeAmount > 0 && (
          <div className="font-bold" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span>Change:</span>
            <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.changeAmount)}</span>
          </div>
        )}
      </div>

      {/* Items Sold */}
      <div className="border-t border-dashed border-gray-400 pt-2 mt-2">
        <div className="flex justify-between text-xs">
          <span>Items Sold:</span>
          <span>{receiptData.cart.reduce((total, item) => total + item.quantity, 0)}</span>
        </div>
      </div>

      {/* Return Policy */}
      {systemSettings.enableReturns && systemSettings.returnTimeLimitDays && (
        <div className="text-center border-t border-dashed border-gray-400 pt-2 mt-3">
          <div className="text-xs font-bold mb-1">RETURN POLICY</div>
          <div className="text-xs">
            Returns accepted within {systemSettings.returnTimeLimitDays} day{systemSettings.returnTimeLimitDays !== 1 ? 's' : ''} with receipt
          </div>
        </div>
      )}

      {/* Receipt Footer */}
      {systemSettings.receiptFooterText ? (
        <div className="text-center border-t border-dashed border-gray-400 pt-2 mt-3">
          {systemSettings.receiptFooterText}
        </div>
      ) : (
        <div className="text-center border-t border-dashed border-gray-400 pt-2 mt-3 text-xs">
          Thank you for your business!
        </div>
      )}

      {/* Transaction Barcode at the very end */}
      {systemSettings.showReceiptBarcode && (
        <div className="mt-3 flex justify-center">
          <Barcode 
            value={receiptData.transactionId} 
            width={1} 
            height={25} 
            fontSize={6}
            displayValue={false}
          />
        </div>
      )}
    </div>
  )

  // Detailed Template - Comprehensive layout
  const renderDetailedTemplate = () => (
    <div className={`mx-auto ${paperWidth} border border-gray-300 bg-white p-3 ${fontSize} font-mono`}>
      
      {/* Enhanced Header */}
      {systemSettings.receiptHeaderText && (
        <div className="text-center font-bold mb-2 text-sm">
          {systemSettings.receiptHeaderText}
        </div>
      )}
      {systemSettings.storeLocation && (
        <div className="text-center text-xs mb-1">
          📍 {systemSettings.storeLocation}
        </div>
      )}
      {systemSettings.phoneNumber && (
        <div className="text-center text-xs mb-2">
          📞 {systemSettings.phoneNumber}
        </div>
      )}
      
      {/* Detailed Transaction Info */}
      <div className="border border-gray-300 p-2 mb-2">
        <div className="text-xs font-bold mb-1">TRANSACTION DETAILS</div>
        <div className="flex justify-between text-xs">
          <span>Date:</span>
          <span>{currentDate}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span>Time:</span>
          <span>{currentTime}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span>Transaction ID:</span>
          <span className="font-mono">{receiptData.transactionId}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span>Payment Method:</span>
          <span>{receiptData.paymentMethod}</span>
        </div>
        {receiptData.cashierName && (
          <div className="flex justify-between text-xs">
            <span>Cashier:</span>
            <span>{receiptData.cashierName}</span>
          </div>
        )}
      </div>

      {/* Detailed Items Table */}
      <div className="border border-gray-300 mb-2">
        <div className="bg-gray-100 p-1 text-xs font-bold text-center">
          ITEMS PURCHASED
        </div>
        <div className="p-2">
          {receiptData.cart.map((item, index) => {
            const barcodeEnd = item.product.barcode.length > 5 
              ? item.product.barcode.slice(-5) 
              : item.product.barcode
            
            return (
              <div key={index} className="border-b border-gray-200 pb-2 mb-2 last:border-b-0 last:mb-0">
                <div className="flex justify-between items-start font-semibold">
                  <span className="flex-1 pr-2 break-words">{item.product.name}</span>
                  <span style={{whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-block', maxWidth: 'fit-content'}}>{formatCurrency(item.total)}</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Barcode: #{item.product.barcode || barcodeEnd}
                </div>
                <div className="text-xs text-gray-600">
                  Quantity: {item.quantity} × Unit Price: {formatCurrency(item.product.price)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Totals */}
      <div className="border border-gray-300 p-2 mb-2">
        <div className="text-xs mb-1" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
          <span>Subtotal:</span>
          <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.subtotal)}</span>
        </div>
        
        {receiptData.taxAmount > 0 && (
          <div className="text-xs mb-1" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span>{receiptData.taxLabel}:</span>
            <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.taxAmount)}</span>
          </div>
        )}
        
        {receiptData.secondaryTaxAmount > 0 && (
          <div className="text-xs mb-1" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span>{receiptData.secondaryTaxLabel}:</span>
            <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.secondaryTaxAmount)}</span>
          </div>
        )}

        {receiptData.discountAmount > 0 && (
          <div className="text-xs mb-1 text-red-600" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span>Discount ({receiptData.discountPercent}%):</span>
            <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>-{formatCurrency(receiptData.discountAmount)}</span>
          </div>
        )}

        <div className="border-t border-gray-400 pt-1 mt-1">
          <div className="font-bold" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span>TOTAL:</span>
            <span className="text-lg text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.finalTotal)}</span>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-1 mt-1">
          <div className="text-xs" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
            <span>Amount Paid:</span>
            <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.amountPaid)}</span>
          </div>
          {receiptData.changeAmount > 0 && (
            <div className="text-xs font-bold" style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start'}}>
              <span>Change:</span>
              <span className="text-right font-mono" style={{whiteSpace: 'pre', display: 'inline-block'}}>{formatCurrency(receiptData.changeAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs mt-1">
            <span>Items Sold:</span>
            <span>{receiptData.cart.reduce((total, item) => total + item.quantity, 0)}</span>
          </div>
        </div>
      </div>

      {/* Return Policy */}
      {systemSettings.enableReturns && systemSettings.returnTimeLimitDays && (
        <div className="border border-gray-300 p-2 mb-2">
          <div className="text-xs font-bold mb-1">RETURN POLICY</div>
          <div className="text-xs">
            • Returns accepted within {systemSettings.returnTimeLimitDays} day{systemSettings.returnTimeLimitDays !== 1 ? 's' : ''}<br/>
            • Original receipt required<br/>
            • Items must be in original condition
          </div>
        </div>
      )}

      {/* Enhanced Footer */}
      <div className="text-center border-t border-dashed border-gray-400 pt-2 mt-3">
        {systemSettings.receiptFooterText ? (
          <div className="text-sm font-semibold">
            {systemSettings.receiptFooterText}
          </div>
        ) : (
          <div>
            <div className="text-sm font-semibold">Thank you for your business!</div>
            <div className="text-xs mt-1">Please keep this receipt for your records</div>
          </div>
        )}
      </div>

      {/* Transaction Barcode at the very end */}
      {systemSettings.showReceiptBarcode && (
        <div className="mt-3 flex justify-center">
          <Barcode 
            value={receiptData.transactionId} 
            width={1.2} 
            height={30} 
            fontSize={8}
            displayValue={false}
          />
        </div>
      )}
    </div>
  )

  return renderReceiptContent()
}

export default SharedReceiptRenderer