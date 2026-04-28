using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.Auth
{
    [Collection("Postgres")]
    public class AuthLoginTests : IntegrationTestBase
    {
        public AuthLoginTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task ValidManagerLogin_ReturnsTokenAndEmployeeData()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = ManagerEmployeeId,
                Pin = ManagerPin,
                SelectedRole = "Manager"
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var data = doc.RootElement.GetProperty("data");
            data.GetProperty("success").GetBoolean().Should().BeTrue();
            data.GetProperty("token").GetString().Should().NotBeNullOrEmpty();
            data.GetProperty("employee").GetProperty("name").GetString().Should().Be("Test Manager");
        }

        [Fact]
        public async Task WrongPin_Returns401()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = ManagerEmployeeId,
                Pin = "000000",
                SelectedRole = "Manager"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        [Fact]
        public async Task NonexistentEmployee_Returns401()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "NOBODY",
                Pin = "123456",
                SelectedRole = "Cashier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("errorCode").GetString().Should().Be("AUTH_001");
        }

        [Fact]
        public async Task RoleMismatch_CashierSelectsManager_Returns401()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = CashierEmployeeId,
                Pin = CashierPin,
                SelectedRole = "Manager"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("errorCode").GetString().Should().Be("AUTH_004");
        }

        [Fact]
        public async Task EmptyEmployeeId_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "",
                Pin = "123456"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task EmptyPin_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = ManagerEmployeeId,
                Pin = ""
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task InactiveEmployee_Returns401()
        {
            await Fixture.ResetAsync();

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.Employees.Add(new Employee
                {
                    EmployeeId = "INACT1",
                    Pin = "999999",
                    Name = "Inactive Employee",
                    Role = "Cashier",
                    IsManager = false,
                    IsActive = false,
                    CreatedDate = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "INACT1",
                Pin = "999999",
                SelectedRole = "Cashier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
                "inactive employees should not be able to log in");
        }

        [Fact]
        public async Task Logout_WithValidToken_ReturnsOk()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsync("/api/auth/logout", null);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("message").GetString().Should().Contain("Logged out");
        }

        [Fact]
        public async Task Logout_TokenDenied_SubsequentRequestReturns401()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var logoutResp = await client.PostAsync("/api/auth/logout", null);
            logoutResp.StatusCode.Should().Be(HttpStatusCode.OK);

            var protectedResp = await client.GetAsync("/api/employees");
            protectedResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
                "a revoked token should no longer access protected endpoints");
        }
    }
}
