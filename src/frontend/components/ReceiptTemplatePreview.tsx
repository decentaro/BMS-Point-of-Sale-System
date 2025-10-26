import React from 'react'
import { Button } from './ui/button'
import SharedReceiptRenderer, { StandardReceiptData } from './SharedReceiptRenderer'
import { SystemSettings } from '../types/SystemSettings'
import ApiClient from '../utils/ApiClient'

interface ReceiptTemplatePreviewProps {
  isOpen: boolean
  systemSettings: SystemSettings
  onClose: () => void
}

const ReceiptTemplatePreview: React.FC<ReceiptTemplatePreviewProps> = ({
  isOpen,
  systemSettings,
  onClose
}) => {
  const [taxSettings, setTaxSettings] = React.useState<any>(null)

  // Load tax settings for consistent labels
  React.useEffect(() => {
    const loadTaxSettings = async () => {
      try {
        const data = await ApiClient.getSettings<any>('tax')
        setTaxSettings(data)
      } catch (error) {
        console.error('Error loading tax settings:', error)
        // Use default settings if none found
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
    
    if (isOpen) {
      loadTaxSettings()
    }
  }, [isOpen])

  if (!isOpen || !taxSettings) return null

  // Sample data for preview - using actual tax settings for consistency
  const subtotal = 3270
  const discountPercent = 10 // Show 10% discount in preview
  const discountAmount = (subtotal * discountPercent) / 100
  const subtotalAfterDiscount = subtotal - discountAmount
  const taxAmount = (subtotalAfterDiscount * taxSettings.taxRate) / 100
  const taxLabel = `${taxSettings.taxName} (${taxSettings.taxRate}%)`
  const finalTotal = subtotalAfterDiscount + taxAmount
  
  // Create StandardReceiptData for the preview
  const sampleReceiptData: StandardReceiptData = {
    transactionId: 'TXN-20250824-12345678',
    saleDate: new Date().toISOString(),
    cashierName: 'Maria Santos',
    paymentMethod: 'Cash',
    cart: [
      { 
        product: { 
          id: 1,
          name: 'Premium Dog Food 15kg', 
          barcode: '1234567890', 
          price: 1250 
        }, 
        quantity: 1, 
        total: 1250 
      },
      { 
        product: { 
          id: 2,
          name: 'Cat Litter Premium', 
          barcode: '9876543210', 
          price: 850 
        }, 
        quantity: 2, 
        total: 1700 
      },
      { 
        product: { 
          id: 3,
          name: 'Pet Shampoo', 
          barcode: '5555444433', 
          price: 320 
        }, 
        quantity: 1, 
        total: 320 
      }
    ],
    subtotal: subtotal,
    discountAmount: discountAmount,
    discountPercent: discountPercent,
    discountReason: 'Sample discount',
    taxAmount: taxAmount,
    taxLabel: taxLabel,
    secondaryTaxAmount: 0,
    secondaryTaxLabel: '',
    finalTotal: finalTotal,
    amountPaid: 4000,
    changeAmount: 4000 - finalTotal
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-3 border-b bg-gray-50">
          <h2 className="text-base font-semibold text-center">
            Receipt Template Preview - {systemSettings.receiptTemplateLayout}
          </h2>
          <p className="text-xs text-center text-gray-600 mt-1">
            Sample receipt with current settings
          </p>
        </div>

        {/* Receipt Content */}
        <div className="flex-1 p-4 overflow-y-auto">
          <SharedReceiptRenderer 
            receiptData={sampleReceiptData}
            systemSettings={systemSettings}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 p-4 border-t bg-gray-50 flex gap-3">
          <Button 
            onClick={onClose}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Close Preview
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ReceiptTemplatePreview