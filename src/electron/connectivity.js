'use strict'

function createConnectivityMonitor(bmsApp) {
    return {
        isOnline: true,
        timer: null,

        start() {
            this.timer = setInterval(() => this.check(), 5000)
            // Run an immediate check after 3s (give API time to start)
            setTimeout(() => this.check(), 3000)
        },

        async check() {
            try {
                const res = await fetch('http://localhost:5002/api/tax-settings', {
                    signal: AbortSignal.timeout(3000)
                })
                const nowOnline = res.ok
                if (nowOnline !== this.isOnline) {
                    this.isOnline = nowOnline
                    if (bmsApp.mainWindow) {
                        bmsApp.mainWindow.webContents.send('connectivity-changed', { online: this.isOnline })
                    }
                }
            } catch {
                if (this.isOnline) {
                    this.isOnline = false
                    if (bmsApp.mainWindow) {
                        bmsApp.mainWindow.webContents.send('connectivity-changed', { online: false })
                    }
                }
            }
        }
    }
}

module.exports = { createConnectivityMonitor }
