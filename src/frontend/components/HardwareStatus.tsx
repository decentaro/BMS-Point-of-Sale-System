import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '../contexts/ToastContext'
import {
  ScanBarcode, Printer, Database, Wifi,
  RefreshCw, Cpu, DollarSign
} from 'lucide-react'

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

type StatusTier = 'ok' | 'warn' | 'error' | 'idle'

function getStatusTier(status: string): StatusTier {
  switch (status) {
    case 'active':
    case 'connected':
    case 'ready':
    case 'online':
      return 'ok'
    case 'inactive':
    case 'disconnected':
    case 'waiting_printer':
    case 'offline':
    case 'manual_only':
      return 'warn'
    case 'error':
    case 'not_found':
    case 'limited':
      return 'error'
    default:
      return 'idle'
  }
}

const tierStyles: Record<StatusTier, { dot: string; badge: string; label: string }> = {
  ok:   { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'text-emerald-700' },
  warn: { dot: 'bg-amber-400',   badge: 'bg-amber-50   text-amber-700   border-amber-200',   label: 'text-amber-700'   },
  error:{ dot: 'bg-red-500',     badge: 'bg-red-50     text-red-700     border-red-200',     label: 'text-red-700'     },
  idle: { dot: 'bg-slate-300',   badge: 'bg-slate-50   text-slate-500   border-slate-200',   label: 'text-slate-500'   },
}

const StatusDot = ({ tier }: { tier: StatusTier }) => (
  <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${tierStyles[tier].dot} ${tier === 'ok' ? 'shadow-[0_0_4px_1px_rgba(16,185,129,0.5)]' : ''}`} />
)

const StatusBadge = ({ status, tier }: { status: string; tier: StatusTier }) => (
  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${tierStyles[tier].badge}`}>
    {status.replace(/_/g, ' ')}
  </span>
)

export default function HardwareStatus({ compact = false, showDetails = true }: Props) {
  const { showToast } = useToast()
  const [status, setStatus] = React.useState<HardwareStatus>({
    barcodeScanner: { status: 'inactive', lastScan: undefined, description: 'Checking scanner status...' },
    receiptPrinter: { status: 'not_found', description: 'Checking printer connection...' },
    cashDrawer:     { status: 'waiting_printer', description: 'Cash drawer requires printer connection' },
    database:       { status: 'disconnected', latency: undefined, description: 'Checking database connection...' },
    network:        { status: 'offline', description: 'Checking network status...' },
  })

  const [isChecking, setIsChecking]       = React.useState(false)
  const [isOpeningDrawer, setIsOpeningDrawer] = React.useState(false)

  const checkHardwareStatus = async () => {
    setIsChecking(true)
    try {
      const scannerStatus = await window.electronAPI.checkBarcodeScanner()
      const printerStatus = await window.electronAPI.checkPrinter()
      const dbStatus      = await window.electronAPI.checkDatabase()
      const networkStatus = navigator.onLine ? 'online' : 'offline'

      setStatus(prev => ({
        ...prev,
        barcodeScanner: {
          status: scannerStatus.active ? 'active' : 'inactive',
          lastScan: scannerStatus.lastScan,
          description: scannerStatus.description || (scannerStatus.active ? 'USB HID Scanner - Working' : 'No scanner detected'),
        },
        receiptPrinter: {
          status: printerStatus.connected ? 'connected' : 'not_found',
          model: printerStatus.model,
          description: printerStatus.description || (printerStatus.connected ? `${printerStatus.model || 'Thermal Printer'} - Ready` : 'No thermal printer detected'),
        },
        cashDrawer: {
          status: printerStatus.connected ? 'ready' : 'waiting_printer',
          description: printerStatus.connected ? 'Ready via printer' : 'Requires thermal printer',
        },
        database: {
          status: dbStatus.connected ? 'connected' : 'error',
          latency: dbStatus.latency,
          description: dbStatus.description || (dbStatus.connected ? `Connected — ${dbStatus.latency}ms` : 'Connection failed'),
        },
        network: {
          status: networkStatus,
          description: networkStatus === 'online' ? 'Internet active' : 'No internet connection',
        },
      }))
    } catch (error) {
      console.error('Error checking hardware status:', error)
    } finally {
      setIsChecking(false)
    }
  }

  const openCashDrawer = async () => {
    setIsOpeningDrawer(true)
    try {
      const result = await window.electronAPI.openCashDrawer()
      if (result.success) {
        showToast('Cash drawer opened successfully', 'success')
      } else {
        showToast('Failed to open cash drawer. Please try again.', 'error')
      }
    } catch (error) {
      console.error('Error opening cash drawer:', error)
      showToast('Failed to open cash drawer', 'error')
    } finally {
      setIsOpeningDrawer(false)
    }
  }

  React.useEffect(() => {
    checkHardwareStatus()
    const interval = setInterval(checkHardwareStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  // ── Compact view (POS bar) ──────────────────────────────────────────────
  if (compact) {
    const items = [
      { tier: getStatusTier(status.barcodeScanner.status), icon: ScanBarcode, label: 'Scanner' },
      { tier: getStatusTier(status.receiptPrinter.status), icon: Printer,     label: 'Printer'  },
      { tier: getStatusTier(status.cashDrawer.status),     icon: DollarSign,  label: 'Drawer'   },
      { tier: getStatusTier(status.database.status),       icon: Database,    label: 'DB'        },
      { tier: getStatusTier(status.network.status),        icon: Wifi,        label: 'Network'  },
    ]
    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 rounded text-xs">
        {items.map(({ tier, icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1" title={label}>
            <StatusDot tier={tier} />
            <Icon className={`w-3.5 h-3.5 ${tierStyles[tier].label}`} />
          </div>
        ))}
        <button
          onClick={checkHardwareStatus}
          disabled={isChecking}
          className="ml-1 text-slate-400 hover:text-slate-600 disabled:opacity-40"
          title="Refresh hardware status"
        >
          <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
        </button>
      </div>
    )
  }

  // ── Full view ───────────────────────────────────────────────────────────
  const rows: Array<{
    key: string
    icon: React.ElementType
    label: string
    status: string
    description: string
    sub?: string
    action?: React.ReactNode
  }> = [
    {
      key: 'scanner',
      icon: ScanBarcode,
      label: 'Barcode Scanner',
      status: status.barcodeScanner.status,
      description: status.barcodeScanner.description,
      sub: status.barcodeScanner.lastScan ? `Last scan: ${status.barcodeScanner.lastScan}` : undefined,
    },
    {
      key: 'printer',
      icon: Printer,
      label: 'Receipt Printer',
      status: status.receiptPrinter.status,
      description: status.receiptPrinter.description,
    },
    {
      key: 'drawer',
      icon: DollarSign,
      label: 'Cash Drawer',
      status: status.cashDrawer.status,
      description: status.cashDrawer.description,
      action: status.cashDrawer.status === 'ready' ? (
        <Button
          size="sm"
          variant="outline"
          onClick={openCashDrawer}
          disabled={isOpeningDrawer}
          className="text-xs gap-1.5 flex-shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          {isOpeningDrawer
            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Opening…</>
            : 'Test Open'}
        </Button>
      ) : undefined,
    },
    {
      key: 'db',
      icon: Database,
      label: 'Database',
      status: status.database.status,
      description: status.database.description,
      sub: status.database.latency !== undefined ? `Latency: ${status.database.latency}ms` : undefined,
    },
    {
      key: 'network',
      icon: Wifi,
      label: 'Network',
      status: status.network.status,
      description: status.network.description,
    },
  ]

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 mb-4">
          <Cpu className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <span className="text-sm font-semibold tracking-wide uppercase text-slate-600 flex-1">Hardware Status</span>
          <Button
            variant="outline"
            size="sm"
            onClick={checkHardwareStatus}
            disabled={isChecking}
            className="gap-1.5 text-xs h-7 px-2.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Checking…' : 'Refresh'}
          </Button>
        </div>

        {/* Rows */}
        <div className="space-y-2">
          {rows.map(({ key, icon: Icon, label, status: s, description, sub, action }) => {
            const tier = getStatusTier(s)
            return (
              <div
                key={key}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 bg-white"
              >
                {/* Device icon in colored circle */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  tier === 'ok'    ? 'bg-emerald-50' :
                  tier === 'warn'  ? 'bg-amber-50'   :
                  tier === 'error' ? 'bg-red-50'     :
                                     'bg-slate-100'
                }`}>
                  <Icon className={`w-4 h-4 ${tierStyles[tier].label}`} />
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                    <StatusBadge status={s} tier={tier} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{description}</p>
                  {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
                </div>

                {/* Status dot + optional action */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {action}
                  <StatusDot tier={tier} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Notes */}
        {showDetails && (
          <div className="mt-4 px-3 py-2.5 rounded-lg bg-[hsl(215,65%,30%)]/5 border border-[hsl(215,65%,30%)]/20 text-xs text-[hsl(215,65%,30%)] space-y-1">
            <p className="font-semibold mb-1">Notes</p>
            <p>• Barcode scanner works as USB HID device (plug &amp; play)</p>
            <p>• Cash drawer connects via the receipt printer (RJ11/RJ12)</p>
            <p>• System can operate offline with limited functionality</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
