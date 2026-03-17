using System.Security.Claims;

namespace BMS_POS_API.Middleware
{
    /// <summary>
    /// Overwrites the X-User-Id and X-User-Name request headers with values
    /// derived from the validated JWT claims for every authenticated request.
    /// This prevents a malicious or compromised frontend from spoofing audit
    /// log entries by sending arbitrary header values.
    /// </summary>
    public class ClaimsEnforcementMiddleware
    {
        private readonly RequestDelegate _next;

        public ClaimsEnforcementMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            if (context.User.Identity?.IsAuthenticated == true)
            {
                // 'sub' is mapped by .NET's JWT middleware to ClaimTypes.NameIdentifier
                var userId = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                          ?? context.User.FindFirst("sub")?.Value;

                var userName = context.User.FindFirst(ClaimTypes.Name)?.Value;

                if (!string.IsNullOrEmpty(userId))
                    context.Request.Headers["X-User-Id"] = userId;

                if (!string.IsNullOrEmpty(userName))
                    context.Request.Headers["X-User-Name"] = userName;
            }

            await _next(context);
        }
    }
}
