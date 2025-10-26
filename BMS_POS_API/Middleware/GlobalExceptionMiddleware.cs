using System.Net;
using System.Text.Json;

namespace BMS_POS_API.Middleware
{
    public class GlobalExceptionMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<GlobalExceptionMiddleware> _logger;

        public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            try
            {
                await _next(context);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unhandled exception occurred: {Message}", ex.Message);
                await HandleExceptionAsync(context, ex);
            }
        }

        private static async Task HandleExceptionAsync(HttpContext context, Exception exception)
        {
            context.Response.ContentType = "application/json";

            var response = new ErrorResponse();

            switch (exception)
            {
                case UnauthorizedAccessException:
                    response.StatusCode = (int)HttpStatusCode.Unauthorized;
                    response.Message = "Unauthorized access";
                    break;
                case ArgumentNullException:
                case ArgumentException:
                    response.StatusCode = (int)HttpStatusCode.BadRequest;
                    response.Message = "Invalid request data";
                    break;
                case KeyNotFoundException:
                    response.StatusCode = (int)HttpStatusCode.NotFound;
                    response.Message = "Resource not found";
                    break;
                case TimeoutException:
                    response.StatusCode = (int)HttpStatusCode.RequestTimeout;
                    response.Message = "Request timeout";
                    break;
                default:
                    response.StatusCode = (int)HttpStatusCode.InternalServerError;
                    response.Message = "An internal server error occurred";
                    break;
            }

            context.Response.StatusCode = response.StatusCode;

            var jsonResponse = JsonSerializer.Serialize(response, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            await context.Response.WriteAsync(jsonResponse);
        }
    }

    public class ErrorResponse
    {
        public int StatusCode { get; set; }
        public string Message { get; set; } = string.Empty;
        public string? Details { get; set; }
    }
}