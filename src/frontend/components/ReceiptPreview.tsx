import React from 'react'
import { Button } from './ui/button'
import SharedReceiptRenderer, { StandardReceiptData } from './SharedReceiptRenderer'
import { SystemSettings } from '../types/SystemSettings'

interface Product {
  id: number
  name: string
  price: number
}

interface CartItem {
  product: Product
  quantity: number
  total: number
}

interface SaleData {
  subtotal: number
  taxAmount: number
  secondaryTaxAmount?: number
  taxLabel: string
  secondaryTaxLabel?: string
  discountAmount: number
  discountPercent: number
  discountReason?: string
  finalTotal: number
  amountPaid: number
  changeAmount: number
  paymentMethod: string
  cart: CartItem[]
  transactionId: string
  cashierName?: string
  saleDate?: string
}

interface ReceiptPreviewProps {
  isOpen: boolean
  saleData: SaleData
  systemSettings: SystemSettings
  onPrint: () => void
  onSkip: () => void
  onBack: () => void
}

const ReceiptPreview: React.FC<ReceiptPreviewProps> = ({
  isOpen,
  saleData,
  systemSettings,
  onPrint,
  onSkip,
  onBack
}) => {
  console.log('ReceiptPreview props:', { isOpen, saleData, systemSettings })

  if (!isOpen) return null

  // Convert saleData to StandardReceiptData format
  const standardReceiptData: StandardReceiptData = {
    transactionId: saleData.transactionId,
    saleDate: saleData.saleDate || new Date().toISOString(),
    cashierName: saleData.cashierName,
    paymentMethod: saleData.paymentMethod,
    cart: saleData.cart,
    subtotal: saleData.subtotal,
    discountAmount: saleData.discountAmount,
    discountPercent: saleData.discountPercent,
    discountReason: saleData.discountReason,
    taxAmount: saleData.taxAmount,
    taxLabel: saleData.taxLabel,
    secondaryTaxAmount: saleData.secondaryTaxAmount,
    secondaryTaxLabel: saleData.secondaryTaxLabel,
    finalTotal: saleData.finalTotal,
    amountPaid: saleData.amountPaid,
    changeAmount: saleData.changeAmount
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-3 border-b bg-gray-50">
          <h2 className="text-base font-semibold text-center">Receipt Preview</h2>
        </div>

        {/* Receipt Content */}
        <div className="flex-1 p-4 overflow-y-auto">
          <SharedReceiptRenderer 
            receiptData={standardReceiptData}
            systemSettings={systemSettings}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 p-4 border-t bg-gray-50 flex gap-3">
          <Button 
            variant="outline" 
            onClick={onBack}
            className="flex-1"
          >
            ← Back
          </Button>
          <Button 
            variant="outline" 
            onClick={onSkip}
            className="flex-1"
          >
            Skip Print
          </Button>
          <Button 
            onClick={onPrint}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
          >
            🖨️ Print Receipt
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ReceiptPreview