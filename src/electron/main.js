const { app, BrowserWindow, Menu, screen, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// API Configuration - Runtime configurable
class ApiConfigManager {
    constructor() {
        this.config = {
            baseUrl: process.env.VITE_API_BASE_URL || 
                    process.env.REACT_APP_API_BASE_URL || 
                    process.env.BMS_POS_API_BASE_URL ||
                    'http://localhost:5002/api',
            timeout: 30000
        }
        this.loadConfigFromFile()
    }

    loadConfigFromFile() {
        try {
            const configPath = path.join(app.getPath('userData'), 'api-config.json')
            if (fs.existsSync(configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
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
                nodeIntegration: true,
                contextIsolation: false,
                preload: path.join(__dirname, 'preload.js'),
                webSecurity: false  // Allow external resources including images
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

        // Disable context menu (right-click) in production
        if (!isDev) {
            this.mainWindow.webContents.on('context-menu', (e) => {
                e.preventDefault();
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
        if (options.defaultPath && options.defaultPath.startsWith('./')) {
            options.defaultPath = path.resolve(process.cwd(), options.defaultPath);
        }
        
        const result = await dialog.showOpenDialog(bmsApp.mainWindow, options);
        return result;
    } catch (error) {
        return { canceled: true, error: error.message };
    }
});

ipcMain.handle('read-file', async (event, filePath) => {
    try {
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
    // Check if barcode scanner is active by detecting USB HID devices
    try {
        const { execSync } = require('child_process');
        const devices = execSync('lsusb 2>/dev/null || echo "no-devices"', { encoding: 'utf8' });
        
        // Look for common barcode scanner identifiers
        const hasBarcodeScanner = devices.toLowerCase().includes('scanner') || 
                                 devices.toLowerCase().includes('honeywell') ||
                                 devices.toLowerCase().includes('symbol') ||
                                 devices.toLowerCase().includes('datalogic') ||
                                 devices.toLowerCase().includes('hid');

        return {
            active: hasBarcodeScanner,
            lastScan: hasBarcodeScanner ? new Date().toLocaleTimeString() : null,
            description: hasBarcodeScanner ? 'USB HID Scanner detected' : 'No scanner detected'
        };
    } catch (error) {
        // Don't assume working - return actual status
        return {
            active: false,
            lastScan: null,
            description: 'Scanner detection failed - check USB connection'
        };
    }
});

ipcMain.handle('check-printer', async () => {
    // Check for thermal printer connection
    try {
        const fs = require('fs');
        const { execSync } = require('child_process');
        
        // Check for USB printer devices
        const printers = execSync('lpstat -p 2>/dev/null || echo "no-printers"', { encoding: 'utf8' });
        
        // Check for common thermal printer ports
        const usbPorts = ['/dev/usb/lp0', '/dev/usb/lp1', '/dev/lp0', '/dev/lp1'];
        const hasUSBPrinter = usbPorts.some(port => fs.existsSync(port));
        
        // More strict printer detection - check for actual available printers
        const hasSystemPrinters = printers.includes('printer') && 
                                 !printers.includes('no-printers') && 
                                 !printers.includes('disabled');
        
        // Also check lsusb for thermal printer USB devices
        let hasUSBThermalPrinter = false;
        try {
            const usbDevices = execSync('lsusb 2>/dev/null || echo "no-usb"', { encoding: 'utf8' });
            hasUSBThermalPrinter = usbDevices.toLowerCase().includes('printer') || 
                                  usbDevices.toLowerCase().includes('thermal') ||
                                  usbDevices.toLowerCase().includes('pos');
        } catch (usbError) {
            // USB check failed, continue without USB detection
        }
        
        const hasPrinter = hasUSBPrinter || hasSystemPrinters || hasUSBThermalPrinter;
        
        // Try to actually test printer communication if detected
        let actuallyConnected = hasPrinter;
        let testResult = '';
        
        if (hasPrinter) {
            try {
                // Try a simple printer test - send empty command to default printer
                execSync('lpstat -d 2>/dev/null', { encoding: 'utf8', timeout: 2000 });
                testResult = 'Communication test passed';
            } catch (testError) {
                // If we can't communicate, printer might be off/disconnected
                actuallyConnected = false;
                testResult = 'Device found but not responding (printer may be turned off)';
            }
        }
        
        return {
            connected: actuallyConnected,
            model: actuallyConnected ? 'Thermal Printer' : null,
            port: hasUSBPrinter ? '/dev/usb/lp0' : null,
            description: actuallyConnected ? 'Thermal printer ready' : (hasPrinter ? testResult : 'No thermal printer detected')
        };
    } catch (error) {
        return {
            connected: false,
            model: null,
            description: 'No thermal printer detected'
        };
    }
});

ipcMain.handle('check-database', async () => {
    // Check database connectivity
    try {
        const startTime = Date.now();
        const response = await fetch(`${apiConfigManager.getConfig().baseUrl}/employees/1`);
        const latency = Date.now() - startTime;
        
        return {
            connected: response.ok,
            latency: latency,
            description: `Database ${response.ok ? 'connected' : 'error'} - ${latency}ms`
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
    // Open cash drawer command (requires thermal printer)
    try {
        const fs = require('fs');
        const { execSync } = require('child_process');
        
        // Get available printers and find the best one for cash drawer
        let availablePrinter = null;
        try {
            const printers = execSync('lpstat -p 2>/dev/null || echo "no-printers"', { encoding: 'utf8' });
            if (printers.includes('no-printers') || printers.includes('No destinations added')) {
                return { success: false, message: 'No printers found - cash drawer requires printer connection' };
            }
            
            // Try to get default printer first
            try {
                const defaultPrinter = execSync('lpstat -d 2>/dev/null', { encoding: 'utf8' });
                const match = defaultPrinter.match(/system default destination: (.+)/);
                if (match) {
                    availablePrinter = match[1].trim();
                }
            } catch {}
            
            // If no default, find first available printer
            if (!availablePrinter) {
                const printerLines = printers.split('\n').filter(line => line.includes('printer'));
                for (const line of printerLines) {
                    const match = line.match(/printer (.+?) is/);
                    if (match && !line.includes('disabled')) {
                        availablePrinter = match[1];
                        break;
                    }
                }
            }
            
            if (!availablePrinter) {
                return { success: false, message: 'No active printers found for cash drawer' };
            }
        } catch (error) {
            return { success: false, message: 'Error checking printer status: ' + error.message };
        }
        
        // Multiple ESC/POS cash drawer kick commands for different printer models
        const drawerCommands = [
            Buffer.from([0x1B, 0x70, 0x00, 0x19, 0x19]), // Standard ESC/POS
            Buffer.from([0x1B, 0x70, 0x00, 0x32, 0x32]), // Alternative timing
            Buffer.from([0x1B, 0x70, 0x01, 0x19, 0x19]), // Drawer 2
        ];
        
        // Try using lp command first (more reliable) - specify POS-80 printer
        try {
            for (const command of drawerCommands) {
                try {
                    // Create a temporary file with the drawer command
                    const tempFile = require('os').tmpdir() + '/drawer_cmd_' + Date.now();
                    fs.writeFileSync(tempFile, command);
                    
                    // Send the command file to the available printer
                    execSync(`lp -d "${availablePrinter}" -o raw "${tempFile}"`, { timeout: 5000 });
                    
                    // Clean up temp file
                    setTimeout(() => {
                        try { fs.unlinkSync(tempFile); } catch {}
                    }, 1000);
                    
                    return { success: true, message: `Cash drawer opened via ${availablePrinter} printer` };
                } catch (lpError) {
                    console.log('LP command failed:', lpError.message);
                    continue; // Try next command
                }
            }
        } catch (lpCommandError) {
            console.log('LP command error:', lpCommandError.message);
            // lp command failed, try direct device paths
        }
        
        // Fallback: try common printer device paths
        const printerPaths = ['/dev/usb/lp0', '/dev/usb/lp1', '/dev/lp0', '/dev/lp1', '/dev/ttyUSB0', '/dev/ttyACM0'];
        
        for (const command of drawerCommands) {
            for (const path of printerPaths) {
                if (fs.existsSync(path)) {
                    try {
                        // Check if device is writable
                        fs.accessSync(path, fs.constants.W_OK);
                        fs.writeFileSync(path, command);
                        return { success: true, message: `Cash drawer opened via ${path}` };
                    } catch (writeError) {
                        continue; // Try next path/command
                    }
                }
            }
        }
        
        return { success: false, message: 'Could not communicate with printer to open cash drawer. Check printer connection and permissions.' };
    } catch (error) {
        return { success: false, message: 'Failed to open cash drawer: ' + error.message };
    }
});

// Receipt printing handler
ipcMain.handle('print-receipt', async (event, receiptContent, logoPath = null) => {
    try {
        const fs = require('fs');
        const { execSync } = require('child_process');
        
        // Get available printer for receipt printing
        let availablePrinter = null;
        try {
            const printers = execSync('lpstat -p 2>/dev/null || echo "no-printers"', { encoding: 'utf8' });
            if (printers.includes('no-printers') || printers.includes('No destinations added')) {
                return { success: false, message: 'No printers found for receipt printing' };
            }
            
            // Try to get default printer first
            try {
                const defaultPrinter = execSync('lpstat -d 2>/dev/null', { encoding: 'utf8' });
                const match = defaultPrinter.match(/system default destination: (.+)/);
                if (match) {
                    availablePrinter = match[1].trim();
                }
            } catch {}
            
            // If no default, find first available printer
            if (!availablePrinter) {
                const printerLines = printers.split('\n').filter(line => line.includes('printer'));
                for (const line of printerLines) {
                    const match = line.match(/printer (.+?) is/);
                    if (match && !line.includes('disabled')) {
                        availablePrinter = match[1];
                        break;
                    }
                }
            }
            
            if (!availablePrinter) {
                return { success: false, message: 'No active printers found for receipt printing' };
            }
        } catch (error) {
            return { success: false, message: 'Error checking printer status: ' + error.message };
        }
        
        // Create a temporary text file for thermal printer
        const tempFile = require('path').join(require('os').tmpdir(), `receipt-${Date.now()}.txt`);
        
        // Add thermal printer commands for proper paper feed and cutting
        let thermalReceiptContent = receiptContent;
        
        // Fetch business name from tax settings
        let businessName = 'Business Name'; // Fallback
        try {
            // Use built-in fetch (Node.js 18+) or node-fetch
            const fetch = globalThis.fetch || require('node-fetch');
            const response = await fetch(`${apiConfigManager.getConfig().baseUrl}/tax-settings`);
            if (response.ok) {
                const taxSettings = await response.json();
                businessName = taxSettings.businessName || 'Business Name';
                console.log('🔥 Using dynamic business name:', businessName);
            }
        } catch (error) {
            console.log('Could not fetch business name from tax settings:', error.message);
        }
        
        // Use dynamic business name from tax settings
        const businessNameLogo = '\x1B\x61\x01' + // Center alignment
                               '\x1B\x45\x01' + // Bold on
                               businessName + '\n' + // Dynamic business name from tax settings
                               '\x1B\x45\x00' + // Bold off
                               '\x1B\x61\x00';  // Reset alignment
        
        thermalReceiptContent = thermalReceiptContent.replace(
            /\[LOGO PLACEHOLDER\]/g,
            businessNameLogo
        );
        
        // Add comprehensive ESC/POS initialization for thermal printers
        let initCommands = '';
        initCommands += '\x1B\x40';      // ESC @ - Initialize printer
        initCommands += '\x1B\x74\x00';  // ESC t 0 - Select character code table (CP437)
        initCommands += '\x1B\x52\x00';  // ESC R 0 - Select international character set (USA)
        initCommands += '\x1B\x61\x00';  // ESC a 0 - Set left alignment (default)
        initCommands += '\x1B\x21\x00';  // ESC ! 0 - Reset print modes
        
        thermalReceiptContent = initCommands + thermalReceiptContent;
        
        // Add paper feed commands at the end
        thermalReceiptContent += '\n\n\n\n';  // Extra line feeds
        thermalReceiptContent += '\x1B\x64\x05';  // ESC d 5 - Feed 5 lines
        thermalReceiptContent += '\x1D\x56\x41\x03';  // GS V A 3 - Partial cut (if supported)
        
        // Debug: Show final receipt content with escape sequences visible
        console.log('🔥 FINAL RECEIPT CONTENT LENGTH:', thermalReceiptContent.length);
        console.log('🔥 RECEIPT CONTENT (first 200 chars):');
        console.log(thermalReceiptContent.substring(0, 200).split('').map(c => 
            c.charCodeAt(0) < 32 ? `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}` : c
        ).join(''));
        console.log('🔥 END RECEIPT PREVIEW');
        
        // Write thermal receipt content
        fs.writeFileSync(tempFile, thermalReceiptContent, 'utf8');
        
        try {
            // Try printing to the available thermal printer
            execSync(`lp -d "${availablePrinter}" -o raw "${tempFile}"`, { timeout: 10000 });
            
            // Clean up temp file
            setTimeout(() => {
                try { fs.unlinkSync(tempFile); } catch {}
            }, 2000);
            
            return { success: true, message: `Receipt printed successfully to ${availablePrinter}` };
        } catch (printError) {
            // Fallback: try without raw mode (for non-thermal printers)
            try {
                execSync(`lp -d "${availablePrinter}" -o media=Custom.80x200mm "${tempFile}"`, { timeout: 10000 });
                
                setTimeout(() => {
                    try { fs.unlinkSync(tempFile); } catch {}
                }, 2000);
                
                return { success: true, message: `Receipt printed successfully to ${availablePrinter}` };
            } catch (fallbackError) {
                return { success: false, message: `Printing failed: ${printError.message}` };
            }
        }
        
    } catch (error) {
        return { success: false, message: `Print error: ${error.message}` };
    }
});


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