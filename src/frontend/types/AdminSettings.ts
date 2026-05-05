export interface AdminSettings {
  id: number
  // Update Management
  currentVersion: string
  updateStatus: 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error'
  availableVersion?: string
  updateDescription?: string
  // Security & Access
  requireStrongPins: boolean
  maxFailedLoginAttempts: number
  // Database Connection (read-only display)
  databaseStatus: string
  lastBackup?: string
  lastBackupMethod?: string
  lastBackupSize?: string
  lastBackupPath?: string
  createdDate: string
  lastUpdated: string
}

export interface BackupCapabilities {
  plan: string
  automaticBackups: boolean
  manualBackupNeeded: boolean
  hasSupabaseCLI: boolean
  localBackupsAvailable: boolean
  message: string
  localBackups: LocalBackupInfo[]
  totalLocalBackups: number
  totalBackupSize: number
  backupsFolder?: string
}

export interface LocalBackupInfo {
  backupId: string
  createdAt: string
  method: string
  size: number
  sizeFormatted: string
  files: number
  hasManifest: boolean
  path: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message: string
  error?: string
}