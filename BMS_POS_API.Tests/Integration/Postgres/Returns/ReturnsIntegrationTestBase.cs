using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Returns
{
    public abstract class ReturnsIntegrationTestBase
    {
        protected const string ManagerEmployeeId = "MGR001";
        protected const string ManagerPin = "123456";
        protected const string CashierEmployeeId = "CSH001";
        protected const string CashierPin = "654321";

        protected readonly PostgresFixture Fixture;

        protected ReturnsIntegrationTestBase(PostgresFixture fixture)
        {
            Fixture = fixture;
        }

        protected async Task ResetAndSeedAsync()
        {
            await Fixture.ResetAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.Employees.AddRange(
                new Employee
                {
                    EmployeeId = ManagerEmployeeId,
                    Pin = ManagerPin,
                    Name = "Returns Test Manager",
                    Role = "Manager",
                    IsManager = true,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                },
                new Employee
                {
                    EmployeeId = CashierEmployeeId,
                    Pin = CashierPin,
                    Name = "Returns Test Cashier",
                    Role = "Cashier",
                    IsManager = false,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                });

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

        protected async Task<int> SeedProductAsync(string barcode, decimal price, int stock)
        {
            await using var ctx = Fixture.CreateContext();
            var product = new Product
            {
                Barcode = barcode,
                Name = $"Test Product {barcode}",
                Price = price,
                Cost = price / 2,
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

        protected async Task<HttpClient> CreateAuthenticatedClientAsync(PosApiFactory factory, string role = "Manager")
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
            return client;
        }

        protected async Task<(int SaleId, int SaleItemId)> CreateSaleAsync(
            PosApiFactory factory, int employeeId, int productId, int quantity, decimal unitPrice)
        {
            using var client = await CreateAuthenticatedClientAsync(factory);
            var subtotal = unitPrice * quantity;

            var payload = new
            {
                EmployeeId = employeeId,
                Subtotal = subtotal,
                TaxRate = 0m,
                TaxAmount = 0m,
                DiscountAmount = 0m,
                DiscountReason = (string?)null,
                Total = subtotal,
                AmountPaid = subtotal,
                Change = 0m,
                PaymentMethod = "Cash",
                Notes = (string?)null,
                Items = new object[]
                {
                    new { ProductId = productId, Quantity = quantity, UnitPrice = unitPrice, LineTotal = subtotal }
                }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.EnsureSuccessStatusCode();

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var saleId = doc.RootElement.GetProperty("id").GetInt32();

            await using var ctx = Fixture.CreateContext();
            var saleItemId = await ctx.SaleItems
                .Where(si => si.SaleId == saleId)
                .Select(si => si.Id)
                .SingleAsync();

            return (saleId, saleItemId);
        }

        protected static object BuildReturnRequest(
            int originalSaleId,
            int processedByEmployeeId,
            (int SaleItemId, int Quantity, decimal LineTotal, string Condition, string Reason)[] items,
            string? managerPin = null,
            string? notes = null)
        {
            return new
            {
                OriginalSaleId = originalSaleId,
                ProcessedByEmployeeId = processedByEmployeeId,
                ManagerPin = managerPin,
                Notes = notes,
                ReturnItems = items.Select(i => new
                {
                    OriginalSaleItemId = i.SaleItemId,
                    ReturnQuantity = i.Quantity,
                    LineTotal = i.LineTotal,
                    Condition = i.Condition,
                    Reason = i.Reason
                }).ToArray()
            };
        }
    }
}
