import React, { useEffect, useState } from 'react'
import { WifiOff, RefreshCw, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { useConnection } from '../../contexts/ConnectionContext'

const OfflineBanner: React.FC = () => {
  const { isOnline, isStartingUp, queueCount, adjustmentQueueCount, returnQueueCount, isSyncing, syncProgress, failedSaleCount, failedAdjustmentCount, failedReturnCount, clearFailedSales, clearFailedAdjustments, clearFailedReturns } = useConnection()
  const [showDone, setShowDone] = useState(false)

  // Show "back online" briefly after sync completes
  const prevSyncing = React.useRef(false)
  useEffect(() => {
    if (prevSyncing.current && !isSyncing && isOnline && queueCount === 0) {
      setShowDone(true)
      const t = setTimeout(() => setShowDone(false), 3000)
      return () => clearTimeout(t)
    }
    prevSyncing.current = isSyncing
  }, [isSyncing, isOnline, queueCount])

  const totalQueued = queueCount + adjustmentQueueCount + returnQueueCount
  const totalFailed = failedSaleCount + failedAdjustmentCount + failedReturnCount

  if (isOnline && !isSyncing && !showDone && totalQueued === 0 && totalFailed === 0) return null

  // Neutral startup banner — shown while the API is still booting, before escalating to red
  if (!isOnline && isStartingUp) {
    return (
      <div className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-slate-600 text-white text-[11px] font-semibold py-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Starting up — please wait…
      </div>
    )
  }

  // Failed operations warning — persists until dismissed
  if (isOnline && !isSyncing && !showDone && totalQueued === 0 && totalFailed > 0) {
    const parts: string[] = []
    if (failedSaleCount > 0) parts.push(`${failedSaleCount} sale${failedSaleCount !== 1 ? 's' : ''}`)
    if (failedReturnCount > 0) parts.push(`${failedReturnCount} return${failedReturnCount !== 1 ? 's' : ''}`)
    if (failedAdjustmentCount > 0) parts.push(`${failedAdjustmentCount} adjustment${failedAdjustmentCount !== 1 ? 's' : ''}`)
    return (
      <div className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-orange-500 text-white text-[11px] font-semibold py-1">
        <AlertTriangle className="w-3 h-3" />
        {parts.join(', ')} failed to sync — manager review required
        <button
          onClick={() => { clearFailedSales(); clearFailedAdjustments(); clearFailedReturns() }}
          className="ml-2 underline opacity-80 hover:opacity-100"
        >
          Dismiss
        </button>
      </div>
    )
  }

  if (showDone) {
    return (
      <div className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-emerald-500 text-white text-[11px] font-semibold py-1">
        <CheckCircle className="w-3 h-3" />
        {totalFailed > 0 ? `Back online — ${totalFailed} operation${totalFailed !== 1 ? 's' : ''} failed to sync` : 'Back online — all operations synced'}
      </div>
    )
  }

  if (isSyncing) {
    return (
      <div className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-[11px] font-semibold py-1">
        <RefreshCw className="w-3 h-3 animate-spin" />
        {syncProgress ? `Syncing (${syncProgress.current} of ${syncProgress.total})…` : 'Syncing…'}
      </div>
    )
  }

  // Offline
  const offlineParts: string[] = []
  if (queueCount > 0) offlineParts.push(`${queueCount} sale${queueCount !== 1 ? 's' : ''}`)
  if (returnQueueCount > 0) offlineParts.push(`${returnQueueCount} return${returnQueueCount !== 1 ? 's' : ''}`)
  if (adjustmentQueueCount > 0) offlineParts.push(`${adjustmentQueueCount} adjustment${adjustmentQueueCount !== 1 ? 's' : ''}`)

  return (
    <div className="absolute bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-red-500 text-white text-[11px] font-semibold py-1">
      <WifiOff className="w-3 h-3" />
      {offlineParts.length > 0 ? `Offline — ${offlineParts.join(', ')} queued` : 'Offline — POS running on cached data'}
    </div>
  )
}

export default OfflineBanner
