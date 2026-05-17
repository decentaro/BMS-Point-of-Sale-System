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
                await _next(context);
                stopwatch.Stop();

                var status = context.Response.StatusCode;
                var duration = stopwatch.ElapsedMilliseconds;

                // Slow request — always surfaced regardless of method
                if (duration > 2000)
                {
                    _logger.LogWarning(
                        "Slow request: {Method} {Path} {StatusCode} in {Duration}ms",
                        method, path + queryString, status, duration);
                    return;
                }

                // Client/server errors — always log
                if (status >= 400)
                {
                    _logger.LogWarning(
                        "API {Method} {Path} responded {StatusCode} in {Duration}ms",
                        method, path + queryString, status, duration);
                    return;
                }

                // Routine GETs returning 2xx — not useful in the log viewer, skip
                if (method == "GET") return;

                // State-changing operations (POST/PUT/DELETE) — log at info
                LogBusinessEvent(context, method, path, employeeId, status, duration);
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                _logger.LogError(ex,
                    "Request failed: {Method} {Path} {Duration}ms",
                    method, path + queryString, stopwatch.ElapsedMilliseconds);
                throw;
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
        /// Log meaningful business events for state-changing operations.
        /// </summary>
        private void LogBusinessEvent(HttpContext context, string method, string path, string? employeeId, int status, long duration)
        {
            var actor = string.IsNullOrEmpty(employeeId) ? "" : $" by employee {employeeId}";

            if (path.StartsWith("/api/auth/login"))
            {
                var ok = status == 200;
                if (ok)
                    _logger.LogInformation("Login successful{Actor}", actor);
                else
                    _logger.LogWarning("Login failed{Actor} — invalid credentials", actor);
                return;
            }

            if (path.StartsWith("/api/sales") && method == "POST")
            {
                _logger.LogInformation("Sale created{Actor} in {Duration}ms", actor, duration);
                return;
            }

            if (path.StartsWith("/api/returns") && method == "POST")
            {
                _logger.LogInformation("Return processed{Actor} in {Duration}ms", actor, duration);
                return;
            }

            if (path.StartsWith("/api/stock") || path.StartsWith("/api/products"))
            {
                _logger.LogInformation("{Method} {Path} completed{Actor} in {Duration}ms", method, path, actor, duration);
                return;
            }

            // Generic fallback for other write operations
            _logger.LogInformation("{Method} {Path} {Status}{Actor} in {Duration}ms", method, path, status, actor, duration);
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