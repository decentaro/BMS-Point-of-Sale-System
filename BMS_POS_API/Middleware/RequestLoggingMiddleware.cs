using System.Diagnostics;
using System.Text.Json;

namespace BMS_POS_API.Middleware
{
    /// <summary>
    /// Comprehensive request logging middleware for monitoring all API activity
    /// </summary>
    public class RequestLoggingMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<RequestLoggingMiddleware> _logger;

        public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var stopwatch = Stopwatch.StartNew();
            var requestId = Guid.NewGuid().ToString("N")[..8];
            
            // Add request ID to context for tracing
            context.Items["RequestId"] = requestId;
            
            // Capture request details
            var method = context.Request.Method;
            var path = context.Request.Path.ToString();
            var queryString = context.Request.QueryString.ToString();
            var ipAddress = GetClientIpAddress(context);
            
            // Try to extract employee ID from request if it's an auth request
            string? employeeId = null;
            if (path.StartsWith("/api/auth") && context.Request.ContentType?.Contains("application/json") == true)
            {
                employeeId = await TryExtractEmployeeId(context);
            }

            try
            {
                // Execute the request
                await _next(context);
                
                stopwatch.Stop();
                
                // Log successful request with structured data
                _logger.LogInformation(
                    "API {Method} {Path} responded {StatusCode} in {Duration}ms {RequestId} {EmployeeId} {IPAddress} {Performance}",
                    method, 
                    path + queryString, 
                    context.Response.StatusCode, 
                    stopwatch.ElapsedMilliseconds,
                    requestId,
                    employeeId ?? "",
                    ipAddress,
                    stopwatch.ElapsedMilliseconds > 2000 // Mark as performance issue
                );

                // Log business metrics for important endpoints
                LogBusinessMetrics(context, method, path, employeeId, stopwatch.ElapsedMilliseconds);
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                
                // Log the error with full context
                _logger.LogError(ex, 
                    "Request failed: {Method} {Path} {RequestId} {Duration}ms {IPAddress} {EmployeeId}",
                    method, path + queryString, requestId, stopwatch.ElapsedMilliseconds, ipAddress, employeeId ?? "");
                
                throw; // Re-throw to maintain normal error handling
            }
        }

        // Fields whose values must never appear in logs
        private static readonly HashSet<string> _sensitiveFields =
            new(StringComparer.OrdinalIgnoreCase) { "pin", "managerPin", "newPin", "oldPin", "currentPin", "password", "confirmationPhrase" };

        /// <summary>
        /// Extract employee ID from auth request body using a proper JSON parser.
        /// Sensitive fields are explicitly excluded so PIN values are never logged.
        /// </summary>
        private async Task<string?> TryExtractEmployeeId(HttpContext context)
        {
            try
            {
                context.Request.EnableBuffering();
                var body = await new StreamReader(context.Request.Body).ReadToEndAsync();
                context.Request.Body.Position = 0;

                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (root.ValueKind != JsonValueKind.Object) return null;

                foreach (var prop in root.EnumerateObject())
                {
                    // Never log the value of a sensitive field
                    if (_sensitiveFields.Contains(prop.Name)) continue;

                    if (prop.Name.Equals("employeeId", StringComparison.OrdinalIgnoreCase)
                        && prop.Value.ValueKind == JsonValueKind.String)
                    {
                        return prop.Value.GetString();
                    }
                }
            }
            catch
            {
                // Don't break request processing if employee ID extraction fails
            }

            return null;
        }

        /// <summary>
        /// Log business metrics for important operations
        /// </summary>
        private void LogBusinessMetrics(HttpContext context, string method, string path, string? employeeId, long duration)
        {
            // Login attempts
            if (path.StartsWith("/api/auth/login"))
            {
                var isSuccess = context.Response.StatusCode == 200;
                _logger.LogInformation(
                    "Business metric: {MetricType} {EmployeeId} {Success} {Duration}ms {BusinessMetric}",
                    isSuccess ? "LOGIN_SUCCESS" : "LOGIN_FAILED",
                    employeeId ?? "unknown",
                    isSuccess,
                    duration,
                    true
                );
            }

            // Transaction operations
            if (path.StartsWith("/api/sales") || path.StartsWith("/api/transactions"))
            {
                _logger.LogInformation(
                    "Business metric: TRANSACTION_API {Method} {Path} {StatusCode} {Duration}ms {EmployeeId} {BusinessMetric}",
                    method,
                    path,
                    context.Response.StatusCode,
                    duration,
                    employeeId ?? "",
                    true
                );
            }
        }

        /// <summary>
        /// Get client IP address with proxy support
        /// </summary>
        private string GetClientIpAddress(HttpContext context)
        {
            var xForwardedFor = context.Request.Headers["X-Forwarded-For"].FirstOrDefault();
            if (!string.IsNullOrEmpty(xForwardedFor))
            {
                return xForwardedFor.Split(',').First().Trim();
            }

            var xRealIp = context.Request.Headers["X-Real-IP"].FirstOrDefault();
            if (!string.IsNullOrEmpty(xRealIp))
            {
                return xRealIp;
            }

            return context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        }
    }
}