'use strict'

const { app } = require('electron')
const path = require('path')
const fs = require('fs')

// In a packaged AppImage the app directory is read-only; credentials must live in userData.
const getDotenvPath = () => app.isPackaged
    ? path.join(app.getPath('userData'), '.env')
    : path.join(app.getAppPath(), '.env')

function register(ipcMain, apiProcessManager) {
    /** Returns whether the .env file exists and has real (non-placeholder) credentials. */
    ipcMain.handle('check-setup', async () => {
        try {
            if (!fs.existsSync(getDotenvPath())) {
                return { configured: false, reason: 'No .env file found' }
            }
            const content = fs.readFileSync(getDotenvPath(), 'utf8')
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
            const safe = (s) => String(s || '').replace(/[\r\n"'`\\$]/g, '').trim()
            const content = [
                `BMS_DB_USER=${safe(dbUser || 'postgres')}`,
                `BMS_DB_PASSWORD=${safe(dbPassword)}`,
                `BMS_DB_SERVER=${safe(dbHost)}`,
                `BMS_DB_PORT=${safe(dbPort || '5432')}`,
                `BMS_DB_NAME=${safe(dbName || 'postgres')}`,
            ].join('\n') + '\n'
            fs.writeFileSync(getDotenvPath(), content, { encoding: 'utf8', mode: 0o600 })
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
        let connected = false
        try {
            await client.connect()
            connected = true
            return { reachable: true }
        } catch (err) {
            const msg = err.message || ''
            if (msg.includes('password authentication failed') || msg.includes('SASL'))
                return { reachable: false, error: 'Incorrect password. Double-check your database password.' }
            if (msg.includes('does not exist'))
                return { reachable: false, error: 'User or database not found. Check your connection string.' }
            if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED'))
                return { reachable: false, error: 'Host not found. Check the server address.' }
            if (msg.includes('timeout'))
                return { reachable: false, error: 'Connection timed out. Check your internet and the host.' }
            return { reachable: false, error: msg }
        } finally {
            if (connected) try { await client.end() } catch {}
        }
    })

    /** Relaunch the Electron process and restart the API with the new .env credentials. */
    ipcMain.handle('relaunch-app', async () => {
        if (app.isPackaged) {
            // Packaged: ApiProcessManager owns the process — let it restart cleanly.
            await apiProcessManager.restart()
        } else {
            // Dev mode: spawn dotnet run (dev.sh may not be running after a credential change).
            const envVars = { ...process.env }
            try {
                const content = fs.readFileSync(getDotenvPath(), 'utf8')
                for (const line of content.split('\n')) {
                    const match = line.match(/^([^#=\s][^=]*)=(.*)$/)
                    if (match) envVars[match[1].trim()] = match[2].trim()
                }
            } catch (e) {
                console.warn('Could not read .env for API restart:', e.message)
            }
            try {
                require('child_process').execFileSync('fuser', ['-k', '5002/tcp'], { stdio: 'ignore' })
            } catch {}
            await new Promise(r => setTimeout(r, 1000))
            const apiDir = path.join(app.getAppPath(), 'BMS_POS_API')
            const cmd = `cd "${apiDir}" && nohup dotnet run --urls=http://localhost:5002 > /tmp/bms_api.log 2>&1 &`
            const spawner = require('child_process').spawn('bash', ['-c', cmd], {
                detached: true, stdio: 'ignore', env: envVars,
            })
            spawner.unref()
            const net = require('net')
            await new Promise(resolve => {
                const deadline = Date.now() + 120000
                const check = () => {
                    const sock = net.createConnection(5002, '127.0.0.1')
                    sock.on('connect', () => { sock.destroy(); resolve(true) })
                    sock.on('error', () => {
                        if (Date.now() < deadline) setTimeout(check, 3000)
                        else resolve(false)
                    })
                }
                setTimeout(check, 5000)
            })
        }
        app.relaunch()
        app.exit(0)
    })
}

module.exports = { register }
