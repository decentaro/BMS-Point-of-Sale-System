using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;
using Serilog;

namespace BMS_POS_API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AdminSettingsController : ControllerBase
    {
        private readonly BmsPosDbContext _context;
        private readonly IUserActivityService _userActivityService;
        private readonly ISupabaseBackupService _backupService;
        private readonly ILogger<AdminSettingsController> _logger;
        private readonly IConfiguration _configuration;

        public AdminSettingsController(
            BmsPosDbContext context, 
            IUserActivityService userActivityService,
            ISupabaseBackupService backupService,
            ILogger<AdminSettingsController> logger,
            IConfiguration configuration)
        {
            _context = context;
            _userActivityService = userActivityService;
            _backupService = backupService;
            _logger = logger;
            _configuration = configuration;
        }

        // GET: api/AdminSettings
        [HttpGet]
        public async Task<ActionResult<ApiResponse<AdminSettings>>> GetAdminSettings()
        {
            try
            {
                var settings = await _context.AdminSettings.FirstOrDefaultAsync();
                
                if (settings == null)
                {
                    // Create default admin settings if none exist
                    settings = new AdminSettings();
                    _context.AdminSettings.Add(settings);
                    await _context.SaveChangesAsync();
                    
                    _logger.LogInformation("Created default admin settings");
                }

                // Update database status dynamically
                settings.DatabaseStatus = await CheckDatabaseConnection() ? "Connected" : "Disconnected";

                return Ok(new ApiResponse<AdminSettings>
                {
                    Success = true,
                    Data = settings,
                    Message = "Admin settings retrieved successfully"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving admin settings");
                return StatusCode(500, new ApiResponse<AdminSettings>
                {
                    Success = false,
                    Message = "Failed to retrieve admin settings",
                    ErrorCode = "ADMIN_001"
                });
            }
        }

        // PUT: api/AdminSettings
        [HttpPut]
        public async Task<ActionResult<ApiResponse<AdminSettings>>> UpdateAdminSettings(AdminSettings adminSettings)
        {
            try
            {
                var existingSettings = await _context.AdminSettings.FirstOrDefaultAsync();
                
                if (existingSettings == null)
                {
                    return NotFound(new ApiResponse<AdminSettings>
                    {
                        Success = false,
                        Message = "Admin settings not found"
                    });
                }

                // Update fields (excluding read-only ones)
                existingSettings.RequireStrongPins = adminSettings.RequireStrongPins;
                existingSettings.MaxFailedLoginAttempts = adminSettings.MaxFailedLoginAttempts;
                existingSettings.LogLevel = adminSettings.LogLevel;
                existingSettings.PerformanceMetricsEnabled = adminSettings.PerformanceMetricsEnabled;
                existingSettings.CacheEnabled = adminSettings.CacheEnabled;
                existingSettings.LastUpdated = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                // Log the admin settings change
                await _userActivityService.LogActivityAsync(
                    userId: null,
                    userName: "SYSTEM",
                    action: "Update Admin Settings",
                    details: $"Updated admin settings: LogLevel={adminSettings.LogLevel}, PerformanceMetrics={adminSettings.PerformanceMetricsEnabled}"
                );

                _logger.LogInformation("Admin settings updated successfully");

                return Ok(new ApiResponse<AdminSettings>
                {
                    Success = true,
                    Data = existingSettings,
                    Message = "Admin settings updated successfully"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating admin settings");
                return StatusCode(500, new ApiResponse<AdminSettings>
                {
                    Success = false,
                    Message = "Failed to update admin settings",
                    ErrorCode = "ADMIN_002"
                });
            }
        }

        // POST: api/AdminSettings/test-connection
        [HttpPost("test-connection")]
        public async Task<ActionResult<ApiResponse<object>>> TestDatabaseConnection()
        {
            try
            {
                bool isConnected = await CheckDatabaseConnection();
                
                var result = new
                {
                    connected = isConnected,
                    timestamp = DateTime.UtcNow,
                    message = isConnected ? "Database connection successful" : "Database connection failed"
                };

                await _userActivityService.LogActivityAsync(
                    userId: null,
                    userName: "SYSTEM",
                    action: "Test Database Connection",
                    details: $"Connection test result: {(isConnected ? "Success" : "Failed")}"
                );

                return Ok(new ApiResponse<object>
                {
                    Success = isConnected,
                    Data = result,
                    Message = result.message
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error testing database connection");
                return StatusCode(500, new ApiResponse<object>
                {
                    Success = false,
                    Message = "Failed to test database connection",
                    ErrorCode = "ADMIN_003"
                });
            }
        }

        // GET: api/AdminSettings/backup/capabilities
        [HttpGet("backup/capabilities")]
        public async Task<ActionResult<ApiResponse<object>>> GetBackupCapabilities()
        {
            try
            {
                var capabilities = await _backupService.DetectPlanAndCapabilities();
                var localBackups = await _backupService.GetLocalBackups();
                
                var result = new
                {
                    capabilities.Plan,
                    capabilities.AutomaticBackups,
                    capabilities.ManualBackupNeeded,
                    capabilities.HasSupabaseCLI,
                    capabilities.LocalBackupsAvailable,
                    capabilities.Message,
                    LocalBackups = localBackups.Take(10), // Last 10 backups
                    TotalLocalBackups = localBackups.Count,
                    TotalBackupSize = localBackups.Sum(b => b.Size)
                };

                return Ok(new ApiResponse<object>
                {
                    Success = true,
                    Data = result,
                    Message = "Backup capabilities retrieved successfully"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting backup capabilities");
                return StatusCode(500, new ApiResponse<object>
                {
                    Success = false,
                    Message = "Failed to get backup capabilities",
                    ErrorCode = "ADMIN_007"
                });
            }
        }

        // POST: api/AdminSettings/backup/create
        [HttpPost("backup/create")]
        public async Task<ActionResult<ApiResponse<object>>> CreateDatabaseBackup()
        {
            try
            {
                _logger.LogInformation("Starting manual database backup");
                
                var backupResult = await _backupService.CreateManualBackup();
                
                if (backupResult.Success)
                {
                    // Update admin settings with backup info
                    var settings = await _context.AdminSettings.FirstOrDefaultAsync();
                    if (settings != null)
                    {
                        settings.LastBackup = backupResult.CreatedAt;
                        settings.LastBackupMethod = backupResult.Method;
                        settings.LastBackupSize = $"{backupResult.Size / (1024 * 1024):F1} MB";
                        settings.LastBackupPath = backupResult.BackupPath;
                        await _context.SaveChangesAsync();
                    }

                    return Ok(new ApiResponse<object>
                    {
                        Success = true,
                        Data = new
                        {
                            backupResult.BackupId,
                            backupResult.BackupPath,
                            backupResult.Method,
                            backupResult.Size,
                            backupResult.Files,
                            SizeFormatted = $"{backupResult.Size / (1024.0 * 1024):F1} MB",
                            backupResult.CreatedAt
                        },
                        Message = "Manual backup created successfully"
                    });
                }
                else
                {
                    return BadRequest(new ApiResponse<object>
                    {
                        Success = false,
                        Message = backupResult.Error ?? "Backup failed",
                        Data = new { backupResult.Suggestion }
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating database backup");
                return StatusCode(500, new ApiResponse<object>
                {
                    Success = false,
                    Message = "Failed to create database backup",
                    ErrorCode = "ADMIN_004"
                });
            }
        }

        // POST: api/AdminSettings/backup/restore
        [HttpPost("backup/restore")]
        public async Task<ActionResult<ApiResponse<object>>> RestoreDatabaseBackup([FromForm] IFormFile backupFile, [FromForm] string? newConnectionString = null)
        {
            try
            {
                if (backupFile == null || backupFile.Length == 0)
                {
                    return BadRequest(new ApiResponse<object>
                    {
                        Success = false,
                        Message = "No backup file provided"
                    });
                }

                _logger.LogInformation("Starting database restore from uploaded file: {FileName}", backupFile.FileName);
                
                // Save uploaded file temporarily
                var tempDir = Path.Combine(Path.GetTempPath(), "restore_temp");
                Directory.CreateDirectory(tempDir);
                var tempFilePath = Path.Combine(tempDir, backupFile.FileName);
                
                using (var stream = new FileStream(tempFilePath, FileMode.Create))
                {
                    await backupFile.CopyToAsync(stream);
                }

                try
                {
                    var restoreResult = await _backupService.RestoreFromBackupFile(tempFilePath, newConnectionString);
                    
                    if (restoreResult.Success)
                    {
                        return Ok(new ApiResponse<object>
                        {
                            Success = true,
                            Data = new
                            {
                                restoreResult.BackupFile,
                                restoreResult.RestoredAt,
                                restoreResult.Message
                            },
                            Message = "Database restored successfully"
                        });
                    }
                    else
                    {
                        return BadRequest(new ApiResponse<object>
                        {
                            Success = false,
                            Message = restoreResult.Error ?? "Restore failed",
                            Data = new { restoreResult.Suggestion }
                        });
                    }
                }
                finally
                {
                    // Cleanup temp file
                    try { System.IO.File.Delete(tempFilePath); } catch { }
                    try { System.IO.Directory.Delete(tempDir); } catch { }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error restoring database backup");
                return StatusCode(500, new ApiResponse<object>
                {
                    Success = false,
                    Message = "Failed to restore database backup",
                    ErrorCode = "ADMIN_008"
                });
            }
        }

        // GET: api/AdminSettings/backup/local
        [HttpGet("backup/local")]
        public async Task<ActionResult<ApiResponse<object>>> GetLocalBackups()
        {
            try
            {
                var backups = await _backupService.GetLocalBackups();
                
                var result = new
                {
                    Backups = backups.Select(b => new
                    {
                        b.BackupId,
                        b.CreatedAt,
                        b.Method,
                        b.Size,
                        SizeFormatted = $"{b.Size / (1024.0 * 1024):F1} MB",
                        b.Files,
                        b.HasManifest,
                        Path = Path.GetFileName(b.Path) // Only show folder name for security
                    }),
                    TotalBackups = backups.Count,
                    TotalSize = backups.Sum(b => b.Size),
                    TotalSizeFormatted = $"{backups.Sum(b => b.Size) / (1024.0 * 1024):F1} MB"
                };

                return Ok(new ApiResponse<object>
                {
                    Success = true,
                    Data = result,
                    Message = "Local backups retrieved successfully"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting local backups");
                return StatusCode(500, new ApiResponse<object>
                {
                    Success = false,
                    Message = "Failed to get local backups",
                    ErrorCode = "ADMIN_009"
                });
            }
        }

        // GET: api/AdminSettings/logs/latest
        [HttpGet("logs/latest")]
        public Task<ActionResult<ApiResponse<object>>> GetLatestLogFile()
        {
            try
            {
                var logsPath = Path.Combine(Directory.GetCurrentDirectory(), "logs");
                
                if (!Directory.Exists(logsPath))
                {
                    return Task.FromResult<ActionResult<ApiResponse<object>>>(NotFound(new ApiResponse<object>
                    {
                        Success = false,
                        Message = "Logs directory not found"
                    }));
                }

                var logFiles = Directory.GetFiles(logsPath, "comprehensive-*.json")
                    .OrderByDescending(f => new FileInfo(f).LastWriteTime)
                    .ToArray();

                if (logFiles.Length == 0)
                {
                    return Task.FromResult<ActionResult<ApiResponse<object>>>(NotFound(new ApiResponse<object>
                    {
                        Success = false,
                        Message = "No log files found"
                    }));
                }

                var latestLogFile = logFiles.First();
                var fileInfo = new FileInfo(latestLogFile);

                var result = new
                {
                    fileName = fileInfo.Name,
                    filePath = latestLogFile,
                    lastModified = fileInfo.LastWriteTime,
                    sizeBytes = fileInfo.Length,
                    canOpen = true
                };

                return Task.FromResult<ActionResult<ApiResponse<object>>>(Ok(new ApiResponse<object>
                {
                    Success = true,
                    Data = result,
                    Message = "Latest log file found"
                }));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving latest log file");
                return Task.FromResult<ActionResult<ApiResponse<object>>>(StatusCode(500, new ApiResponse<object>
                {
                    Success = false,
                    Message = "Failed to retrieve latest log file",
                    ErrorCode = "ADMIN_005"
                }));
            }
        }

        // POST: api/AdminSettings/clear-database
        [HttpPost("clear-database")]
        public async Task<ActionResult<ApiResponse<object>>> ClearDatabase()
        {
            try
            {
                _logger.LogInformation("Starting complete database clear");
                
                // Use the same secure configuration service that Program.cs uses
                var secureConfig = new SecureConfigurationService();
                var connectionStringTemplate = _configuration.GetConnectionString("DefaultConnection");
                var connectionString = secureConfig.ProcessConnectionString(connectionStringTemplate);
                
                _logger.LogInformation("Using secure configuration to process connection string for database clearing");
                
                using var connection = new Npgsql.NpgsqlConnection(connectionString);
                await connection.OpenAsync();
                
                // First drop all views and functions
                var dropViewsQuery = @"
                    DO $$ 
                    DECLARE 
                        view_name text;
                        func_name text;
                    BEGIN 
                        -- Drop all views
                        FOR view_name IN 
                            SELECT viewname FROM pg_views WHERE schemaname = 'public'
                        LOOP 
                            EXECUTE 'DROP VIEW IF EXISTS ' || view_name || ' CASCADE;';
                        END LOOP;
                        
                        -- Drop all functions
                        FOR func_name IN 
                            SELECT proname FROM pg_proc p 
                            JOIN pg_namespace n ON p.pronamespace = n.oid 
                            WHERE n.nspname = 'public'
                        LOOP 
                            EXECUTE 'DROP FUNCTION IF EXISTS ' || func_name || '() CASCADE;';
                        END LOOP;
                    END $$;";
                
                using var dropViewsCommand = new Npgsql.NpgsqlCommand(dropViewsQuery, connection);
                await dropViewsCommand.ExecuteNonQueryAsync();

                // Drop all tables dynamically to ensure we get everything
                var dropAllTablesQuery = @"
                    DO $$ 
                    DECLARE 
                        table_name text;
                    BEGIN 
                        FOR table_name IN 
                            SELECT tablename FROM pg_tables WHERE schemaname = 'public'
                        LOOP 
                            EXECUTE 'DROP TABLE IF EXISTS ' || table_name || ' CASCADE;';
                        END LOOP; 
                    END $$;";
                
                using var dropCommand = new Npgsql.NpgsqlCommand(dropAllTablesQuery, connection);
                await dropCommand.ExecuteNonQueryAsync();
                
                _logger.LogInformation("Dropped all tables");
                
                // Drop all custom types
                var dropTypesQuery = @"
                    DO $$ 
                    DECLARE 
                        type_name text;
                    BEGIN 
                        FOR type_name IN 
                            SELECT typname FROM pg_type t 
                            JOIN pg_namespace n ON t.typnamespace = n.oid 
                            WHERE n.nspname = 'public' AND t.typtype = 'e'
                        LOOP 
                            EXECUTE 'DROP TYPE IF EXISTS ' || type_name || ' CASCADE;';
                        END LOOP; 
                    END $$;";
                
                using var dropTypesCommand = new Npgsql.NpgsqlCommand(dropTypesQuery, connection);
                await dropTypesCommand.ExecuteNonQueryAsync();
                
                _logger.LogInformation("Dropped all custom types");
                
                // Drop all sequences
                var dropSequencesQuery = @"
                    DO $$ 
                    DECLARE 
                        seq_name text;
                    BEGIN 
                        FOR seq_name IN 
                            SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
                        LOOP 
                            EXECUTE 'DROP SEQUENCE IF EXISTS ' || seq_name || ' CASCADE;';
                        END LOOP; 
                    END $$;";
                
                using var dropSeqCommand = new Npgsql.NpgsqlCommand(dropSequencesQuery, connection);
                await dropSeqCommand.ExecuteNonQueryAsync();
                
                _logger.LogInformation("Dropped all sequences");
                
                // Also clear migration history so EF thinks it's a fresh database
                var clearMigrationHistoryQuery = @"
                    DROP TABLE IF EXISTS ""__EFMigrationsHistory"" CASCADE;";
                
                using var migrationCommand = new Npgsql.NpgsqlCommand(clearMigrationHistoryQuery, connection);
                await migrationCommand.ExecuteNonQueryAsync();
                
                _logger.LogInformation("Cleared migration history");
                _logger.LogInformation("Database schema completely dropped - will be recreated on next app start");
                
                return Ok(new ApiResponse<object>
                {
                    Success = true,
                    Data = new { Message = "Database completely cleared, sequences reset, and real-time functionality will be enabled on next startup" },
                    Message = "Database cleared successfully"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error clearing database");
                return StatusCode(500, new ApiResponse<object>
                {
                    Success = false,
                    Message = "Failed to clear database: " + ex.Message,
                    ErrorCode = "ADMIN_011"
                });
            }
        }

        // GET: api/AdminSettings/logs/folder
        [HttpGet("logs/folder")]
        public Task<ActionResult<ApiResponse<object>>> GetLogsFolderPath()
        {
            try
            {
                var logsPath = Path.Combine(Directory.GetCurrentDirectory(), "logs");
                
                var result = new
                {
                    folderPath = logsPath,
                    exists = Directory.Exists(logsPath),
                    fileCount = Directory.Exists(logsPath) ? Directory.GetFiles(logsPath, "*.json").Length : 0
                };

                return Task.FromResult<ActionResult<ApiResponse<object>>>(Ok(new ApiResponse<object>
                {
                    Success = true,
                    Data = result,
                    Message = "Logs folder information retrieved"
                }));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving logs folder information");
                return Task.FromResult<ActionResult<ApiResponse<object>>>(StatusCode(500, new ApiResponse<object>
                {
                    Success = false,
                    Message = "Failed to retrieve logs folder information",
                    ErrorCode = "ADMIN_006"
                }));
            }
        }

        private async Task<bool> CheckDatabaseConnection()
        {
            try
            {
                await _context.Database.OpenConnectionAsync();
                await _context.Database.CloseConnectionAsync();
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}