'use strict'

const { shell, dialog, app } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

function register(ipcMain, bmsApp) {
    ipcMain.handle('open-path', async (event, filePath) => {
        try {
            // Restrict to home directory to prevent opening arbitrary system paths
            const resolvedPath = path.resolve(filePath)
            const homeDir = os.homedir()
            if (!resolvedPath.startsWith(homeDir + path.sep) && resolvedPath !== homeDir) {
                return { success: false, error: 'Access denied: path is outside the allowed directory' }
            }

            if (!fs.existsSync(resolvedPath)) {
                return { success: false, error: 'Path does not exist' }
            }

            const stat = fs.statSync(resolvedPath)

            // Exit fullscreen so the external window isn't hidden behind the app.
            if (bmsApp.mainWindow?.isFullScreen()) {
                bmsApp.mainWindow.setFullScreen(false)
                await new Promise(r => setTimeout(r, 300))
            }

            let result
            if (stat.isDirectory()) {
                result = await shell.openPath(resolvedPath)
            } else {
                result = await shell.openPath(resolvedPath)
                if (result !== '') {
                    result = await shell.showItemInFolder(resolvedPath)
                }
            }

            return result === '' || result === undefined
                ? { success: true }
                : { success: false, error: result }
        } catch {
            return { success: false, error: 'Failed to open path' }
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
                    // Walk up to the nearest existing directory so GTK doesn't ignore it
                    let dir = resolved
                    while (dir && dir !== path.dirname(dir)) {
                        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) break
                        dir = path.dirname(dir)
                    }
                    options.defaultPath = dir || resolved
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
            // Restrict to home directory or app userData — same policy as show-open-dialog
            const resolved = path.resolve(filePath)
            const home = os.homedir()
            const userData = app.getPath('userData')
            if (!resolved.startsWith(home) && !resolved.startsWith(userData)) {
                throw new Error('Access denied: file is outside permitted directories.')
            }
            const stat = await fs.promises.stat(resolved)
            if (!stat.isFile()) {
                throw new Error('Path is not a regular file.')
            }
            return await fs.promises.readFile(resolved)
        } catch (error) {
            console.error('Failed to read file:', filePath, error)
            throw new Error(`Failed to read file: ${error.message}`)
        }
    })
}

module.exports = { register }
