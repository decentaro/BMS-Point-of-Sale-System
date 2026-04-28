using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Auth
{
    [Collection("Postgres")]
    public class AuthEdgeCaseTests : IntegrationTestBase
    {
        public AuthEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task Login_RepeatedFailures_EventuallyLocksOut()
        {
            await ResetAndSeedAsync(seedAdminSettings: true);

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.AdminSettings.SingleAsync();
            settings.MaxFailedLoginAttempts = 3;
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            for (int i = 0; i < 3; i++)
            {
                await client.PostAsJsonAsync("/api/auth/login", new
                {
                    EmployeeId = ManagerEmployeeId,
                    Pin = "000000",
                    SelectedRole = "Manager"
                });
            }

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = ManagerEmployeeId,
                Pin = "000000",
                SelectedRole = "Manager"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Locked,
                "account should return 423 Locked after max failed attempts");
        }

        [Fact]
        public async Task Login_CorrectPinAfterFails_Succeeds()
        {
            await ResetAndSeedAsync(seedAdminSettings: true);

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = ManagerEmployeeId,
                Pin = "000000",
                SelectedRole = "Manager"
            });

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = ManagerEmployeeId,
                Pin = ManagerPin,
                SelectedRole = "Manager"
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "correct PIN before lockout threshold should still succeed");
        }

        [Fact]
        public async Task Login_MultipleRoles_CanSelectEachRole()
        {
            await Fixture.ResetAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.Employees.Add(new Employee
            {
                EmployeeId = "MULTI01", Pin = "123456", Name = "Multi Role",
                Role = "Manager,Cashier", IsManager = true, IsActive = true,
                CreatedDate = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var managerLogin = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "MULTI01", Pin = "123456", SelectedRole = "Manager"
            });
            managerLogin.StatusCode.Should().Be(HttpStatusCode.OK);

            var cashierLogin = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "MULTI01", Pin = "123456", SelectedRole = "Cashier"
            });
            cashierLogin.StatusCode.Should().Be(HttpStatusCode.OK);
        }

        [Fact]
        public async Task ProtectedEndpoint_NoToken_Returns401()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.GetAsync("/api/employees");
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        [Fact]
        public async Task ProtectedEndpoint_GarbageToken_Returns401()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();
            client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "not.a.real.token");

            var response = await client.GetAsync("/api/employees");
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }
    }
}
