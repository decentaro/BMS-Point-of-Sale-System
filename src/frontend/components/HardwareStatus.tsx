import React from 'react'
import { Card } from '@/components/ui/card'

interface HardwareStatus {
  barcodeScanner: {
    status: 'active' | 'inactive' | 'error'
    lastScan?: string
    description: string
  }
  receiptPrinter: {
    status: 'connected' | 'disconnected' | 'error' | 'not_found'
    model?: string
    description: string
  }
  cashDrawer: {
    status: 'ready' | 'waiting_printer' | 'error' | 'manual_only'
    description: string
  }
  database: {
    status: 'connected' | 'disconnected' | 'error'
    latency?: number
    description: string
  }
  network: {
    status: 'online' | 'offline' | 'limited'
    description: string
  }
}

interface Props {
  compact?: boolean
  showDetails?: boolean
}

export default function HardwareStatus({ compact = false, showDetails = true }: Props) {
  const [status, setStatus] = React.useState<HardwareStatus>({
    barcodeScanner: {
      status: 'inactive',
      lastScan: undefined,
      description: 'Checking scanner status...'
    },
    receiptPrinter: {
      status: 'not_found',
      description: 'Checking printer connection...'
    },
    cashDrawer: {
      status: 'waiting_printer',
      description: 'Cash drawer requires printer connection'
    },
    database: {
      status: 'disconnected',
      latency: undefined,
      description: 'Checking database connection...'
    },
    network: {
      status: 'offline',
      description: 'Checking network status...'
    }
  })

  const [isChecking, setIsChecking] = React.useState(false)
  const [isOpeningDrawer, setIsOpeningDrawer] = React.useState(false)

  // Check hardware status
  const checkHardwareStatus = async () => {
    setIsChecking(true)
    try {
      // Check barcode scanner (detect recent input activity)
      const scannerStatus = await window.electronAPI.checkBarcodeScanner()
      
      // Check printer connection
      const printerStatus = await window.electronAPI.checkPrinter()
      
      // Check database connection
      const dbStatus = await window.electronAPI.checkDatabase()
      
      // Check network connectivity
      const networkStatus = navigator.onLine ? 'online' : 'offline'

      setStatus(prev => ({
        ...prev,
        barcodeScanner: {
          status: scannerStatus.active ? 'active' : 'inactive',
          lastScan: scannerStatus.lastScan,
          description: scannerStatus.description || (scannerStatus.active ? 'USB HID Scanner - Working' : 'No scanner detected')
        },
        receiptPrinter: {
          status: printerStatus.connected ? 'connected' : 'not_found',
          model: printerStatus.model,
          description: printerStatus.description || (printerStatus.connected ? `${printerStatus.model || 'Thermal Printer'} - Ready` : 'No thermal printer detected')
        },
        cashDrawer: {
          status: printerStatus.connected ? 'ready' : 'waiting_printer',
          description: printerStatus.connected ? 'Cash drawer ready (connected via printer)' : 'Cash drawer requires thermal printer connection'
        },
        database: {
          status: dbStatus.connected ? 'connected' : 'error',
          latency: dbStatus.latency,
          description: dbStatus.description || (dbStatus.connected ? `Database connected - ${dbStatus.latency}ms` : 'Database connection failed')
        },
        network: {
          status: networkStatus,
          description: networkStatus === 'online' ? 'Internet connection active' : 'No internet connection'
        }
      }))
    } catch (error) {
      console.error('Error checking hardware status:', error)
    } finally {
      setIsChecking(false)
    }
  }

  // Open cash drawer function
  const openCashDrawer = async () => {
    setIsOpeningDrawer(true)
    try {
      const result = await window.electronAPI.openCashDrawer()
      if (result.success) {
        alert('✅ Cash drawer opened successfully!')
      } else {
        alert(`❌ Failed to open cash drawer: ${result.message}`)
      }
    } catch (error) {
      console.error('Error opening cash drawer:', error)
      alert('❌ Failed to open cash drawer')
    } finally {
      setIsOpeningDrawer(false)
    }
  }

  // Check status on component mount and periodically
  React.useEffect(() => {
    checkHardwareStatus()
    const interval = setInterval(checkHardwareStatus, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [])

  // Status icon and color helper
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
      case 'connected':
      case 'ready':
      case 'online':
        return '🟢'
      case 'inactive':
      case 'disconnected':
      case 'waiting_printer':
      case 'offline':
        return '🟡'
      case 'error':
      case 'not_found':
      case 'limited':
        return '🔴'
      default:
        return '⚪'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'connected':
      case 'ready':
      case 'online':
        return 'text-green-600'
      case 'inactive':
      case 'disconnected':
      case 'waiting_printer':
      case 'offline':
        return 'text-yellow-600'
      case 'error':
      case 'not_found':
      case 'limited':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  if (compact) {
    // Compact view for POS screen
    return (
      <div className="flex items-center space-x-2 text-xs bg-gray-50 px-2 py-1 rounded">
        <span>{getStatusIcon(status.barcodeScanner.status)}</span>
        <span>{getStatusIcon(status.receiptPrinter.status)}</span>
        <span>{getStatusIcon(status.cashDrawer.status)}</span>
        <span>{getStatusIcon(status.database.status)}</span>
        <span>{getStatusIcon(status.network.status)}</span>
        <button 
          onClick={checkHardwareStatus}
          disabled={isChecking}
          className="text-blue-600 hover:text-blue-800 ml-1"
          title="Refresh hardware status"
        >
          {isChecking ? '⟳' : '↻'}
        </button>
      </div>
    )
  }

  // Full view for Admin Panel
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Hardware Status</h3>
        <button 
          onClick={checkHardwareStatus}
          disabled={isChecking}
          className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50"
        >
          {isChecking ? 'Checking...' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-3">
        {/* Barcode Scanner */}
        <div className="flex items-center space-x-3 p-2 bg-gray-50 rounded">
          <span className="text-xl">{getStatusIcon(status.barcodeScanner.status)}</span>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-medium">Barcode Scanner</span>
              <span className={`text-sm font-semibold ${getStatusColor(status.barcodeScanner.status)}`}>
                {status.barcodeScanner.status.toUpperCase()}
              </span>
            </div>
            <div className="text-sm text-gray-600">{status.barcodeScanner.description}</div>
            {status.barcodeScanner.lastScan && (
              <div className="text-xs text-gray-500">Last scan: {status.barcodeScanner.lastScan}</div>
            )}
          </div>
        </div>

        {/* Receipt Printer */}
        <div className="flex items-center space-x-3 p-2 bg-gray-50 rounded">
          <span className="text-xl">{getStatusIcon(status.receiptPrinter.status)}</span>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-medium">Receipt Printer</span>
              <span className={`text-sm font-semibold ${getStatusColor(status.receiptPrinter.status)}`}>
                {status.receiptPrinter.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="text-sm text-gray-600">{status.receiptPrinter.description}</div>
          </div>
        </div>

        {/* Cash Drawer */}
        <div className="flex items-center space-x-3 p-2 bg-gray-50 rounded">
          <span className="text-xl">{getStatusIcon(status.cashDrawer.status)}</span>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-medium">Cash Drawer</span>
              <span className={`text-sm font-semibold ${getStatusColor(status.cashDrawer.status)}`}>
                {status.cashDrawer.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="text-sm text-gray-600">{status.cashDrawer.description}</div>
          </div>
          {status.cashDrawer.status === 'ready' && (
            <button 
              onClick={openCashDrawer}
              disabled={isOpeningDrawer}
              className="px-2 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 disabled:opacity-50"
            >
              {isOpeningDrawer ? '...' : 'Test Open'}
            </button>
          )}
        </div>

        {/* Database */}
        <div className="flex items-center space-x-3 p-2 bg-gray-50 rounded">
          <span className="text-xl">{getStatusIcon(status.database.status)}</span>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-medium">Database</span>
              <span className={`text-sm font-semibold ${getStatusColor(status.database.status)}`}>
                {status.database.status.toUpperCase()}
              </span>
            </div>
            <div className="text-sm text-gray-600">{status.database.description}</div>
          </div>
        </div>

        {/* Network */}
        <div className="flex items-center space-x-3 p-2 bg-gray-50 rounded">
          <span className="text-xl">{getStatusIcon(status.network.status)}</span>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-medium">Network</span>
              <span className={`text-sm font-semibold ${getStatusColor(status.network.status)}`}>
                {status.network.status.toUpperCase()}
              </span>
            </div>
            <div className="text-sm text-gray-600">{status.network.description}</div>
          </div>
        </div>
      </div>

      {showDetails && (
        <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
          <strong>Hardware Notes:</strong>
          <ul className="mt-1 space-y-1 text-xs text-gray-700">
            <li>• Barcode scanner works as USB HID device (plug & play)</li>
            <li>• Cash drawer requires thermal printer connection via RJ11/RJ12</li>
            <li>• Receipt printer enables automatic cash drawer operation</li>
            <li>• System can operate in offline mode with limited functionality</li>
          </ul>
        </div>
      )}
    </Card>
  )
}