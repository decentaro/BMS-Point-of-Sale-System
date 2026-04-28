using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using BMS_POS_API.Middleware;
using FluentAssertions;

namespace BMS_POS_API.Tests.Middleware
{
    public class ClaimsEnforcementMiddlewareTests
    {
        private static ClaimsEnforcementMiddleware Create(RequestDelegate? next = null)
        {
            next ??= _ => Task.CompletedTask;
            return new ClaimsEnforcementMiddleware(next);
        }

        private static HttpContext MakeAuthenticatedContext(string userId, string userName)
        {
            var ctx = new DefaultHttpContext();
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, userId),
                new(ClaimTypes.Name, userName),
            };
            var identity = new ClaimsIdentity(claims, "Bearer");
            ctx.User = new ClaimsPrincipal(identity);
            return ctx;
        }

        private static HttpContext MakeUnauthenticatedContext()
        {
            var ctx = new DefaultHttpContext();
            ctx.User = new ClaimsPrincipal(new ClaimsIdentity()); // no auth type → not authenticated
            return ctx;
        }

        // ── Happy Path ────────────────────────────────────────────

        [Fact]
        public async Task AuthenticatedRequest_SetsXUserIdFromClaims()
        {
            var mw = Create();
            var ctx = MakeAuthenticatedContext("42", "Alice");

            await mw.InvokeAsync(ctx);

            ctx.Request.Headers["X-User-Id"].ToString().Should().Be("42");
        }

        [Fact]
        public async Task AuthenticatedRequest_SetsXUserNameFromClaims()
        {
            var mw = Create();
            var ctx = MakeAuthenticatedContext("42", "Alice");

            await mw.InvokeAsync(ctx);

            ctx.Request.Headers["X-User-Name"].ToString().Should().Be("Alice");
        }

        [Fact]
        public async Task AuthenticatedRequest_OverwritesSpoofedXUserId()
        {
            var mw = Create();
            var ctx = MakeAuthenticatedContext("42", "Alice");
            ctx.Request.Headers["X-User-Id"] = "999"; // attacker tries to spoof

            await mw.InvokeAsync(ctx);

            ctx.Request.Headers["X-User-Id"].ToString().Should().Be("42");
        }

        [Fact]
        public async Task AuthenticatedRequest_OverwritesSpoofedXUserName()
        {
            var mw = Create();
            var ctx = MakeAuthenticatedContext("42", "Alice");
            ctx.Request.Headers["X-User-Name"] = "Admin"; // attacker tries to spoof

            await mw.InvokeAsync(ctx);

            ctx.Request.Headers["X-User-Name"].ToString().Should().Be("Alice");
        }

        [Fact]
        public async Task UnauthenticatedRequest_DoesNotSetHeaders()
        {
            var mw = Create();
            var ctx = MakeUnauthenticatedContext();

            await mw.InvokeAsync(ctx);

            ctx.Request.Headers.ContainsKey("X-User-Id").Should().BeFalse();
            ctx.Request.Headers.ContainsKey("X-User-Name").Should().BeFalse();
        }

        [Fact]
        public async Task InvokeAsync_CallsNextMiddleware()
        {
            var nextCalled = false;
            RequestDelegate next = _ => { nextCalled = true; return Task.CompletedTask; };
            var mw = Create(next);
            var ctx = MakeAuthenticatedContext("1", "Bob");

            await mw.InvokeAsync(ctx);

            nextCalled.Should().BeTrue();
        }

        // ── Edge Cases ────────────────────────────────────────────

        [Fact]
        public async Task AuthenticatedRequest_SubClaimFallback_SetsXUserId()
        {
            // .NET may map 'sub' to ClaimTypes.NameIdentifier; test the fallback path too
            var ctx = new DefaultHttpContext();
            var claims = new[]
            {
                new Claim("sub", "99"),
                new Claim(ClaimTypes.Name, "SubUser"),
            };
            ctx.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

            var mw = Create();
            await mw.InvokeAsync(ctx);

            // Either NameIdentifier or sub should set X-User-Id
            ctx.Request.Headers["X-User-Id"].ToString().Should().Be("99");
        }

        [Fact]
        public async Task AuthenticatedRequest_MissingUserIdClaim_DoesNotSetXUserId()
        {
            var ctx = new DefaultHttpContext();
            var claims = new[] { new Claim(ClaimTypes.Name, "NameOnly") };
            ctx.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

            var mw = Create();
            await mw.InvokeAsync(ctx);

            ctx.Request.Headers.ContainsKey("X-User-Id").Should().BeFalse();
        }

        [Fact]
        public async Task AuthenticatedRequest_MissingUserNameClaim_DoesNotSetXUserName()
        {
            var ctx = new DefaultHttpContext();
            var claims = new[] { new Claim(ClaimTypes.NameIdentifier, "7") };
            ctx.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Bearer"));

            var mw = Create();
            await mw.InvokeAsync(ctx);

            ctx.Request.Headers.ContainsKey("X-User-Name").Should().BeFalse();
        }

        [Fact]
        public async Task UnauthenticatedRequest_ExistingSpoofedHeaders_NotOverwritten()
        {
            // Without auth, we should NOT touch headers at all (caller's headers preserved as-is)
            var mw = Create();
            var ctx = MakeUnauthenticatedContext();
            ctx.Request.Headers["X-User-Id"] = "evil";

            await mw.InvokeAsync(ctx);

            // Middleware skips unauthenticated — header stays as attacker set it.
            // This is acceptable because unauthenticated routes don't use these headers
            // for auth decisions; the JWT auth check gates those routes separately.
            ctx.Request.Headers["X-User-Id"].ToString().Should().Be("evil");
        }

        // ── Rare Edge Cases ───────────────────────────────────────

        [Fact]
        public async Task MultiplePrincipals_FirstIdentityUsed()
        {
            var ctx = new DefaultHttpContext();
            var identity1 = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, "100"),
                new Claim(ClaimTypes.Name, "First"),
            }, "Bearer");
            var identity2 = new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.NameIdentifier, "200"),
                new Claim(ClaimTypes.Name, "Second"),
            }, "Bearer");
            ctx.User = new ClaimsPrincipal(new[] { identity1, identity2 });

            var mw = Create();
            await mw.InvokeAsync(ctx);

            // FindFirst picks first matching claim across all identities
            ctx.Request.Headers["X-User-Id"].ToString().Should().Be("100");
        }

        [Fact]
        public async Task NextMiddlewareReceivesUpdatedHeaders()
        {
            string? capturedUserId = null;
            RequestDelegate next = httpCtx =>
            {
                capturedUserId = httpCtx.Request.Headers["X-User-Id"].ToString();
                return Task.CompletedTask;
            };
            var mw = Create(next);
            var ctx = MakeAuthenticatedContext("77", "Charlie");
            ctx.Request.Headers["X-User-Id"] = "0"; // spoof before middleware

            await mw.InvokeAsync(ctx);

            capturedUserId.Should().Be("77");
        }
    }
}
