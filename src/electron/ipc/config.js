'use strict'

function register(ipcMain, apiConfigManager) {
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
}

module.exports = { register }
