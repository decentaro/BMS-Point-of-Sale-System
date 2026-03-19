'use strict'

const { shell, dialog, app } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

function register(ipcMain, bmsApp) {
    ipcMain.handle('open-path', async (event, filePath) => {
        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: 'Path does not exist' }
            }

            const stat = fs.statSync(filePath)
            let result

            if (stat.isDirectory()) {
                result = await shell.openPath(filePath)
            } else {
                result = await shell.openPath(filePath)
                if (result !== '') {
                    result = await shell.showItemInFolder(filePath)
                }
            }

            return result === '' || result === undefined
                ? { success: true }
                : { success: false, error: result }
        } catch (error) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('show-open-dialog', async (event, options) => {
        try {
            if (options.defaultPath) {
                const resolved = options.defaultPath.startsWith('./')
                    ? path.resolve(process.cwd(), options.defaultPath)
                    : options.defaultPath
                const home = os.homedir()
                const userData = app.getPath('userData')
                if (resolved.startsWith(home) || resolved.startsWith(userData)) {
                    options.defaultPath = resolved
                } else {
                    delete options.defaultPath
                }
            }
            return await dialog.showOpenDialog(bmsApp.mainWindow, options)
        } catch (error) {
            return { canceled: true, error: error.message }
        }
    })

    ipcMain.handle('read-file', async (event, filePath) => {
        try {
            const ALLOWED_EXTENSIONS = ['.backup', '.sql', '.gz', '.dump', '.bak']
            const ext = path.extname(filePath).toLowerCase()
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                throw new Error('File type not permitted. Only backup files (.backup, .sql, .gz, .dump, .bak) can be read.')
            }
            const stat = await fs.promises.stat(filePath)
            if (!stat.isFile()) {
                throw new Error('Path is not a regular file.')
            }
            return await fs.promises.readFile(filePath)
        } catch (error) {
            console.error('Failed to read file:', filePath, error)
            throw new Error(`Failed to read file: ${error.message}`)
        }
    })
}

module.exports = { register }
