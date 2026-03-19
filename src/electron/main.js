const { app, BrowserWindow, Menu, screen, ipcMain } = require('electron');
const path = require('path');

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
            if (input.key === 'F11') this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
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
            setTimeout(() => { this.mainWindow.setFullScreen(true); }, 100);
        }
    }

    async initialize() {
    }
}

const bmsApp = new BMSApp();

// ── IPC modules ───────────────────────────────────────────────────────────────
const { createConnectivityMonitor } = require('./connectivity')
const connectivityMonitor = createConnectivityMonitor(bmsApp)

require('./ipc/filesystem').register(ipcMain, bmsApp)
require('./ipc/hardware').register(ipcMain, apiConfigManager)
require('./ipc/setup').register(ipcMain)
require('./ipc/config').register(ipcMain, apiConfigManager)
require('./ipc/offline-queue').register(ipcMain)

// Connectivity IPC (needs monitor reference)
ipcMain.handle('get-connectivity', async () => ({ online: connectivityMonitor.isOnline }))

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    if (!process.argv.includes('--dev')) {
        Menu.setApplicationMenu(null);
    }
    await bmsApp.initialize();
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
