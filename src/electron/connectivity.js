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

        stop() {
            if (this.timer) {
                clearInterval(this.timer)
                this.timer = null
            }
        },

        sendToRenderer(payload) {
            const win = bmsApp.mainWindow
            if (win && !win.isDestroyed()) {
                win.webContents.send('connectivity-changed', payload)
            }
        },

        async check() {
            try {
                const res = await fetch('http://localhost:5002/api/tax-settings', {
                    signal: AbortSignal.timeout(3000)
                })
                const nowOnline = res.ok
                if (nowOnline !== this.isOnline) {
                    this.isOnline = nowOnline
                    this.sendToRenderer({ online: this.isOnline })
                }
            } catch {
                if (this.isOnline) {
                    this.isOnline = false
                    this.sendToRenderer({ online: false })
                }
            }
        }
    }
}

module.exports = { createConnectivityMonitor }
