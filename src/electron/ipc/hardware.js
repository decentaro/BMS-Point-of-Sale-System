'use strict'

const fs = require('fs')
const path = require('path')

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
])

const SCANNER_NAME_KEYWORDS = [
    'barcode', 'scanner', 'symbol', 'zebra', 'honeywell', 'metrologic',
    'datalogic', 'newland', 'cognex', 'opticon', 'hand held', 'cipherlab',
    'intermec', 'code corp', 'microscan', 'socket mobile', 'unitec', 'tera'
]

/**
 * Strip ESC/POS control characters from user-supplied text to prevent
 * printer command injection via product names, business names, etc.
 * Keeps printable ASCII (0x20–0x7E), newlines, carriage returns, and tabs.
 */
function sanitizeForPrinter(text) {
    if (!text) return ''
    return text.split('').filter(c => {
        const code = c.charCodeAt(0)
        return code === 0x09 || code === 0x0A || code === 0x0D
            || (code >= 0x20 && code <= 0x7E)
    }).join('')
}

/**
 * Find the first available thermal printer device.
 * Linux/RPi: checks /dev/usb/lp* and /dev/lp* directly — zero config, no CUPS needed.
 * Windows:   queries installed printers via PowerShell, preferring known thermal/POS models.
 * Returns { device, name, platform } or null if nothing found.
 */
function findPrinterDevice() {
    if (process.platform === 'linux') {
        const candidates = [
            '/dev/usb/lp0', '/dev/usb/lp1', '/dev/usb/lp2',
            '/dev/lp0', '/dev/lp1',
            '/dev/ttyUSB0', '/dev/ttyACM0'
        ]
        for (const devPath of candidates) {
            try {
                fs.accessSync(devPath, fs.constants.W_OK)
                return { device: devPath, name: devPath, platform: 'linux' }
            } catch {}
        }
        return null
    }

    if (process.platform === 'win32') {
        try {
            const { execFileSync } = require('child_process')
            const out = execFileSync('powershell', [
                '-NoProfile', '-NonInteractive', '-Command',
                `Get-Printer | Where-Object {$_.PrinterStatus -eq "Normal"} | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress`
            ], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] }).trim()
            if (!out) return null
            const printers = [].concat(JSON.parse(out))
            if (!printers.length) return null
            const thermalRe = /thermal|pos|receipt|epson.*tm|star.*tsp|bixolon|citizen|tsp\d|tm-|srp-\d|sdp-\d/i
            const name = printers.find(n => thermalRe.test(n)) || printers[0]
            return { device: name, name, platform: 'win32' }
        } catch { return null }
    }

    return null
}

/**
 * Send raw ESC/POS bytes to a printer.
 * Linux/RPi: writes directly to the device file — no CUPS, no spooler, no queue.
 * Windows:   uses PowerShell + Win32 spooler RAW datatype (bypasses GDI rendering).
 */
async function sendRawToPrinter(printerInfo, data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary')

    if (printerInfo.platform === 'linux') {
        // fs.promises.writeFile is async — does not block the event loop.
        // The race ensures we surface a timeout error if the device is
        // unresponsive (paper jam, USB disconnect) rather than hanging forever.
        const TIMEOUT_MS = 5000
        await Promise.race([
            fs.promises.writeFile(printerInfo.device, buf),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Printer write timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
            ),
        ])
        return
    }

    if (printerInfo.platform === 'win32') {
        const tempFile = path.join(require('os').tmpdir(), `bms_print_${require('crypto').randomUUID()}.bin`)
        try {
            await fs.promises.writeFile(tempFile, buf)
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
`
            await new Promise((resolve, reject) => {
                require('child_process').execFile(
                    'powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript],
                    { timeout: 15000 },
                    (err) => err ? reject(err) : resolve()
                )
            })
        } finally {
            try { await fs.promises.unlink(tempFile) } catch {}
        }
    }
}

function register(ipcMain, apiConfigManager) {
    ipcMain.handle('check-barcode-scanner', async () => {
        const { execFile } = require('child_process')
        const execAsync = (cmd, args, opts) => new Promise((resolve, reject) => {
            execFile(cmd, args, opts, (err, stdout) => err ? reject(err) : resolve(stdout))
        })

        try {
            if (process.platform === 'linux') {
                const output = await execAsync('lsusb', [], {
                    encoding: 'utf8', timeout: 3000,
                    stdio: ['pipe', 'pipe', 'ignore']
                })
                for (const line of output.split('\n')) {
                    if (!line.trim()) continue
                    const lower = line.toLowerCase()
                    const vidMatch = line.match(/ID ([0-9a-f]{4}):/i)
                    if (vidMatch && SCANNER_VENDOR_IDS.has(vidMatch[1].toLowerCase())) {
                        return { active: true, lastScan: new Date().toLocaleTimeString(), description: `Scanner: ${line.trim()}` }
                    }
                    if (SCANNER_NAME_KEYWORDS.some(kw => lower.includes(kw))) {
                        return { active: true, lastScan: new Date().toLocaleTimeString(), description: `Scanner: ${line.trim()}` }
                    }
                }
                return { active: false, lastScan: null, description: 'No barcode scanner detected' }
            }

            if (process.platform === 'win32') {
                const out = (await execAsync('powershell', [
                    '-NoProfile', '-NonInteractive', '-Command',
                    `Get-WmiObject Win32_PnPEntity | Where-Object {$_.DeviceID -like 'USB*'} | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress`
                ], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] })).trim()
                const devices = [].concat(out ? JSON.parse(out) : [])
                for (const name of devices) {
                    if (SCANNER_NAME_KEYWORDS.some(kw => (name || '').toLowerCase().includes(kw))) {
                        return { active: true, lastScan: new Date().toLocaleTimeString(), description: `Scanner: ${name}` }
                    }
                }
                return { active: false, lastScan: null, description: 'No barcode scanner detected' }
            }

            return { active: false, lastScan: null, description: 'Scanner detection not supported on this platform' }
        } catch {
            return { active: false, lastScan: null, description: 'Scanner detection failed - check USB connection' }
        }
    })

    ipcMain.handle('check-printer', async () => {
        try {
            const printer = findPrinterDevice()
            if (!printer) {
                return { connected: false, model: null, port: null, description: 'No thermal printer detected — check USB connection and printer power' }
            }
            return { connected: true, model: printer.name, port: printer.device, description: `Thermal printer ready (${printer.name})` }
        } catch {
            return { connected: false, model: null, description: 'Printer detection failed' }
        }
    })

    ipcMain.handle('check-database', async () => {
        try {
            const startTime = Date.now()
            const response = await fetch(`${apiConfigManager.getConfig().baseUrl}/system-settings`)
            const latency = Date.now() - startTime
            const connected = response.status === 200 || response.status === 404
            return { connected, latency, description: `Database ${connected ? 'connected' : 'error'} - ${latency}ms` }
        } catch {
            return { connected: false, latency: null, description: 'Database connection failed' }
        }
    })

    ipcMain.handle('open-cash-drawer', async () => {
        try {
            const printer = findPrinterDevice()
            if (!printer) {
                return { success: false, message: 'No printer found — cash drawer requires a connected printer' }
            }
            const drawerCommands = [
                Buffer.from([0x1B, 0x70, 0x00, 0x19, 0x19]),
                Buffer.from([0x1B, 0x70, 0x00, 0x32, 0x32]),
                Buffer.from([0x1B, 0x70, 0x01, 0x19, 0x19]),
            ]
            for (const command of drawerCommands) {
                try {
                    await sendRawToPrinter(printer, command)
                    return { success: true, message: `Cash drawer opened via ${printer.name}` }
                } catch { continue }
            }
            return { success: false, message: 'Could not communicate with printer to open cash drawer' }
        } catch (error) {
            return { success: false, message: 'Failed to open cash drawer: ' + error.message }
        }
    })

    ipcMain.handle('print-receipt', async (event, receiptContent, logoPath = null, businessNameOverride = null) => {
        try {
            const printer = findPrinterDevice()
            if (!printer) {
                return { success: false, message: 'No printer found for receipt printing' }
            }

            // Note: receiptContent is generated by our own receiptFormatter and already
            // contains intentional ESC/POS commands. Only externally-sourced text
            // (businessName) is sanitized before being embedded in the stream.

            let businessName = 'Business Name'
            if (businessNameOverride) {
                businessName = sanitizeForPrinter(businessNameOverride)
            } else {
                try {
                    const fetch = globalThis.fetch || require('node-fetch')
                    const response = await fetch(`${apiConfigManager.getConfig().baseUrl}/tax-settings`)
                    if (response.ok) {
                        const taxSettings = await response.json()
                        businessName = sanitizeForPrinter(taxSettings.businessName || 'Business Name')
                    }
                } catch (error) {
                    console.log('Could not fetch business name:', error.message)
                }
            }

            const businessNameLogo = '\x1B\x61\x01' +
                                     '\x1B\x45\x01' +
                                     businessName + '\n' +
                                     '\x1B\x45\x00' +
                                     '\x1B\x61\x00'

            let thermalReceiptContent = receiptContent.replace(/\[LOGO PLACEHOLDER\]/g, businessNameLogo)

            const initCommands = '\x1B\x40'
                               + '\x1B\x74\x00'
                               + '\x1B\x52\x00'
                               + '\x1B\x61\x00'
                               + '\x1B\x21\x00'

            thermalReceiptContent = initCommands + thermalReceiptContent
            thermalReceiptContent += '\n\n\n\n'
            thermalReceiptContent += '\x1B\x64\x05'
            thermalReceiptContent += '\x1D\x56\x41\x03'

            await sendRawToPrinter(printer, Buffer.from(thermalReceiptContent, 'binary'))
            return { success: true, message: `Receipt printed to ${printer.name}` }
        } catch (error) {
            return { success: false, message: `Print error: ${error.message}` }
        }
    })
}

module.exports = { register }
