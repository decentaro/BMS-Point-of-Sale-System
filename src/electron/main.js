const { app, BrowserWindow, Menu, screen, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const { autoUpdater } = require('electron-updater');

// API Configuration - Runtime configurable
class ApiConfigManager {
    constructor() {
        const envUrl = process.env.VITE_API_BASE_URL ||
                       process.env.REACT_APP_API_BASE_URL ||
                       process.env.BMS_POS_API_BASE_URL;
        this.config = {
            baseUrl: this.isValidApiUrl(envUrl) ? envUrl : 'http://localhost:5002/api',
            timeout: 30000
        }
        this.loadConfigFromFile()
    }

    // Only allow localhost/127.0.0.1 — prevents env-var hijacking to a remote host
    isValidApiUrl(url) {
        if (!url) return false;
        try {
            const parsed = new URL(url);
            return (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
                && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
        } catch { return false; }
    }

    loadConfigFromFile() {
        try {
            const configPath = path.join(app.getPath('userData'), 'api-config.json')
            const fs = require('fs')
            if (fs.existsSync(configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
                if (fileConfig.baseUrl && !this.isValidApiUrl(fileConfig.baseUrl)) {
                    console.warn('Ignoring invalid API URL from config file:', fileConfig.baseUrl)
                    delete fileConfig.baseUrl
                }
                this.config = { ...this.config, ...fileConfig }
                console.log('Loaded API config from file:', this.config)
            }
        } catch (error) {
            console.warn('Failed to load API config from file:', error.message)
        }
    }

    saveConfigToFile() {
        try {
            const configPath = path.join(app.getPath('userData'), 'api-config.json')
            require('fs').writeFileSync(configPath, JSON.stringify(this.config, null, 2))
            console.log('Saved API config to file:', this.config)
        } catch (error) {
            console.error('Failed to save API config to file:', error.message)
        }
    }

    getConfig() {
        return { ...this.config }
    }

    updateConfig(newConfig) {
        if (newConfig.baseUrl && !this.isValidApiUrl(newConfig.baseUrl)) {
            throw new Error(`Invalid API URL: only localhost/127.0.0.1 is permitted. Got: ${newConfig.baseUrl}`)
        }
        this.config = { ...this.config, ...newConfig }
        this.saveConfigToFile()
        return this.getConfig()
    }
}

const apiConfigManager = new ApiConfigManager()

// Terminal Configuration — persists terminal identity across restarts
class TerminalConfigManager {
    constructor() {
        this.config = { terminalId: null, terminalName: null }
        this.loadConfig()
    }

    loadConfig() {
        try {
            const configPath = path.join(app.getPath('userData'), 'terminal-config.json')
            const fs = require('fs')
            if (fs.existsSync(configPath)) {
                this.config = { ...this.config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) }
                console.log('Loaded terminal config:', this.config)
            }
        } catch (error) {
            console.warn('Failed to load terminal config:', error.message)
        }
    }

    saveConfig() {
        try {
            const configPath = path.join(app.getPath('userData'), 'terminal-config.json')
            require('fs').writeFileSync(configPath, JSON.stringify(this.config, null, 2))
        } catch (error) {
            console.error('Failed to save terminal config:', error.message)
        }
    }

    getConfig() { return { ...this.config } }

    updateConfig(newConfig) {
        if (newConfig.terminalId !== undefined && typeof newConfig.terminalId !== 'string')
            throw new Error('terminalId must be a string')
        this.config = { ...this.config, ...newConfig }
        this.saveConfig()
        return this.getConfig()
    }
}

const terminalConfigManager = new TerminalConfigManager()

// Manages the .NET API child process in packaged mode
class ApiProcessManager {
    constructor() {
        this.process = null
    }

    // Returns the path to the self-contained API binary bundled with the package.
    getBinaryPath() {
        const ext = process.platform === 'win32' ? '.exe' : ''
        return path.join(process.resourcesPath, 'api', `BMS_POS_API${ext}`)
    }

    // Reads DB credentials from userData/.env (packaged) or appPath/.env (dev).
    getEnvVars() {
        const envVars = { ...process.env }
        try {
            const dotenvPath = app.isPackaged
                ? path.join(app.getPath('userData'), '.env')
                : path.join(app.getAppPath(), '.env')
            if (fs.existsSync(dotenvPath)) {
                for (const line of fs.readFileSync(dotenvPath, 'utf8').split('\n')) {
                    const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
                    if (match) envVars[match[1].trim()] = match[2].trim()
                }
            }
        } catch {}
        return envVars
    }

    hasCredentials(envVars) {
        const pw = envVars.BMS_DB_PASSWORD || ''
        const sv = envVars.BMS_DB_SERVER   || ''
        const isPlaceholder = s => !s || s.startsWith('your_')
        return !isPlaceholder(pw) && !isPlaceholder(sv)
    }

    // Start the bundled API binary. No-op in dev mode (dev.sh handles it).
    start() {
        if (!app.isPackaged) return
        const bin = this.getBinaryPath()
        if (!fs.existsSync(bin)) {
            console.warn('[API] Binary not found at', bin)
            return
        }
        const envVars = this.getEnvVars()
        if (!this.hasCredentials(envVars)) {
            console.log('[API] No credentials yet — setup wizard will start the API after configuration')
            return
        }
        // Ensure the binary is executable (AppImage may strip the bit)
        try { fs.chmodSync(bin, 0o755) } catch {}

        // CWD must be writable (logs/, uploads/ are created relative to it).
        // AppImage mount is read-only, so use userData as the working directory.
        // ASPNETCORE_CONTENTROOT tells ASP.NET Core where appsettings.json lives
        // (the binary's directory inside the AppImage mount — read access is fine).
        const apiRuntime = app.isPackaged
            ? path.join(app.getPath('userData'), 'api-runtime')
            : path.dirname(bin)
        try { fs.mkdirSync(apiRuntime, { recursive: true }) } catch {}
        envVars.ASPNETCORE_CONTENTROOT = path.dirname(bin)

        console.log('[API] Spawning', bin)
        console.log('[API] CWD (writable):', apiRuntime)
        console.log('[API] ContentRoot (appsettings):', path.dirname(bin))
        this.process = spawn(bin, ['--urls', 'http://localhost:5002'], {
            env: envVars,
            cwd: apiRuntime,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false,
        })
        this.process.stdout?.on('data', d => console.log('[API]', d.toString().trimEnd()))
        this.process.stderr?.on('data', d => console.error('[API]', d.toString().trimEnd()))
        this.process.on('exit', code => {
            console.log(`[API] Exited with code ${code}`)
            this.process = null
        })
    }

    stop() {
        if (this.process) {
            console.log('[API] Stopping')
            this.process.kill()
            this.process = null
        }
    }

    waitForReady(maxMs = 120000) {
        return new Promise(resolve => {
            const deadline = Date.now() + maxMs
            const check = () => {
                const sock = net.createConnection(5002, '127.0.0.1')
                sock.on('connect', () => { sock.destroy(); resolve(true) })
                sock.on('error', () => {
                    if (Date.now() < deadline) setTimeout(check, 2000)
                    else resolve(false)
                })
            }
            setTimeout(check, 3000)
        })
    }

    // Kill, clear port, restart, wait for ready. Used by setup wizard after credential save.
    async restart() {
        this.stop()
        try { execFileSync('fuser', ['-k', '5002/tcp'], { stdio: 'ignore' }) } catch {}
        await new Promise(r => setTimeout(r, 1000))
        this.start()
        return this.waitForReady()
    }
}

const apiProcessManager = new ApiProcessManager()

// ── Auto-updater ──────────────────────────────────────────────────────────────
function setupAutoUpdater() {
    if (!app.isPackaged) return  // skip in dev — no release channel to check

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    const send = (event, payload) => {
        bmsApp.mainWindow?.webContents?.send('updater-status', { event, ...payload })
    }

    autoUpdater.on('checking-for-update', () => {
        console.log('[Updater] Checking for updates...')
        send('checking')
    })

    autoUpdater.on('update-available', info => {
        console.log('[Updater] Update available:', info.version)
        const notes = Array.isArray(info.releaseNotes)
            ? info.releaseNotes.map(n => n.note).filter(Boolean).join('\n\n')
            : (info.releaseNotes || '')
        send('available', { version: info.version, releaseNotes: notes })
    })

    autoUpdater.on('update-not-available', () => {
        console.log('[Updater] Already up to date')
        send('up-to-date')
    })

    autoUpdater.on('download-progress', progress => {
        console.log(`[Updater] Downloading... ${Math.round(progress.percent)}%`)
        send('downloading', { percent: Math.round(progress.percent) })
    })

    autoUpdater.on('update-downloaded', info => {
        console.log('[Updater] Update downloaded:', info.version)
        send('ready', { version: info.version })
    })

    autoUpdater.on('error', err => {
        console.error('[Updater] Error:', err.message)
        send('error', { message: err.message })
    })
}

// ── Manual update check (IPC) ─────────────────────────────────────────────────
ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged) return { message: 'Update checks disabled in dev mode' }
    try {
        await autoUpdater.checkForUpdates()
        return { success: true }
    } catch (err) {
        return { success: false, error: err.message }
    }
})

// Enable hot reload for development
if (process.argv.includes('--dev')) {
    require('electron-reload')(path.join(__dirname, '..'), {
        electron: path.join(__dirname, '..', '..', 'node_modules', '.bin', 'electron'),
        hardResetMethod: 'exit'
    });
}

class BMSApp {
    constructor() {
        this.mainWindow = null;
    }

    createWindow() {
        const isDev = process.argv.includes('--dev');

        const displays = screen.getAllDisplays();
        console.log('Available displays:', displays.map(d => ({
            id: d.id,
            bounds: d.bounds,
            size: `${d.bounds.width}x${d.bounds.height}`,
            primary: d === screen.getPrimaryDisplay()
        })));

        let targetDisplay = null;
        const displayArg = process.argv.find(arg => arg.startsWith('--display='));
        const envDisplayIndex = process.env.BMS_DISPLAY_INDEX ? parseInt(process.env.BMS_DISPLAY_INDEX) : NaN;
        if (displayArg) {
            const displayIndex = parseInt(displayArg.split('=')[1]);
            if (Number.isFinite(displayIndex) && displayIndex >= 0 && displayIndex < displays.length) {
                targetDisplay = displays[displayIndex];
                console.log(`Using specified display via arg ${displayIndex}:`, targetDisplay.bounds);
            }
        }
        if (!targetDisplay && Number.isFinite(envDisplayIndex) && envDisplayIndex >= 0 && envDisplayIndex < displays.length) {
            targetDisplay = displays[envDisplayIndex];
            console.log(`Using specified display via env ${envDisplayIndex}:`, targetDisplay.bounds);
        }
        if (!targetDisplay) {
            targetDisplay = displays.reduce((smallest, d) => {
                const area = d.bounds.width * d.bounds.height;
                const smallestArea = smallest.bounds.width * smallest.bounds.height;
                return area < smallestArea ? d : smallest;
            }, displays[0]);
            console.log('Using smallest display by area:', targetDisplay.bounds);
        }

        let windowWidth, windowHeight;
        if (isDev) {
            windowWidth = Math.min(1200, targetDisplay.bounds.width * 0.8);
            windowHeight = Math.min(800, targetDisplay.bounds.height * 0.8);
        } else {
            windowWidth = targetDisplay.bounds.width;
            windowHeight = targetDisplay.bounds.height;
        }
        const centeredX = targetDisplay.bounds.x + Math.max(0, Math.floor((targetDisplay.bounds.width - windowWidth) / 2));
        const centeredY = targetDisplay.bounds.y + Math.max(0, Math.floor((targetDisplay.bounds.height - windowHeight) / 2));

        this.mainWindow = new BrowserWindow({
            width: windowWidth,
            height: windowHeight,
            x: centeredX,
            y: centeredY,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                webSecurity: true
            },
            frame: true,
            resizable: true,
            fullscreen: false,
            kiosk: false,
            alwaysOnTop: !isDev,
            skipTaskbar: !isDev,
            autoHideMenuBar: true,
            useContentSize: true,
            enableLargerThanScreen: true
        });

        if (isDev) {
            let devUrl = process.env.BMS_VITE_URL || 'http://127.0.0.1:3001';
            if (!devUrl.endsWith('/')) devUrl += '/';
            const devIndex = devUrl + 'index.html';
            console.log('Loading DEV URL in BrowserWindow:', devIndex);
            this.mainWindow.loadURL(devIndex);
        } else {
            const prodIndex = path.join(__dirname, '../../dist/index.html');
            console.log('Loading PROD index file in BrowserWindow:', prodIndex);
            this.mainWindow.loadFile(prodIndex);
        }

        this.mainWindow.once('ready-to-show', () => {
            try {
                this.mainWindow.setBounds({ x: centeredX, y: centeredY, width: windowWidth, height: windowHeight });
            } catch (e) {
                console.warn('Failed to set bounds before show', e);
            }
            this.mainWindow.show();
            if (!isDev) {
                try {
                    this.mainWindow.setFullScreen(true);
                    this.mainWindow.setKiosk(true);
                } catch (e) {
                    console.warn('Failed to enable fullscreen/kiosk', e);
                }
            } else {
                console.log('Development mode: Window is resizable for responsive design testing');
            }
        });

        setTimeout(() => {
            if (this.mainWindow && !this.mainWindow.isVisible()) {
                console.log('Forcing window to show after timeout');
                this.mainWindow.show();
            }
        }, 5000);

        if (process.argv.includes('--dev')) {
            this.mainWindow.webContents.openDevTools();
        }

        if (!isDev) {
            this.mainWindow.webContents.on('context-menu', (e, params) => {
                if (!params.isEditable) e.preventDefault();
            });
        }

        this.mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.control && input.shift && input.key.toLowerCase() === 'q') app.quit();
            if (input.key === 'F11') this.mainWindow?.setFullScreen(!this.mainWindow?.isFullScreen());
            if (input.control && input.shift && input.key.toLowerCase() === 'm') this.moveToNextDisplay();
            if (input.key === 'F12' && !isDev) event.preventDefault();
        });

        this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            console.error('Renderer failed to load:', { errorCode, errorDescription, validatedURL });
        });

        this.mainWindow.webContents.on('did-finish-load', () => {
            console.log('Renderer finished loading');
        });

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
    }

    moveToNextDisplay() {
        if (!this.mainWindow) return;
        const displays = screen.getAllDisplays();
        const currentBounds = this.mainWindow.getBounds();
        let currentDisplayIndex = 0;
        for (let i = 0; i < displays.length; i++) {
            const display = displays[i];
            if (currentBounds.x >= display.bounds.x &&
                currentBounds.x < display.bounds.x + display.bounds.width) {
                currentDisplayIndex = i;
                break;
            }
        }
        const nextDisplayIndex = (currentDisplayIndex + 1) % displays.length;
        const nextDisplay = displays[nextDisplayIndex];
        console.log(`Moving from display ${currentDisplayIndex} to display ${nextDisplayIndex}`);
        this.mainWindow.setPosition(nextDisplay.bounds.x, nextDisplay.bounds.y);
        if (this.mainWindow.isFullScreen()) {
            this.mainWindow.setFullScreen(false);
            setTimeout(() => { if (this.mainWindow) this.mainWindow.setFullScreen(true); }, 100);
        }
    }

}

const bmsApp = new BMSApp();

// ── IPC modules ───────────────────────────────────────────────────────────────
const { createConnectivityMonitor } = require('./connectivity')
const connectivityMonitor = createConnectivityMonitor(bmsApp)

require('./ipc/filesystem').register(ipcMain, bmsApp)
require('./ipc/hardware').register(ipcMain, apiConfigManager)
require('./ipc/setup').register(ipcMain, apiProcessManager)
require('./ipc/config').register(ipcMain, apiConfigManager, terminalConfigManager)
require('./ipc/offline-queue').register(ipcMain)

// Connectivity IPC (needs monitor reference)
ipcMain.handle('get-connectivity', async () => ({ online: connectivityMonitor.isOnline }))

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('install-update', () => autoUpdater.quitAndInstall())

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    if (!process.argv.includes('--dev')) {
        Menu.setApplicationMenu(null);
    }
    apiProcessManager.start()
    setupAutoUpdater()
    bmsApp.createWindow();
    connectivityMonitor.start()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            bmsApp.createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    apiProcessManager.stop()
    connectivityMonitor.stop()
});
