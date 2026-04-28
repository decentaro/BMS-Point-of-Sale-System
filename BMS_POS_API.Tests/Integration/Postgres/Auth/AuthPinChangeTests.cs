using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.Auth
{
    [Collection("Postgres")]
    public class AuthPinChangeTests : IntegrationTestBase
    {
        public AuthPinChangeTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task Login_WithMustChangePinOnNextLogin_ResponseFlagIsTrue()
        {
            await ResetAndSeedAsync();

            // Add an extra employee whose PIN must change on next login
            await using var ctx = Fixture.CreateContext();
            ctx.Employees.Add(new Employee
            {
                EmployeeId = "NEWBIE01",
                Pin = "1111",
                Name = "New Employee",
                Role = "Cashier",
                IsManager = false,
                IsActive = true,
                MustChangePinOnNextLogin = true,
                CreatedDate = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "NEWBIE01",
                Pin = "1111",
                SelectedRole = "Cashier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var employee = doc.RootElement
                .GetProperty("data")
                .GetProperty("employee");

            employee.GetProperty("mustChangePinOnNextLogin").GetBoolean()
                .Should().BeTrue("the login response must surface this flag so the frontend can redirect to the PIN change screen");
        }

        [Fact]
        public async Task Login_WithMustChangePinOnNextLogin_False_FlagAbsentOrFalse()
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
            var employee = doc.RootElement
                .GetProperty("data")
                .GetProperty("employee");

            // Either the field is absent or explicitly false
            if (employee.TryGetProperty("mustChangePinOnNextLogin", out var flag))
                flag.GetBoolean().Should().BeFalse();
        }

        [Fact]
        public async Task ResetPin_ClearsMustChangePinOnNextLoginFlag()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.Employees.Add(new Employee
            {
                EmployeeId = "NEWBIE02",
                Pin = "2222",
                Name = "New Employee 2",
                Role = "Cashier",
                IsManager = false,
                IsActive = true,
                MustChangePinOnNextLogin = true,
                CreatedDate = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);

            // Get the new employee's DB id by logging in as them first
            using var anonClient = factory.CreateClient();
            var loginRes = await anonClient.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "NEWBIE02",
                Pin = "2222",
                SelectedRole = "Cashier"
            });
            loginRes.StatusCode.Should().Be(HttpStatusCode.OK);
            using var loginDoc = JsonDocument.Parse(await loginRes.Content.ReadAsStringAsync());
            var employeeId = loginDoc.RootElement.GetProperty("data").GetProperty("employee").GetProperty("id").GetInt32();

            // Reset the PIN using a Manager token — only managers can call reset-pin
            using var managerClient = await CreateAuthenticatedClientAsync(factory, "Manager");
            var resetRes = await managerClient.PutAsJsonAsync($"/api/employees/{employeeId}/reset-pin", new { newPin = "5678" });
            resetRes.StatusCode.Should().Be(HttpStatusCode.OK);

            // Log in again with the new PIN and verify mustChangePinOnNextLogin is now false
            var reloginRes = await anonClient.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "NEWBIE02",
                Pin = "5678",
                SelectedRole = "Cashier"
            });
            reloginRes.StatusCode.Should().Be(HttpStatusCode.OK);
            using var reloginDoc = JsonDocument.Parse(await reloginRes.Content.ReadAsStringAsync());
            var flagAfterReset = reloginDoc.RootElement
                .GetProperty("data")
                .GetProperty("employee")
                .GetProperty("mustChangePinOnNextLogin")
                .GetBoolean();
            flagAfterReset.Should().BeFalse("resetting the PIN must clear the force-change flag");
        }
    }
}
