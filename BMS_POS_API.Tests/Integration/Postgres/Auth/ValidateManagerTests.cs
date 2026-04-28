using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.Auth
{
    [Collection("Postgres")]
    public class ValidateManagerTests
    {
        private readonly PostgresFixture _fixture;

        public ValidateManagerTests(PostgresFixture fixture)
        {
            _fixture = fixture;
        }

        private async Task SeedManagerAndCashierAsync()
        {
            await _fixture.ResetAsync();

            await using var ctx = _fixture.CreateContext();
            ctx.Employees.AddRange(
                new Employee
                {
                    EmployeeId = "VM-MGR",
                    Pin = "424242",
                    Name = "Validate Manager",
                    Role = "Manager",
                    IsManager = true,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                },
                new Employee
                {
                    EmployeeId = "VM-CSH",
                    Pin = "111111",
                    Name = "Validate Cashier",
                    Role = "Cashier",
                    IsManager = false,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                });
            await ctx.SaveChangesAsync();
        }

        [Fact]
        public async Task CorrectManagerPin_ReturnsSuccessWithManagerName()
        {
            await SeedManagerAndCashierAsync();

            await using var factory = new PosApiFactory(_fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/validate-manager", new { Pin = "424242" });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeTrue();
            doc.RootElement.GetProperty("managerName").GetString().Should().Be("Validate Manager");
        }

        [Fact]
        public async Task WrongPin_ReturnsSuccessFalse()
        {
            await SeedManagerAndCashierAsync();

            await using var factory = new PosApiFactory(_fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/validate-manager", new { Pin = "000000" });
            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "endpoint returns 200 with success=false rather than 401 — documented contract");

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeFalse();
            doc.RootElement.GetProperty("message").GetString().Should().Contain("Invalid");
        }

        [Fact]
        public async Task CashierPin_ReturnsSuccessFalse_NotAMatch()
        {
            await SeedManagerAndCashierAsync();

            await using var factory = new PosApiFactory(_fixture);
            using var client = factory.CreateClient();

            // Cashier exists with this PIN but is NOT a manager — must not validate.
            var response = await client.PostAsJsonAsync("/api/auth/validate-manager", new { Pin = "111111" });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeFalse();
        }

        [Fact]
        public async Task InactiveManager_ReturnsSuccessFalse()
        {
            await _fixture.ResetAsync();

            await using (var ctx = _fixture.CreateContext())
            {
                ctx.Employees.Add(new Employee
                {
                    EmployeeId = "VM-INA",
                    Pin = "777777",
                    Name = "Inactive Manager",
                    Role = "Manager",
                    IsManager = true,
                    IsActive = false, // deactivated
                    CreatedDate = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(_fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/validate-manager", new { Pin = "777777" });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeFalse(
                "deactivated managers must not validate even with the correct PIN");
        }
    }
}
