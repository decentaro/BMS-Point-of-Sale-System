using System.ComponentModel.DataAnnotations;

namespace BMS_POS_API.Models
{
    public class AdminSettings
    {
        [Key]
        public int Id { get; set; }
        
        // Update Management
        public string CurrentVersion { get; set; } = "1.2.0";
        public string UpdateStatus { get; set; } = "up-to-date"; // checking, up-to-date, available, downloading, ready, error
        public string? AvailableVersion { get; set; }
        public string? UpdateDescription { get; set; }
        
        // Security & Access
        public bool RequireStrongPins { get; set; } = false;
        public int MaxFailedLoginAttempts { get; set; } = 5;
        
        // System Performance
        public string LogLevel { get; set; } = "info"; // error, warning, info, debug
        public bool PerformanceMetricsEnabled { get; set; } = true;
        public bool CacheEnabled { get; set; } = true;
        
        // Database Connection (read-only display)
        public string DatabaseStatus { get; set; } = "Connected";
        public DateTime? LastBackup { get; set; }
        public string? LastBackupMethod { get; set; } // "CLI", "Dashboard", "Manual"
        public string? LastBackupSize { get; set; }
        public string? LastBackupPath { get; set; }
        
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    }
}