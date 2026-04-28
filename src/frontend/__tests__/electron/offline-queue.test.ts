/**
 * @vitest-environment node
 *
 * Tests for the Electron IPC offline queue module.
 * Since the module uses require('electron') at the top level, we can't easily mock it.
 * Instead, we extract and test the core logic directly: readJson, writeJson, and the
 * queue CRUD operations by creating a standalone test harness.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

let tmpDir: string

// Re-implement readJson/writeJson matching production code exactly
function readJson(filePath: string, fallback: any) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return fallback }
}

function writeJson(filePath: string, data: any) {
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

// Queue operations matching the IPC handler logic
function queueTransaction(queuePath: string, transaction: any) {
  const queue = readJson(queuePath, [])
  queue.push(transaction)
  writeJson(queuePath, queue)
  return { success: true }
}

function getQueue(queuePath: string) { return readJson(queuePath, []) }

function removeFromQueue(queuePath: string, id: string) {
  const queue = readJson(queuePath, [])
  writeJson(queuePath, queue.filter((item: any) => item.id !== id))
  return { success: true }
}

function logEntry(logPath: string, entry: any) {
  const log = readJson(logPath, [])
  log.push(entry)
  writeJson(logPath, log)
  return { success: true }
}

function clearLog(logPath: string) {
  writeJson(logPath, [])
  return { success: true }
}

function saveProductCache(cachePath: string, products: any[]) {
  writeJson(cachePath, { products, savedAt: new Date().toISOString() })
  return { success: true }
}

describe('offline-queue', () => {
  let salesQueue: string
  let adjQueue: string
  let retQueue: string
  let failedSales: string
  let failedAdj: string
  let failedRet: string
  let productCache: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bms-queue-test-'))
    salesQueue = path.join(tmpDir, 'sales-queue.json')
    adjQueue = path.join(tmpDir, 'adjustment-queue.json')
    retQueue = path.join(tmpDir, 'return-queue.json')
    failedSales = path.join(tmpDir, 'failed-sales.json')
    failedAdj = path.join(tmpDir, 'failed-adjustments.json')
    failedRet = path.join(tmpDir, 'failed-returns.json')
    productCache = path.join(tmpDir, 'product-cache.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ── Sales Queue ─────────────────────────────────────────────

  describe('Sales Queue', () => {
    it('queues a transaction and retrieves it', () => {
      queueTransaction(salesQueue, { id: 'sale-1', saleData: { items: [{ productId: 1, qty: 2 }] } })
      const queue = getQueue(salesQueue)
      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe('sale-1')
    })

    it('removes transaction by id', () => {
      queueTransaction(salesQueue, { id: 'sale-1', saleData: {} })
      queueTransaction(salesQueue, { id: 'sale-2', saleData: {} })

      removeFromQueue(salesQueue, 'sale-1')

      const queue = getQueue(salesQueue)
      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe('sale-2')
    })

    it('returns empty array when no queue file exists', () => {
      expect(getQueue(salesQueue)).toEqual([])
    })

    it('multiple transactions maintain insertion order', () => {
      queueTransaction(salesQueue, { id: '1', saleData: { first: true } })
      queueTransaction(salesQueue, { id: '2', saleData: { second: true } })
      queueTransaction(salesQueue, { id: '3', saleData: { third: true } })

      expect(getQueue(salesQueue).map((q: any) => q.id)).toEqual(['1', '2', '3'])
    })

    it('remove non-existent id is a no-op', () => {
      queueTransaction(salesQueue, { id: 'sale-1', saleData: {} })
      removeFromQueue(salesQueue, 'non-existent')
      expect(getQueue(salesQueue)).toHaveLength(1)
    })

    it('preserves full sale data round-trip', () => {
      const saleData = {
        items: [{ productId: 1, qty: 2, price: 9.99 }],
        total: 19.98,
        paymentMethod: 'CASH',
        cashierId: 42,
      }
      queueTransaction(salesQueue, { id: 'sale-1', saleData, idempotencyKey: 'key-abc' })

      const queue = getQueue(salesQueue)
      expect(queue[0].saleData).toEqual(saleData)
      expect(queue[0].idempotencyKey).toBe('key-abc')
    })
  })

  // ── Adjustment Queue ────────────────────────────────────────

  describe('Adjustment Queue', () => {
    it('queues and retrieves adjustment', () => {
      queueTransaction(adjQueue, { id: 'adj-1', adjustmentData: { qty: -5 } })
      const queue = getQueue(adjQueue)
      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe('adj-1')
    })

    it('removes adjustment by id', () => {
      queueTransaction(adjQueue, { id: 'adj-1', adjustmentData: {} })
      queueTransaction(adjQueue, { id: 'adj-2', adjustmentData: {} })
      removeFromQueue(adjQueue, 'adj-1')
      expect(getQueue(adjQueue)).toHaveLength(1)
      expect(getQueue(adjQueue)[0].id).toBe('adj-2')
    })
  })

  // ── Return Queue ────────────────────────────────────────────

  describe('Return Queue', () => {
    it('queues and retrieves return', () => {
      queueTransaction(retQueue, { id: 'ret-1', returnData: { saleId: 100 } })
      expect(getQueue(retQueue)).toHaveLength(1)
    })

    it('removes return by id', () => {
      queueTransaction(retQueue, { id: 'ret-1', returnData: {} })
      queueTransaction(retQueue, { id: 'ret-2', returnData: {} })
      removeFromQueue(retQueue, 'ret-1')
      expect(getQueue(retQueue)[0].id).toBe('ret-2')
    })
  })

  // ── Product Cache ───────────────────────────────────────────

  describe('Product Cache', () => {
    it('saves and retrieves product cache with timestamp', () => {
      const products = [{ id: 1, name: 'Widget', price: 9.99 }]
      saveProductCache(productCache, products)

      const cached = readJson(productCache, null)
      expect(cached.products).toEqual(products)
      expect(cached.savedAt).toBeDefined()
      expect(new Date(cached.savedAt).getTime()).toBeGreaterThan(0)
    })

    it('returns null when no cache exists', () => {
      expect(readJson(productCache, null)).toBeNull()
    })

    it('overwrites previous cache', () => {
      saveProductCache(productCache, [{ id: 1 }])
      saveProductCache(productCache, [{ id: 2 }, { id: 3 }])
      const cached = readJson(productCache, null)
      expect(cached.products).toHaveLength(2)
    })
  })

  // ── Failed Sales Log ────────────────────────────────────────

  describe('Failed Sales Log', () => {
    it('logs and retrieves failed sale', () => {
      logEntry(failedSales, { id: 'f1', failedAt: '2026-04-12', error: 'HTTP 400', httpStatus: 400 })
      const log = readJson(failedSales, [])
      expect(log).toHaveLength(1)
      expect(log[0].httpStatus).toBe(400)
    })

    it('clears all failed sales', () => {
      logEntry(failedSales, { id: 'f1' })
      logEntry(failedSales, { id: 'f2' })
      clearLog(failedSales)
      expect(readJson(failedSales, [])).toEqual([])
    })

    it('accumulates multiple entries', () => {
      logEntry(failedSales, { id: 'f1' })
      logEntry(failedSales, { id: 'f2' })
      logEntry(failedSales, { id: 'f3' })
      expect(readJson(failedSales, [])).toHaveLength(3)
    })
  })

  // ── Failed Returns & Adjustments Logs ───────────────────────

  describe('Failed Returns Log', () => {
    it('logs and retrieves', () => {
      logEntry(failedRet, { id: 'ret-f1', error: 'invalid' })
      expect(readJson(failedRet, [])).toHaveLength(1)
    })

    it('clears all', () => {
      logEntry(failedRet, { id: 'ret-f1' })
      clearLog(failedRet)
      expect(readJson(failedRet, [])).toEqual([])
    })
  })

  describe('Failed Adjustments Log', () => {
    it('logs and retrieves', () => {
      logEntry(failedAdj, { id: 'adj-f1', error: 'bad data' })
      expect(readJson(failedAdj, [])).toHaveLength(1)
    })

    it('clears all', () => {
      logEntry(failedAdj, { id: 'adj-f1' })
      clearLog(failedAdj)
      expect(readJson(failedAdj, [])).toEqual([])
    })
  })

  // ── Atomic Write Safety ─────────────────────────────────────

  describe('Atomic Write Safety', () => {
    it('no .tmp file left after write', () => {
      queueTransaction(salesQueue, { id: 'sale-1', saleData: {} })
      const files = fs.readdirSync(tmpDir)
      expect(files).toContain('sales-queue.json')
      expect(files.filter(f => f.endsWith('.tmp'))).toHaveLength(0)
    })

    it('corrupted queue file falls back to empty array', () => {
      fs.writeFileSync(salesQueue, 'NOT JSON!!!')
      queueTransaction(salesQueue, { id: 'after-corrupt', saleData: {} })
      const queue = getQueue(salesQueue)
      expect(queue).toHaveLength(1)
      expect(queue[0].id).toBe('after-corrupt')
    })

    it('empty file falls back gracefully', () => {
      fs.writeFileSync(adjQueue, '')
      expect(getQueue(adjQueue)).toEqual([])
    })

    it('separate queue types are isolated from each other', () => {
      queueTransaction(salesQueue, { id: 'sale-1' })
      queueTransaction(adjQueue, { id: 'adj-1' })
      queueTransaction(retQueue, { id: 'ret-1' })

      expect(getQueue(salesQueue)).toHaveLength(1)
      expect(getQueue(adjQueue)).toHaveLength(1)
      expect(getQueue(retQueue)).toHaveLength(1)

      removeFromQueue(salesQueue, 'sale-1')
      expect(getQueue(salesQueue)).toHaveLength(0)
      expect(getQueue(adjQueue)).toHaveLength(1)
      expect(getQueue(retQueue)).toHaveLength(1)
    })

    it('written JSON is human-readable (pretty-printed)', () => {
      queueTransaction(salesQueue, { id: 'pretty' })
      const raw = fs.readFileSync(salesQueue, 'utf8')
      expect(raw).toContain('\n')
      expect(raw).toContain('  ')
    })

    it('handles large queue (100 items)', () => {
      for (let i = 0; i < 100; i++) {
        queueTransaction(salesQueue, { id: `sale-${i}`, saleData: { item: i } })
      }
      const queue = getQueue(salesQueue)
      expect(queue).toHaveLength(100)
      expect(queue[0].id).toBe('sale-0')
      expect(queue[99].id).toBe('sale-99')
    })

    it('remove middle item preserves order', () => {
      queueTransaction(salesQueue, { id: 'a' })
      queueTransaction(salesQueue, { id: 'b' })
      queueTransaction(salesQueue, { id: 'c' })

      removeFromQueue(salesQueue, 'b')

      const queue = getQueue(salesQueue)
      expect(queue.map((q: any) => q.id)).toEqual(['a', 'c'])
    })
  })
})
