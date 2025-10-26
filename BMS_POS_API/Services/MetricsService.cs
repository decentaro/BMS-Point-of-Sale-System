namespace BMS_POS_API.Services
{
    /// <summary>
    /// Service for tracking business metrics and generating insights
    /// </summary>
    public interface IMetricsService
    {
        Task LogLoginAttempt(string employeeId, bool success, string? reason = null);
        Task LogTransaction(decimal amount, string employeeId, int productCount);
        Task LogSystemEvent(string eventType, string details, string? employeeId = null);
    }

    public class MetricsService : IMetricsService
    {
        private readonly ILogger<MetricsService> _logger;

        public MetricsService(ILogger<MetricsService> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Log login attempts with success/failure tracking
        /// </summary>
        public async Task LogLoginAttempt(string employeeId, bool success, string? reason = null)
        {
            _logger.LogInformation(
                "Login attempt: {EmployeeId} {Success} {Reason} {BusinessMetric}",
                employeeId,
                success,
                reason ?? "",
                true
            );

            // Return completed task
            await Task.CompletedTask;
        }

        /// <summary>
        /// Log transaction metrics for business intelligence
        /// </summary>
        public async Task LogTransaction(decimal amount, string employeeId, int productCount)
        {
            _logger.LogInformation(
                "Transaction: {Amount} {EmployeeId} {ProductCount} {BusinessMetric}",
                amount,
                employeeId,
                productCount,
                true
            );

            // Return completed task
            await Task.CompletedTask;
        }

        /// <summary>
        /// Log general system events
        /// </summary>
        public async Task LogSystemEvent(string eventType, string details, string? employeeId = null)
        {
            _logger.LogInformation(
                "System event: {EventType} {Details} {EmployeeId} {BusinessMetric}",
                eventType,
                details,
                employeeId ?? "system",
                true
            );

            // Return completed task
            await Task.CompletedTask;
        }
    }
}