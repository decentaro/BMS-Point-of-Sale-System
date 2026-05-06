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
import { AdminSettings, ApiResponse, BackupCapabilities } from '../types/AdminSettings'
import { ElectronFile } from '../../types/electron'
import ApiClient from '../utils/ApiClient'
import { useConnection } from '../contexts/ConnectionContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateSync, formatTime } from '../utils/dateFormat'
import { SectionLoader } from './ui/LoadingSpinner'
import {
  AlertTriangle, RefreshCw, Download, CheckCircle2, XCircle,
  Shield, Lock, Activity, FileText, Database, ArchiveRestore,
  Save, Wifi, FolderOpen, ExternalLink, Trash2, Settings2,
  ChevronRight, Info, Clock, HardDrive, X, ArrowLeft
} from 'lucide-react'

const NAVY = 'hsl(215,65%,30%)'


const AdminPanel: React.FC = () => {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { isOnline } = useConnection()

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
  const [selectedLocalBackupId, setSelectedLocalBackupId] = React.useState<string>('')
  const [newConnectionString, setNewConnectionString] = React.useState<string>('')
  
  // Terminal identity state
  const [terminalId, setTerminalId] = React.useState<string>('')
  const [terminalName, setTerminalName] = React.useState<string>('')
  const [terminalSaving, setTerminalSaving] = React.useState<boolean>(false)
  const [appVersion, setAppVersion] = React.useState<string>('')

  React.useEffect(() => {
    if (window.electronAPI?.getTerminalConfig) {
      window.electronAPI.getTerminalConfig().then((cfg: { terminalId: string | null, terminalName: string | null }) => {
        setTerminalId(cfg.terminalId ?? '')
        setTerminalName(cfg.terminalName ?? '')
      })
    }
    window.electronAPI?.getAppVersion?.().then((v: string) => setAppVersion(v))
  }, [])

  const handleSaveTerminal = async () => {
    const id = terminalId.trim()
    const name = terminalName.trim()
    if (!id) { showToast('Terminal ID is required', 'error'); return }
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(id)) {
      showToast('Terminal ID must be 1–20 characters: letters, numbers, - or _', 'error')
      return
    }
    if (!window.electronAPI?.setTerminalConfig) {
      showToast('Terminal config not available', 'error')
      return
    }
    setTerminalSaving(true)
    try {
      await window.electronAPI.setTerminalConfig({ terminalId: id, terminalName: name || null })
      ApiClient.setTerminalId(id, name || null)
      showToast('Terminal identity saved', 'success')
    } catch (err: any) {
      showToast(err?.message ?? 'Failed to save terminal config', 'error')
    } finally {
      setTerminalSaving(false)
    }
  }

  // Modal keyboard state (following shared pattern)
  type FormKeys = 'newConnectionString' | 'clearManagerPin' | 'terminalId' | 'terminalName'
  const [kbOpen, setKbOpen] = React.useState<boolean>(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('qwerty')
  const [kbTitle, setKbTitle] = React.useState<string>('')
  const [kbTarget, setKbTarget] = React.useState<FormKeys>('newConnectionString')

  // Cursor visibility (stored in localStorage, applied globally)
  const [cursorEnabled, setCursorEnabled] = React.useState<boolean>(
    () => localStorage.getItem('bms-show-cursor') !== 'false'
  )

  const toggleCursor = (enabled: boolean) => {
    setCursorEnabled(enabled)
    localStorage.setItem('bms-show-cursor', String(enabled))
    window.dispatchEvent(new Event('bms:cursor-changed'))
  }

  // Log viewer modal state
  const [logModal, setLogModal] = React.useState<{
    open: boolean
    fileName: string
    lines: string[]
    loading: boolean
    showAll: boolean
  }>({ open: false, fileName: '', lines: [], loading: false, showAll: false })

  // Clear database modal state
  const [showClearModal, setShowClearModal] = React.useState<boolean>(false)
  const [clearConfirmPhrase, setClearConfirmPhrase] = React.useState<string>('')
  const [clearManagerPin, setClearManagerPin] = React.useState<string>('')
  const [clearLoading, setClearLoading] = React.useState<boolean>(false)

  // Generic confirm modal state (used for backup/restore/update/db change confirmations)
  const pendingConfirmAction = React.useRef<() => void>(() => {})
  const [confirmModal, setConfirmModal] = React.useState<{
    open: boolean
    title: string
    body: React.ReactNode
    confirmLabel: string
    variant: 'warning' | 'danger'
  }>({ open: false, title: '', body: null, confirmLabel: 'Confirm', variant: 'warning' })

  const openConfirmModal = (
    title: string,
    body: React.ReactNode,
    confirmLabel: string,
    variant: 'warning' | 'danger',
    action: () => void
  ) => {
    pendingConfirmAction.current = action
    setConfirmModal({ open: true, title, body, confirmLabel, variant })
  }

  const handleConfirmAction = () => {
    setConfirmModal(m => ({ ...m, open: false }))
    pendingConfirmAction.current()
  }

  const openKb = (target: FormKeys, type: KeyboardType, title: string) => {
    setKbTarget(target)
    setKbType(type)
    setKbTitle(title)
    setKbOpen(true)
  }

  const applyKb = (val: string) => {
    if (kbTarget === 'newConnectionString') setNewConnectionString(val)
    else if (kbTarget === 'clearManagerPin') setClearManagerPin(val)
    else if (kbTarget === 'terminalId') setTerminalId(val)
    else if (kbTarget === 'terminalName') setTerminalName(val)
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
        showToast('Failed to load admin settings. Check your connection.', 'error')
      }
    } catch (error) {
      console.error('Error loading admin settings:', error)
      showToast('Error loading admin settings. Check your connection.', 'error')
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

  // Listen for real auto-updater events from main process
  React.useEffect(() => {
    if (!window.electronAPI?.onUpdaterStatus) return
    return window.electronAPI.onUpdaterStatus(({ event, version }) => {
      setAdminSettings(prev => {
        if (!prev) return prev
        switch (event) {
          case 'checking':    return { ...prev, updateStatus: 'checking' }
          case 'available':   return { ...prev, updateStatus: 'available', availableVersion: version ?? prev.availableVersion }
          case 'up-to-date':  return { ...prev, updateStatus: 'up-to-date' }
          case 'downloading': return { ...prev, updateStatus: 'downloading' }
          case 'ready':       return { ...prev, updateStatus: 'ready', availableVersion: version ?? prev.availableVersion }
          case 'error':       return { ...prev, updateStatus: 'error' }
          default:            return prev
        }
      })
    })
  }, [])

  // Update check functions
  const checkForUpdates = async () => {
    if (!adminSettings) return
    setAdminSettings(prev => prev ? { ...prev, updateStatus: 'checking' } : prev)
    const result = await window.electronAPI?.checkForUpdates?.()
    if (result && !result.success && result.error) {
      showToast(result.error, 'error')
    }
  }

  const downloadUpdate = () => { /* auto-download is handled by electron-updater */ }

  const installUpdate = () => {
    openConfirmModal(
      'Install Update',
      'This will restart the application to install the update.',
      'Restart & Install',
      'warning',
      async () => {
        try {
          await window.electronAPI?.installUpdate?.()
        } catch (err) {
          showToast('Failed to install update', 'error')
        }
      }
    )
  }

  const openLogViewer = async () => {
    setLogModal({ open: true, fileName: '', lines: [], loading: true, showAll: false })
    try {
      const result: ApiResponse<any> = await ApiClient.getJson('/AdminSettings/logs/content?lines=500')
      if (result.success && result.data) {
        setLogModal({ open: true, fileName: result.data.fileName, lines: result.data.lines ?? [], loading: false, showAll: false })
      } else {
        setLogModal(m => ({ ...m, loading: false }))
        showToast('No log files found.', 'error')
      }
    } catch (error) {
      console.error('Error loading log content:', error)
      setLogModal(m => ({ ...m, loading: false }))
      showToast('Failed to load log content', 'error')
    }
  }

  const parseLogLine = (line: string) => {
    try {
      const obj = JSON.parse(line)
      const level = (obj.Level || obj.level || 'Information') as string
      const src = (obj.Properties?.SourceContext || '') as string
      const isFrameworkNoise = src.startsWith('Microsoft.') || src.startsWith('System.')
      const ts = obj.Timestamp || obj.timestamp || ''
      const time = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
      const msg = (obj.RenderedMessage || obj.MessageTemplate || obj.message || line).split('\n')[0].slice(0, 200)
      return { level, isFrameworkNoise, time, msg }
    } catch {
      return { level: 'Information', isFrameworkNoise: false, time: '', msg: line.slice(0, 200) }
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


  const handleSave = async () => {
    if (!adminSettings) return
    
    setSaving(true)
    try {
      const result: ApiResponse<AdminSettings> = await ApiClient.putJson('/AdminSettings', adminSettings)
      
      if (result.success && result.data) {
        setAdminSettings(result.data)
        showToast('Admin settings saved successfully', 'success')
      } else {
        showToast('Failed to save admin settings.', 'error')
      }
    } catch (error) {
      console.error('Error saving admin settings:', error)
      showToast('Error saving admin settings. Check your connection.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setLoading(true)
    try {
      const result: ApiResponse<any> = await ApiClient.postJson('/AdminSettings/test-connection', {})
      
      if (result.success) {
        showToast('Database connection successful', 'success')
        // Reload admin settings to update connection status
        await loadAdminSettings()
      } else {
        showToast('Database connection failed. Check your settings.', 'error')
      }
    } catch (error) {
      console.error('Error testing database connection:', error)
      showToast('Database connection test failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBackup = () => {
    openConfirmModal(
      'Create Backup',
      'Create a manual backup of your database? This may take a few minutes.',
      'Create Backup',
      'warning',
      async () => {
        setBackupLoading(true)
        try {
          const result: ApiResponse<any> = await ApiClient.postJson('/AdminSettings/backup/create', {})
          if (result.success) {
            await loadAdminSettings()
            await loadBackupCapabilities()
            showToast('Backup created. ID: ' + result.data.backupId + ' | Size: ' + result.data.sizeFormatted, 'success')
          } else {
            showToast('Backup failed. Please try again.', 'error')
          }
        } catch (error) {
          console.error('Error creating database backup:', error)
          showToast('Backup creation failed. Check your connection.', 'error')
        } finally {
          setBackupLoading(false)
        }
      }
    )
  }

  const handleRestoreBackup = () => {
    if (!restoreFile && !selectedLocalBackupId) {
      showToast('Please select a backup to restore', 'warning')
      return
    }

    const isLocal = !!selectedLocalBackupId && !restoreFile
    const localBackup = isLocal
      ? backupCapabilities?.localBackups?.find(b => b.backupId === selectedLocalBackupId)
      : undefined
    const fileName = isLocal ? (localBackup?.backupId ?? selectedLocalBackupId) : (restoreFile?.name ?? '')
    const fileSize = isLocal
      ? (localBackup ? (localBackup.size / 1024 / 1024).toFixed(1) : 'Unknown')
      : (restoreFile?.size ? (restoreFile.size / 1024 / 1024).toFixed(1) : 'Unknown')

    openConfirmModal(
      'Restore Database',
      <div className="space-y-3">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs space-y-1 text-red-800">
          <p className="font-semibold text-red-700 uppercase tracking-wide text-[10px]">Warning — this will overwrite your current database</p>
          <p><span className="font-medium">{isLocal ? 'Backup' : 'File'}:</span> {fileName}</p>
          <p><span className="font-medium">Size:</span> {fileSize} MB</p>
        </div>
        <p className="text-sm text-slate-600">Make sure you have a recent backup before proceeding. This operation cannot be undone.</p>
      </div>,
      'Restore Database',
      'danger',
      async () => {
        setBackupLoading(true)
    try {
      let result: ApiResponse<any>

      if (isLocal) {
        // Local backup — server already has the files, no upload needed.
        result = await ApiClient.postJson('/AdminSettings/backup/restore-local', {
          backupId: selectedLocalBackupId,
          newConnectionString: newConnectionString.trim() || null
        })
      } else {
        // Imported file from native dialog — upload as multipart.
        const formData = new FormData()

        if (restoreFile && (restoreFile as ElectronFile).path) {
          if (window.electronAPI?.readFile) {
            try {
              const fileBuffer = await window.electronAPI.readFile((restoreFile as ElectronFile).path)
              const blob = new Blob([new Uint8Array(fileBuffer as unknown as ArrayBuffer)])
              const file = new File([blob], restoreFile.name, { type: 'application/octet-stream' })
              formData.append('backupFile', file)
            } catch (err) {
              console.error('Error reading file:', err)
              showToast('Error reading the backup file. Please try again.', 'error')
              return
            }
          } else {
            showToast('File access not available. Use a standard file browser.', 'warning')
            return
          }
        } else if (restoreFile) {
          formData.append('backupFile', restoreFile)
        }

        if (newConnectionString.trim()) {
          formData.append('newConnectionString', newConnectionString.trim())
        }

        const response = await ApiClient.request('/AdminSettings/backup/restore', {
          method: 'POST',
          body: formData,
          headers: {}
        })
        result = await response.json()
      }

      if (result.success) {
        await loadAdminSettings()
        await loadBackupCapabilities()
        showToast('Database restored successfully from ' + (result.data?.backupFile ?? fileName), 'success')
        setRestoreFile(null)
        setSelectedLocalBackupId('')
        setNewConnectionString('')
      } else {
        showToast('Restore failed. Check the backup and try again.', 'error')
      }
    } catch (error) {
      console.error('Error restoring database:', error)
      showToast('Database restore failed. Check your connection.', 'error')
    } finally {
      setBackupLoading(false)
    }
      }
    )
  }

  const handleChangeDatabase = () => {
    openConfirmModal(
      'Change Database Connection',
      <div className="space-y-2">
        <p className="text-sm text-slate-700 font-medium">This will disconnect from your current database.</p>
        <p className="text-sm text-slate-600">Make sure you have a recent backup before proceeding.</p>
      </div>,
      'Continue',
      'warning',
      () => {
        try {
          // TODO: Open database configuration modal/wizard
          showToast('Database connection change not available in this build', 'info')
        } catch (err) {
          showToast('Failed to change database connection', 'error')
        }
      }
    )
  }

  const handleClearDatabase = () => {
    setClearConfirmPhrase('')
    setClearManagerPin('')
    setShowClearModal(true)
  }

  const handleConfirmClearDatabase = async () => {
    if (clearConfirmPhrase !== 'CLEAR DATABASE' || clearManagerPin.length < 4) return
    setClearLoading(true)
    try {
      const result: ApiResponse<any> = await ApiClient.postJson('/AdminSettings/clear-database', {
        managerPin: clearManagerPin,
        confirmationPhrase: clearConfirmPhrase
      })
      if (result.success) {
        showToast('Database cleared successfully. Restarting application...', 'success')
        SessionManager.clearSession()
        setShowClearModal(false)
        window.location.href = '/login'
      } else {
        showToast('Failed to clear database. Please try again.', 'error')
      }
    } catch (error) {
      console.error('Error clearing database:', error)
      showToast('Failed to clear database', 'error')
    } finally {
      setClearLoading(false)
    }
  }

  const handleSelectBackupFile = async () => {
    try {
      if (window.electronAPI?.showOpenDialog) {
        const dialogOptions: any = {
          title: 'Select Backup File',
          filters: [
            { name: 'Backup Files', extensions: ['backup', 'sql'] },
            { name: 'All Files', extensions: ['*'] }
          ],
          properties: ['openFile']
        }
        if (backupCapabilities?.backupsFolder) {
          dialogOptions.defaultPath = backupCapabilities.backupsFolder
        }
        const result = await window.electronAPI.showOpenDialog(dialogOptions)

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

  // ── Shared sub-components ────────────────────────────────────────────────

  const SectionHeader = ({ icon: Icon, label, color = 'emerald' }: {
    icon: React.ElementType
    label: string
    color?: 'emerald' | 'navy' | 'red' | 'amber'
  }) => {
    const colors = {
      emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      navy:    'text-[hsl(215,65%,30%)] bg-slate-50 border-slate-200',
      red:     'text-red-600 bg-red-50 border-red-200',
      amber:   'text-amber-600 bg-amber-50 border-amber-200',
    }
    return (
      <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${colors[color]} mb-4`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm font-semibold tracking-wide uppercase">{label}</span>
      </div>
    )
  }

  const ToggleRow = ({ id, checked, onChange, label, sub }: {
    id: string; checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string
  }) => (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-4 py-3 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-colors"
    >
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
      <div className="relative flex-shrink-0">
        <input id={id} type="checkbox" className="sr-only peer" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className="w-10 h-6 rounded-full bg-slate-200 peer-checked:bg-emerald-500 transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </div>
    </label>
  )

  const StyledSelect = ({ value, onChange, children, hint }: {
    value: string | number; onChange: (v: string) => void; children: React.ReactNode; hint?: string
  }) => (
    <div>
      <div className="relative">
        <select
          className="w-full appearance-none border border-slate-300 rounded-lg px-4 py-2.5 pr-10 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {children}
        </select>
        <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 rotate-90 pointer-events-none" />
      </div>
      {hint && <p className="text-xs text-slate-500 mt-1.5">{hint}</p>}
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SessionGuard requiredPermission="admin.view">
      <div className="w-full h-full flex flex-col">
        <header
          className="h-16 px-5 flex items-center justify-between flex-shrink-0"
          style={{ background: NAVY }}
        >
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-white/70 hover:text-white border border-white/25 hover:border-white/50 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>

          <div className="text-center">
            <div className="text-white text-lg font-bold leading-tight tracking-tight">Admin Panel</div>
            <div className="text-white/50 text-[11px] font-medium mt-0.5">System configuration &amp; technical settings</div>
          </div>

          <SessionStatus dark />
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-100">
          {(loading || !adminSettings) ? (
            <SectionLoader message="Loading admin settings..." />
          ) : (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

              {/* ── Caution Banner ─────────────────────────────────────── */}
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Restricted Area</p>
                  <p className="text-xs text-red-600 mt-0.5">Changes here affect system behaviour and security. Proceed with caution.</p>
                </div>
              </div>

              {/* ── Hardware Status ────────────────────────────────────── */}
              <HardwareStatus />

              {/* ── Software Update ────────────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-white">
                  <SectionHeader icon={RefreshCw} label="Software Update" color="emerald" />

                  {/* Version badge + status */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100">
                        <Settings2 className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-medium">Installed Version</div>
                        <div className="text-xl font-bold text-slate-900 leading-none mt-0.5">v{appVersion || adminSettings.currentVersion}</div>
                        <div className="text-[10px] text-emerald-600 font-medium mt-0.5">Stable Release</div>
                      </div>
                    </div>

                    {/* Status pill */}
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${
                      adminSettings.updateStatus === 'up-to-date'  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      adminSettings.updateStatus === 'available'   ? 'bg-blue-50   text-blue-700   border-blue-200'    :
                      adminSettings.updateStatus === 'ready'       ? 'bg-green-50  text-green-700  border-green-200'   :
                      adminSettings.updateStatus === 'error'       ? 'bg-red-50    text-red-700    border-red-200'     :
                      adminSettings.updateStatus === 'checking' || adminSettings.updateStatus === 'downloading'
                                                                    ? 'bg-slate-50  text-slate-700  border-slate-200'  :
                                                                      'bg-slate-50  text-slate-600  border-slate-200'
                    }`}>
                      {(adminSettings.updateStatus === 'checking' || adminSettings.updateStatus === 'downloading') &&
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                      {adminSettings.updateStatus === 'up-to-date'  && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {adminSettings.updateStatus === 'available'   && <Download className="w-3.5 h-3.5" />}
                      {adminSettings.updateStatus === 'ready'       && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {adminSettings.updateStatus === 'error'       && <XCircle className="w-3.5 h-3.5" />}
                      <span className="capitalize">{
                        adminSettings.updateStatus === 'up-to-date'  ? 'Up to Date' :
                        adminSettings.updateStatus === 'available'   ? `v${adminSettings.availableVersion} Available` :
                        adminSettings.updateStatus === 'ready'       ? 'Ready to Install' :
                        adminSettings.updateStatus === 'checking'    ? 'Checking...' :
                        adminSettings.updateStatus === 'downloading' ? 'Downloading...' :
                        adminSettings.updateStatus === 'error'       ? 'Check Failed' : adminSettings.updateStatus
                      }</span>
                    </div>
                  </div>

                  {/* Update notes */}
                  {adminSettings.updateStatus === 'available' && adminSettings.updateDescription && (
                    <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800 whitespace-pre-line">
                      <p className="font-semibold mb-1">What's new in v{adminSettings.availableVersion}:</p>
                      {adminSettings.updateDescription}
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex items-center gap-3">
                    {(adminSettings.updateStatus === 'up-to-date' || adminSettings.updateStatus === 'error') && (
                      <Button onClick={checkForUpdates} variant="outline" className="gap-2">
                        <RefreshCw className="w-3.5 h-3.5" />
                        {adminSettings.updateStatus === 'error' ? 'Try Again' : 'Check for Updates'}
                      </Button>
                    )}
                    {adminSettings.updateStatus === 'available' && (
                      <>
                        <Button onClick={downloadUpdate} className="bg-[hsl(215,65%,30%)] hover:bg-[hsl(215,65%,25%)] text-white gap-2">
                          <Download className="w-3.5 h-3.5" /> Download Update
                        </Button>
                        <Button onClick={checkForUpdates} variant="outline" className="gap-2">
                          <RefreshCw className="w-3.5 h-3.5" /> Check Again
                        </Button>
                      </>
                    )}
                    {adminSettings.updateStatus === 'ready' && (
                      <>
                        <Button onClick={installUpdate} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Install & Restart
                        </Button>
                        <Button onClick={checkForUpdates} variant="outline" size="sm">Check for Newer</Button>
                      </>
                    )}
                    <span className="text-xs text-slate-400 flex items-center gap-1 ml-auto">
                      <Info className="w-3 h-3" /> Updates are applied manually
                    </span>
                  </div>
                </div>
              </Card>

              {/* ── Security & Access ──────────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardContent className="p-5">
                  <SectionHeader icon={Shield} label="Security & Access" color="navy" />

                  <div className="space-y-3">
                    <ToggleRow
                      id="strongPins"
                      checked={adminSettings.requireStrongPins}
                      onChange={v => setAdminSettings({...adminSettings, requireStrongPins: v})}
                      label="Require Strong PINs"
                      sub="Minimum 6 digits, no repeated or sequential patterns (e.g. 1111, 1234)"
                    />

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-slate-500" />
                        <label className="text-sm font-medium text-slate-700">Failed Login Lockout</label>
                      </div>
                      <StyledSelect
                        value={adminSettings.maxFailedLoginAttempts}
                        onChange={v => setAdminSettings({...adminSettings, maxFailedLoginAttempts: parseInt(v)})}
                        hint="Account is locked after this many failed PIN attempts"
                      >
                        <option value="3">3 attempts</option>
                        <option value="5">5 attempts (recommended)</option>
                        <option value="10">10 attempts</option>
                        <option value="0">Unlimited (not recommended)</option>
                      </StyledSelect>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Display ─────────────────────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardContent className="p-5">
                  <SectionHeader icon={Activity} label="Display" color="emerald" />

                  <div className="space-y-4">
                    {/* Toggles */}
                    <div className="space-y-3">
                      <ToggleRow
                        id="cursorEnabled"
                        checked={cursorEnabled}
                        onChange={toggleCursor}
                        label="Show Cursor"
                        sub="Enable mouse cursor — disable for touch-only terminals"
                      />
                    </div>

                    {/* Log file actions */}
                    <div className="flex items-center gap-3 pt-1">
                      <span className="text-xs text-slate-500 mr-auto">Log file access:</span>
                      <Button variant="outline" size="sm" onClick={openLogViewer} className="gap-1.5 text-xs">
                        <FileText className="w-3.5 h-3.5" /> View Logs
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Terminal Identity ─────────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardContent className="p-5">
                  <SectionHeader icon={Settings2} label="Terminal Identity" color="navy" />

                  <div className="space-y-4">
                    <p className="text-xs text-slate-500">
                      Identifies this register when sharing a database with other terminals.
                      Each terminal must have a unique ID (e.g. T01, T02).
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-700">Terminal ID <span className="text-red-500">*</span></label>
                        <div className="flex gap-2">
                          <HybridInput
                            type="text"
                            placeholder="e.g. T01"
                            value={terminalId}
                            onChange={v => setTerminalId(v.toUpperCase())}
                            onTouchKeyboard={() => openKb('terminalId', 'qwerty', 'Terminal ID')}
                            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[hsl(215,65%,30%)]"
                          />
                        </div>
                        <p className="text-xs text-slate-400">Letters, numbers, - or _ (max 20)</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-700">Terminal Name <span className="text-slate-400">(optional)</span></label>
                        <HybridInput
                          type="text"
                          placeholder="e.g. Front Counter"
                          value={terminalName}
                          onChange={setTerminalName}
                          onTouchKeyboard={() => openKb('terminalName', 'qwerty', 'Terminal Name')}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[hsl(215,65%,30%)]"
                        />
                        <p className="text-xs text-slate-400">Human-readable label for reports</p>
                      </div>
                    </div>

                    {terminalId && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(215,65%,30%)]/5 border border-[hsl(215,65%,30%)]/20 text-xs text-[hsl(215,65%,30%)]">
                        <Info className="w-3.5 h-3.5 flex-shrink-0" />
                        Session code will include terminal: <span className="font-mono font-semibold ml-1">CS-20260321-{terminalId}-0001</span>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        onClick={handleSaveTerminal}
                        disabled={terminalSaving}
                        className="bg-[hsl(215,65%,30%)] hover:bg-[hsl(215,65%,25%)] text-white gap-2"
                        size="sm"
                      >
                        {terminalSaving
                          ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                          : <><Save className="w-3.5 h-3.5" /> Save Terminal</>
                        }
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Database Management ───────────────────────────────── */}
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardContent className="p-5">
                  <SectionHeader icon={Database} label="Database Management" color="navy" />

                  {/* Connection status */}
                  <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 mb-4">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isOnline && adminSettings.databaseStatus === 'Connected' ? 'bg-emerald-500' : 'bg-red-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {isOnline && adminSettings.databaseStatus === 'Connected' ? 'Connected' : 'Disconnected'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">****base.supabase.co</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={loading} className="gap-1.5 text-xs">
                        <Wifi className="w-3.5 h-3.5" />
                        {loading ? 'Testing…' : 'Test'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleChangeDatabase} className="gap-1.5 text-xs border-amber-200 text-amber-700 hover:bg-amber-50">
                        Change
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleClearDatabase} className="gap-1.5 text-xs border-red-200 text-red-700 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" /> Clear
                      </Button>
                    </div>
                  </div>

                  {/* Backup & Recovery */}
                  {backupCapabilities && (
                    <div className="space-y-4">
                      <div className="flex items-start gap-2">
                        <HardDrive className="w-4 h-4 text-slate-400 mt-0.5" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Backup & Recovery</span>
                      </div>

                      {/* Plan pill */}
                      <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border ${
                        backupCapabilities.automaticBackups
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-amber-50 border-amber-200'
                      }`}>
                        <div>
                          <p className={`text-sm font-semibold ${backupCapabilities.automaticBackups ? 'text-emerald-800' : 'text-amber-800'}`}>
                            Supabase {backupCapabilities.plan}
                          </p>
                          <p className={`text-xs mt-0.5 ${backupCapabilities.automaticBackups ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {backupCapabilities.automaticBackups ? 'Automatic daily backups enabled' : 'No automatic backups — manual backup required'}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">{backupCapabilities.message}</p>
                        </div>
                        {backupCapabilities.automaticBackups && (
                          <Button variant="outline" size="sm" onClick={openSupabaseDashboard} className="gap-1.5 text-xs flex-shrink-0">
                            <ExternalLink className="w-3.5 h-3.5" /> Supabase
                          </Button>
                        )}
                      </div>

                      {/* Manual backup needed */}
                      {backupCapabilities.manualBackupNeeded && (
                        <div className="px-4 py-4 rounded-lg border border-amber-200 bg-amber-50 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-amber-800">Manual Backup Required</p>
                              <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last: {formatLastBackup(adminSettings.lastBackup, adminSettings.lastBackupMethod, adminSettings.lastBackupSize)}
                              </p>
                            </div>
                            <Button onClick={handleCreateBackup} disabled={backupLoading} className="bg-[hsl(215,65%,30%)] hover:bg-[hsl(215,65%,25%)] text-white gap-2 flex-shrink-0" size="sm">
                              {backupLoading
                                ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating…</>
                                : <><HardDrive className="w-3.5 h-3.5" /> Backup Now</>
                              }
                            </Button>
                          </div>
                          {backupCapabilities.localBackupsAvailable && (
                            <div className="flex items-center gap-4 text-xs text-slate-600 bg-white border border-amber-200 rounded-lg px-3 py-2">
                              <span className="font-medium">{backupCapabilities.totalLocalBackups} local backup{backupCapabilities.totalLocalBackups !== 1 ? 's' : ''}</span>
                              <span className="text-slate-400">•</span>
                              <span>{(backupCapabilities.totalBackupSize / 1024 / 1024).toFixed(1)} MB total</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Automatic backup plan */}
                      {backupCapabilities.automaticBackups && (
                        <div className="px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50 space-y-2">
                          <p className="text-sm font-semibold text-emerald-800">Automatic Backups Active</p>
                          <div className="text-xs text-emerald-700 space-y-1">
                            <p>Daily backups managed by Supabase</p>
                            <p className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last: {formatLastBackup(adminSettings.lastBackup, adminSettings.lastBackupMethod, adminSettings.lastBackupSize)}
                            </p>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button onClick={handleCreateBackup} disabled={backupLoading} variant="outline" size="sm" className="gap-1.5 text-xs">
                              {backupLoading ? 'Creating…' : <><HardDrive className="w-3.5 h-3.5" /> Extra Backup</>}
                            </Button>
                            <Button variant="outline" size="sm" onClick={openSupabaseDashboard} className="gap-1.5 text-xs">
                              <ExternalLink className="w-3.5 h-3.5" /> Manage
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Restore section */}
                      <div className="px-4 py-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
                        <div className="flex items-center gap-2">
                          <ArchiveRestore className="w-4 h-4 text-slate-500" />
                          <span className="text-sm font-semibold text-slate-700">Restore Database</span>
                        </div>

                        {(backupCapabilities?.localBackups?.length ?? 0) > 0 && (
                          <div>
                            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Restore from local backup</label>
                            <StyledSelect
                              value={selectedLocalBackupId}
                              onChange={v => {
                                setSelectedLocalBackupId(v)
                                if (v) setRestoreFile(null)
                              }}
                              hint="Backups created on this machine — no file upload needed"
                            >
                              <option value="">— Select a backup —</option>
                              {backupCapabilities?.localBackups?.map(b => (
                                <option key={b.backupId} value={b.backupId}>
                                  {b.backupId} · {(b.size / 1024 / 1024).toFixed(1)} MB · {new Date(b.createdAt).toLocaleString()}
                                </option>
                              ))}
                            </StyledSelect>
                          </div>
                        )}

                        <div>
                          <label className="text-xs font-medium text-slate-600 mb-1.5 block">Or import a backup file</label>
                          <Button type="button" variant="outline" onClick={handleSelectBackupFile} className="gap-2 text-[hsl(215,65%,30%)] border-[hsl(215,65%,30%)]/30 hover:bg-slate-100">
                            <FolderOpen className="w-4 h-4" /> Browse Backup Files
                          </Button>
                          {restoreFile ? (
                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
                              <HardDrive className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              <span className="truncate font-medium">{restoreFile.name}</span>
                              {restoreFile.size > 0 && <span className="text-slate-400 flex-shrink-0">({(restoreFile.size / 1024 / 1024).toFixed(1)} MB)</span>}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400 mt-1.5">Supports .backup and .sql files — for importing from another machine or USB</p>
                          )}
                        </div>

                        <div>
                          <label className="text-xs font-medium text-slate-600 mb-1.5 block">New connection string <span className="text-slate-400">(optional)</span></label>
                          <HybridInput
                            type="text"
                            placeholder="postgresql://user:password@host:port/database"
                            value={newConnectionString}
                            onChange={setNewConnectionString}
                            onTouchKeyboard={() => openKb('newConnectionString', 'qwerty', 'Connection String')}
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                          <p className="text-xs text-slate-400 mt-1">Leave empty to restore to current database</p>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <Button
                            onClick={handleRestoreBackup}
                            disabled={backupLoading || (!restoreFile && !selectedLocalBackupId)}
                            className="bg-red-600 hover:bg-red-700 text-white gap-2"
                          >
                            {backupLoading
                              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Restoring…</>
                              : <><ArchiveRestore className="w-4 h-4" /> Restore Database</>
                            }
                          </Button>
                          {(restoreFile || selectedLocalBackupId) && (
                            <Button variant="outline" size="sm" onClick={() => { setRestoreFile(null); setSelectedLocalBackupId(''); setNewConnectionString('') }}>
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[hsl(215,65%,30%)]/5 border border-[hsl(215,65%,30%)]/20 text-xs text-[hsl(215,65%,30%)]">
                        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">Backup includes: </span>
                          sales, products, employees, settings, schema, relationships &amp; security policies.
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-400 mt-4">
                    Database credentials are stored securely and configured during initial setup.
                  </p>
                </CardContent>
              </Card>

              {/* ── Save ───────────────────────────────────────────────── */}
              <div className="flex justify-end pb-2">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>

            </div>
          )}
        </main>

        {/* Log Viewer Modal */}
        {logModal.open && (() => {
          const parsed = logModal.lines.map(parseLogLine).reverse() // newest first
          const isError = (l: string) => l === 'Error' || l === 'Fatal'
          const isWarn  = (l: string) => l === 'Warning'
          const filtered = logModal.showAll
            ? parsed.filter(e => !e.isFrameworkNoise)
            : parsed.filter(e => isError(e.level) || isWarn(e.level))
          const errorCount = parsed.filter(e => isError(e.level)).length
          const warnCount  = parsed.filter(e => isWarn(e.level)).length
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-2xl mx-4" style={{ maxHeight: '82vh' }}>
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 flex-shrink-0">
                  <FileText className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">System Logs</p>
                    <p className="text-xs text-slate-400">{logModal.fileName || 'Today'}</p>
                  </div>
                  {/* summary badges */}
                  {!logModal.loading && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {errorCount > 0 && (
                        <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
                      )}
                      {warnCount > 0 && (
                        <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">{warnCount} warning{warnCount !== 1 ? 's' : ''}</span>
                      )}
                      {errorCount === 0 && warnCount === 0 && (
                        <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">All clear</span>
                      )}
                    </div>
                  )}
                  <button onClick={() => setLogModal(m => ({ ...m, open: false }))} className="text-slate-400 hover:text-slate-600 p-1 rounded flex-shrink-0">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Toggle */}
                {!logModal.loading && (
                  <div className="flex items-center gap-3 px-5 py-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                    <span className="text-xs text-slate-500 mr-auto">
                      {logModal.showAll ? 'Showing all app messages (newest first)' : 'Showing errors & warnings only'}
                    </span>
                    <button
                      onClick={() => setLogModal(m => ({ ...m, showAll: !m.showAll }))}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {logModal.showAll ? 'Show errors & warnings only' : 'Show all messages'}
                    </button>
                  </div>
                )}

                {/* Body */}
                <div className="overflow-y-auto flex-1 p-4 space-y-1.5">
                  {logModal.loading ? (
                    <p className="text-slate-400 text-center py-10 text-sm">Loading logs…</p>
                  ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      </div>
                      <p className="font-semibold text-slate-700">All clear — no issues found</p>
                      <p className="text-xs text-slate-400">The system is running normally.</p>
                      {!logModal.showAll && (
                        <button onClick={() => setLogModal(m => ({ ...m, showAll: true }))} className="text-xs text-blue-600 hover:underline mt-1">
                          View all messages
                        </button>
                      )}
                    </div>
                  ) : (
                    filtered.map((entry, i) => {
                      const isErr = isError(entry.level)
                      const isW   = isWarn(entry.level)
                      return (
                        <div key={i} className={`flex gap-2.5 rounded-lg px-3 py-2 text-sm ${
                          isErr ? 'bg-red-50 border border-red-100' :
                          isW   ? 'bg-yellow-50 border border-yellow-100' :
                                  'bg-slate-50 border border-slate-100'
                        }`}>
                          {entry.time && <span className="text-xs text-slate-400 flex-shrink-0 pt-0.5 font-mono">{entry.time}</span>}
                          <span className={`text-xs font-bold flex-shrink-0 pt-0.5 uppercase ${
                            isErr ? 'text-red-600' : isW ? 'text-yellow-600' : 'text-slate-400'
                          }`}>{entry.level.slice(0, 4)}</span>
                          <span className={`break-words leading-snug ${isErr ? 'text-red-800' : isW ? 'text-yellow-800' : 'text-slate-600'}`}>
                            {entry.msg}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Clear Database Confirmation Modal */}
        {showClearModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
              <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-white flex-shrink-0" />
                <div>
                  <p className="text-white font-bold text-lg">Clear Entire Database</p>
                  <p className="text-red-100 text-sm">This action cannot be undone</p>
                </div>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800 font-medium">All data will be permanently deleted:</p>
                  <ul className="mt-1.5 text-xs text-red-700 space-y-0.5 list-disc list-inside">
                    <li>All employees and login credentials</li>
                    <li>All products and inventory</li>
                    <li>All sales and transaction history</li>
                    <li>All settings and configuration</li>
                  </ul>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Type <span className="font-mono font-bold text-red-700">CLEAR DATABASE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={clearConfirmPhrase}
                    onChange={(e) => setClearConfirmPhrase(e.target.value)}
                    placeholder="CLEAR DATABASE"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Manager PIN</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={clearManagerPin}
                      onChange={(e) => setClearManagerPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      maxLength={6}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      autoComplete="off"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openKb('clearManagerPin', 'numeric', 'Manager PIN')}
                      className="flex-shrink-0"
                    >
                      <Lock className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowClearModal(false)}
                    disabled={clearLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0"
                    onClick={handleConfirmClearDatabase}
                    disabled={clearConfirmPhrase !== 'CLEAR DATABASE' || clearManagerPin.length < 4 || clearLoading}
                  >
                    {clearLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <><Trash2 className="w-4 h-4 mr-1.5" />Delete All Data</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Generic Confirm Modal */}
        {confirmModal.open && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    confirmModal.variant === 'danger' ? 'bg-red-100' : 'bg-amber-100'
                  }`}>
                    <AlertTriangle className={`w-5 h-5 ${
                      confirmModal.variant === 'danger' ? 'text-red-600' : 'text-amber-600'
                    }`} />
                  </div>
                  <h2 className="text-base font-semibold text-slate-800">{confirmModal.title}</h2>
                </div>
                <button
                  onClick={() => setConfirmModal(m => ({ ...m, open: false }))}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-6 py-4">
                {typeof confirmModal.body === 'string'
                  ? <p className="text-sm text-slate-600">{confirmModal.body}</p>
                  : confirmModal.body}
              </div>
              <div className="flex gap-3 px-6 pb-5">
                <Button
                  variant="outline"
                  className="flex-1 border-slate-300 text-slate-600"
                  onClick={() => setConfirmModal(m => ({ ...m, open: false }))}
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 text-white ${
                    confirmModal.variant === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-amber-500 hover:bg-amber-600'
                  }`}
                  onClick={handleConfirmAction}
                >
                  {confirmModal.confirmLabel}
                </Button>
              </div>
            </div>
          </div>
        )}

        <ModalKeyboard
          open={kbOpen}
          type={kbType}
          title={kbTitle}
          initialValue={kbTarget === 'newConnectionString' ? newConnectionString : kbTarget === 'clearManagerPin' ? clearManagerPin : ''}
          onSubmit={applyKb}
          onClose={() => setKbOpen(false)}
        />
      </div>
    </SessionGuard>
  )
}

export default AdminPanel