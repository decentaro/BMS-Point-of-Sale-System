import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import SessionStatus from './SessionStatus'
import SessionGuard from './SessionGuard'
import SessionManager from '../utils/SessionManager'
import HardwareStatus from './HardwareStatus'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import { AdminSettings, ApiResponse, BackupCapabilities, LocalBackupInfo } from '../types/AdminSettings'
import ApiClient from '../utils/ApiClient'
import { formatDateSync, formatTime } from '../utils/dateFormat'


const AdminPanel: React.FC = () => {
  const navigate = useNavigate()

  // Session and role validation handled by SessionGuard wrapper
  const goBack = () => {
    // Check user role from session manager
    const session = SessionManager.getCurrentSession()
    if (session) {
      // Navigate based on role
      if (session.role === 'Manager') {
        navigate('/manager')
      } else {
        navigate('/login')
      }
    } else {
      navigate('/login')
    }
  }

  // State management
  const [adminSettings, setAdminSettings] = React.useState<AdminSettings | null>(null)
  const [backupCapabilities, setBackupCapabilities] = React.useState<BackupCapabilities | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  const [saving, setSaving] = React.useState<boolean>(false)
  const [backupLoading, setBackupLoading] = React.useState<boolean>(false)
  const [restoreFile, setRestoreFile] = React.useState<File | null>(null)
  const [newConnectionString, setNewConnectionString] = React.useState<string>('')
  
  // Modal keyboard state (following shared pattern)
  type FormKeys = 'newConnectionString'
  const [kbOpen, setKbOpen] = React.useState<boolean>(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('qwerty')
  const [kbTitle, setKbTitle] = React.useState<string>('')
  const [kbTarget, setKbTarget] = React.useState<FormKeys>('newConnectionString')

  const openKb = (target: FormKeys, type: KeyboardType, title: string) => {
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
    setKbOpen(true)
  }

  const applyKb = (val: string) => {
    if (kbTarget === 'newConnectionString') {
      setNewConnectionString(val)
    }
    setKbOpen(false)
  }

  // Load admin settings and backup capabilities on component mount
  React.useEffect(() => {
    loadAdminSettings()
    loadBackupCapabilities()
  }, [])

  const loadAdminSettings = async () => {
    try {
      setLoading(true)
      const result: ApiResponse<AdminSettings> = await ApiClient.getJson('/AdminSettings')
      
      if (result.success && result.data) {
        setAdminSettings(result.data)
      } else {
        console.error('Failed to load admin settings:', result.message)
        alert('Failed to load admin settings: ' + result.message)
      }
    } catch (error) {
      console.error('Error loading admin settings:', error)
      alert('Error loading admin settings. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const loadBackupCapabilities = async () => {
    try {
      const result: ApiResponse<BackupCapabilities> = await ApiClient.getJson('/AdminSettings/backup/capabilities')
      
      if (result.success && result.data) {
        setBackupCapabilities(result.data)
      } else {
        console.error('Failed to load backup capabilities:', result.message)
      }
    } catch (error) {
      console.error('Error loading backup capabilities:', error)
    }
  }

  // Update check functions
  const checkForUpdates = async () => {
    if (!adminSettings) return
    
    setAdminSettings({...adminSettings, updateStatus: 'checking'})
    
    try {
      // Simulate checking for updates (this would be a real API call in production)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Simulate finding an update (or not)
      const hasUpdate = Math.random() > 0.5 // 50% chance for demo
      
      if (hasUpdate) {
        setAdminSettings({
          ...adminSettings,
          updateStatus: 'available',
          availableVersion: '1.3.0',
          updateDescription: 'New features:\n• Product categories system\n• Improved inventory management\n• Bug fixes and performance improvements'
        })
      } else {
        setAdminSettings({...adminSettings, updateStatus: 'up-to-date'})
      }
    } catch (err) {
      setAdminSettings({...adminSettings, updateStatus: 'error'})
    }
  }

  const downloadUpdate = async () => {
    if (!adminSettings) return
    
    setAdminSettings({...adminSettings, updateStatus: 'downloading'})
    
    try {
      // Simulate download progress
      await new Promise(resolve => setTimeout(resolve, 3000))
      setAdminSettings({...adminSettings, updateStatus: 'ready'})
    } catch (err) {
      setAdminSettings({...adminSettings, updateStatus: 'error'})
    }
  }

  const installUpdate = async () => {
    if (window.confirm('This will restart the application to install the update. Continue?')) {
      try {
        // TODO: Trigger actual update installation
        alert('Update will be installed and application will restart...')
        // In real implementation, this would trigger the installer
      } catch (err) {
        alert('Failed to install update!')
      }
    }
  }

  const openLogFolder = async () => {
    try {
      const result: ApiResponse<any> = await ApiClient.getJson('/AdminSettings/logs/folder')
      
      if (result.success && result.data) {
        // Try to open the folder using Electron shell
        if (window.electronAPI?.openPath) {
          const openResult = await window.electronAPI.openPath(result.data.folderPath)
          if (!openResult.success) {
            alert(`Failed to open folder: ${openResult.error}\n\nFolder location: ${result.data.folderPath}`)
          }
        } else {
          alert(`Log folder location:\n${result.data.folderPath}\n\nFiles found: ${result.data.fileCount}\n\nYou can manually navigate to this folder in your file manager.`)
        }
      } else {
        alert('Failed to get logs folder information: ' + result.message)
      }
    } catch (error) {
      console.error('Error opening log folder:', error)
      alert('Failed to open log folder!')
    }
  }

  const openSupabaseDashboard = () => {
    window.open('https://supabase.com/dashboard', '_blank')
  }

  const formatLastBackup = (lastBackup?: string, method?: string, size?: string) => {
    if (!lastBackup) return 'Never'
    const dateObj = new Date(lastBackup)
    const formattedDate = formatDateSync(dateObj)
    const formattedTime = formatTime(dateObj)
    const date = `${formattedDate}, ${formattedTime}`
    const methodText = method ? ` (${method})` : ''
    const sizeText = size ? ` • ${size}` : ''
    return `${date}${methodText}${sizeText}`
  }

  const viewLatestLog = async () => {
    try {
      const result: ApiResponse<any> = await ApiClient.getJson('/AdminSettings/logs/latest')
      
      if (result.success && result.data) {
        // Try to open the log file using Electron shell
        if (window.electronAPI?.openPath) {
          const openResult = await window.electronAPI.openPath(result.data.filePath)
          if (!openResult.success) {
            alert(`Failed to open file: ${openResult.error}\n\nFile location: ${result.data.filePath}`)
          }
        } else {
          const dateObj = new Date(result.data.lastModified)
          const formattedDate = formatDateSync(dateObj)
          const formattedTime = formatTime(dateObj)
          alert(`Latest log file:\n${result.data.fileName}\nLast modified: ${formattedDate}, ${formattedTime}\nLocation: ${result.data.filePath}\n\nYou can manually navigate to this file in your file manager.`)
        }
      } else {
        alert('Failed to get latest log file: ' + result.message)
      }
    } catch (error) {
      console.error('Error opening latest log file:', error)
      alert('Failed to open log file!')
    }
  }

  const handleSave = async () => {
    if (!adminSettings) return
    
    setSaving(true)
    try {
      const result: ApiResponse<AdminSettings> = await ApiClient.putJson('/AdminSettings', adminSettings)
      
      if (result.success && result.data) {
        setAdminSettings(result.data)
        alert('Admin settings saved successfully!')
      } else {
        alert('Failed to save admin settings: ' + result.message)
      }
    } catch (error) {
      console.error('Error saving admin settings:', error)
      alert('Error saving admin settings. Please check your connection.')
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setLoading(true)
    try {
      const result: ApiResponse<any> = await ApiClient.postJson('/AdminSettings/test-connection', {})
      
      if (result.success) {
        alert('Database connection successful!')
        // Reload admin settings to update connection status
        await loadAdminSettings()
      } else {
        alert('Database connection failed: ' + result.message)
      }
    } catch (error) {
      console.error('Error testing database connection:', error)
      alert('Database connection test failed. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBackup = async () => {
    if (!window.confirm('Create a manual backup of your database? This may take a few minutes.')) {
      return
    }
    
    setBackupLoading(true)
    try {
      const result: ApiResponse<any> = await ApiClient.postJson('/AdminSettings/backup/create', {})
      
      if (result.success) {
        await loadAdminSettings()
        await loadBackupCapabilities()
        alert(`Backup created successfully!\n\nBackup ID: ${result.data.backupId}\nSize: ${result.data.sizeFormatted}\nFiles: ${result.data.files}`)
      } else {
        alert(`Backup failed: ${result.message}\n\n${result.data?.suggestion || ''}`)
      }
    } catch (error) {
      console.error('Error creating database backup:', error)
      alert('Backup creation failed. Please check your connection and try again.')
    } finally {
      setBackupLoading(false)
    }
  }

  const handleRestoreBackup = async () => {
    if (!restoreFile) {
      alert('Please select a backup file to restore.')
      return
    }

    const fileSize = restoreFile.size ? (restoreFile.size / 1024 / 1024).toFixed(1) : 'Unknown'
    const confirmMessage = `Restore database from backup?\n\nFile: ${restoreFile.name}\nSize: ${fileSize} MB\n\n⚠️ WARNING: This will overwrite your current database!\n\nContinue?`
    
    if (!window.confirm(confirmMessage)) {
      return
    }
    
    setBackupLoading(true)
    try {
      const formData = new FormData()
      
      // Handle both regular File objects and our mock file objects with paths
      if (restoreFile.path) {
        // This is a file selected through Electron dialog
        // We need to read the file and create a proper File object
        if (window.electronAPI?.readFile) {
          try {
            const fileBuffer = await window.electronAPI.readFile(restoreFile.path)
            const blob = new Blob([fileBuffer])
            const file = new File([blob], restoreFile.name, { type: 'application/octet-stream' })
            formData.append('backupFile', file)
          } catch (err) {
            console.error('Error reading file:', err)
            alert('Error reading the selected backup file. Please try again.')
            return
          }
        } else {
          alert('File access not available in this environment. Please use a standard file browser.')
          return
        }
      } else {
        // This is a regular File object from file input
        formData.append('backupFile', restoreFile)
      }
      
      if (newConnectionString.trim()) {
        formData.append('newConnectionString', newConnectionString.trim())
      }

      const response = await ApiClient.request('/AdminSettings/backup/restore', {
        method: 'POST',
        body: formData,
        headers: {} // Let ApiClient handle FormData headers
      })
      
      const result: ApiResponse<any> = await response.json()
      
      if (result.success) {
        await loadAdminSettings()
        await loadBackupCapabilities()
        const dateObj = new Date(result.data.restoredAt)
        const formattedDate = formatDateSync(dateObj)
        const formattedTime = formatTime(dateObj)
        alert(`Database restored successfully!\n\nRestored from: ${result.data.backupFile}\nCompleted: ${formattedDate}, ${formattedTime}`)
        setRestoreFile(null)
        setNewConnectionString('')
      } else {
        alert(`Restore failed: ${result.message}\n\n${result.data?.suggestion || ''}`)
      }
    } catch (error) {
      console.error('Error restoring database:', error)
      alert('Database restore failed. Please check your connection and try again.')
    } finally {
      setBackupLoading(false)
    }
  }

  const handleChangeDatabase = async () => {
    const confirmed = window.confirm(
      'Change database connection?\n\n' +
      'WARNING: This will disconnect from your current database.\n' +
      'Make sure you have a backup before proceeding.\n\n' +
      'Continue?'
    )
    
    if (confirmed) {
      try {
        // TODO: Open database configuration modal/wizard
        alert('Database connection change wizard would open here.\n\nThis would guide you through:\n• Backing up current data\n• Testing new connection\n• Migrating data (if needed)')
      } catch (err) {
        alert('Failed to change database connection!')
      }
    }
  }

  const handleClearDatabase = async () => {
    const confirmed = window.confirm(
      '🚨 DANGER: Clear Entire Database?\n\n' +
      'This will DELETE ALL DATA including:\n' +
      '• All employees and login data\n' +
      '• All products and inventory\n' +
      '• All sales and transaction history\n' +
      '• All system settings\n\n' +
      '⚠️ THIS CANNOT BE UNDONE!\n\n' +
      'Are you absolutely sure?'
    )
    
    if (confirmed) {
      const doubleConfirm = window.confirm(
        'FINAL WARNING!\n\n' +
        'You will lose ALL DATA and need to:\n' +
        '1. Recreate all employees\n' +
        '2. Re-add all products\n' +
        '3. Reconfigure all settings\n\n' +
        'Click OK in the next dialog to proceed.'
      )
      
      if (doubleConfirm) {
        const finalConfirm = window.confirm('Final confirmation: Click OK ONLY if you want to permanently delete ALL data and reset the database.')
        
        if (finalConfirm) {
          setLoading(true)
          try {
            const result: ApiResponse<any> = await ApiClient.postJson('/AdminSettings/clear-database', {})
            
            if (result.success) {
              alert(`Database cleared successfully!\n\nAll tables and sequences dropped.\nDatabase schema will be recreated on next app start.\n\nDefault admin account will be:\nEmployee ID: 0001\nPIN: 0000\n\nRestarting application...`)
              
              // Clear session and reload the entire app to trigger migrations
              SessionManager.clearSession()
              window.location.href = '/login'
            } else {
              alert('Failed to clear database: ' + result.message)
            }
          } catch (error) {
            console.error('Error clearing database:', error)
            alert('Failed to clear database!')
          } finally {
            setLoading(false)
          }
        } else {
          alert('Database clear cancelled.')
        }
      }
    }
  }

  const handleSelectBackupFile = async () => {
    try {
      if (window.electronAPI?.showOpenDialog) {
        const result = await window.electronAPI.showOpenDialog({
          title: 'Select Backup File',
          defaultPath: './BMS_POS_API/backups', // Start in the API backups folder (relative to project root)
          filters: [
            { name: 'Backup Files', extensions: ['backup', 'sql'] },
            { name: 'All Files', extensions: ['*'] }
          ],
          properties: ['openFile']
        })

        if (!result.canceled && result.filePaths.length > 0) {
          // Create a File object from the selected path for compatibility with existing logic
          const filePath = result.filePaths[0]
          const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'backup'
          
          // We'll create a mock file object with the path information
          // The actual file handling will be done by the backend
          const mockFile = {
            name: fileName,
            path: filePath,
            size: 0 // We don't have size info from the dialog
          } as any
          
          setRestoreFile(mockFile)
        }
      } else {
        // Fallback to regular file input if Electron API is not available
        const fileInput = document.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = '.backup,.sql'
        fileInput.onchange = (e) => {
          const target = e.target as HTMLInputElement
          setRestoreFile(target.files?.[0] || null)
        }
        fileInput.click()
      }
    } catch (error) {
      console.error('Error selecting backup file:', error)
      // Fallback to regular file input
      const fileInput = document.createElement('input')
      fileInput.type = 'file'
      fileInput.accept = '.backup,.sql'
      fileInput.onchange = (e) => {
        const target = e.target as HTMLInputElement
        setRestoreFile(target.files?.[0] || null)
      }
      fileInput.click()
    }
  }

  if (loading || !adminSettings) {
    return (
      <SessionGuard requiredPermission="admin.view">
        <div className="w-full h-full flex flex-col bg-white">
          <header className="h-14 px-4 border-b flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={goBack}>← Back</Button>
            <div className="text-center">
              <h1 className="text-xl font-semibold text-emerald-600">Admin Panel</h1>
              <p className="text-[10px] text-muted-foreground">Technical settings</p>
            </div>
            <SessionStatus />
          </header>
          <main className="flex-1 p-6 bg-slate-50 overflow-y-auto flex items-center justify-center">
            <div className="text-center">
              <div className="text-gray-600 mb-2">Loading admin settings...</div>
              <div className="text-sm text-gray-500">Please wait while we load the technical settings</div>
            </div>
          </main>
        </div>
      </SessionGuard>
    )
  }

  return (
    <SessionGuard requiredPermission="admin.view">
      <div className="w-full h-full flex flex-col bg-white">
        {/* Header */}
        <header className="h-14 px-4 border-b flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={goBack}>← Back</Button>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-emerald-600">Admin Panel</h1>
            <p className="text-[10px] text-muted-foreground">Technical settings</p>
          </div>
          <SessionStatus />
        </header>

        {/* Body */}
        <main className="flex-1 p-4 bg-slate-50 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Warning */}
            <Card>
              <CardContent className="p-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="font-semibold text-red-800 mb-1">Administrator Panel</h3>
                  <p className="text-red-700 text-sm">Changes here affect system behavior and security. Use with caution.</p>
                </div>
              </CardContent>
            </Card>

            {/* Hardware Status */}
            <HardwareStatus />

            {/* Update Management */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-4">Software Update</h2>
                <div className="space-y-6">
                  
                  {/* Current Version */}
                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-gray-700 border-b pb-2">Current Version</h3>
                    <div className="bg-white border rounded-lg p-4">
                      <div className="text-center">
                        <div className="text-sm font-medium text-gray-600 mb-1">Current Version</div>
                        <div className="text-2xl font-bold text-gray-900">v{adminSettings.currentVersion}</div>
                        <div className="text-sm text-gray-500">Stable Release</div>
                      </div>
                    </div>
                  </div>

                  {/* Update Status */}
                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-gray-700 border-b pb-2">Update Status</h3>
                    <div className="bg-gray-50 border rounded-lg p-4">
                    {adminSettings.updateStatus === 'checking' && (
                      <div>
                        <div className="font-medium text-gray-800 mb-1">Checking for updates...</div>
                        <div className="text-sm text-gray-600">Please wait while we check for new versions</div>
                      </div>
                    )}

                    {adminSettings.updateStatus === 'up-to-date' && (
                      <div>
                        <div className="font-medium text-green-800 mb-1">BMS POS is up to date</div>
                        <div className="text-sm text-gray-600">You have the latest version {adminSettings.currentVersion}</div>
                      </div>
                    )}

                    {adminSettings.updateStatus === 'available' && (
                      <div>
                        <div className="font-medium text-blue-800 mb-1">Update Available</div>
                        <div className="text-sm text-gray-600 mb-3">Version {adminSettings.availableVersion} is now available</div>
                        {adminSettings.updateDescription && (
                          <div className="bg-white border rounded p-3">
                            <div className="text-sm font-medium text-gray-700 mb-2">What's new in this update:</div>
                            <div className="text-sm text-gray-600 whitespace-pre-line">
                              {adminSettings.updateDescription}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {adminSettings.updateStatus === 'downloading' && (
                      <div>
                        <div className="font-medium text-blue-800 mb-1">Downloading update...</div>
                        <div className="text-sm text-gray-600">Please wait while the update downloads</div>
                      </div>
                    )}

                    {adminSettings.updateStatus === 'ready' && (
                      <div>
                        <div className="font-medium text-green-800 mb-1">Update Ready to Install</div>
                        <div className="text-sm text-gray-600">Version {adminSettings.availableVersion} has been downloaded and is ready to install</div>
                      </div>
                    )}

                    {adminSettings.updateStatus === 'error' && (
                      <div>
                        <div className="font-medium text-red-800 mb-1">Update Check Failed</div>
                        <div className="text-sm text-gray-600">Unable to check for updates. Please check your internet connection and try again</div>
                      </div>
                    )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-gray-700 border-b pb-2">Actions</h3>
                    <div className="flex gap-3">
                    {adminSettings.updateStatus === 'up-to-date' && (
                      <Button 
                        onClick={checkForUpdates}
                        disabled={adminSettings.updateStatus === 'checking'}
                        variant="outline"
                      >
                        Check for Updates
                      </Button>
                    )}

                    {adminSettings.updateStatus === 'available' && (
                      <>
                        <Button 
                          onClick={downloadUpdate}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Download Update
                        </Button>
                        <Button 
                          onClick={checkForUpdates}
                          variant="outline"
                        >
                          Check Again
                        </Button>
                      </>
                    )}

                    {adminSettings.updateStatus === 'ready' && (
                      <>
                        <Button 
                          onClick={installUpdate}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Install & Restart
                        </Button>
                        <Button 
                          onClick={checkForUpdates}
                          variant="outline"
                        >
                          Check for Newer Updates
                        </Button>
                      </>
                    )}

                    {adminSettings.updateStatus === 'error' && (
                      <Button 
                        onClick={checkForUpdates}
                        variant="outline"
                      >
                        Try Again
                      </Button>
                    )}
                    </div>
                    
                    <p className="text-xs text-blue-600">
                      Updates are checked manually for full control over when your system updates.
                    </p>
                  </div>

                </div>
              </CardContent>
            </Card>

            {/* Security & Access */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-4">Security & Access</h2>
                <div className="space-y-6">

                  {/* PIN Requirements */}
                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-gray-700 border-b pb-2">PIN Security</h3>
                    
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        id="strongPins"
                        checked={adminSettings.requireStrongPins}
                        onChange={(e) => setAdminSettings({...adminSettings, requireStrongPins: e.target.checked})}
                        className="w-4 h-4"
                      />
                      <label htmlFor="strongPins" className="text-sm font-medium">
                        Require strong PINs (6+ digits, no repeated patterns)
                      </label>
                    </div>
                  </div>

                  {/* Login Controls */}
                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-gray-700 border-b pb-2">Login Controls</h3>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">Failed Login Attempts</label>
                      <select 
                        className="w-full p-3 border rounded-lg"
                        value={adminSettings.maxFailedLoginAttempts}
                        onChange={(e) => setAdminSettings({...adminSettings, maxFailedLoginAttempts: parseInt(e.target.value)})}
                      >
                        <option value="3">3 attempts</option>
                        <option value="5">5 attempts (recommended)</option>
                        <option value="10">10 attempts</option>
                        <option value="0">Unlimited (not recommended)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Lock account after this many failed login attempts</p>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>

            {/* System Performance */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-4">System Performance</h2>
                <div className="space-y-6">

                  {/* Logging Configuration */}
                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-gray-700 border-b pb-2">Logging Configuration</h3>
                    
                    <div>
                      <label className="block text-sm font-medium mb-2">Log Level</label>
                      <select 
                        className="w-full p-3 border rounded-lg"
                        value={adminSettings.logLevel}
                        onChange={(e) => setAdminSettings({...adminSettings, logLevel: e.target.value})}
                      >
                        <option value="error">Error - Only critical errors</option>
                        <option value="warning">Warning - Errors and warnings</option>
                        <option value="info">Info - Normal operation info (recommended)</option>
                        <option value="debug">Debug - Detailed diagnostic info</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Higher levels provide more detail but may affect performance</p>
                    </div>
                  </div>

                  {/* Performance Settings */}
                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-gray-700 border-b pb-2">Performance Settings</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          id="performanceMetrics"
                          checked={adminSettings.performanceMetricsEnabled}
                          onChange={(e) => setAdminSettings({...adminSettings, performanceMetricsEnabled: e.target.checked})}
                          className="w-4 h-4"
                        />
                        <label htmlFor="performanceMetrics" className="text-sm font-medium">
                          Enable performance metrics collection
                        </label>
                      </div>

                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          id="cacheEnabled"
                          checked={adminSettings.cacheEnabled}
                          onChange={(e) => setAdminSettings({...adminSettings, cacheEnabled: e.target.checked})}
                          className="w-4 h-4"
                        />
                        <label htmlFor="cacheEnabled" className="text-sm font-medium">
                          Enable data caching (improves performance)
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Log File Access */}
                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-gray-700 border-b pb-2">Log Files</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-gray-600 mb-3">Access system log files for troubleshooting</div>
                        <div className="flex gap-3">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={viewLatestLog}
                            className="text-xs"
                          >
                            View Latest Log
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={openLogFolder}
                            className="text-xs"
                          >
                            Open Log Folder
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>

            {/* Database Management */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold mb-4">Database Management</h2>
                <div className="space-y-6">

                  {/* Database Connection */}
                  <div className="space-y-4">
                    <h3 className="text-md font-medium text-gray-700 border-b pb-2">Database Connection</h3>
                    <div className="bg-gray-50 border rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-3 h-3 rounded-full ${
                            adminSettings.databaseStatus === 'Connected' ? 'bg-green-500' : 'bg-red-500'
                          }`}></span>
                          <div>
                            <div className="font-medium text-gray-800">
                              {adminSettings.databaseStatus === 'Connected' ? 'Connected' : 'Disconnected'}
                            </div>
                            <div className="text-sm text-gray-600">
                              Database: ****base.supabase.co
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleTestConnection}
                            disabled={loading}
                          >
                            {loading ? 'Testing...' : 'Test Connection'}
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleChangeDatabase}
                            className="border-orange-200 text-orange-700 hover:bg-orange-50"
                          >
                            Change Database
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleClearDatabase}
                            className="border-red-200 text-red-700 hover:bg-red-50"
                          >
                            Clear Database
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Backup System - Dynamic based on Supabase Plan */}
                  {backupCapabilities && (
                    <div className="space-y-4">
                      <h3 className="text-md font-medium text-gray-700 border-b pb-2">Database Backup & Recovery</h3>
                      
                      {/* Plan Status */}
                      <div className="bg-white border rounded-lg p-4 mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <div>
                            <div className="font-medium text-gray-800">
                              Supabase Plan: {backupCapabilities.plan}
                            </div>
                            <div className="text-sm text-gray-600">
                              {backupCapabilities.automaticBackups 
                                ? '✅ Automatic daily backups enabled' 
                                : '⚠️ No automatic backups (Free tier)'}
                            </div>
                          </div>
                          {backupCapabilities.automaticBackups && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={openSupabaseDashboard}
                            >
                              View in Supabase
                            </Button>
                          )}
                        </div>
                        
                        <div className="text-sm text-gray-600">
                          {backupCapabilities.message}
                        </div>
                      </div>

                      {/* Manual Backup Section */}
                      {backupCapabilities.manualBackupNeeded && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                          <div className="flex justify-between items-center mb-3">
                            <div>
                              <div className="font-medium text-yellow-800">Manual Backup Required</div>
                              <div className="text-sm text-yellow-700">
                                Last backup: {formatLastBackup(adminSettings.lastBackup, adminSettings.lastBackupMethod, adminSettings.lastBackupSize)}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex gap-3 mb-3">
                            <Button 
                              onClick={handleCreateBackup}
                              disabled={backupLoading}
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              {backupLoading ? 'Creating Backup...' : 'Create Backup Now'}
                            </Button>
                          </div>

                          {backupCapabilities.localBackupsAvailable && (
                            <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded p-3">
                              <div className="font-medium mb-1">Local backups: {backupCapabilities.totalLocalBackups}</div>
                              <div>Total size: {(backupCapabilities.totalBackupSize / 1024 / 1024).toFixed(1)} MB</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Automatic Backup Info (Pro+ plans) */}
                      {backupCapabilities.automaticBackups && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                          <div className="font-medium text-green-800 mb-2">Automatic Backup Status</div>
                          <div className="text-sm text-green-700 space-y-1">
                            <div>• Daily backups enabled by Supabase</div>
                            <div>• Last backup: {formatLastBackup(adminSettings.lastBackup, adminSettings.lastBackupMethod, adminSettings.lastBackupSize)}</div>
                            <div>• Retention based on your plan</div>
                          </div>
                          
                          <div className="flex gap-3 mt-3">
                            <Button 
                              onClick={handleCreateBackup}
                              disabled={backupLoading}
                              variant="outline"
                              size="sm"
                            >
                              {backupLoading ? 'Creating...' : 'Create Extra Backup'}
                            </Button>
                            <Button 
                              variant="outline"
                              size="sm"
                              onClick={openSupabaseDashboard}
                            >
                              Manage Backups
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Restore Section */}
                      <div className="bg-gray-50 border rounded-lg p-4">
                        <div className="font-medium text-gray-800 mb-3">Restore Database</div>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium mb-2">Select backup file</label>
                            <div className="space-y-3">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleSelectBackupFile}
                                className="text-blue-700 border-blue-300 hover:bg-blue-50"
                              >
                                Browse Backup Files
                              </Button>
                              <p className="text-xs text-gray-500">
                                Supports .backup (Supabase) and .sql files. Opens directly in the backups folder.
                              </p>
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium mb-2">New connection string (optional)</label>
                            <HybridInput
                              type="text"
                              placeholder="postgresql://user:password@host:port/database"
                              value={newConnectionString}
                              onChange={setNewConnectionString}
                              onTouchKeyboard={() => openKb('newConnectionString', 'qwerty', 'Connection String')}
                              className="w-full p-2 text-sm border rounded"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Leave empty to restore to current database
                            </p>
                          </div>
                          
                          <div className="flex gap-3">
                            <Button 
                              onClick={handleRestoreBackup}
                              disabled={backupLoading || !restoreFile}
                              className="bg-red-600 hover:bg-red-700 text-white"
                            >
                              {backupLoading ? 'Restoring...' : 'Restore Database'}
                            </Button>
                            {restoreFile && (
                              <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setRestoreFile(null)
                                  setNewConnectionString('')
                                }}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                          
                          {restoreFile && (
                            <div className="text-xs text-gray-600 bg-white border rounded p-2">
                              Selected: {restoreFile.name} {restoreFile.size > 0 ? `(${(restoreFile.size / 1024 / 1024).toFixed(1)} MB)` : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded p-3">
                        <div className="font-medium mb-1">Backup includes:</div>
                        <ul className="list-disc list-inside space-y-0.5">
                          <li>All sales, products, employees, and settings data</li>
                          <li>Database structure, relationships, and security policies</li>
                          <li>Complete system state for disaster recovery</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    Database credentials are configured during initial setup and stored securely.
                  </p>

                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button 
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-8"
              >
                {saving ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Saving...</span>
                  </div>
                ) : (
                  'Save Admin Settings'
                )}
              </Button>
            </div>

          </div>
        </main>

        {/* Modal Keyboard */}
        <ModalKeyboard
          open={kbOpen}
          type={kbType}
          title={kbTitle}
          initialValue={kbTarget === 'newConnectionString' ? newConnectionString : ''}
          onSubmit={applyKb}
          onClose={() => setKbOpen(false)}
        />

      </div>
    </SessionGuard>
  )
}

export default AdminPanel