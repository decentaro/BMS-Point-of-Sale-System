using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Moq;
using BMS_POS_API.Middleware;
using FluentAssertions;

namespace BMS_POS_API.Tests.Middleware
{
    public class GlobalExceptionMiddlewareTests
    {
        private static GlobalExceptionMiddleware Create(RequestDelegate next)
        {
            var logger = Mock.Of<ILogger<GlobalExceptionMiddleware>>();
            return new GlobalExceptionMiddleware(next, logger);
        }

        private static HttpContext MakeContext()
        {
            var ctx = new DefaultHttpContext();
            ctx.Response.Body = new MemoryStream();
            return ctx;
        }

        private static async Task<(int status, string body)> InvokeAndRead(GlobalExceptionMiddleware mw, HttpContext ctx)
        {
            await mw.InvokeAsync(ctx);
            ctx.Response.Body.Seek(0, SeekOrigin.Begin);
            var body = await new StreamReader(ctx.Response.Body).ReadToEndAsync();
            return (ctx.Response.StatusCode, body);
        }

        // ── Happy Path — no exception ─────────────────────────────

        [Fact]
        public async Task NoException_PassesThrough()
        {
            var reached = false;
            RequestDelegate next = _ => { reached = true; return Task.CompletedTask; };
            var mw = Create(next);
            var ctx = MakeContext();

            await mw.InvokeAsync(ctx);

            reached.Should().BeTrue();
        }

        // ── Exception mapping ─────────────────────────────────────

        [Fact]
        public async Task UnauthorizedAccessException_Returns401()
        {
            RequestDelegate next = _ => throw new UnauthorizedAccessException("nope");
            var mw = Create(next);
            var ctx = MakeContext();

            var (status, body) = await InvokeAndRead(mw, ctx);

            status.Should().Be((int)HttpStatusCode.Unauthorized);
            body.Should().Contain("Unauthorized access");
        }

        [Fact]
        public async Task ArgumentException_Returns400()
        {
            RequestDelegate next = _ => throw new ArgumentException("bad arg");
            var mw = Create(next);
            var ctx = MakeContext();

            var (status, body) = await InvokeAndRead(mw, ctx);

            status.Should().Be((int)HttpStatusCode.BadRequest);
            body.Should().Contain("Invalid request data");
        }

        [Fact]
        public async Task ArgumentNullException_Returns400()
        {
            RequestDelegate next = _ => throw new ArgumentNullException("param");
            var mw = Create(next);
            var ctx = MakeContext();

            var (status, body) = await InvokeAndRead(mw, ctx);

            status.Should().Be((int)HttpStatusCode.BadRequest);
            body.Should().Contain("Invalid request data");
        }

        [Fact]
        public async Task KeyNotFoundException_Returns404()
        {
            RequestDelegate next = _ => throw new KeyNotFoundException("not found");
            var mw = Create(next);
            var ctx = MakeContext();

            var (status, body) = await InvokeAndRead(mw, ctx);

            status.Should().Be((int)HttpStatusCode.NotFound);
            body.Should().Contain("Resource not found");
        }

        [Fact]
        public async Task TimeoutException_Returns408()
        {
            RequestDelegate next = _ => throw new TimeoutException("timed out");
            var mw = Create(next);
            var ctx = MakeContext();

            var (status, body) = await InvokeAndRead(mw, ctx);

            status.Should().Be((int)HttpStatusCode.RequestTimeout);
            body.Should().Contain("Request timeout");
        }

        [Fact]
        public async Task UnhandledException_Returns500()
        {
            RequestDelegate next = _ => throw new InvalidOperationException("something exploded");
            var mw = Create(next);
            var ctx = MakeContext();

            var (status, body) = await InvokeAndRead(mw, ctx);

            status.Should().Be((int)HttpStatusCode.InternalServerError);
            body.Should().Contain("An internal server error occurred");
        }

        // ── Response format ───────────────────────────────────────

        [Fact]
        public async Task Response_ContentType_IsApplicationJson()
        {
            RequestDelegate next = _ => throw new Exception("boom");
            var mw = Create(next);
            var ctx = MakeContext();

            await mw.InvokeAsync(ctx);

            ctx.Response.ContentType.Should().Be("application/json");
        }

        [Fact]
        public async Task Response_Body_IsValidJson()
        {
            RequestDelegate next = _ => throw new Exception("boom");
            var mw = Create(next);
            var ctx = MakeContext();

            var (_, body) = await InvokeAndRead(mw, ctx);

            var act = () => JsonDocument.Parse(body);
            act.Should().NotThrow();
        }

        [Fact]
        public async Task Response_Json_UsesCamelCase()
        {
            RequestDelegate next = _ => throw new KeyNotFoundException();
            var mw = Create(next);
            var ctx = MakeContext();

            var (_, body) = await InvokeAndRead(mw, ctx);

            // camelCase: "statusCode" not "StatusCode"
            body.Should().Contain("\"statusCode\"");
            body.Should().Contain("\"message\"");
        }

        [Fact]
        public async Task Response_StatusCode_MatchesBodyStatusCode()
        {
            RequestDelegate next = _ => throw new UnauthorizedAccessException();
            var mw = Create(next);
            var ctx = MakeContext();

            var (status, body) = await InvokeAndRead(mw, ctx);
            var doc = JsonDocument.Parse(body);

            status.Should().Be(doc.RootElement.GetProperty("statusCode").GetInt32());
        }

        // ── Edge Cases ────────────────────────────────────────────

        [Fact]
        public async Task DerivedArgumentException_Returns400()
        {
            // ArgumentOutOfRangeException extends ArgumentException
            RequestDelegate next = _ => throw new ArgumentOutOfRangeException("val");
            var mw = Create(next);
            var ctx = MakeContext();

            var (status, _) = await InvokeAndRead(mw, ctx);
            status.Should().Be((int)HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task NullReferenceException_Returns500()
        {
            RequestDelegate next = _ => throw new NullReferenceException();
            var mw = Create(next);
            var ctx = MakeContext();

            var (status, _) = await InvokeAndRead(mw, ctx);
            status.Should().Be((int)HttpStatusCode.InternalServerError);
        }

        [Fact]
        public async Task AsyncException_HandledCorrectly()
        {
            RequestDelegate next = async _ =>
            {
                await Task.Delay(1);
                throw new KeyNotFoundException("async not found");
            };
            var mw = Create(next);
            var ctx = MakeContext();

            var (status, body) = await InvokeAndRead(mw, ctx);

            status.Should().Be((int)HttpStatusCode.NotFound);
            body.Should().Contain("Resource not found");
        }
    }
}
