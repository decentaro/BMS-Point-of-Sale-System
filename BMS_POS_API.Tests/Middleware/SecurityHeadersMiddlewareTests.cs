using Microsoft.AspNetCore.Http;
using BMS_POS_API.Middleware;
using FluentAssertions;

namespace BMS_POS_API.Tests.Middleware
{
    public class SecurityHeadersMiddlewareTests
    {
        private static SecurityHeadersMiddleware Create(RequestDelegate? next = null)
        {
            next ??= _ => Task.CompletedTask;
            return new SecurityHeadersMiddleware(next);
        }

        private static HttpContext MakeContext()
        {
            return new DefaultHttpContext();
        }

        // ── Happy Path ────────────────────────────────────────────

        [Fact]
        public async Task XFrameOptions_IsDeny()
        {
            var mw = Create();
            var ctx = MakeContext();
            await mw.InvokeAsync(ctx);
            ctx.Response.Headers["X-Frame-Options"].ToString().Should().Be("DENY");
        }

        [Fact]
        public async Task XContentTypeOptions_IsNoSniff()
        {
            var mw = Create();
            var ctx = MakeContext();
            await mw.InvokeAsync(ctx);
            ctx.Response.Headers["X-Content-Type-Options"].ToString().Should().Be("nosniff");
        }

        [Fact]
        public async Task XXssProtection_IsSet()
        {
            var mw = Create();
            var ctx = MakeContext();
            await mw.InvokeAsync(ctx);
            ctx.Response.Headers["X-XSS-Protection"].ToString().Should().Be("1; mode=block");
        }

        [Fact]
        public async Task ReferrerPolicy_IsNoReferrer()
        {
            var mw = Create();
            var ctx = MakeContext();
            await mw.InvokeAsync(ctx);
            ctx.Response.Headers["Referrer-Policy"].ToString().Should().Be("no-referrer");
        }

        [Fact]
        public async Task ContentSecurityPolicy_IsSet()
        {
            var mw = Create();
            var ctx = MakeContext();
            await mw.InvokeAsync(ctx);
            ctx.Response.Headers["Content-Security-Policy"].ToString()
                .Should().Contain("default-src 'none'")
                .And.Contain("frame-ancestors 'none'");
        }

        [Fact]
        public async Task PermissionsPolicy_IsSet()
        {
            var mw = Create();
            var ctx = MakeContext();
            await mw.InvokeAsync(ctx);
            var pp = ctx.Response.Headers["Permissions-Policy"].ToString();
            pp.Should().Contain("geolocation=()")
                .And.Contain("microphone=()")
                .And.Contain("camera=()");
        }

        [Fact]
        public async Task AllSixHeaders_PresentSimultaneously()
        {
            var mw = Create();
            var ctx = MakeContext();
            await mw.InvokeAsync(ctx);

            ctx.Response.Headers.ContainsKey("X-Frame-Options").Should().BeTrue();
            ctx.Response.Headers.ContainsKey("X-Content-Type-Options").Should().BeTrue();
            ctx.Response.Headers.ContainsKey("X-XSS-Protection").Should().BeTrue();
            ctx.Response.Headers.ContainsKey("Referrer-Policy").Should().BeTrue();
            ctx.Response.Headers.ContainsKey("Content-Security-Policy").Should().BeTrue();
            ctx.Response.Headers.ContainsKey("Permissions-Policy").Should().BeTrue();
        }

        // ── Passthrough behaviour ─────────────────────────────────

        [Fact]
        public async Task InvokeAsync_CallsNextMiddleware()
        {
            var nextCalled = false;
            RequestDelegate next = _ => { nextCalled = true; return Task.CompletedTask; };
            var mw = Create(next);
            var ctx = MakeContext();

            await mw.InvokeAsync(ctx);

            nextCalled.Should().BeTrue();
        }

        [Fact]
        public async Task Headers_SetBeforeNextMiddlewareRuns()
        {
            // Verify headers are set regardless of what next does
            string? xfoOnNext = null;
            RequestDelegate next = httpCtx =>
            {
                xfoOnNext = httpCtx.Response.Headers["X-Frame-Options"].ToString();
                return Task.CompletedTask;
            };
            var mw = Create(next);
            var ctx = MakeContext();

            await mw.InvokeAsync(ctx);

            xfoOnNext.Should().Be("DENY");
        }

        // ── Edge Cases ────────────────────────────────────────────

        [Fact]
        public async Task NextMiddlewareThrows_ExceptionPropagates()
        {
            RequestDelegate next = _ => throw new InvalidOperationException("downstream error");
            var mw = Create(next);
            var ctx = MakeContext();

            var act = () => mw.InvokeAsync(ctx);
            await act.Should().ThrowAsync<InvalidOperationException>();
        }

        [Fact]
        public async Task MultipleRequests_HeadersSetEachTime()
        {
            var mw = Create();

            for (int i = 0; i < 3; i++)
            {
                var ctx = MakeContext();
                await mw.InvokeAsync(ctx);
                ctx.Response.Headers["X-Frame-Options"].ToString().Should().Be("DENY");
            }
        }
    }
}
