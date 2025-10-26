using Serilog;
using Serilog.Events;

namespace BMS_POS_API.Extensions
{
    /// <summary>
    /// Logging extensions for structured, comprehensive application monitoring
    /// </summary>
    public static class LoggingExtensions
    {
        /// <summary>
        /// Configure comprehensive Serilog with structured JSON logging
        /// </summary>
        public static IServiceCollection AddComprehensiveLogging(this IServiceCollection services, IConfiguration configuration)
        {
            // Create directory if it doesn't exist
            Directory.CreateDirectory("logs");

            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Information()
                .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
                .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Information)
                .MinimumLevel.Override("System", LogEventLevel.Warning)
                .Enrich.FromLogContext()
                .Enrich.WithProperty("Application", "BMS_POS")
                .Enrich.WithProperty("Environment", configuration["ASPNETCORE_ENVIRONMENT"] ?? "Development")
                
                // Console logging
                .WriteTo.Console()
                
                // All application events in JSON
                .WriteTo.File(
                    path: "logs/application-.json",
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 30,
                    formatter: new Serilog.Formatting.Json.JsonFormatter())
                
                // Performance logs (separate file)
                .WriteTo.File(
                    path: "logs/performance-.json",
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 7,
                    restrictedToMinimumLevel: LogEventLevel.Information,
                    formatter: new Serilog.Formatting.Json.JsonFormatter())
                
                // Error logs (separate file)
                .WriteTo.File(
                    path: "logs/errors-.json",
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 30,
                    restrictedToMinimumLevel: LogEventLevel.Error,
                    formatter: new Serilog.Formatting.Json.JsonFormatter())
                
                // Business metrics logs (separate file)
                .WriteTo.File(
                    path: "logs/business-.json",
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 365,
                    formatter: new Serilog.Formatting.Json.JsonFormatter())
                
                .CreateLogger();
            
            return services;
        }
    }
}