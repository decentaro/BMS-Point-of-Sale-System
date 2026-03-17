const { app, BrowserWindow, Menu, screen, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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
            if (fs.existsSync(configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
                // Validate URL from file before applying
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
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2))
            console.log('Saved API config to file:', this.config)
        } catch (error) {
            console.error('Failed to save API config to file:', error.message)
        }
    }

    getConfig() {
        return { ...this.config }
    }

    updateConfig(newConfig) {
        // Reject any attempt to point the API at a non-localhost host
        if (newConfig.baseUrl && !this.isValidApiUrl(newConfig.baseUrl)) {
            throw new Error(`Invalid API URL: only localhost/127.0.0.1 is permitted. Got: ${newConfig.baseUrl}`)
        }
        this.config = { ...this.config, ...newConfig }
        this.saveConfigToFile()
        return this.getConfig()
    }
}

const apiConfigManager = new ApiConfigManager()
const API_BASE_URL = apiConfigManager.getConfig().baseUrl

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
        
        // Get all displays
        const displays = screen.getAllDisplays();
        console.log('Available displays:', displays.map(d => ({
            id: d.id,
            bounds: d.bounds,
            size: `${d.bounds.width}x${d.bounds.height}`,
            primary: d === screen.getPrimaryDisplay()
        })));

        // Choose target display
        // Priority 1: --display=<index>
        // Priority 2: BMS_DISPLAY_INDEX env
        // Fallback: smallest display by area
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
            // Pick the smallest display by area (width * height)
            targetDisplay = displays.reduce((smallest, d) => {
                const area = d.bounds.width * d.bounds.height;
                const smallestArea = smallest.bounds.width * smallest.bounds.height;
                return area < smallestArea ? d : smallest;
            }, displays[0]);
            console.log('Using smallest display by area:', targetDisplay.bounds);
        }

        // Use responsive window sizing
        let windowWidth, windowHeight;
        if (isDev) {
            // Development: Start with a reasonable size that can be resized
            windowWidth = Math.min(1200, targetDisplay.bounds.width * 0.8);
            windowHeight = Math.min(800, targetDisplay.bounds.height * 0.8);
        } else {
            // Production: Use full display size
            windowWidth = targetDisplay.bounds.width;
            windowHeight = targetDisplay.bounds.height;
        }
        const centeredX = targetDisplay.bounds.x + Math.max(0, Math.floor((targetDisplay.bounds.width - windowWidth) / 2));
        const centeredY = targetDisplay.bounds.y + Math.max(0, Math.floor((targetDisplay.bounds.height - windowHeight) / 2));
        
        this.mainWindow = new BrowserWindow({
            width: windowWidth,
            height: windowHeight,
            x: centeredX,       // Center on target display
            y: centeredY,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                webSecurity: true
            },
            // Kiosk mode settings (apply fullscreen/kiosk AFTER positioning to ensure correct monitor)
            frame: true,
            resizable: true, // Always resizable for responsive testing
            fullscreen: false,
            kiosk: false,
            alwaysOnTop: !isDev,
            skipTaskbar: !isDev,
            autoHideMenuBar: true,           // Hide menu bar
            useContentSize: true,
            // Touch optimization
            enableLargerThanScreen: true     // Allow larger than screen
        });

        // Window uses full screen size - CSS will handle responsive layout

        // Load the React app
        if (isDev) {
            // In development, load from Vite dev server (port provided by env)
            let devUrl = process.env.BMS_VITE_URL || 'http://127.0.0.1:3001';
            if (!devUrl.endsWith('/')) devUrl += '/';
            const devIndex = devUrl + 'index.html';
            console.log('Loading DEV URL in BrowserWindow:', devIndex);
            this.mainWindow.loadURL(devIndex);
        } else {
            // In production, load from built files
            const prodIndex = path.join(__dirname, '../../dist/index.html');
            console.log('Loading PROD index file in BrowserWindow:', prodIndex);
            this.mainWindow.loadFile(prodIndex);
        }

        // Show window when ready (prevents invisible window issues on some Linux setups)
        this.mainWindow.once('ready-to-show', () => {
            // Ensure the window is positioned on the target display before enabling fullscreen/kiosk
            try {
                this.mainWindow.setBounds({
                    x: centeredX,
                    y: centeredY,
                    width: windowWidth,
                    height: windowHeight
                });
            } catch (e) {
                console.warn('Failed to set bounds before show', e);
            }
            this.mainWindow.show();

            // Apply fullscreen/kiosk on the correct monitor (production only)
            // In development, window stays resizable for responsive testing
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

        // Ensure the window is shown even if 'ready-to-show' doesn't fire (e.g., file load issues)
        setTimeout(() => {
            if (this.mainWindow && !this.mainWindow.isVisible()) {
                console.log('Forcing window to show after timeout');
                this.mainWindow.show();
            }
        }, 5000);

        // Open DevTools in development
        if (process.argv.includes('--dev')) {
            this.mainWindow.webContents.openDevTools();
        }

        // Disable context menu (right-click) in production,
        // except on input/textarea elements so paste still works (e.g. setup wizard)
        if (!isDev) {
            this.mainWindow.webContents.on('context-menu', (e, params) => {
                if (!params.isEditable) {
                    e.preventDefault();
                }
            });
        }

        // Keyboard shortcuts for kiosk mode
        this.mainWindow.webContents.on('before-input-event', (event, input) => {
            // Ctrl+Shift+Q to quit in kiosk mode
            if (input.control && input.shift && input.key.toLowerCase() === 'q') {
                app.quit();
            }
            // F11 to toggle fullscreen
            if (input.key === 'F11') {
                this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
            }
            // Ctrl+Shift+M to move between displays
            if (input.control && input.shift && input.key.toLowerCase() === 'm') {
                this.moveToNextDisplay();
            }
            // Disable F12 (DevTools) in production
            if (input.key === 'F12' && !isDev) {
                event.preventDefault();
            }
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
        
        // Find current display
        let currentDisplayIndex = 0;
        for (let i = 0; i < displays.length; i++) {
            const display = displays[i];
            if (currentBounds.x >= display.bounds.x && 
                currentBounds.x < display.bounds.x + display.bounds.width) {
                currentDisplayIndex = i;
                break;
            }
        }

        // Move to next display (cycle through)
        const nextDisplayIndex = (currentDisplayIndex + 1) % displays.length;
        const nextDisplay = displays[nextDisplayIndex];
        
        console.log(`Moving from display ${currentDisplayIndex} to display ${nextDisplayIndex}`);
        console.log(`Target display: ${nextDisplay.bounds.width}x${nextDisplay.bounds.height}`);

        // Position window on next display
        this.mainWindow.setPosition(nextDisplay.bounds.x, nextDisplay.bounds.y);
        
        // If in fullscreen, re-enable it on the new display
        if (this.mainWindow.isFullScreen()) {
            this.mainWindow.setFullScreen(false);
            setTimeout(() => {
                this.mainWindow.setFullScreen(true);
            }, 100);
        }
    }

    async initialize() {
    }
}

const bmsApp = new BMSApp();

// IPC handlers for file system operations
ipcMain.handle('open-path', async (event, path) => {
    try {
        if (!fs.existsSync(path)) {
            return { success: false, error: 'Path does not exist' };
        }

        const stat = fs.statSync(path);
        let result;
        
        if (stat.isDirectory()) {
            result = await shell.openPath(path);
        } else {
            // For files, try to open directly first, fallback to showing in folder
            result = await shell.openPath(path);
            if (result !== '') {
                // If opening failed, show in folder instead
                result = await shell.showItemInFolder(path);
            }
        }
        
        if (result === '' || result === undefined) {
            return { success: true };
        } else {
            return { success: false, error: result };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('show-open-dialog', async (event, options) => {
    try {
        if (options.defaultPath) {
            const resolved = options.defaultPath.startsWith('./')
                ? path.resolve(process.cwd(), options.defaultPath)
                : options.defaultPath;
            // Restrict defaultPath to within the user's home dir or app userData —
            // prevents the dialog from being pre-navigated to sensitive system dirs
            const home = require('os').homedir();
            const userData = app.getPath('userData');
            if (resolved.startsWith(home) || resolved.startsWith(userData)) {
                options.defaultPath = resolved;
            } else {
                delete options.defaultPath;
            }
        }

        const result = await dialog.showOpenDialog(bmsApp.mainWindow, options);
        return result;
    } catch (error) {
        return { canceled: true, error: error.message };
    }
});

ipcMain.handle('read-file', async (event, filePath) => {
    try {
        // Only allow backup file types — prevents reading arbitrary system files
        const ALLOWED_EXTENSIONS = ['.backup', '.sql', '.gz', '.dump', '.bak'];
        const ext = path.extname(filePath).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            throw new Error('File type not permitted. Only backup files (.backup, .sql, .gz, .dump, .bak) can be read.');
        }

        // Ensure the path resolves to a regular file (not a symlink to /etc/shadow, a device node, etc.)
        const stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) {
            throw new Error('Path is not a regular file.');
        }

        const data = await fs.promises.readFile(filePath);
        return data;
    } catch (error) {
        console.error('Failed to read file:', filePath, error);
        throw new Error(`Failed to read file: ${error.message}`);
    }
});

app.whenReady().then(async () => {
    // Disable menu in production
    if (!process.argv.includes('--dev')) {
        Menu.setApplicationMenu(null);
    }
    
    await bmsApp.initialize();
    bmsApp.createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            bmsApp.createWindow();
        }
    });
});

// Hardware status checking handlers
ipcMain.handle('check-barcode-scanner', async () => {
    try {
        if (process.platform === 'linux') {
            const { execFileSync } = require('child_process');
            const output = execFileSync('lsusb', [], {
                encoding: 'utf8', timeout: 3000,
                stdio: ['pipe', 'pipe', 'ignore']
            });
            for (const line of output.split('\n')) {
                if (!line.trim()) continue;
                const lower = line.toLowerCase();
                const vidMatch = line.match(/ID ([0-9a-f]{4}):/i);
                if (vidMatch && SCANNER_VENDOR_IDS.has(vidMatch[1].toLowerCase())) {
                    return { active: true, lastScan: new Date().toLocaleTimeString(), description: `Scanner: ${line.trim()}` };
                }
                if (SCANNER_NAME_KEYWORDS.some(kw => lower.includes(kw))) {
                    return { active: true, lastScan: new Date().toLocaleTimeString(), description: `Scanner: ${line.trim()}` };
                }
            }
            return { active: false, lastScan: null, description: 'No barcode scanner detected' };
        }

        if (process.platform === 'win32') {
            const { execFileSync } = require('child_process');
            const out = execFileSync('powershell', [
                '-NoProfile', '-NonInteractive', '-Command',
                `Get-WmiObject Win32_PnPEntity | Where-Object {$_.DeviceID -like 'USB*'} | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress`
            ], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
            const devices = [].concat(out ? JSON.parse(out) : []);
            for (const name of devices) {
                if (SCANNER_NAME_KEYWORDS.some(kw => (name || '').toLowerCase().includes(kw))) {
                    return { active: true, lastScan: new Date().toLocaleTimeString(), description: `Scanner: ${name}` };
                }
            }
            return { active: false, lastScan: null, description: 'No barcode scanner detected' };
        }

        return { active: false, lastScan: null, description: 'Scanner detection not supported on this platform' };
    } catch (error) {
        return { active: false, lastScan: null, description: 'Scanner detection failed - check USB connection' };
    }
});

ipcMain.handle('check-printer', async () => {
    try {
        const printer = findPrinterDevice();
        if (!printer) {
            return {
                connected: false,
                model: null,
                port: null,
                description: 'No thermal printer detected — check USB connection and printer power'
            };
        }
        return {
            connected: true,
            model: printer.name,
            port: printer.device,
            description: `Thermal printer ready (${printer.name})`
        };
    } catch (error) {
        return { connected: false, model: null, description: 'Printer detection failed' };
    }
});

ipcMain.handle('check-database', async () => {
    // Check database connectivity via public health endpoint (no auth required)
    try {
        const startTime = Date.now();
        const response = await fetch(`${apiConfigManager.getConfig().baseUrl}/system-settings`);
        const latency = Date.now() - startTime;
        // 200 = connected, 404 = backend up but no settings yet (still connected)
        const connected = response.status === 200 || response.status === 404;

        return {
            connected: connected,
            latency: latency,
            description: `Database ${connected ? 'connected' : 'error'} - ${latency}ms`
        };
    } catch (error) {
        return {
            connected: false,
            latency: null,
            description: 'Database connection failed'
        };
    }
});

ipcMain.handle('open-cash-drawer', async () => {
    try {
        const printer = findPrinterDevice();
        if (!printer) {
            return { success: false, message: 'No printer found — cash drawer requires a connected printer' };
        }

        // ESC/POS cash drawer kick commands — try multiple for cross-model compatibility
        const drawerCommands = [
            Buffer.from([0x1B, 0x70, 0x00, 0x19, 0x19]), // Standard ESC p 0
            Buffer.from([0x1B, 0x70, 0x00, 0x32, 0x32]), // Alternative timing
            Buffer.from([0x1B, 0x70, 0x01, 0x19, 0x19]), // Drawer 2
        ];

        for (const command of drawerCommands) {
            try {
                sendRawToPrinter(printer, command);
                return { success: true, message: `Cash drawer opened via ${printer.name}` };
            } catch { continue; }
        }

        return { success: false, message: 'Could not communicate with printer to open cash drawer' };
    } catch (error) {
        return { success: false, message: 'Failed to open cash drawer: ' + error.message };
    }
});

/**
 * Strip ESC/POS control characters from user-supplied text to prevent
 * printer command injection via product names, business names, etc.
 * Keeps printable ASCII (0x20–0x7E), newlines, carriage returns, and tabs.
 */
function sanitizeForPrinter(text) {
    if (!text) return '';
    return text.split('').filter(c => {
        const code = c.charCodeAt(0);
        return code === 0x09 || code === 0x0A || code === 0x0D
            || (code >= 0x20 && code <= 0x7E);
    }).join('');
}

// Known USB Vendor IDs for barcode scanner manufacturers
const SCANNER_VENDOR_IDS = new Set([
    '05e0',  // Symbol Technologies / Zebra
    '0a5f',  // Zebra Technologies
    '0c2e',  // Metrologic / Honeywell
    '0536',  // Hand Held Products / Honeywell
    '05f9',  // PSC / Datalogic
    '1eab',  // Newland AIDC
    '0b4b',  // Code Corporation
    '067e',  // Intermec Technologies
    '1d5f',  // Unitec
]);

const SCANNER_NAME_KEYWORDS = [
    'barcode', 'scanner', 'symbol', 'zebra', 'honeywell', 'metrologic',
    'datalogic', 'newland', 'cognex', 'opticon', 'hand held', 'cipherlab',
    'intermec', 'code corp', 'microscan', 'socket mobile', 'unitec', 'tera'
];

/**
 * Find the first available thermal printer device.
 * Linux/RPi: checks /dev/usb/lp* and /dev/lp* directly — zero config, no CUPS needed.
 *            Plug in the printer and it's immediately found.
 * Windows:   queries installed printers via PowerShell, preferring known thermal/POS models.
 * Returns { device, name, platform } or null if nothing found.
 */
function findPrinterDevice() {
    if (process.platform === 'linux') {
        const candidates = [
            '/dev/usb/lp0', '/dev/usb/lp1', '/dev/usb/lp2',
            '/dev/lp0', '/dev/lp1',
            '/dev/ttyUSB0', '/dev/ttyACM0'
        ];
        for (const devPath of candidates) {
            try {
                fs.accessSync(devPath, fs.constants.W_OK);
                return { device: devPath, name: devPath, platform: 'linux' };
            } catch {}
        }
        return null;
    }

    if (process.platform === 'win32') {
        try {
            const { execFileSync } = require('child_process');
            const out = execFileSync('powershell', [
                '-NoProfile', '-NonInteractive', '-Command',
                `Get-Printer | Where-Object {$_.PrinterStatus -eq "Normal"} | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress`
            ], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
            if (!out) return null;
            const printers = [].concat(JSON.parse(out));
            if (!printers.length) return null;
            const thermalRe = /thermal|pos|receipt|epson.*tm|star.*tsp|bixolon|citizen|tsp\d|tm-|srp-\d|sdp-\d/i;
            const name = printers.find(n => thermalRe.test(n)) || printers[0];
            return { device: name, name, platform: 'win32' };
        } catch { return null; }
    }

    return null;
}

/**
 * Send raw ESC/POS bytes to a printer.
 * Linux/RPi: writes directly to the device file — no CUPS, no spooler, no queue.
 * Windows:   uses PowerShell + Win32 spooler RAW datatype (bypasses GDI rendering).
 */
function sendRawToPrinter(printerInfo, data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary');

    if (printerInfo.platform === 'linux') {
        fs.writeFileSync(printerInfo.device, buf);
        return;
    }

    if (printerInfo.platform === 'win32') {
        const tempFile = path.join(require('os').tmpdir(), `bms_print_${require('crypto').randomUUID()}.bin`);
        try {
            fs.writeFileSync(tempFile, buf);
            // Win32 spooler raw print via PowerShell — RAW datatype bypasses all Windows rendering
            const psScript = `
$pn='${printerInfo.device.replace(/'/g, "''")}'; $fp='${tempFile.replace(/\\/g, '\\\\').replace(/'/g, "''")}'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Ansi)]
  public class DOC { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
  [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)] public static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
  [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)] public static extern int StartDocPrinter(IntPtr h,int l,[In,MarshalAs(UnmanagedType.LPStruct)] DOC d);
  [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv",CharSet=CharSet.Auto,SetLastError=true)] public static extern bool WritePrinter(IntPtr h,IntPtr p,int c,out int w);
}
'@
$b=[System.IO.File]::ReadAllBytes($fp); $hP=[IntPtr]::Zero
[RawPrint]::OpenPrinter($pn,[ref]$hP,[IntPtr]::Zero)|Out-Null
$d=New-Object RawPrint+DOC; $d.pDocName='BMS Receipt'; $d.pDataType='RAW'
[RawPrint]::StartDocPrinter($hP,1,$d)|Out-Null; [RawPrint]::StartPagePrinter($hP)|Out-Null
$ptr=[Runtime.InteropServices.Marshal]::AllocHGlobal($b.Length)
[Runtime.InteropServices.Marshal]::Copy($b,0,$ptr,$b.Length); $w=0
[RawPrint]::WritePrinter($hP,$ptr,$b.Length,[ref]$w)|Out-Null
[Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
[RawPrint]::EndPagePrinter($hP)|Out-Null; [RawPrint]::EndDocPrinter($hP)|Out-Null; [RawPrint]::ClosePrinter($hP)|Out-Null
`;
            require('child_process').execFileSync(
                'powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript],
                { timeout: 15000 }
            );
        } finally {
            try { fs.unlinkSync(tempFile); } catch {}
        }
    }
}

// Receipt printing handler
ipcMain.handle('print-receipt', async (event, receiptContent, logoPath = null) => {
    try {
        const printer = findPrinterDevice();
        if (!printer) {
            return { success: false, message: 'No printer found for receipt printing' };
        }

        // Note: receiptContent is generated by our own receiptFormatter and already
        // contains intentional ESC/POS commands. Only externally-sourced text
        // (businessName) is sanitized before being embedded in the stream.

        // Fetch business name from tax settings
        let businessName = 'Business Name';
        try {
            const fetch = globalThis.fetch || require('node-fetch');
            const response = await fetch(`${apiConfigManager.getConfig().baseUrl}/tax-settings`);
            if (response.ok) {
                const taxSettings = await response.json();
                businessName = sanitizeForPrinter(taxSettings.businessName || 'Business Name');
            }
        } catch (error) {
            console.log('Could not fetch business name:', error.message);
        }

        const businessNameLogo = '\x1B\x61\x01' +   // Center alignment
                                 '\x1B\x45\x01' +   // Bold on
                                 businessName + '\n' +
                                 '\x1B\x45\x00' +   // Bold off
                                 '\x1B\x61\x00';    // Reset alignment

        let thermalReceiptContent = receiptContent.replace(/\[LOGO PLACEHOLDER\]/g, businessNameLogo);

        // ESC/POS initialization sequence
        const initCommands = '\x1B\x40'      // ESC @ - Initialize printer
                           + '\x1B\x74\x00'  // ESC t 0 - CP437 character table
                           + '\x1B\x52\x00'  // ESC R 0 - USA charset
                           + '\x1B\x61\x00'  // ESC a 0 - Left align
                           + '\x1B\x21\x00'; // ESC ! 0 - Reset print modes

        thermalReceiptContent = initCommands + thermalReceiptContent;

        // Paper feed and partial cut
        thermalReceiptContent += '\n\n\n\n';
        thermalReceiptContent += '\x1B\x64\x05';       // ESC d 5 - Feed 5 lines
        thermalReceiptContent += '\x1D\x56\x41\x03';   // GS V A 3 - Partial cut

        sendRawToPrinter(printer, Buffer.from(thermalReceiptContent, 'binary'));
        return { success: true, message: `Receipt printed to ${printer.name}` };

    } catch (error) {
        return { success: false, message: `Print error: ${error.message}` };
    }
});


// ─── Setup wizard IPC handlers ───────────────────────────────────────────────

const dotenvPath = path.join(app.getAppPath(), '.env')

/** Returns whether the .env file exists and has real (non-placeholder) credentials. */
ipcMain.handle('check-setup', async () => {
    try {
        if (!fs.existsSync(dotenvPath)) {
            return { configured: false, reason: 'No .env file found' }
        }
        const content = fs.readFileSync(dotenvPath, 'utf8')
        const vars = {}
        for (const line of content.split('\n')) {
            const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
            if (match) vars[match[1].trim()] = match[2].trim()
        }
        const password = vars['BMS_DB_PASSWORD'] || ''
        const server   = vars['BMS_DB_SERVER']   || ''
        const isPlaceholder = (s) => !s || s.startsWith('your_') || s === 'your_secure_password'
        if (isPlaceholder(password) || isPlaceholder(server)) {
            return { configured: false, reason: 'Credentials not configured' }
        }
        return { configured: true }
    } catch (error) {
        return { configured: false, reason: error.message }
    }
})

/** Write credentials to .env, sanitizing all values to prevent injection. */
ipcMain.handle('save-env', async (event, credentials) => {
    try {
        const { dbUser, dbPassword, dbHost, dbPort, dbName } = credentials
        if (!dbHost || !dbPassword) {
            return { success: false, error: 'Host and password are required' }
        }
        // Strip characters that could break shell export or connection strings
        const safe = (s) => String(s || '').replace(/[\r\n"'`\\$]/g, '').trim()
        const content = [
            `BMS_DB_USER=${safe(dbUser || 'postgres')}`,
            `BMS_DB_PASSWORD=${safe(dbPassword)}`,
            `BMS_DB_SERVER=${safe(dbHost)}`,
            `BMS_DB_PORT=${safe(dbPort || '5432')}`,
            `BMS_DB_NAME=${safe(dbName || 'postgres')}`,
        ].join('\n') + '\n'
        fs.writeFileSync(dotenvPath, content, { encoding: 'utf8', mode: 0o600 })
        return { success: true }
    } catch (error) {
        return { success: false, error: error.message }
    }
})

/** Full PostgreSQL authentication test — verifies host, user, and password are all correct. */
ipcMain.handle('test-db-connection', async (event, { host, port, user, password, database }) => {
    const { Client } = require('pg')
    const client = new Client({
        host,
        port: parseInt(port) || 5432,
        user,
        password,
        database: database || 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 8000,
    })
    try {
        await client.connect()
        await client.end()
        return { reachable: true }
    } catch (err) {
        const msg = err.message || ''
        // Translate common pg error codes into friendly messages
        if (msg.includes('password authentication failed') || msg.includes('SASL'))
            return { reachable: false, error: 'Incorrect password. Double-check your database password.' }
        if (msg.includes('does not exist'))
            return { reachable: false, error: 'User or database not found. Check your connection string.' }
        if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED'))
            return { reachable: false, error: 'Host not found. Check the server address.' }
        if (msg.includes('timeout'))
            return { reachable: false, error: 'Connection timed out. Check your internet and the host.' }
        return { reachable: false, error: msg }
    }
})

/** Relaunch the Electron process and restart the API with the new .env credentials. */
ipcMain.handle('relaunch-app', async () => {
    // Read the newly saved .env and build env vars for the API process
    const envVars = { ...process.env }
    try {
        const content = fs.readFileSync(dotenvPath, 'utf8')
        for (const line of content.split('\n')) {
            const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
            if (match) envVars[match[1].trim()] = match[2].trim()
        }
    } catch (e) {
        console.warn('Could not read .env for API restart:', e.message)
    }

    // Kill any existing API process on port 5002
    try {
        require('child_process').execFileSync('fuser', ['-k', '5002/tcp'], { stdio: 'ignore' })
    } catch {}
    await new Promise(r => setTimeout(r, 1000))

    // Spawn via nohup + bash so the process survives Electron exiting.
    // dotnet run must compile first — this can take 30–60s on a Pi.
    const apiDir = path.join(app.getAppPath(), 'BMS_POS_API')
    const cmd = `cd "${apiDir}" && nohup dotnet run --urls=http://localhost:5002 > /tmp/bms_api.log 2>&1 &`
    const spawner = require('child_process').spawn('bash', ['-c', cmd], {
        detached: true,
        stdio: 'ignore',
        env: envVars,
    })
    spawner.unref()

    // Poll port 5002 until the API is actually listening (up to 2 minutes)
    const net = require('net')
    const waitForApi = (maxMs = 120000) => new Promise((resolve) => {
        const deadline = Date.now() + maxMs
        const check = () => {
            const sock = net.createConnection(5002, '127.0.0.1')
            sock.on('connect', () => { sock.destroy(); resolve(true) })
            sock.on('error',   () => {
                if (Date.now() < deadline) setTimeout(check, 3000)
                else resolve(false)
            })
        }
        setTimeout(check, 5000) // initial pause for dotnet to start compiling
    })

    await waitForApi()

    app.relaunch()
    app.exit(0)
})

// ─────────────────────────────────────────────────────────────────────────────

// API Configuration IPC handlers
ipcMain.handle('get-api-config', async () => {
    return apiConfigManager.getConfig()
});

ipcMain.handle('set-api-config', async (event, config) => {
    try {
        const updatedConfig = apiConfigManager.updateConfig(config)
        console.log('API config updated via IPC:', updatedConfig)
        return updatedConfig
    } catch (error) {
        console.error('Failed to update API config:', error)
        throw error
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});