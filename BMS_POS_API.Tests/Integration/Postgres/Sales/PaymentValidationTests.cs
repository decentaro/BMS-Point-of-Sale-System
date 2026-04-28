using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Sales
{
    [Collection("Postgres")]
    public class PaymentValidationTests : SalesIntegrationTestBase
    {
        public PaymentValidationTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task AmountPaidLessThanTotal_Returns400_NoWrites()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("PAY-SHORT", 20.00m, stock: 5);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(
                managerId, productId,
                quantity: 2, unitPrice: 20.00m,
                amountPaidOverride: 10.00m); // total would be 40

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("less than the total");

            await using var verify = Fixture.CreateContext();
            (await verify.Sales.CountAsync()).Should().Be(0);
            (await verify.Products.Where(p => p.Id == productId).Select(p => p.StockQuantity).SingleAsync())
                .Should().Be(5);
        }

        [Fact]
        public async Task AmountPaidExactlyMatchesTotal_Succeeds_ChangeIsZero()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("PAY-EXACT", 7.50m, stock: 10);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, quantity: 2, unitPrice: 7.50m);

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var sale = await verify.Sales.SingleAsync();
            sale.Total.Should().Be(15.00m);
            sale.AmountPaid.Should().Be(15.00m);
            sale.Change.Should().Be(0m);
        }

        [Fact]
        public async Task AmountPaidGreaterThanTotal_Succeeds_ChangePositive()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("PAY-OVER", 10.00m, stock: 10);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(
                managerId, productId,
                quantity: 1, unitPrice: 10.00m,
                amountPaidOverride: 20.00m);

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var sale = await verify.Sales.SingleAsync();
            sale.AmountPaid.Should().Be(20.00m);
            sale.Change.Should().Be(10.00m);
        }

        [Fact]
        public async Task EmptyItems_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 0m,
                TaxRate = 0m,
                TaxAmount = 0m,
                DiscountAmount = 0m,
                DiscountReason = (string?)null,
                Total = 0m,
                AmountPaid = 0m,
                Change = 0m,
                PaymentMethod = "Cash",
                Notes = (string?)null,
                Items = Array.Empty<object>()
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("at least one item");
        }

        [Fact]
        public async Task ZeroQuantityItem_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("PAY-ZEROQTY", 10.00m, stock: 5);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 0m,
                TaxRate = 0m,
                TaxAmount = 0m,
                DiscountAmount = 0m,
                DiscountReason = (string?)null,
                Total = 0m,
                AmountPaid = 0m,
                Change = 0m,
                PaymentMethod = "Cash",
                Notes = (string?)null,
                Items = new object[]
                {
                    new { ProductId = productId, Quantity = 0, UnitPrice = 10.00m, LineTotal = 0m }
                }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("quantity must be greater than zero");
        }

        [Fact]
        public async Task InvalidEmployeeId_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("PAY-NOEMP", 5.00m, stock: 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(employeeId: 999_999, productId, quantity: 1, unitPrice: 5.00m);

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid employee ID");
        }
    }
}
