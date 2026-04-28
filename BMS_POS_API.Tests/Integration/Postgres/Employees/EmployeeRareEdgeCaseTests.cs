using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Employees
{
    [Collection("Postgres")]
    public class EmployeeRareEdgeCaseTests : IntegrationTestBase
    {
        public EmployeeRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task ActivateEmployee_AlreadyActive_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            // The seeded manager is already active
            var response = await client.PutAsync($"/api/employees/{managerId}/activate", null);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("already active");
        }

        [Fact]
        public async Task DeactivateEmployee_AlreadyInactive_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var ctx = Fixture.CreateContext();
            var cashierId = await ctx.Employees
                .Where(e => e.EmployeeId == CashierEmployeeId)
                .Select(e => e.Id).SingleAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            // Deactivate first
            var first = await client.PutAsync($"/api/employees/{cashierId}/deactivate", null);
            first.StatusCode.Should().Be(HttpStatusCode.NoContent);

            // Second deactivate should fail
            var second = await client.PutAsync($"/api/employees/{cashierId}/deactivate", null);
            second.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await second.Content.ReadAsStringAsync()).Should().Contain("already inactive");
        }

        [Fact]
        public async Task DeactivateEmployee_NotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PutAsync("/api/employees/999999/deactivate", null);
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task ActivateEmployee_NotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PutAsync("/api/employees/999999/activate", null);
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task ResetPin_NotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PutAsJsonAsync("/api/employees/999999/reset-pin",
                new { NewPin = "987654" });
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task ResetPin_EmptyPin_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var cashierId = await GetEmployeeIdAsync(CashierEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PutAsJsonAsync($"/api/employees/{cashierId}/reset-pin",
                new { NewPin = "" });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("PIN cannot be empty");
        }

        [Fact]
        public async Task ResetPin_ValidPin_SucceedsAndNewPinWorks()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var cashierId = await GetEmployeeIdAsync(CashierEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var resetResp = await client.PutAsJsonAsync($"/api/employees/{cashierId}/reset-pin",
                new { NewPin = "9876" });
            resetResp.StatusCode.Should().Be(HttpStatusCode.OK);

            // Login with new PIN
            var loginClient = factory.CreateClient();
            var loginResp = await loginClient.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = CashierEmployeeId,
                Pin = "9876",
                SelectedRole = "Cashier"
            });
            loginResp.StatusCode.Should().Be(HttpStatusCode.OK,
                "new PIN should work after reset");
        }

        [Fact]
        public async Task CreateEmployee_InvalidRole_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var payload = new
            {
                EmployeeId = "INV-ROLE",
                Pin = "1234",
                Name = "Invalid Role",
                Role = "SuperAdmin",
                IsManager = false,
                IsActive = true
            };

            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("role must be one of");
        }

        [Fact]
        public async Task CreateEmployee_EmptyEmployeeId_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var payload = new
            {
                EmployeeId = "",
                Pin = "1234",
                Name = "No ID",
                Role = "Cashier",
                IsManager = false,
                IsActive = true
            };

            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateEmployee_EmptyName_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var payload = new
            {
                EmployeeId = "NONAME01",
                Pin = "1234",
                Name = "",
                Role = "Cashier",
                IsManager = false,
                IsActive = true
            };

            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateEmployee_EmptyPin_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var payload = new
            {
                EmployeeId = "NOPIN01",
                Pin = "",
                Name = "No Pin",
                Role = "Cashier",
                IsManager = false,
                IsActive = true
            };

            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateEmployee_PinTooLong_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var payload = new
            {
                EmployeeId = "LONGPIN01",
                Pin = "1234567",
                Name = "Long Pin",
                Role = "Cashier",
                IsManager = false,
                IsActive = true
            };

            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("too long");
        }

        [Fact]
        public async Task CreateEmployee_PinTooShort_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var payload = new
            {
                EmployeeId = "SHORTPIN",
                Pin = "123",
                Name = "Short Pin",
                Role = "Cashier",
                IsManager = false,
                IsActive = true
            };

            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("too short");
        }

        [Fact]
        public async Task CreateEmployee_MultiRole_Succeeds()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var payload = new
            {
                EmployeeId = "MULTI01",
                Pin = "5678",
                Name = "Multi Role",
                Role = "Cashier,Inventory",
                IsManager = false,
                IsActive = true
            };

            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("role").GetString().Should().Contain("Cashier");
            doc.RootElement.GetProperty("role").GetString().Should().Contain("Inventory");
        }

        [Fact]
        public async Task ResetPin_StrongPinRequired_WeakPinRejected()
        {
            await ResetAndSeedAsync(seedAdminSettings: true);

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.AdminSettings.SingleAsync();
            settings.RequireStrongPins = true;
            await ctx.SaveChangesAsync();

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var cashierId = await GetEmployeeIdAsync(CashierEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            // All-same digits — should fail strong PIN check
            var response = await client.PutAsJsonAsync($"/api/employees/{cashierId}/reset-pin",
                new { NewPin = "111111" });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("too weak");
        }
    }
}
