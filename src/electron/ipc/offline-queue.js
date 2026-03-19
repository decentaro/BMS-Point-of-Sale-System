'use strict'

const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const queuePath           = path.join(app.getPath('userData'), 'sales-queue.json')
const adjustmentQueuePath = path.join(app.getPath('userData'), 'adjustment-queue.json')
const returnQueuePath     = path.join(app.getPath('userData'), 'return-queue.json')
const productCachePath    = path.join(app.getPath('userData'), 'product-cache.json')
const failedSalesPath     = path.join(app.getPath('userData'), 'failed-sales.json')
const failedAdjustmentsPath = path.join(app.getPath('userData'), 'failed-adjustments.json')
const failedReturnsPath   = path.join(app.getPath('userData'), 'failed-returns.json')

const readJson  = (filePath, fallback) => {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return fallback }
}
const writeJson = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

function register(ipcMain) {
    // ── Sales queue ──────────────────────────────────────────────────────────
    ipcMain.handle('queue-transaction', async (event, transaction) => {
        const queue = readJson(queuePath, [])
        queue.push(transaction)
        writeJson(queuePath, queue)
        return { success: true }
    })
    ipcMain.handle('get-queue', async () => readJson(queuePath, []))
    ipcMain.handle('remove-from-queue', async (event, id) => {
        const queue = readJson(queuePath, [])
        writeJson(queuePath, queue.filter(item => item.id !== id))
        return { success: true }
    })

    // ── Product cache ─────────────────────────────────────────────────────────
    ipcMain.handle('save-product-cache', async (event, products) => {
        writeJson(productCachePath, { products, savedAt: new Date().toISOString() })
        return { success: true }
    })
    ipcMain.handle('get-product-cache', async () => readJson(productCachePath, null))

    // ── Adjustment queue ─────────────────────────────────────────────────────
    ipcMain.handle('queue-adjustment', async (event, adjustment) => {
        const queue = readJson(adjustmentQueuePath, [])
        queue.push(adjustment)
        writeJson(adjustmentQueuePath, queue)
        return { success: true }
    })
    ipcMain.handle('get-adjustment-queue', async () => readJson(adjustmentQueuePath, []))
    ipcMain.handle('remove-from-adjustment-queue', async (event, id) => {
        const queue = readJson(adjustmentQueuePath, [])
        writeJson(adjustmentQueuePath, queue.filter(item => item.id !== id))
        return { success: true }
    })

    // ── Failed sales log ─────────────────────────────────────────────────────
    ipcMain.handle('log-failed-sale', async (event, entry) => {
        const log = readJson(failedSalesPath, [])
        log.push(entry)
        writeJson(failedSalesPath, log)
        return { success: true }
    })
    ipcMain.handle('get-failed-sales', async () => readJson(failedSalesPath, []))
    ipcMain.handle('clear-failed-sales', async () => {
        writeJson(failedSalesPath, [])
        return { success: true }
    })

    // ── Return queue ─────────────────────────────────────────────────────────
    ipcMain.handle('queue-return', async (event, ret) => {
        const queue = readJson(returnQueuePath, [])
        queue.push(ret)
        writeJson(returnQueuePath, queue)
        return { success: true }
    })
    ipcMain.handle('get-return-queue', async () => readJson(returnQueuePath, []))
    ipcMain.handle('remove-from-return-queue', async (event, id) => {
        const queue = readJson(returnQueuePath, [])
        writeJson(returnQueuePath, queue.filter(item => item.id !== id))
        return { success: true }
    })

    // ── Failed returns log ───────────────────────────────────────────────────
    ipcMain.handle('log-failed-return', async (event, entry) => {
        const log = readJson(failedReturnsPath, [])
        log.push(entry)
        writeJson(failedReturnsPath, log)
        return { success: true }
    })
    ipcMain.handle('get-failed-returns', async () => readJson(failedReturnsPath, []))
    ipcMain.handle('clear-failed-returns', async () => {
        writeJson(failedReturnsPath, [])
        return { success: true }
    })

    // ── Failed adjustments log ───────────────────────────────────────────────
    ipcMain.handle('log-failed-adjustment', async (event, entry) => {
        const log = readJson(failedAdjustmentsPath, [])
        log.push(entry)
        writeJson(failedAdjustmentsPath, log)
        return { success: true }
    })
    ipcMain.handle('get-failed-adjustments', async () => readJson(failedAdjustmentsPath, []))
    ipcMain.handle('clear-failed-adjustments', async () => {
        writeJson(failedAdjustmentsPath, [])
        return { success: true }
    })
}

module.exports = { register }
