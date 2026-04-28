using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Sales
{
    public abstract class SalesIntegrationTestBase
    {
        protected const string ManagerEmployeeId = "MGR001";
        protected const string ManagerPin = "123456";

        protected readonly PostgresFixture Fixture;

        protected SalesIntegrationTestBase(PostgresFixture fixture)
        {
            Fixture = fixture;
        }

        protected async Task ResetAndSeedManagerAsync()
        {
            await Fixture.ResetAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.Employees.Add(new Employee
            {
                EmployeeId = ManagerEmployeeId,
                Pin = ManagerPin, // legacy plaintext — AuthController.IsValidPin accepts this
                Name = "Integration Test Manager",
                Role = "Manager",
                IsManager = true,
                IsActive = true,
                CreatedDate = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();
        }

        protected async Task<int> GetManagerIdAsync()
        {
            await using var ctx = Fixture.CreateContext();
            return await ctx.Employees
                .Where(e => e.EmployeeId == ManagerEmployeeId)
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

        protected async Task<HttpClient> CreateAuthenticatedClientAsync(PosApiFactory factory)
        {
            var client = factory.CreateClient();

            var loginResp = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = ManagerEmployeeId,
                Pin = ManagerPin,
                SelectedRole = "Manager"
            });
            loginResp.EnsureSuccessStatusCode();

            using var loginJson = JsonDocument.Parse(await loginResp.Content.ReadAsStringAsync());
            var token = loginJson.RootElement.GetProperty("data").GetProperty("token").GetString();

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client;
        }

        /// <summary>
        /// Convenience payload builder for a single-item sale.
        /// </summary>
        protected static object BuildSingleItemSale(
            int employeeId,
            int productId,
            int quantity,
            decimal unitPrice,
            decimal? discountAmount = null,
            string? discountReason = null,
            decimal? taxRate = null,
            decimal? amountPaidOverride = null)
        {
            var subtotal = unitPrice * quantity;
            var discount = discountAmount ?? 0m;
            var effectiveSubtotal = subtotal - discount;
            var rate = taxRate ?? 0m;
            var tax = Math.Round(effectiveSubtotal * rate / 100m, 2);
            var total = effectiveSubtotal + tax;
            var paid = amountPaidOverride ?? total;

            return new
            {
                EmployeeId = employeeId,
                Subtotal = subtotal,
                TaxRate = rate,
                TaxAmount = tax,
                DiscountAmount = discount,
                DiscountReason = discountReason,
                Total = total,
                AmountPaid = paid,
                Change = paid - total,
                PaymentMethod = "Cash",
                Notes = (string?)null,
                Items = new object[]
                {
                    new { ProductId = productId, Quantity = quantity, UnitPrice = unitPrice, LineTotal = unitPrice * quantity }
                }
            };
        }
    }
}
