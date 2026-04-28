using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Sales
{
    [Collection("Postgres")]
    public class SalesEdgeCaseTests : SalesIntegrationTestBase
    {
        public SalesEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task CreateSale_EmptyItemsArray_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 0m, TaxRate = 0m, TaxAmount = 0m,
                DiscountAmount = 0m, Total = 0m, AmountPaid = 0m,
                Change = 0m, PaymentMethod = "Cash",
                Items = Array.Empty<object>()
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateSale_NegativeDiscount_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("NEG-001", 100.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 100m, TaxRate = 0m, TaxAmount = 0m,
                DiscountAmount = -5m, Total = 105m, AmountPaid = 105m,
                Change = 0m, PaymentMethod = "Cash",
                Items = new[] { new { ProductId = productId, Quantity = 1, UnitPrice = 100m, LineTotal = 100m } }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("negative");
        }

        [Fact]
        public async Task CreateSale_DiscountExceedsSubtotal_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("DIS-001", 50.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 50m, TaxRate = 0m, TaxAmount = 0m,
                DiscountAmount = 60m, Total = 0m, AmountPaid = 0m,
                Change = 0m, PaymentMethod = "Cash",
                Items = new[] { new { ProductId = productId, Quantity = 1, UnitPrice = 50m, LineTotal = 50m } }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("exceed");
        }

        [Fact]
        public async Task CreateSale_DiscountReasonTooLong_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("DRL-001", 100.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 100m, TaxRate = 0m, TaxAmount = 0m,
                DiscountAmount = 5m, DiscountReason = new string('x', 101),
                Total = 95m, AmountPaid = 95m, Change = 0m,
                PaymentMethod = "Cash",
                Items = new[] { new { ProductId = productId, Quantity = 1, UnitPrice = 100m, LineTotal = 100m } }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("100");
        }

        [Fact]
        public async Task CreateSale_NegativeUnitPrice_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("NUP-001", 100.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = -50m, TaxRate = 0m, TaxAmount = 0m,
                DiscountAmount = 0m, Total = -50m, AmountPaid = 0m,
                Change = 0m, PaymentMethod = "Cash",
                Items = new[] { new { ProductId = productId, Quantity = 1, UnitPrice = -50m, LineTotal = -50m } }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateSale_NegativeTotal_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("NT-001", 50.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 50m, TaxRate = 0m, TaxAmount = 0m,
                DiscountAmount = 0m, Total = -1m, AmountPaid = 0m,
                Change = 0m, PaymentMethod = "Cash",
                Items = new[] { new { ProductId = productId, Quantity = 1, UnitPrice = 50m, LineTotal = 50m } }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateSale_InvalidEmployeeId_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("IE-001", 50.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = 999999,
                Subtotal = 50m, TaxRate = 0m, TaxAmount = 0m,
                DiscountAmount = 0m, Total = 50m, AmountPaid = 50m,
                Change = 0m, PaymentMethod = "Cash",
                Items = new[] { new { ProductId = productId, Quantity = 1, UnitPrice = 50m, LineTotal = 50m } }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("employee");
        }

        [Fact]
        public async Task CreateSale_InvalidProductId_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 50m, TaxRate = 0m, TaxAmount = 0m,
                DiscountAmount = 0m, Total = 50m, AmountPaid = 50m,
                Change = 0m, PaymentMethod = "Cash",
                Items = new[] { new { ProductId = 999999, Quantity = 1, UnitPrice = 50m, LineTotal = 50m } }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("product");
        }

        [Fact]
        public async Task CreateSale_ExactStockBoundary_Succeeds()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("EXB-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, 5, 10.00m);
            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created);

            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(0, "buying exact available stock leaves 0");
        }

        [Fact]
        public async Task CreateSale_OneOverStock_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("OVS-001", 10.00m, 3);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, 4, 10.00m);
            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Insufficient stock");
        }

        [Fact]
        public async Task CreateSale_ZeroQuantityItem_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("ZQ-001", 50.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 0m, TaxRate = 0m, TaxAmount = 0m,
                DiscountAmount = 0m, Total = 0m, AmountPaid = 0m,
                Change = 0m, PaymentMethod = "Cash",
                Items = new[] { new { ProductId = productId, Quantity = 0, UnitPrice = 50m, LineTotal = 0m } }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("greater than zero");
        }
    }
}
