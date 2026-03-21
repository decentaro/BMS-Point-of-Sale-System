'use strict'

function register(ipcMain, apiConfigManager, terminalConfigManager) {
    ipcMain.handle('get-api-config', async () => {
        return apiConfigManager.getConfig()
    })

    ipcMain.handle('set-api-config', async (event, config) => {
        try {
            const updatedConfig = apiConfigManager.updateConfig(config)
            console.log('API config updated via IPC:', updatedConfig)
            return updatedConfig
        } catch (error) {
            console.error('Failed to update API config:', error)
            throw error
        }
    })

    ipcMain.handle('get-terminal-config', async () => {
        return terminalConfigManager.getConfig()
    })

    ipcMain.handle('set-terminal-config', async (event, config) => {
        try {
            const updatedConfig = terminalConfigManager.updateConfig(config)
            console.log('Terminal config updated via IPC:', updatedConfig)
            return updatedConfig
        } catch (error) {
            console.error('Failed to update terminal config:', error)
            throw error
        }
    })
}

module.exports = { register }
