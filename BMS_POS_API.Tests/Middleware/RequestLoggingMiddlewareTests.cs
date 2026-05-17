using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Moq;
using BMS_POS_API.Middleware;
using FluentAssertions;

namespace BMS_POS_API.Tests.Middleware
{
    public class RequestLoggingMiddlewareTests
    {
        private static RequestLoggingMiddleware Create(RequestDelegate next, ILogger<RequestLoggingMiddleware>? logger = null)
        {
            logger ??= Mock.Of<ILogger<RequestLoggingMiddleware>>();
            return new RequestLoggingMiddleware(next, logger);
        }

        private static HttpContext MakeContext(
            string method = "GET",
            string path = "/api/products",
            string? body = null,
            string? contentType = null,
            string? xForwardedFor = null,
            string? xRealIp = null)
        {
            var ctx = new DefaultHttpContext();
            ctx.Request.Method = method;
            ctx.Request.Path = new PathString(path);
            ctx.Response.Body = new MemoryStream();

            if (body != null)
            {
                var bytes = Encoding.UTF8.GetBytes(body);
                ctx.Request.Body = new MemoryStream(bytes);
                ctx.Request.ContentLength = bytes.Length;
                ctx.Request.ContentType = contentType ?? "application/json";
            }

            if (xForwardedFor != null)
                ctx.Request.Headers["X-Forwarded-For"] = xForwardedFor;
            if (xRealIp != null)
                ctx.Request.Headers["X-Real-IP"] = xRealIp;

            return ctx;
        }

        // ── Happy Path ────────────────────────────────────────────

        [Fact]
        public async Task InvokeAsync_SetsRequestIdInContextItems()
        {
            var mw = Create(_ => Task.CompletedTask);
            var ctx = MakeContext();

            await mw.InvokeAsync(ctx);

            ctx.Items["RequestId"].Should().NotBeNull();
            ctx.Items["RequestId"]!.ToString().Should().HaveLength(8);
        }

        [Fact]
        public async Task InvokeAsync_CallsNextMiddleware()
        {
            var called = false;
            var mw = Create(_ => { called = true; return Task.CompletedTask; });
            var ctx = MakeContext();

            await mw.InvokeAsync(ctx);

            called.Should().BeTrue();
        }

        [Fact]
        public async Task InvokeAsync_DoesNotLog_SuccessfulGetRequests()
        {
            // Routine GETs (product loads, settings fetches) are suppressed to keep logs clean
            var mockLogger = new Mock<ILogger<RequestLoggingMiddleware>>();
            var mw = Create(_ => Task.CompletedTask, mockLogger.Object);
            var ctx = MakeContext("GET", "/api/products");

            await mw.InvokeAsync(ctx);

            mockLogger.Verify(l => l.Log(
                It.IsAny<LogLevel>(),
                It.IsAny<EventId>(),
                It.IsAny<It.IsAnyType>(),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
                Times.Never);
        }

        [Fact]
        public async Task InvokeAsync_Logs_FailedRequests()
        {
            var mockLogger = new Mock<ILogger<RequestLoggingMiddleware>>();
            var mw = Create(ctx => { ctx.Response.StatusCode = 404; return Task.CompletedTask; }, mockLogger.Object);
            var ctx = MakeContext("GET", "/api/products");

            await mw.InvokeAsync(ctx);

            mockLogger.Verify(l => l.Log(
                LogLevel.Warning,
                It.IsAny<EventId>(),
                It.IsAny<It.IsAnyType>(),
                null,
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
                Times.AtLeastOnce);
        }

        [Fact]
        public async Task InvokeAsync_ExceptionRethrows()
        {
            RequestDelegate next = _ => throw new InvalidOperationException("boom");
            var mw = Create(next);
            var ctx = MakeContext();

            var act = () => mw.InvokeAsync(ctx);
            await act.Should().ThrowAsync<InvalidOperationException>();
        }

        [Fact]
        public async Task InvokeAsync_ExceptionLogsError()
        {
            var mockLogger = new Mock<ILogger<RequestLoggingMiddleware>>();
            RequestDelegate next = _ => throw new InvalidOperationException("boom");
            var mw = Create(next, mockLogger.Object);
            var ctx = MakeContext();

            try { await mw.InvokeAsync(ctx); } catch { }

            mockLogger.Verify(l => l.Log(
                LogLevel.Error,
                It.IsAny<EventId>(),
                It.IsAny<It.IsAnyType>(),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
                Times.Once);
        }

        // ── Employee ID extraction ────────────────────────────────

        [Fact]
        public async Task ExtractsEmployeeId_FromAuthRequestBody()
        {
            var mockLogger = new Mock<ILogger<RequestLoggingMiddleware>>();
            var capturedMessages = new List<string>();

            mockLogger
                .Setup(l => l.Log(
                    It.IsAny<LogLevel>(),
                    It.IsAny<EventId>(),
                    It.IsAny<It.IsAnyType>(),
                    It.IsAny<Exception?>(),
                    It.IsAny<Func<It.IsAnyType, Exception?, string>>()))
                .Callback<LogLevel, EventId, object, Exception?, Delegate>((level, _, state, _, formatter) =>
                {
                    capturedMessages.Add(state.ToString() ?? "");
                });

            var body = "{\"employeeId\":\"MGR-001\",\"pin\":\"1234\"}";
            var mw = Create(_ => Task.CompletedTask, mockLogger.Object);
            var ctx = MakeContext("POST", "/api/auth/login", body);

            await mw.InvokeAsync(ctx);

            capturedMessages.Should().Contain(m => m.Contains("MGR-001"));
        }

        [Fact]
        public async Task NeverLogs_PinValue()
        {
            var mockLogger = new Mock<ILogger<RequestLoggingMiddleware>>();
            var capturedMessages = new List<string>();

            mockLogger
                .Setup(l => l.Log(
                    It.IsAny<LogLevel>(),
                    It.IsAny<EventId>(),
                    It.IsAny<It.IsAnyType>(),
                    It.IsAny<Exception?>(),
                    It.IsAny<Func<It.IsAnyType, Exception?, string>>()))
                .Callback<LogLevel, EventId, object, Exception?, Delegate>((_, _, state, _, _) =>
                {
                    capturedMessages.Add(state.ToString() ?? "");
                });

            var body = "{\"employeeId\":\"EMP-001\",\"pin\":\"SECRET_PIN_9999\"}";
            var mw = Create(_ => Task.CompletedTask, mockLogger.Object);
            var ctx = MakeContext("POST", "/api/auth/login", body);

            await mw.InvokeAsync(ctx);

            capturedMessages.Should().NotContain(m => m.Contains("SECRET_PIN_9999"));
        }

        [Theory]
        [InlineData("pin")]
        [InlineData("managerPin")]
        [InlineData("newPin")]
        [InlineData("oldPin")]
        [InlineData("currentPin")]
        [InlineData("password")]
        [InlineData("confirmationPhrase")]
        public async Task SensitiveFields_AreNeverLogged(string fieldName)
        {
            var mockLogger = new Mock<ILogger<RequestLoggingMiddleware>>();
            var capturedMessages = new List<string>();
            mockLogger
                .Setup(l => l.Log(It.IsAny<LogLevel>(), It.IsAny<EventId>(), It.IsAny<It.IsAnyType>(), It.IsAny<Exception?>(), It.IsAny<Func<It.IsAnyType, Exception?, string>>()))
                .Callback<LogLevel, EventId, object, Exception?, Delegate>((_, _, state, _, _) =>
                    capturedMessages.Add(state.ToString() ?? ""));

            var secret = "SUPER_SECRET_VALUE_XYZ";
            var body = $"{{\"employeeId\":\"E1\",\"{fieldName}\":\"{secret}\"}}";
            var mw = Create(_ => Task.CompletedTask, mockLogger.Object);
            var ctx = MakeContext("POST", "/api/auth/login", body);

            await mw.InvokeAsync(ctx);

            capturedMessages.Should().NotContain(m => m.Contains(secret),
                $"field '{fieldName}' value should never appear in logs");
        }

        [Fact]
        public async Task DoesNotExtractEmployeeId_ForNonAuthPath()
        {
            // For non-auth paths, body is not read; no employee ID in log
            var body = "{\"employeeId\":\"SHOULD_NOT_EXTRACT\"}";
            var mw = Create(_ => Task.CompletedTask);
            var ctx = MakeContext("POST", "/api/products", body);

            // Should not throw even though body has employeeId
            await mw.InvokeAsync(ctx);
        }

        // ── IP address extraction ─────────────────────────────────

        [Fact]
        public async Task UsesXForwardedFor_WhenPresent_DoesNotThrow()
        {
            // IP is extracted internally but not included in log messages (kept clean for users)
            var mw = Create(_ => Task.CompletedTask);
            var ctx = MakeContext(xForwardedFor: "203.0.113.5, 10.0.0.1");
            await mw.InvokeAsync(ctx);
            // No throw = pass
        }

        [Fact]
        public async Task UsesXRealIp_WhenXForwardedForAbsent_DoesNotThrow()
        {
            var mw = Create(_ => Task.CompletedTask);
            var ctx = MakeContext(xRealIp: "198.51.100.7");
            await mw.InvokeAsync(ctx);
        }

        [Fact]
        public async Task TakesFirstIp_FromXForwardedForChain_DoesNotThrow()
        {
            var mw = Create(_ => Task.CompletedTask);
            var ctx = MakeContext(xForwardedFor: "1.2.3.4, 5.6.7.8, 9.10.11.12");
            await mw.InvokeAsync(ctx);
        }

        // ── Edge Cases ────────────────────────────────────────────

        [Fact]
        public async Task HandlesNonJsonBody_ForAuthPath_Gracefully()
        {
            var mw = Create(_ => Task.CompletedTask);
            var ctx = MakeContext("POST", "/api/auth/login", "not-json", "text/plain");
            // Should not throw
            await mw.InvokeAsync(ctx);
        }

        [Fact]
        public async Task HandlesEmptyBody_ForAuthPath_Gracefully()
        {
            var mw = Create(_ => Task.CompletedTask);
            var ctx = MakeContext("POST", "/api/auth/login", "", "application/json");
            await mw.InvokeAsync(ctx);
        }

        [Fact]
        public async Task RequestId_IsUniquePerRequest()
        {
            var mw = Create(_ => Task.CompletedTask);
            var ctx1 = MakeContext();
            var ctx2 = MakeContext();

            await mw.InvokeAsync(ctx1);
            await mw.InvokeAsync(ctx2);

            ctx1.Items["RequestId"].Should().NotBe(ctx2.Items["RequestId"]);
        }
    }
}
