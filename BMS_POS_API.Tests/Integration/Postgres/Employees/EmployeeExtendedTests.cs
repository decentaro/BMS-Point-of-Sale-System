using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Employees
{
    [Collection("Postgres")]
    public class EmployeeExtendedTests : IntegrationTestBase
    {
        public EmployeeExtendedTests(PostgresFixture fixture) : base(fixture) { }

        // ── GET /api/employees/{id} ──

        [Fact]
        public async Task GetEmployeeById_Exists_ReturnsEmployee()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync($"/api/employees/{managerId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("employeeId").GetString().Should().Be(ManagerEmployeeId);
        }

        [Fact]
        public async Task GetEmployeeById_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/employees/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── GET /api/employees?includeInactive ──

        [Fact]
        public async Task GetEmployees_IncludeInactive_ShowsDeactivated()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.Employees.Add(new Employee
            {
                EmployeeId = "INACT01", Pin = "999999", Name = "Inactive Test",
                Role = "Cashier", IsManager = false, IsActive = false,
                CreatedDate = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var activeOnly = await client.GetAsync("/api/employees");
            using var activeDoc = JsonDocument.Parse(await activeOnly.Content.ReadAsStringAsync());
            var activeList = activeDoc.RootElement.EnumerateArray().ToList();
            activeList.Should().NotContain(e => e.GetProperty("employeeId").GetString() == "INACT01");

            var includeInactive = await client.GetAsync("/api/employees?includeInactive=true");
            using var allDoc = JsonDocument.Parse(await includeInactive.Content.ReadAsStringAsync());
            var allList = allDoc.RootElement.EnumerateArray().ToList();
            allList.Should().Contain(e => e.GetProperty("employeeId").GetString() == "INACT01");
        }

        // ── PUT /api/employees/{id} ──

        [Fact]
        public async Task UpdateEmployee_ValidInput_Succeeds()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var ctx = Fixture.CreateContext();
            var emp = await ctx.Employees.FindAsync(managerId);

            var payload = new
            {
                Id = managerId,
                EmployeeId = emp!.EmployeeId,
                Name = "Updated Manager Name",
                Pin = emp.Pin,
                Role = "Manager",
                IsManager = true,
                IsActive = true,
                CreatedDate = emp.CreatedDate
            };

            var response = await client.PutAsJsonAsync($"/api/employees/{managerId}", payload);
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            await using var verify = Fixture.CreateContext();
            var updated = await verify.Employees.FindAsync(managerId);
            updated!.Name.Should().Be("Updated Manager Name");
        }

        [Fact]
        public async Task UpdateEmployee_IdMismatch_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Id = managerId + 999, EmployeeId = "X", Name = "X", Pin = "1234", Role = "Cashier", IsManager = false, IsActive = true };
            var response = await client.PutAsJsonAsync($"/api/employees/{managerId}", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task UpdateEmployee_DuplicateEmployeeId_Returns400()
        {
            await ResetAndSeedAsync();
            var cashierId = await GetEmployeeIdAsync(CashierEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            await using var ctx = Fixture.CreateContext();
            var cashier = await ctx.Employees.FindAsync(cashierId);

            var payload = new
            {
                Id = cashierId,
                EmployeeId = ManagerEmployeeId,
                Name = cashier!.Name,
                Pin = cashier.Pin,
                Role = cashier.Role,
                IsManager = false,
                IsActive = true,
                CreatedDate = cashier.CreatedDate
            };

            var response = await client.PutAsJsonAsync($"/api/employees/{cashierId}", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("already exists");
        }

        [Fact]
        public async Task UpdateEmployee_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { Id = 999999, EmployeeId = "X", Name = "X", Pin = "1234", Role = "Cashier", IsManager = false, IsActive = true };
            var response = await client.PutAsJsonAsync("/api/employees/999999", payload);
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── Strong PIN validation ──

        [Fact]
        public async Task CreateEmployee_StrongPinsRequired_AllSameDigits_Returns400()
        {
            await ResetAndSeedAsync(seedAdminSettings: true);

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.AdminSettings.SingleAsync();
            settings.RequireStrongPins = true;
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { EmployeeId = "STR001", Name = "Strong Test", Pin = "111111", Role = "Cashier" };
            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("weak");
        }

        [Fact]
        public async Task CreateEmployee_StrongPinsRequired_SequentialDigits_Returns400()
        {
            await ResetAndSeedAsync(seedAdminSettings: true);

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.AdminSettings.SingleAsync();
            settings.RequireStrongPins = true;
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { EmployeeId = "SEQ001", Name = "Sequential Test", Pin = "123456", Role = "Cashier" };
            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("sequential");
        }

        [Fact]
        public async Task CreateEmployee_StrongPinsRequired_TooShort_Returns400()
        {
            await ResetAndSeedAsync(seedAdminSettings: true);

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.AdminSettings.SingleAsync();
            settings.RequireStrongPins = true;
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { EmployeeId = "SHT001", Name = "Short PIN", Pin = "1234", Role = "Cashier" };
            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("6 digits");
        }

        [Fact]
        public async Task CreateEmployee_StrongPinsRequired_ValidPin_Succeeds()
        {
            await ResetAndSeedAsync(seedAdminSettings: true);

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.AdminSettings.SingleAsync();
            settings.RequireStrongPins = true;
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { EmployeeId = "VAL001", Name = "Valid Strong PIN", Pin = "839271", Role = "Cashier" };
            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        }

        // ── PIN validation basics ──

        [Fact]
        public async Task CreateEmployee_NonDigitPin_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new { EmployeeId = "NDG001", Name = "Non Digit", Pin = "12ab56", Role = "Cashier" };
            var response = await client.PostAsJsonAsync("/api/employees", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("digits only");
        }

        // ── Deactivate then login ──

        [Fact]
        public async Task DeactivateEmployee_ThenLogin_Fails()
        {
            await ResetAndSeedAsync();
            var cashierId = await GetEmployeeIdAsync(CashierEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var managerClient = await CreateAuthenticatedClientAsync(factory);

            var deactivateResp = await managerClient.PutAsync($"/api/employees/{cashierId}/deactivate", null);
            deactivateResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

            var loginClient = factory.CreateClient();
            var loginResp = await loginClient.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = CashierEmployeeId,
                Pin = CashierPin,
                SelectedRole = "Cashier"
            });
            loginResp.StatusCode.Should().Be(HttpStatusCode.Unauthorized,
                "deactivated employee should not be able to log in");
        }
    }
}
