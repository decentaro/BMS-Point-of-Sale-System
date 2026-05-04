const { contextBridge, ipcRenderer } = require('electron');

// In-memory JWT token — cleared on process restart (intentional for desktop app)
let authToken = null;

// HTTP helper function - now gets API URL dynamically
async function apiRequest(endpoint, options = {}) {
    // Get current API config from main process
    let baseUrl = 'http://localhost:5002/api'; // fallback
    try {
        const config = await ipcRenderer.invoke('get-api-config');
        baseUrl = config.baseUrl;
    } catch (error) {
        console.warn('Failed to get API config from main process:', error);
    }

    const url = `${baseUrl}${endpoint}`;
    const authHeader = authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...authHeader,
            ...options.headers
        },
        ...options
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(error || `HTTP ${response.status}`);
    }
    
    // Check if response has content before trying to parse JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return response.json();
    } else {
        // Return empty object for successful responses with no content (like PUT/DELETE)
        return {};
    }
}

// Expose protected methods that allow the renderer process to use HTTP requests
const electronAPI = {
    setScale: (scale) => {
        try {
            document.documentElement.style.setProperty('--app-scale', String(scale));
            return true;
        } catch (e) {
            return false;
        }
    },
    // Employee operations
    getAllEmployees: () => apiRequest('/employees'),
    
    validateLogin: async (employeeId, pin, selectedRole = null) => {
        try {
            const response = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ employeeId, pin, selectedRole })
            });
            return response;
        } catch (error) {
            return { success: false, message: error.message };
        }
    },

    validateManagerPin: async (pin) => {
        try {
            const response = await apiRequest('/auth/validate-manager', {
                method: 'POST',
                body: JSON.stringify({ pin })
            });
            return response;
        } catch (error) {
            return { success: false, message: error.message };
        }
    },
    
    createEmployee: (employeeData) => apiRequest('/employees', {
        method: 'POST',
        body: JSON.stringify({
            employeeId: employeeData.employeeId,
            pin: employeeData.pin,
            name: employeeData.name,
            isManager: employeeData.isManager || false
        })
    }),
    
    updateEmployee: (id, employeeData) => apiRequest(`/employees/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
            id: id,
            employeeId: employeeData.employeeId,
            pin: employeeData.pin,
            name: employeeData.name,
            isManager: employeeData.isManager || false,
            createdDate: employeeData.createdDate
        })
    }),
    
    deleteEmployee: (id) => apiRequest(`/employees/${id}`, {
        method: 'DELETE'
    }),
    
    // Product operations
    getAllProducts: () => apiRequest('/products'),
    
    getProduct: (id) => apiRequest(`/products/${id}`),
    
    getProductByBarcode: (barcode) => apiRequest(`/products/barcode/${barcode}`),
    
    getLowStockProducts: () => apiRequest('/products/low-stock'),
    
    createProduct: (productData) => apiRequest('/products', {
        method: 'POST',
        body: JSON.stringify({
            barcode: productData.barcode,
            name: productData.name,
            description: productData.description || '',
            variant: productData.variant || '',
            brand: productData.brand || '',
            category: productData.category || '',
            imageUrl: productData.imageUrl || '',
            price: parseFloat(productData.price),
            cost: parseFloat(productData.cost),
            stockQuantity: parseInt(productData.stockQuantity),
            minStockLevel: parseInt(productData.minStockLevel) || 5,
            unit: productData.unit || 'pcs'
        })
    }),
    
    updateProduct: (id, productData) => apiRequest(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
            id: id,
            barcode: productData.barcode,
            name: productData.name,
            description: productData.description || '',
            variant: productData.variant || '',
            brand: productData.brand || '',
            category: productData.category || '',
            imageUrl: productData.imageUrl || '',
            price: parseFloat(productData.price),
            cost: parseFloat(productData.cost),
            stockQuantity: parseInt(productData.stockQuantity),
            minStockLevel: parseInt(productData.minStockLevel) || 5,
            unit: productData.unit || 'pcs',
            isActive: productData.isActive !== false,
            createdDate: productData.createdDate,
            lastUpdated: productData.lastUpdated
        })
    }),
    
    updateProductStock: (id, newQuantity) => apiRequest(`/products/${id}/stock`, {
        method: 'PUT',
        body: JSON.stringify({
            newQuantity: parseInt(newQuantity)
        })
    }),
    
    deleteProduct: (id) => apiRequest(`/products/${id}`, {
        method: 'DELETE'
    }),

    // File system operations  
    openPath: async (path) => {
        try {
            return await ipcRenderer.invoke('open-path', path);
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    showOpenDialog: async (options) => {
        try {
            return await ipcRenderer.invoke('show-open-dialog', options);
        } catch (error) {
            return { canceled: true, error: error.message };
        }
    },

    readFile: async (filePath) => {
        try {
            return await ipcRenderer.invoke('read-file', filePath);
        } catch (error) {
            throw new Error(`Failed to read file: ${error.message}`);
        }
    },

    // Hardware status checking
    checkBarcodeScanner: () => ipcRenderer.invoke('check-barcode-scanner'),
    checkPrinter: () => ipcRenderer.invoke('check-printer'),
    checkDatabase: () => ipcRenderer.invoke('check-database'),
    openCashDrawer: () => ipcRenderer.invoke('open-cash-drawer'),
    
    // Receipt printing
    printReceipt: (receiptHtml, logoPath, businessName, copies) => ipcRenderer.invoke('print-receipt', receiptHtml, logoPath, businessName, copies),
    
    // API Configuration methods
    getApiConfig: () => ipcRenderer.invoke('get-api-config'),
    setApiConfig: (config) => ipcRenderer.invoke('set-api-config', config),

    // Terminal identity — set once per machine, sent as X-Terminal-Id on every request
    getTerminalConfig: () => ipcRenderer.invoke('get-terminal-config'),
    setTerminalConfig: (config) => ipcRenderer.invoke('set-terminal-config', config),
    
    // Setup wizard
    checkSetup: () => ipcRenderer.invoke('check-setup'),
    saveEnv: (credentials) => ipcRenderer.invoke('save-env', credentials),
    testDbConnection: (host, port, user, password, database) => ipcRenderer.invoke('test-db-connection', { host, port, user, password, database }),
    relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

    // Store JWT token for authenticated requests
    setAuthToken: (token) => { authToken = token; },

    // Clear JWT token on logout
    clearAuthToken: () => { authToken = null; },

    // Connectivity
    onConnectivityChange: (callback) => {
        const handler = (event, data) => callback(data)
        ipcRenderer.on('connectivity-changed', handler)
        return () => ipcRenderer.removeListener('connectivity-changed', handler)
    },
    getConnectivity: () => ipcRenderer.invoke('get-connectivity'),

    // Offline queue
    queueTransaction: (transaction) => ipcRenderer.invoke('queue-transaction', transaction),
    getQueue: () => ipcRenderer.invoke('get-queue'),
    removeFromQueue: (id) => ipcRenderer.invoke('remove-from-queue', id),

    // Product cache
    saveProductCache: (products) => ipcRenderer.invoke('save-product-cache', products),
    getProductCache: () => ipcRenderer.invoke('get-product-cache'),

    // Adjustment queue
    queueAdjustment: (adjustment) => ipcRenderer.invoke('queue-adjustment', adjustment),
    getAdjustmentQueue: () => ipcRenderer.invoke('get-adjustment-queue'),
    removeFromAdjustmentQueue: (id) => ipcRenderer.invoke('remove-from-adjustment-queue', id),

    // Failed sales log
    logFailedSale: (entry) => ipcRenderer.invoke('log-failed-sale', entry),
    getFailedSales: () => ipcRenderer.invoke('get-failed-sales'),
    clearFailedSales: () => ipcRenderer.invoke('clear-failed-sales'),

    // Failed adjustments log
    logFailedAdjustment: (entry) => ipcRenderer.invoke('log-failed-adjustment', entry),
    getFailedAdjustments: () => ipcRenderer.invoke('get-failed-adjustments'),
    clearFailedAdjustments: () => ipcRenderer.invoke('clear-failed-adjustments'),

    // Return queue
    queueReturn: (ret) => ipcRenderer.invoke('queue-return', ret),
    getReturnQueue: () => ipcRenderer.invoke('get-return-queue'),
    removeFromReturnQueue: (id) => ipcRenderer.invoke('remove-from-return-queue', id),

    // Failed returns log
    logFailedReturn: (entry) => ipcRenderer.invoke('log-failed-return', entry),
    getFailedReturns: () => ipcRenderer.invoke('get-failed-returns'),
    clearFailedReturns: () => ipcRenderer.invoke('clear-failed-returns'),

    // Debug function to test preload
    debug: () => "Preload script loaded successfully!"
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);