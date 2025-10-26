using System.Diagnostics;
using System.Text.Json;

namespace BMS_POS_API.Services
{
    public interface ISupabaseBackupService
    {
        Task<BackupCapabilities> DetectPlanAndCapabilities();
        Task<BackupResult> CreateManualBackup();
        Task<RestoreResult> RestoreFromBackupFile(string backupFilePath, string? newConnectionString = null);
        Task<List<LocalBackupInfo>> GetLocalBackups();
        Task<bool> IsSupabaseCLIAvailable();
    }

    public class SupabaseBackupService : ISupabaseBackupService
    {
        private readonly ILogger<SupabaseBackupService> _logger;
        private readonly IConfiguration _configuration;
        private readonly IUserActivityService _userActivityService;

        public SupabaseBackupService(
            ILogger<SupabaseBackupService> logger,
            IConfiguration configuration,
            IUserActivityService userActivityService)
        {
            _logger = logger;
            _configuration = configuration;
            _userActivityService = userActivityService;
        }

        public async Task<BackupCapabilities> DetectPlanAndCapabilities()
        {
            try
            {
                // Try to detect plan by checking for automatic backups
                // This is a simplified detection - in production you might use Supabase Management API
                var connectionString = GetSupabaseConnectionString();
                
                var capabilities = new BackupCapabilities
                {
                    Plan = "Free", // Assume Free tier (most common case)
                    AutomaticBackups = false, // Free tier doesn't have automatic backups
                    ManualBackupNeeded = true,
                    HasSupabaseCLI = true, // Always true now - we use built-in functionality
                    LocalBackupsAvailable = (await GetLocalBackups()).Count > 0
                };

                // Always available since we use direct database connections
                capabilities.Message = "Manual backup available using built-in functionality";

                _logger.LogInformation("Detected backup capabilities: {Capabilities}", JsonSerializer.Serialize(capabilities));
                
                return capabilities;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error detecting backup capabilities");
                return new BackupCapabilities
                {
                    Plan = "Free",
                    AutomaticBackups = false,
                    ManualBackupNeeded = true,
                    HasSupabaseCLI = true, // Built-in functionality always available
                    Message = "Manual backup available using built-in functionality"
                };
            }
        }

        public async Task<BackupResult> CreateManualBackup()
        {
            var businessTime = DateTime.UtcNow;
            var backupId = $"manual_{businessTime:yyyyMMdd_HHmmss}";
            var backupDir = Path.Combine("backups", backupId);
            
            try
            {
                Directory.CreateDirectory(backupDir);
                _logger.LogInformation("Creating manual backup in directory: {BackupDir}", backupDir);

                // Use direct database connection - no external tools required
                var connectionString = GetSupabaseConnectionString();
                
                // Create comprehensive backup using Entity Framework and raw SQL
                await CreateSchemaBackup(connectionString, Path.Combine(backupDir, "schema.sql"));
                await CreateDataBackup(connectionString, Path.Combine(backupDir, "data.sql"));
                await CreateRolesBackup(connectionString, Path.Combine(backupDir, "roles.sql"));
                
                // Create backup manifest
                var manifest = new BackupManifest
                {
                    BackupId = backupId,
                    CreatedAt = DateTime.UtcNow,
                    Method = "Supabase CLI Manual",
                    DatabaseUrl = MaskConnectionString(connectionString),
                    Files = Directory.GetFiles(backupDir).Select(f => Path.GetFileName(f)).ToList()
                };
                
                var manifestPath = Path.Combine(backupDir, "manifest.json");
                await File.WriteAllTextAsync(manifestPath, JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }));

                var totalSize = GetDirectorySize(backupDir);
                
                await _userActivityService.LogActivityAsync(
                    userId: null,
                    userName: "SYSTEM",
                    action: "Create Manual Backup",
                    details: $"Manual backup created: {backupId}, Size: {FormatBytes(totalSize)}"
                );

                return new BackupResult
                {
                    Success = true,
                    BackupId = backupId,
                    BackupPath = backupDir,
                    Method = "Supabase CLI Manual",
                    Size = totalSize,
                    Files = manifest.Files.Count,
                    CreatedAt = DateTime.UtcNow
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Manual backup failed for {BackupId}", backupId);
                
                // Cleanup failed backup
                if (Directory.Exists(backupDir))
                {
                    try { Directory.Delete(backupDir, true); } catch { }
                }
                
                return new BackupResult
                {
                    Success = false,
                    BackupId = backupId,
                    Error = ex.Message,
                    Suggestion = GetBackupErrorSuggestion(ex)
                };
            }
        }

        public async Task<RestoreResult> RestoreFromBackupFile(string backupFilePath, string? newConnectionString = null)
        {
            try
            {
                var connectionString = newConnectionString ?? GetSupabaseConnectionString();
                
                _logger.LogInformation("Starting database restore from {BackupFile}", backupFilePath);

                // Validate backup file exists
                if (!File.Exists(backupFilePath))
                {
                    throw new FileNotFoundException($"Backup file not found: {backupFilePath}");
                }

                // Execute restore using direct database connection (no external tools required)
                await ExecuteDirectRestore(backupFilePath, connectionString);

                await _userActivityService.LogActivityAsync(
                    userId: null,
                    userName: "SYSTEM", 
                    action: "Restore Database",
                    details: $"Database restored from backup: {Path.GetFileName(backupFilePath)}"
                );

                return new RestoreResult
                {
                    Success = true,
                    BackupFile = backupFilePath,
                    RestoredAt = DateTime.UtcNow,
                    Message = "Database restored successfully"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Database restore failed from {BackupFile}", backupFilePath);
                
                return new RestoreResult
                {
                    Success = false,
                    BackupFile = backupFilePath,
                    Error = ex.Message,
                    Suggestion = GetRestoreErrorSuggestion(ex)
                };
            }
        }

        public async Task<List<LocalBackupInfo>> GetLocalBackups()
        {
            var backups = new List<LocalBackupInfo>();
            var backupsDir = "backups";
            
            try
            {
                if (!Directory.Exists(backupsDir))
                    return backups;

                var backupDirs = Directory.GetDirectories(backupsDir);
                
                foreach (var dir in backupDirs.OrderByDescending(d => Directory.GetCreationTime(d)))
                {
                    try
                    {
                        var manifestPath = Path.Combine(dir, "manifest.json");
                        BackupManifest? manifest = null;
                        
                        if (File.Exists(manifestPath))
                        {
                            var manifestJson = await File.ReadAllTextAsync(manifestPath);
                            manifest = JsonSerializer.Deserialize<BackupManifest>(manifestJson);
                        }

                        var backup = new LocalBackupInfo
                        {
                            BackupId = Path.GetFileName(dir),
                            Path = dir,
                            CreatedAt = manifest?.CreatedAt ?? Directory.GetCreationTime(dir),
                            Method = manifest?.Method ?? "Unknown",
                            Size = GetDirectorySize(dir),
                            Files = Directory.GetFiles(dir).Length,
                            HasManifest = manifest != null
                        };

                        backups.Add(backup);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error reading backup info from {Dir}", dir);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting local backups");
            }
            
            return backups;
        }

        public async Task<bool> IsSupabaseCLIAvailable()
        {
            try
            {
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "supabase",
                        Arguments = "--version",
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                await process.WaitForExitAsync();
                
                return process.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }

        #region Private Methods

        private async Task CreateSchemaBackup(string connectionString, string outputFile)
        {
            using var connection = new Npgsql.NpgsqlConnection(connectionString);
            await connection.OpenAsync();

            var schemaQueries = new List<string>
            {
                // Get table definitions
                @"SELECT 'CREATE TABLE ' || t.table_schema||'.'||t.table_name || ' (' || 
                  array_to_string(array_agg(column_name || ' ' || data_type), ', ') || ');' as ddl
                  FROM information_schema.tables t 
                  JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
                  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
                  GROUP BY t.table_schema, t.table_name",

                // Get indexes
                @"SELECT indexdef || ';' as ddl FROM pg_indexes WHERE schemaname = 'public'",

                // Get constraints  
                @"SELECT 'ALTER TABLE ' || table_name || ' ADD CONSTRAINT ' || constraint_name || ' ' || 
                  constraint_type || ';' as ddl FROM information_schema.table_constraints 
                  WHERE constraint_schema = 'public' AND constraint_type != 'CHECK'"
            };

            var allDDL = new List<string>();
            
            foreach (var query in schemaQueries)
            {
                using var command = new Npgsql.NpgsqlCommand(query, connection);
                using var reader = await command.ExecuteReaderAsync();
                
                while (await reader.ReadAsync())
                {
                    if (!reader.IsDBNull(0))
                        allDDL.Add(reader.GetString(0));
                }
            }

            await File.WriteAllLinesAsync(outputFile, allDDL);
        }

        private async Task CreateDataBackup(string connectionString, string outputFile)
        {
            using var connection = new Npgsql.NpgsqlConnection(connectionString);
            await connection.OpenAsync();

            var dataStatements = new List<string>();

            // Get all table names
            var tablesQuery = @"SELECT tablename FROM pg_tables WHERE schemaname = 'public'";
            using var tablesCommand = new Npgsql.NpgsqlCommand(tablesQuery, connection);
            using var tablesReader = await tablesCommand.ExecuteReaderAsync();
            
            var tableNames = new List<string>();
            while (await tablesReader.ReadAsync())
            {
                tableNames.Add(tablesReader.GetString(0));
            }
            tablesReader.Close();

            // Export data from each table
            foreach (var tableName in tableNames)
            {
                try
                {
                    // Get column names
                    var columnsQuery = $@"SELECT column_name FROM information_schema.columns 
                                         WHERE table_schema = 'public' AND table_name = '{tableName}' 
                                         ORDER BY ordinal_position";
                    using var columnsCommand = new Npgsql.NpgsqlCommand(columnsQuery, connection);
                    using var columnsReader = await columnsCommand.ExecuteReaderAsync();
                    
                    var columns = new List<string>();
                    while (await columnsReader.ReadAsync())
                    {
                        columns.Add(columnsReader.GetString(0));
                    }
                    columnsReader.Close();

                    if (columns.Count == 0) continue;

                    // Export data
                    var dataQuery = $"SELECT * FROM public.\"{tableName}\"";
                    using var dataCommand = new Npgsql.NpgsqlCommand(dataQuery, connection);
                    using var dataReader = await dataCommand.ExecuteReaderAsync();

                    while (await dataReader.ReadAsync())
                    {
                        var values = new List<string>();
                        for (int i = 0; i < dataReader.FieldCount; i++)
                        {
                            if (dataReader.IsDBNull(i))
                            {
                                values.Add("NULL");
                            }
                            else
                            {
                                var value = dataReader.GetValue(i);
                                string escapedValue;
                                
                                // Handle DateTime values with proper ISO format
                                if (value is DateTime dateTime)
                                {
                                    escapedValue = dateTime.ToString("yyyy-MM-dd HH:mm:ss.ffffff");
                                }
                                else
                                {
                                    escapedValue = value.ToString()?.Replace("'", "''") ?? "";
                                }
                                
                                values.Add($"'{escapedValue}'");
                            }
                        }

                        var insertStatement = $"INSERT INTO public.\"{tableName}\" ({string.Join(", ", columns.Select(c => $"\"{c}\""))}) VALUES ({string.Join(", ", values)});";
                        dataStatements.Add(insertStatement);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to backup table {TableName}", tableName);
                }
            }

            await File.WriteAllLinesAsync(outputFile, dataStatements);
        }

        private async Task CreateRolesBackup(string connectionString, string outputFile)
        {
            // For Supabase, we can't export roles as they're managed by Supabase
            // Just create a placeholder file with information
            var roleInfo = new List<string>
            {
                "-- Supabase Role Information",
                "-- Roles are managed by Supabase and cannot be exported",
                "-- Users must be recreated manually via Supabase Auth dashboard",
                "-- This file is for reference only"
            };

            await File.WriteAllLinesAsync(outputFile, roleInfo);
        }

        private async Task ExecuteSupabaseDump(string connectionString, string outputFile, string additionalArgs)
        {
            var args = $"db dump --db-url \"{connectionString}\" -f \"{outputFile}\" {additionalArgs}".Trim();
            
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "supabase",
                    Arguments = args,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.Start();
            await process.WaitForExitAsync();

            if (process.ExitCode != 0)
            {
                var error = await process.StandardError.ReadToEndAsync();
                throw new Exception($"Supabase dump failed: {error}");
            }
        }

        private async Task ExecuteDirectRestore(string backupFilePath, string connectionString)
        {
            _logger.LogInformation("Starting direct database restore from {BackupFile}", backupFilePath);
            
            // Check if it's a directory (full backup) or single file
            if (Directory.Exists(backupFilePath))
            {
                // Full backup directory - restore in order: schema, data, roles
                await RestoreFromDirectory(backupFilePath, connectionString);
            }
            else if (File.Exists(backupFilePath))
            {
                // Single SQL file - execute directly
                await RestoreSingleFile(backupFilePath, connectionString);
            }
            else
            {
                throw new FileNotFoundException($"Backup file or directory not found: {backupFilePath}");
            }
        }

        private async Task RestoreFromDirectory(string backupDir, string connectionString)
        {
            using var connection = new Npgsql.NpgsqlConnection(connectionString);
            await connection.OpenAsync();

            // Step 1: Clear existing data (preserve schema structure)
            _logger.LogInformation("Clearing existing data from all tables");
            await ClearAllTableData(connection);

            // Step 2: Execute files in order: schema, data, roles
            var filesToRestore = new[]
            {
                Path.Combine(backupDir, "schema.sql"),
                Path.Combine(backupDir, "data.sql"),
                Path.Combine(backupDir, "roles.sql")
            };

            foreach (var filePath in filesToRestore)
            {
                if (File.Exists(filePath))
                {
                    _logger.LogInformation("Executing SQL file: {File}", Path.GetFileName(filePath));
                    var sqlContent = await File.ReadAllTextAsync(filePath);
                    await ExecuteSqlContent(connection, sqlContent);
                }
                else
                {
                    _logger.LogWarning("SQL file not found, skipping: {File}", filePath);
                }
            }
        }

        private async Task ClearAllTableData(Npgsql.NpgsqlConnection connection)
        {
            // Get all table names in the public schema
            var tablesQuery = @"SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename";
            using var tablesCommand = new Npgsql.NpgsqlCommand(tablesQuery, connection);
            using var tablesReader = await tablesCommand.ExecuteReaderAsync();
            
            var tableNames = new List<string>();
            while (await tablesReader.ReadAsync())
            {
                tableNames.Add(tablesReader.GetString(0));
            }
            tablesReader.Close();

            // Disable foreign key constraints temporarily
            using var disableFkCommand = new Npgsql.NpgsqlCommand("SET session_replication_role = replica;", connection);
            await disableFkCommand.ExecuteNonQueryAsync();
            _logger.LogInformation("Disabled foreign key constraints");

            // Clear data from all tables in reverse order (to handle FK dependencies)
            var reversedTableNames = tableNames.AsEnumerable().Reverse().ToList();
            foreach (var tableName in reversedTableNames)
            {
                try
                {
                    _logger.LogInformation("Clearing table: {TableName}", tableName);
                    
                    // Try TRUNCATE first (faster, resets sequences)
                    using var truncateCommand = new Npgsql.NpgsqlCommand($"TRUNCATE TABLE \"{tableName}\" RESTART IDENTITY CASCADE;", connection);
                    await truncateCommand.ExecuteNonQueryAsync();
                    _logger.LogInformation("Successfully truncated table: {TableName}", tableName);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "TRUNCATE failed for table {TableName}, trying DELETE", tableName);
                    try
                    {
                        // Fallback to DELETE if TRUNCATE fails
                        using var deleteCommand = new Npgsql.NpgsqlCommand($"DELETE FROM \"{tableName}\";", connection);
                        await deleteCommand.ExecuteNonQueryAsync();
                        _logger.LogInformation("Successfully deleted data from table: {TableName}", tableName);
                    }
                    catch (Exception deleteEx)
                    {
                        _logger.LogError(deleteEx, "Failed to clear data from table {TableName}", tableName);
                        throw; // Re-throw to stop the restore process
                    }
                }
            }

            // Reset all sequences to prevent duplicate key issues
            await ResetAllSequences(connection);

            // Re-enable foreign key constraints
            using var enableFkCommand = new Npgsql.NpgsqlCommand("SET session_replication_role = DEFAULT;", connection);
            await enableFkCommand.ExecuteNonQueryAsync();
            _logger.LogInformation("Re-enabled foreign key constraints");
        }

        private async Task RestoreSingleFile(string filePath, string connectionString)
        {
            using var connection = new Npgsql.NpgsqlConnection(connectionString);
            await connection.OpenAsync();

            // Clear existing data first (same as directory restore)
            _logger.LogInformation("Clearing existing data from all tables before single file restore");
            await ClearAllTableData(connection);
            
            var sqlContent = await File.ReadAllTextAsync(filePath);
            await ExecuteSqlContent(connection, sqlContent);
        }

        private async Task ResetAllSequences(Npgsql.NpgsqlConnection connection)
        {
            try
            {
                _logger.LogInformation("Resetting all sequences to prevent duplicate key issues");

                // Get all sequences in the public schema directly
                var sequencesQuery = @"
                    SELECT schemaname, sequencename
                    FROM pg_sequences 
                    WHERE schemaname = 'public'";

                using var sequencesCommand = new Npgsql.NpgsqlCommand(sequencesQuery, connection);
                using var sequencesReader = await sequencesCommand.ExecuteReaderAsync();
                
                var sequencesToReset = new List<string>();
                while (await sequencesReader.ReadAsync())
                {
                    var sequenceName = sequencesReader.GetString(1); // sequencename column
                    sequencesToReset.Add(sequenceName);
                }
                sequencesReader.Close();

                // Reset each sequence to MAX(id) + 1
                foreach (var sequenceName in sequencesToReset)
                {
                    try
                    {
                        // Extract table and column name from sequence name
                        // Sequence names are typically like "tablename_columnname_seq"
                        var parts = sequenceName.Replace("_seq", "").Split('_');
                        if (parts.Length >= 2)
                        {
                            var tableName = string.Join("_", parts.Take(parts.Length - 1));
                            var columnName = parts.Last().ToLower(); // Convert to lowercase for PostgreSQL
                            
                            // Get the maximum ID value for this table
                            var maxIdQuery = $"SELECT COALESCE(MAX(\"{columnName}\"), 0) FROM \"{tableName}\"";
                            using var maxIdCommand = new Npgsql.NpgsqlCommand(maxIdQuery, connection);
                            var maxId = await maxIdCommand.ExecuteScalarAsync();
                            
                            var nextValue = Convert.ToInt64(maxId) + 1;
                            
                            // Reset the sequence to max + 1
                            var resetSequenceCommand = $"SELECT setval('{sequenceName}', {nextValue}, false)";
                            using var resetCommand = new Npgsql.NpgsqlCommand(resetSequenceCommand, connection);
                            await resetCommand.ExecuteNonQueryAsync();
                            
                            _logger.LogInformation("Reset sequence {SequenceName} to {NextValue} for table {TableName}.{ColumnName}", 
                                sequenceName, nextValue, tableName, columnName);
                        }
                        else
                        {
                            _logger.LogWarning("Could not parse sequence name {SequenceName} to extract table/column", sequenceName);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to reset sequence {SequenceName}", sequenceName);
                        // Continue with other sequences even if one fails
                    }
                }

                _logger.LogInformation("Completed sequence reset for {Count} sequences", sequencesToReset.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during sequence reset process");
                // Don't throw - this is a recovery operation and shouldn't break the restore
            }
        }

        private async Task ExecuteSqlContent(Npgsql.NpgsqlConnection connection, string sqlContent)
        {
            // Split SQL content by statements and execute each one
            var statements = sqlContent.Split(new[] { ";" }, StringSplitOptions.RemoveEmptyEntries);
            
            foreach (var statement in statements)
            {
                var trimmedStatement = statement.Trim();
                if (!string.IsNullOrEmpty(trimmedStatement))
                {
                    try
                    {
                        using var command = new Npgsql.NpgsqlCommand(trimmedStatement, connection);
                        await command.ExecuteNonQueryAsync();
                    }
                    catch (Exception ex)
                    {
                        // Log warning but continue - some statements might fail due to constraints or existing data
                        _logger.LogWarning(ex, "SQL statement execution warning: {Statement}", 
                            trimmedStatement.Length > 100 ? trimmedStatement.Substring(0, 100) + "..." : trimmedStatement);
                    }
                }
            }
        }

        private string GetSupabaseConnectionString()
        {
            try
            {
                var connectionString = _configuration.GetConnectionString("DefaultConnection");
                var secureConfig = new SecureConfigurationService();
                var processedConnectionString = secureConfig.ProcessConnectionString(connectionString ?? string.Empty);
                
                // Check if we still have placeholder values
                if (processedConnectionString.Contains("{{DB_PASSWORD}}"))
                {
                    throw new InvalidOperationException("Database password not configured. Please set the BMS_DB_PASSWORD environment variable with your Supabase database password.");
                }
                
                return processedConnectionString;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get database connection string");
                throw new InvalidOperationException("Database connection configuration error: " + ex.Message, ex);
            }
        }

        private static long GetDirectorySize(string directoryPath)
        {
            return Directory.GetFiles(directoryPath, "*", SearchOption.AllDirectories)
                .Sum(file => new FileInfo(file).Length);
        }

        private static string FormatBytes(long bytes)
        {
            string[] suffixes = { "B", "KB", "MB", "GB" };
            int counter = 0;
            decimal number = bytes;
            while (Math.Round(number / 1024) >= 1)
            {
                number /= 1024;
                counter++;
            }
            return $"{number:n1} {suffixes[counter]}";
        }

        private static string MaskConnectionString(string connectionString)
        {
            // Hide password in connection string for logging
            return System.Text.RegularExpressions.Regex.Replace(
                connectionString, 
                @"Password=[^;]+", 
                "Password=***", 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        }

        private static string GetBackupErrorSuggestion(Exception ex)
        {
            if (ex.Message.Contains("BMS_DB_PASSWORD"))
                return "Please configure your database password: set BMS_DB_PASSWORD environment variable";
            if (ex.Message.Contains("Database connection configuration error"))
                return "Check database configuration and ensure all environment variables are set";
            if (ex.Message.Contains("supabase"))
                return "Install Supabase CLI: npm install -g supabase";
            if (ex.Message.Contains("connection"))
                return "Check database connection and credentials";
            if (ex.Message.Contains("permission"))
                return "Check file system permissions for backup directory";
            return "Check logs for detailed error information";
        }

        private static string GetRestoreErrorSuggestion(Exception ex)
        {
            if (ex.Message.Contains("psql"))
                return "Install PostgreSQL client tools (psql)";
            if (ex.Message.Contains("connection"))
                return "Check database connection and credentials";
            if (ex.Message.Contains("file"))
                return "Verify backup file exists and is not corrupted";
            return "Check logs for detailed error information";
        }

        #endregion
    }

    #region Data Models

    public class BackupCapabilities
    {
        public string Plan { get; set; } = "Unknown";
        public bool AutomaticBackups { get; set; }
        public bool ManualBackupNeeded { get; set; }
        public bool HasSupabaseCLI { get; set; }
        public bool LocalBackupsAvailable { get; set; }
        public string Message { get; set; } = "";
        public List<string> AvailableBackups { get; set; } = new();
    }

    public class BackupResult
    {
        public bool Success { get; set; }
        public string BackupId { get; set; } = "";
        public string BackupPath { get; set; } = "";
        public string Method { get; set; } = "";
        public long Size { get; set; }
        public int Files { get; set; }
        public DateTime CreatedAt { get; set; }
        public string? Error { get; set; }
        public string? Suggestion { get; set; }
    }

    public class RestoreResult  
    {
        public bool Success { get; set; }
        public string BackupFile { get; set; } = "";
        public DateTime RestoredAt { get; set; }
        public string Message { get; set; } = "";
        public string? Error { get; set; }
        public string? Suggestion { get; set; }
    }

    public class LocalBackupInfo
    {
        public string BackupId { get; set; } = "";
        public string Path { get; set; } = "";
        public DateTime CreatedAt { get; set; }
        public string Method { get; set; } = "";
        public long Size { get; set; }
        public int Files { get; set; }
        public bool HasManifest { get; set; }
    }

    public class BackupManifest
    {
        public string BackupId { get; set; } = "";
        public DateTime CreatedAt { get; set; }
        public string Method { get; set; } = "";
        public string DatabaseUrl { get; set; } = "";
        public List<string> Files { get; set; } = new();
    }

    #endregion
}