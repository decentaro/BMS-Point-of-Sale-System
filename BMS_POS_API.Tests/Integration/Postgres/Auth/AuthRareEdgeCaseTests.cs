using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Auth
{
    [Collection("Postgres")]
    public class AuthRareEdgeCaseTests : IntegrationTestBase
    {
        public AuthRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task Login_EmptyEmployeeId_Returns400WithValidationError()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "",
                Pin = "123456",
                SelectedRole = "Manager"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("errorCode").GetString().Should().Be("AUTH_005");
        }

        [Fact]
        public async Task Login_EmptyPin_Returns400WithValidationError()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = ManagerEmployeeId,
                Pin = "",
                SelectedRole = "Manager"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("errorCode").GetString().Should().Be("AUTH_005");
        }

        [Fact]
        public async Task Login_BothFieldsEmpty_Returns400WithMultipleErrors()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "",
                Pin = ""
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var errors = doc.RootElement.GetProperty("validationErrors");
            errors.GetArrayLength().Should().Be(2,
                "both EmployeeId and Pin should have validation errors");
        }

        [Fact]
        public async Task Login_InactiveEmployee_Returns401()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            var cashier = await ctx.Employees.FirstAsync(e => e.EmployeeId == CashierEmployeeId);
            cashier.IsActive = false;
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = CashierEmployeeId,
                Pin = CashierPin,
                SelectedRole = "Cashier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
                "inactive employees should not be able to login");
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("errorCode").GetString().Should().Be("AUTH_001");
        }

        [Fact]
        public async Task Login_NoSelectedRole_SucceedsForSingleRoleEmployee()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = ManagerEmployeeId,
                Pin = ManagerPin
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "omitting SelectedRole should succeed — role validation is skipped");
        }

        [Fact]
        public async Task ValidateManager_EmptyPin_ReturnsFalse()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/validate-manager",
                new { Pin = "" });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeFalse();
        }

        [Fact]
        public async Task ValidateManager_NoManagersInSystem_ReturnsFalse()
        {
            await Fixture.ResetAsync();

            // Only seed a cashier — no managers
            await using var ctx = Fixture.CreateContext();
            ctx.Employees.Add(new Employee
            {
                EmployeeId = "CASH-ONLY", Pin = "111111", Name = "Cashier Only",
                Role = "Cashier", IsManager = false, IsActive = true,
                CreatedDate = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/validate-manager",
                new { Pin = "111111" });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeFalse();
        }

        [Fact]
        public async Task ValidateManager_WrongPin_ReturnsFalse()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/validate-manager",
                new { Pin = "000000" });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeFalse();
            doc.RootElement.GetProperty("message").GetString().Should().Contain("Invalid");
        }

        [Fact]
        public async Task ValidateManager_CorrectPin_ReturnsTrueWithName()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/validate-manager",
                new { Pin = ManagerPin });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeTrue();
            doc.RootElement.GetProperty("managerName").GetString().Should().NotBeNullOrEmpty();
        }

        // BUG FOUND: ValidateManager lockout is broken in production.
        // The controller uses lockout key "manager_pin_global", but LoginLockoutService
        // looks up by EmployeeId in the Employees table. No employee has EmployeeId =
        // "manager_pin_global", so IsLockedOutAsync always returns false and
                [Fact]
        public async Task ValidateManager_RepeatedFails_EventuallyLocked()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            for (int i = 0; i < 6; i++)
            {
                await client.PostAsJsonAsync("/api/auth/validate-manager",
                    new { Pin = "000000" });
            }

            var response = await client.PostAsJsonAsync("/api/auth/validate-manager",
                new { Pin = "000000" });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeFalse();
            doc.RootElement.GetProperty("message").GetString().Should().Contain("Too many failed attempts");
        }

        [Fact]
        public async Task Logout_ValidToken_ReturnsOk()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsync("/api/auth/logout", null);
            response.StatusCode.Should().Be(HttpStatusCode.OK);
        }
    }
}
