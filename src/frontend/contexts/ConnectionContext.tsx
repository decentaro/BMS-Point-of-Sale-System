import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import ApiClient from '../utils/ApiClient'
import CacheService from '../utils/CacheService'

interface ConnectionState {
  isOnline: boolean
  isStartingUp: boolean
  queueCount: number
  adjustmentQueueCount: number
  returnQueueCount: number
  isSyncing: boolean
  syncProgress: { current: number; total: number } | null
  lastOnlineAt: Date | null
  failedSaleCount: number
  failedAdjustmentCount: number
  failedReturnCount: number
}

interface ConnectionContextValue extends ConnectionState {
  refreshQueueCount: () => Promise<void>
  refreshAdjustmentQueueCount: () => Promise<void>
  refreshReturnQueueCount: () => Promise<void>
  refreshFailedCount: () => Promise<void>
  clearFailedSales: () => Promise<void>
  clearFailedAdjustments: () => Promise<void>
  clearFailedReturns: () => Promise<void>
}

const ConnectionContext = createContext<ConnectionContextValue>({
  isOnline: true,
  isStartingUp: false,
  queueCount: 0,
  adjustmentQueueCount: 0,
  returnQueueCount: 0,
  isSyncing: false,
  syncProgress: null,
  lastOnlineAt: null,
  failedSaleCount: 0,
  failedAdjustmentCount: 0,
  failedReturnCount: 0,
  refreshQueueCount: async () => {},
  refreshAdjustmentQueueCount: async () => {},
  refreshReturnQueueCount: async () => {},
  refreshFailedCount: async () => {},
  clearFailedSales: async () => {},
  clearFailedAdjustments: async () => {},
  clearFailedReturns: async () => {},
})

export const useConnection = () => useContext(ConnectionContext)

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline]                           = useState(true)
  const [isStartingUp, setIsStartingUp]                   = useState(true)
  const startupTimerRef                                   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [queueCount, setQueueCount]                       = useState(0)
  const [adjustmentQueueCount, setAdjustmentQueueCount]   = useState(0)
  const [returnQueueCount, setReturnQueueCount]           = useState(0)
  const [isSyncing, setIsSyncing]                         = useState(false)
  const [syncProgress, setSyncProgress]                   = useState<{ current: number; total: number } | null>(null)
  const [lastOnlineAt, setLastOnlineAt]                   = useState<Date | null>(null)
  const [failedSaleCount, setFailedSaleCount]             = useState(0)
  const [failedAdjustmentCount, setFailedAdjustmentCount] = useState(0)
  const [failedReturnCount, setFailedReturnCount]         = useState(0)
  const wasOnlineRef                                      = useRef(true)
  const syncingSalesRef                                   = useRef(false)
  const syncingAdjustmentsRef                             = useRef(false)
  const syncingReturnsRef                                 = useRef(false)

  const refreshQueueCount = useCallback(async () => {
    if (!window.electronAPI?.getQueue) return
    const queue = await window.electronAPI.getQueue()
    setQueueCount(queue.length)
  }, [])

  const refreshAdjustmentQueueCount = useCallback(async () => {
    if (!window.electronAPI?.getAdjustmentQueue) return
    const queue = await window.electronAPI.getAdjustmentQueue()
    setAdjustmentQueueCount(queue.length)
  }, [])

  const refreshReturnQueueCount = useCallback(async () => {
    if (!window.electronAPI?.getReturnQueue) return
    const queue = await window.electronAPI.getReturnQueue()
    setReturnQueueCount(queue.length)
  }, [])

  const refreshFailedCount = useCallback(async () => {
    if (!window.electronAPI?.getFailedSales) return
    const [sales, adjustments, returns] = await Promise.all([
      window.electronAPI.getFailedSales(),
      window.electronAPI.getFailedAdjustments?.() ?? [],
      window.electronAPI.getFailedReturns?.() ?? [],
    ])
    setFailedSaleCount(sales.length)
    setFailedAdjustmentCount(adjustments.length)
    setFailedReturnCount(returns.length)
  }, [])

  const clearFailedSales = useCallback(async () => {
    if (!window.electronAPI?.clearFailedSales) return
    await window.electronAPI.clearFailedSales()
    setFailedSaleCount(0)
  }, [])

  const clearFailedAdjustments = useCallback(async () => {
    if (!window.electronAPI?.clearFailedAdjustments) return
    await window.electronAPI.clearFailedAdjustments()
    setFailedAdjustmentCount(0)
  }, [])

  const clearFailedReturns = useCallback(async () => {
    if (!window.electronAPI?.clearFailedReturns) return
    await window.electronAPI.clearFailedReturns()
    setFailedReturnCount(0)
  }, [])

  const syncQueue = useCallback(async () => {
    if (syncingSalesRef.current) return
    if (!window.electronAPI?.getQueue) return
    const queue = await window.electronAPI.getQueue()
    if (queue.length === 0) return

    syncingSalesRef.current = true
    setIsSyncing(true)
    setSyncProgress({ current: 0, total: queue.length })

    try {
      let processed = 0
      for (const item of queue) {
        try {
          await ApiClient.postJson('/sales', item.saleData, true, { headers: { 'X-Idempotency-Key': item.idempotencyKey ?? item.id } })
          await window.electronAPI.removeFromQueue(item.id)
          processed++
          setSyncProgress({ current: processed, total: queue.length })
          setQueueCount(prev => Math.max(0, prev - 1))
        } catch (error: any) {
          const status: number | undefined = error?.status
          const isPermanent = status !== undefined && status >= 400 && status < 500

          if (isPermanent) {
            await window.electronAPI.logFailedSale({
              id: item.id,
              failedAt: new Date().toISOString(),
              error: error.message ?? `HTTP ${status}`,
              httpStatus: status,
              saleData: item.saleData,
              receiptData: item.receiptData,
            })
            await window.electronAPI.removeFromQueue(item.id)
            processed++
            setSyncProgress({ current: processed, total: queue.length })
            setQueueCount(prev => Math.max(0, prev - 1))
            setFailedSaleCount(prev => prev + 1)
          } else {
            break
          }
        }
      }
    } finally {
      syncingSalesRef.current = false
      setIsSyncing(false)
      setSyncProgress(null)
    }
  }, [])

  const syncReturnQueue = useCallback(async () => {
    if (syncingReturnsRef.current) return
    if (!window.electronAPI?.getReturnQueue) return
    const queue = await window.electronAPI.getReturnQueue()
    if (queue.length === 0) return

    syncingReturnsRef.current = true
    try {
      for (const item of queue) {
        try {
          await ApiClient.postJson('/returns', item.returnData, true, { headers: { 'X-Idempotency-Key': item.idempotencyKey ?? item.id } })
          await window.electronAPI.removeFromReturnQueue(item.id)
          setReturnQueueCount(prev => Math.max(0, prev - 1))
        } catch (error: any) {
          const status: number | undefined = error?.status
          const isPermanent = status !== undefined && status >= 400 && status < 500

          if (isPermanent) {
            await window.electronAPI.logFailedReturn({
              id: item.id,
              failedAt: new Date().toISOString(),
              error: error.message ?? `HTTP ${status}`,
              httpStatus: status,
              transactionId: item.transactionId,
              returnData: item.returnData,
            })
            await window.electronAPI.removeFromReturnQueue(item.id)
            setReturnQueueCount(prev => Math.max(0, prev - 1))
            setFailedReturnCount(prev => prev + 1)
          } else {
            break
          }
        }
      }
    } finally {
      syncingReturnsRef.current = false
    }
  }, [])

  const syncAdjustmentQueue = useCallback(async () => {
    if (syncingAdjustmentsRef.current) return
    if (!window.electronAPI?.getAdjustmentQueue) return
    const queue = await window.electronAPI.getAdjustmentQueue()
    if (queue.length === 0) return

    syncingAdjustmentsRef.current = true
    try {
      for (const item of queue) {
        try {
          await ApiClient.postJson('/stockadjustments', item.adjustmentData, true, { headers: { 'X-Idempotency-Key': item.id } })
          await window.electronAPI.removeFromAdjustmentQueue(item.id)
          setAdjustmentQueueCount(prev => Math.max(0, prev - 1))
        } catch (error: any) {
          const status: number | undefined = error?.status
          const isPermanent = status !== undefined && status >= 400 && status < 500

          if (isPermanent) {
            await window.electronAPI.logFailedAdjustment({
              id: item.id,
              failedAt: new Date().toISOString(),
              error: error.message ?? `HTTP ${status}`,
              httpStatus: status,
              productName: item.productName,
              adjustmentData: item.adjustmentData,
            })
            await window.electronAPI.removeFromAdjustmentQueue(item.id)
            setAdjustmentQueueCount(prev => Math.max(0, prev - 1))
            setFailedAdjustmentCount(prev => prev + 1)
          } else {
            break
          }
        }
      }
    } finally {
      syncingAdjustmentsRef.current = false
    }
  }, [])

  // Initial state + queue count + initial cache warm
  useEffect(() => {
    const init = async () => {
      // Load terminal identity so every API request carries X-Terminal-Id
      if (window.electronAPI?.getTerminalConfig) {
        const terminalConfig = await window.electronAPI.getTerminalConfig()
        if (terminalConfig?.terminalId) {
          ApiClient.setTerminalId(terminalConfig.terminalId, terminalConfig.terminalName ?? null)
        }
      }

      // Give the API up to 25 seconds to start before showing the red offline banner.
      startupTimerRef.current = setTimeout(() => setIsStartingUp(false), 25000)

      if (window.electronAPI?.getConnectivity) {
        const { online } = await window.electronAPI.getConnectivity()
        setIsOnline(online)
        ApiClient.setOnline(online)
        wasOnlineRef.current = online
        // Don't clear isStartingUp here — getConnectivity returns the cached initial
        // value (always true) before the first real check runs. Only clear it once a
        // real connectivity-changed event confirms we're actually up.
        if (online) {
          setLastOnlineAt(new Date())
          CacheService.warmAll()
        }
      }
      await refreshQueueCount()
      await refreshAdjustmentQueueCount()
      await refreshReturnQueueCount()
      await refreshFailedCount()
    }
    init()
  }, [refreshQueueCount, refreshAdjustmentQueueCount, refreshReturnQueueCount, refreshFailedCount])

  // Listen for connectivity changes from main process
  useEffect(() => {
    if (!window.electronAPI?.onConnectivityChange) return
    const cleanup = window.electronAPI.onConnectivityChange(({ online }) => {
      setIsOnline(online)
      ApiClient.setOnline(online)
      if (online) {
        setIsStartingUp(false)
        if (startupTimerRef.current) clearTimeout(startupTimerRef.current)
        setLastOnlineAt(new Date())
        if (!wasOnlineRef.current) {
          syncQueue()
          syncAdjustmentQueue()
          syncReturnQueue()
          CacheService.warmAll()
        }
      }
      wasOnlineRef.current = online
    })
    return cleanup
  }, [syncQueue, syncAdjustmentQueue, syncReturnQueue])

  // Warm cache on login event
  useEffect(() => {
    const onLogin = () => { if (ApiClient.online) CacheService.warmAll() }
    window.addEventListener('bms:logged-in', onLogin)
    return () => window.removeEventListener('bms:logged-in', onLogin)
  }, [])

  // Refresh cache every 2 minutes while online so stock changes from other terminals propagate quickly
  useEffect(() => {
    const interval = setInterval(() => {
      if (ApiClient.online) CacheService.warmAll()
    }, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <ConnectionContext.Provider value={{
      isOnline, isStartingUp, queueCount, adjustmentQueueCount, returnQueueCount, isSyncing, syncProgress, lastOnlineAt,
      failedSaleCount, failedAdjustmentCount, failedReturnCount,
      refreshQueueCount, refreshAdjustmentQueueCount, refreshReturnQueueCount, refreshFailedCount,
      clearFailedSales, clearFailedAdjustments, clearFailedReturns
    }}>
      {children}
    </ConnectionContext.Provider>
  )
}
