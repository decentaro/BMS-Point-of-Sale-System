using System.Diagnostics;

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

        /// <summary>
        /// Extract employee ID from request body for authentication requests
        /// </summary>
        private async Task<string?> TryExtractEmployeeId(HttpContext context)
        {
            try
            {
                context.Request.EnableBuffering();
                var body = await new StreamReader(context.Request.Body).ReadToEndAsync();
                context.Request.Body.Position = 0;
                
                // Simple JSON parsing to extract employeeId
                if (body.Contains("employeeId"))
                {
                    var start = body.IndexOf("\"employeeId\":");
                    if (start >= 0)
                    {
                        start = body.IndexOf('\"', start + 13);
                        var end = body.IndexOf('\"', start + 1);
                        if (start >= 0 && end >= 0)
                        {
                            return body.Substring(start + 1, end - start - 1);
                        }
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