using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Sales
{
    [Collection("Postgres")]
    public class StockEnforcementTests : SalesIntegrationTestBase
    {
        public StockEnforcementTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task OversellSingleItem_Returns400_NoWrites()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("STK-A", 8.00m, stock: 5);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, quantity: 10, unitPrice: 8.00m);

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var body = await response.Content.ReadAsStringAsync();
            body.Should().Contain("Insufficient stock");

            await using var verify = Fixture.CreateContext();
            (await verify.Sales.CountAsync()).Should().Be(0);
            (await verify.SaleItems.CountAsync()).Should().Be(0);
            (await verify.Products.Where(p => p.Id == productId).Select(p => p.StockQuantity).SingleAsync())
                .Should().Be(5, "rollback should leave stock untouched");
        }

        [Fact]
        public async Task OversellOneItemInMultiItemSale_RollsBackAllItems()
        {
            await ResetAndSeedManagerAsync();
            var okProductId = await SeedProductAsync("STK-OK", 10.00m, stock: 100);
            var shortProductId = await SeedProductAsync("STK-SHORT", 20.00m, stock: 2);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // Try to sell 3 of the short product (only 2 in stock) bundled with 1 of the ok product.
            // Controller must roll back the whole sale; neither product's stock should change.
            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 10.00m + 60.00m,
                TaxRate = 0m,
                TaxAmount = 0m,
                DiscountAmount = 0m,
                DiscountReason = (string?)null,
                Total = 70.00m,
                AmountPaid = 70.00m,
                Change = 0m,
                PaymentMethod = "Cash",
                Notes = (string?)null,
                Items = new object[]
                {
                    new { ProductId = okProductId,    Quantity = 1, UnitPrice = 10.00m, LineTotal = 10.00m },
                    new { ProductId = shortProductId, Quantity = 3, UnitPrice = 20.00m, LineTotal = 60.00m }
                }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            await using var verify = Fixture.CreateContext();
            (await verify.Sales.CountAsync()).Should().Be(0);
            (await verify.SaleItems.CountAsync()).Should().Be(0);
            (await verify.Products.Where(p => p.Id == okProductId).Select(p => p.StockQuantity).SingleAsync())
                .Should().Be(100, "the ok item must NOT have been decremented because the full transaction rolled back");
            (await verify.Products.Where(p => p.Id == shortProductId).Select(p => p.StockQuantity).SingleAsync())
                .Should().Be(2);
        }

        [Fact]
        public async Task SellExactlyAvailableStock_Succeeds_StockGoesToZero()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("STK-EXACT", 3.00m, stock: 4);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, quantity: 4, unitPrice: 3.00m);

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            (await verify.Products.Where(p => p.Id == productId).Select(p => p.StockQuantity).SingleAsync())
                .Should().Be(0, "selling exactly the available stock must leave stock at zero, not fail");
        }

        [Fact]
        public async Task UnknownProductId_Returns400_NoWrites()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId: 999_999, quantity: 1, unitPrice: 1.00m);

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

            var body = await response.Content.ReadAsStringAsync();
            body.Should().Contain("Invalid product ID");

            await using var verify = Fixture.CreateContext();
            (await verify.Sales.CountAsync()).Should().Be(0);
        }
    }
}
