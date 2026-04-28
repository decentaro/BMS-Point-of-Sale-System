using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres
{
    public abstract class IntegrationTestBase
    {
        protected const string ManagerEmployeeId = "MGR001";
        protected const string ManagerPin = "123456";
        protected const string CashierEmployeeId = "CSH001";
        protected const string CashierPin = "654321";

        protected readonly PostgresFixture Fixture;

        protected IntegrationTestBase(PostgresFixture fixture)
        {
            Fixture = fixture;
        }

        protected async Task ResetAndSeedAsync(bool seedSystemSettings = false, bool seedAdminSettings = false)
        {
            await Fixture.ResetAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.Employees.AddRange(
                new Employee
                {
                    EmployeeId = ManagerEmployeeId,
                    Pin = ManagerPin,
                    Name = "Test Manager",
                    Role = "Manager",
                    IsManager = true,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                },
                new Employee
                {
                    EmployeeId = CashierEmployeeId,
                    Pin = CashierPin,
                    Name = "Test Cashier",
                    Role = "Cashier",
                    IsManager = false,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                });

            if (seedSystemSettings)
            {
                ctx.SystemSettings.Add(new BMS_POS_API.Models.SystemSettings
                {
                    EnableReturns = true,
                    RequireManagerApprovalForReturns = false,
                    RestockReturnedItems = true,
                    AllowDefectiveItemReturns = true,
                    ReturnTimeLimitDays = 30,
                    ReturnManagerApprovalAmount = 1000.00m,
                    CreatedDate = DateTime.UtcNow,
                    LastUpdated = DateTime.UtcNow
                });
            }

            if (seedAdminSettings)
            {
                ctx.AdminSettings.Add(new BMS_POS_API.Models.AdminSettings
                {
                    RequireStrongPins = false,
                    MaxFailedLoginAttempts = 5,
                    CreatedDate = DateTime.UtcNow,
                    LastUpdated = DateTime.UtcNow
                });
            }

            await ctx.SaveChangesAsync();
        }

        protected async Task<int> GetEmployeeIdAsync(string employeeId)
        {
            await using var ctx = Fixture.CreateContext();
            return await ctx.Employees
                .Where(e => e.EmployeeId == employeeId)
                .Select(e => e.Id)
                .SingleAsync();
        }

        protected async Task<int> SeedProductAsync(string barcode, decimal price, int stock, decimal? cost = null)
        {
            await using var ctx = Fixture.CreateContext();
            var product = new Product
            {
                Barcode = barcode,
                Name = $"Test Product {barcode}",
                Price = price,
                Cost = cost ?? price / 2,
                StockQuantity = stock,
                MinStockLevel = 1,
                Unit = "pcs",
                IsActive = true,
                CreatedDate = DateTime.UtcNow
            };
            ctx.Products.Add(product);
            await ctx.SaveChangesAsync();
            return product.Id;
        }

        protected async Task<HttpClient> CreateAuthenticatedClientAsync(
            PosApiFactory factory, string role = "Manager", int? employeeDbId = null)
        {
            var client = factory.CreateClient();
            var empId = role == "Manager" ? ManagerEmployeeId : CashierEmployeeId;
            var pin = role == "Manager" ? ManagerPin : CashierPin;

            var loginResp = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = empId,
                Pin = pin,
                SelectedRole = role
            });
            loginResp.EnsureSuccessStatusCode();

            using var loginJson = JsonDocument.Parse(await loginResp.Content.ReadAsStringAsync());
            var token = loginJson.RootElement.GetProperty("data").GetProperty("token").GetString();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            if (employeeDbId.HasValue)
            {
                client.DefaultRequestHeaders.Add("X-User-Id", employeeDbId.Value.ToString());
                client.DefaultRequestHeaders.Add("X-User-Name", "Test User");
            }

            return client;
        }
    }
}
