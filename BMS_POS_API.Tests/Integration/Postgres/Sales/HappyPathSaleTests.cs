using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Sales
{
    [Collection("Postgres")]
    public class HappyPathSaleTests
    {
        private readonly PostgresFixture _fixture;

        public HappyPathSaleTests(PostgresFixture fixture)
        {
            _fixture = fixture;
        }

        [Fact]
        public async Task CreateSale_MultiItem_PersistsSaleDecrementsStock()
        {
            // Arrange: clean DB + seed a manager and two products
            await _fixture.ResetAsync();

            await using (var ctx = _fixture.CreateContext())
            {
                ctx.Employees.Add(new Employee
                {
                    EmployeeId = "MGR001",
                    Pin = "123456", // legacy plaintext — AuthController.IsValidPin allows this
                    Name = "Happy Path Manager",
                    Role = "Manager",
                    IsManager = true,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                });

                ctx.Products.AddRange(
                    new Product
                    {
                        Barcode = "HP-A",
                        Name = "Happy Product A",
                        Price = 10.00m,
                        Cost = 4.00m,
                        StockQuantity = 20,
                        MinStockLevel = 1,
                        Unit = "pcs",
                        IsActive = true,
                        CreatedDate = DateTime.UtcNow
                    },
                    new Product
                    {
                        Barcode = "HP-B",
                        Name = "Happy Product B",
                        Price = 5.50m,
                        Cost = 2.00m,
                        StockQuantity = 15,
                        MinStockLevel = 1,
                        Unit = "pcs",
                        IsActive = true,
                        CreatedDate = DateTime.UtcNow
                    });

                await ctx.SaveChangesAsync();
            }

            int managerId, productAId, productBId;
            await using (var ctx = _fixture.CreateContext())
            {
                managerId = await ctx.Employees.Where(e => e.EmployeeId == "MGR001").Select(e => e.Id).SingleAsync();
                productAId = await ctx.Products.Where(p => p.Barcode == "HP-A").Select(p => p.Id).SingleAsync();
                productBId = await ctx.Products.Where(p => p.Barcode == "HP-B").Select(p => p.Id).SingleAsync();
            }

            await using var factory = new PosApiFactory(_fixture);
            using var client = factory.CreateClient();

            // Login to get JWT
            var loginResp = await client.PostAsJsonAsync("/api/auth/login", new
            {
                EmployeeId = "MGR001",
                Pin = "123456",
                SelectedRole = "Manager"
            });
            loginResp.StatusCode.Should().Be(HttpStatusCode.OK);

            var loginJson = JsonDocument.Parse(await loginResp.Content.ReadAsStringAsync());
            var token = loginJson.RootElement.GetProperty("data").GetProperty("token").GetString();
            token.Should().NotBeNullOrWhiteSpace();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            // Act: POST a two-item sale
            // 2 x A @ 10.00 = 20.00; 3 x B @ 5.50 = 16.50; subtotal 36.50
            // tax 8% = 2.92; total 39.42; paid 40.00; change 0.58
            var saleRequest = new
            {
                EmployeeId = managerId,
                Subtotal = 36.50m,
                TaxRate = 8.0m,
                TaxAmount = 2.92m,
                DiscountAmount = 0m,
                DiscountReason = (string?)null,
                Total = 39.42m,
                AmountPaid = 40.00m,
                Change = 0.58m,
                PaymentMethod = "Cash",
                Notes = (string?)null,
                Items = new object[]
                {
                    new { ProductId = productAId, Quantity = 2, UnitPrice = 10.00m, LineTotal = 20.00m },
                    new { ProductId = productBId, Quantity = 3, UnitPrice = 5.50m,  LineTotal = 16.50m }
                }
            };

            var saleResp = await client.PostAsJsonAsync("/api/sales", saleRequest);
            saleResp.StatusCode.Should().Be(HttpStatusCode.Created,
                because: await saleResp.Content.ReadAsStringAsync());

            // Assert: Sale persisted, items persisted, stock decremented
            await using var verify = _fixture.CreateContext();

            var sale = await verify.Sales
                .Include(s => s.SaleItems)
                .SingleAsync();

            sale.EmployeeId.Should().Be(managerId);
            sale.Subtotal.Should().Be(36.50m);
            sale.TaxAmount.Should().Be(2.92m);
            sale.Total.Should().Be(39.42m);
            sale.AmountPaid.Should().Be(40.00m);
            sale.Change.Should().Be(0.58m);
            sale.PaymentMethod.Should().Be("Cash");
            sale.Status.Should().Be("Completed");
            sale.TransactionId.Should().StartWith("TXN-");
            sale.SaleItems.Should().HaveCount(2);

            var itemA = sale.SaleItems.Single(i => i.ProductId == productAId);
            itemA.Quantity.Should().Be(2);
            itemA.LineTotal.Should().Be(20.00m);

            var itemB = sale.SaleItems.Single(i => i.ProductId == productBId);
            itemB.Quantity.Should().Be(3);
            itemB.LineTotal.Should().Be(16.50m);

            var productA = await verify.Products.SingleAsync(p => p.Id == productAId);
            var productB = await verify.Products.SingleAsync(p => p.Id == productBId);
            productA.StockQuantity.Should().Be(18); // 20 - 2
            productB.StockQuantity.Should().Be(12); // 15 - 3
        }
    }
}
