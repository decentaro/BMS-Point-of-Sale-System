using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Employees
{
    [Collection("Postgres")]
    public class EmployeeCrudTests : IntegrationTestBase
    {
        public EmployeeCrudTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task CreateEmployee_ValidInput_Returns201()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/employees", new
            {
                EmployeeId = "NEW001",
                Pin = "5678",
                Name = "New Employee",
                Role = "Cashier",
                IsManager = false,
                IsActive = true
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var emp = await verify.Employees.SingleOrDefaultAsync(e => e.EmployeeId == "NEW001");
            emp.Should().NotBeNull();
            emp!.Name.Should().Be("New Employee");
            emp.Pin.Should().StartWith("$2", "PIN should be BCrypt-hashed on create");
        }

        [Fact]
        public async Task CreateEmployee_DuplicateId_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/employees", new
            {
                EmployeeId = ManagerEmployeeId,
                Pin = "1111",
                Name = "Duplicate",
                Role = "Cashier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("already exists");
        }

        [Fact]
        public async Task CreateEmployee_EmptyName_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/employees", new
            {
                EmployeeId = "NONAME",
                Pin = "1234",
                Name = "",
                Role = "Cashier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateEmployee_InvalidRole_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/employees", new
            {
                EmployeeId = "BADROLE",
                Pin = "1234",
                Name = "Bad Role",
                Role = "SuperAdmin"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("role must be one of");
        }

        [Fact]
        public async Task CreateEmployee_MultiRole_PersistsCorrectly()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/employees", new
            {
                EmployeeId = "MULTI1",
                Pin = "4567",
                Name = "Multi Role",
                Role = "Cashier,Inventory",
                IsManager = false,
                IsActive = true
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var emp = await verify.Employees.SingleAsync(e => e.EmployeeId == "MULTI1");
            emp.Role.Should().Be("Cashier,Inventory");
        }

        [Fact]
        public async Task CreateEmployee_PinTooShort_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/employees", new
            {
                EmployeeId = "SHORT1",
                Pin = "12",
                Name = "Short Pin",
                Role = "Cashier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("too short");
        }

        [Fact]
        public async Task CreateEmployee_PinTooLong_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/employees", new
            {
                EmployeeId = "LONG01",
                Pin = "1234567",
                Name = "Long Pin",
                Role = "Cashier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("too long");
        }

        [Fact]
        public async Task CreateEmployee_NonDigitPin_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/employees", new
            {
                EmployeeId = "ALPHA1",
                Pin = "abcd",
                Name = "Alpha Pin",
                Role = "Cashier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("digits only");
        }

        [Fact]
        public async Task GetEmployees_ReturnsActiveOnly()
        {
            await ResetAndSeedAsync();

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.Employees.Add(new Employee
                {
                    EmployeeId = "INACT2",
                    Pin = "9999",
                    Name = "Inactive",
                    Role = "Cashier",
                    IsActive = false,
                    CreatedDate = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/employees");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var employees = doc.RootElement.EnumerateArray().ToList();
            employees.Should().NotContain(e => e.GetProperty("employeeId").GetString() == "INACT2");
        }

        [Fact]
        public async Task GetEmployees_IncludeInactive_ReturnsAll()
        {
            await ResetAndSeedAsync();

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.Employees.Add(new Employee
                {
                    EmployeeId = "INACT3",
                    Pin = "9999",
                    Name = "Inactive 3",
                    Role = "Cashier",
                    IsActive = false,
                    CreatedDate = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/employees?includeInactive=true");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var employees = doc.RootElement.EnumerateArray().ToList();
            employees.Should().Contain(e => e.GetProperty("employeeId").GetString() == "INACT3");
        }

        [Fact]
        public async Task GetEmployee_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/employees/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task DeactivateEmployee_Succeeds()
        {
            await ResetAndSeedAsync();
            var cashierId = await GetEmployeeIdAsync(CashierEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsync($"/api/employees/{cashierId}/deactivate", null);
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            await using var verify = Fixture.CreateContext();
            var emp = await verify.Employees.FindAsync(cashierId);
            emp!.IsActive.Should().BeFalse();
        }

        [Fact]
        public async Task DeactivateEmployee_AlreadyInactive_Returns400()
        {
            await ResetAndSeedAsync();

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.Employees.Add(new Employee
                {
                    EmployeeId = "INACT4",
                    Pin = "9999",
                    Name = "Already Inactive",
                    Role = "Cashier",
                    IsActive = false,
                    CreatedDate = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

            int empId;
            await using (var ctx = Fixture.CreateContext())
            {
                empId = await ctx.Employees.Where(e => e.EmployeeId == "INACT4").Select(e => e.Id).SingleAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsync($"/api/employees/{empId}/deactivate", null);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("already inactive");
        }

        [Fact]
        public async Task ActivateEmployee_Succeeds()
        {
            await ResetAndSeedAsync();

            int empId;
            await using (var ctx = Fixture.CreateContext())
            {
                var emp = new Employee
                {
                    EmployeeId = "REACT1",
                    Pin = "9999",
                    Name = "Reactivate Me",
                    Role = "Cashier",
                    IsActive = false,
                    CreatedDate = DateTime.UtcNow
                };
                ctx.Employees.Add(emp);
                await ctx.SaveChangesAsync();
                empId = emp.Id;
            }

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsync($"/api/employees/{empId}/activate", null);
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            await using var verify = Fixture.CreateContext();
            var e = await verify.Employees.FindAsync(empId);
            e!.IsActive.Should().BeTrue();
        }

        [Fact]
        public async Task ResetPin_ValidPin_Succeeds()
        {
            await ResetAndSeedAsync();
            var cashierId = await GetEmployeeIdAsync(CashierEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync($"/api/employees/{cashierId}/reset-pin", new
            {
                NewPin = "9876"
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var emp = await verify.Employees.FindAsync(cashierId);
            emp!.Pin.Should().StartWith("$2", "new PIN should be BCrypt-hashed");
        }

        [Fact]
        public async Task ResetPin_EmptyPin_Returns400()
        {
            await ResetAndSeedAsync();
            var cashierId = await GetEmployeeIdAsync(CashierEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync($"/api/employees/{cashierId}/reset-pin", new
            {
                NewPin = ""
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task ResetPin_NonexistentEmployee_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync("/api/employees/999999/reset-pin", new
            {
                NewPin = "1234"
            });

            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CashierCannotCreateEmployee_Returns403()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, role: "Cashier");

            var response = await client.PostAsJsonAsync("/api/employees", new
            {
                EmployeeId = "UNAUTH",
                Pin = "1234",
                Name = "Unauthorized",
                Role = "Cashier"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
    }
}
