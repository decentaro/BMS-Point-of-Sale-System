namespace BMS_POS_API.Middleware
{
    public class SecurityHeadersMiddleware
    {
        private readonly RequestDelegate _next;

        public SecurityHeadersMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var headers = context.Response.Headers;
            headers["X-Frame-Options"]           = "DENY";
            headers["X-Content-Type-Options"]    = "nosniff";
            headers["X-XSS-Protection"]          = "1; mode=block";
            headers["Referrer-Policy"]           = "no-referrer";
            headers["Content-Security-Policy"]   = "default-src 'none'; frame-ancestors 'none'";
            headers["Permissions-Policy"]        = "geolocation=(), microphone=(), camera=()";
            await _next(context);
        }
    }
}
