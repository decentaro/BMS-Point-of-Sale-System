using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Sales
{
    [Collection("Postgres")]
    public class TaxPersistenceTests : SalesIntegrationTestBase
    {
        public TaxPersistenceTests(PostgresFixture fixture) : base(fixture) { }

        /// <summary>
        /// FINDING: SalesController does NOT recompute tax server-side — it persists whatever
        /// TaxRate/TaxAmount the client sends. These tests verify the current, documented
        /// behavior: values round-trip exactly. Semantic tax-rate enforcement (if added later)
        /// belongs in TaxSettings tests, not here.
        /// </summary>
        [Fact]
        public async Task TaxValuesPersistExactlyAsSent()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("TAX-A", 100.00m, stock: 5);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // 8.5% on a $100 sale = $8.50 tax, $108.50 total
            var payload = BuildSingleItemSale(managerId, productId, quantity: 1, unitPrice: 100.00m, taxRate: 8.5m);

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var sale = await verify.Sales.SingleAsync();
            sale.Subtotal.Should().Be(100.00m);
            sale.TaxRate.Should().Be(8.5m);
            sale.TaxAmount.Should().Be(8.50m);
            sale.Total.Should().Be(108.50m);
        }

        [Fact]
        public async Task ZeroTaxRate_PersistsZeroTaxAmount()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("TAX-ZERO", 25.00m, stock: 5);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, quantity: 2, unitPrice: 25.00m, taxRate: 0m);

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var sale = await verify.Sales.SingleAsync();
            sale.TaxRate.Should().Be(0m);
            sale.TaxAmount.Should().Be(0m);
            sale.Total.Should().Be(50.00m);
        }

        [Fact]
        public async Task ClientSendsMismatchedTaxMath_CurrentlyAccepted_FindingDocumented()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("TAX-LIE", 100.00m, stock: 5);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // Lie about tax: 10% rate should be $10, but we send $0.01. Controller trusts it.
            var payload = new
            {
                EmployeeId = managerId,
                Subtotal = 100.00m,
                TaxRate = 10.00m,
                TaxAmount = 0.01m,        // mathematically wrong vs 10% of 100
                DiscountAmount = 0m,
                DiscountReason = (string?)null,
                Total = 100.01m,
                AmountPaid = 100.01m,
                Change = 0m,
                PaymentMethod = "Cash",
                Notes = (string?)null,
                Items = new object[]
                {
                    new { ProductId = productId, Quantity = 1, UnitPrice = 100.00m, LineTotal = 100.00m }
                }
            };

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created,
                "SalesController trusts client-supplied tax math; if this changes, this test should flip to BadRequest");

            await using var verify = Fixture.CreateContext();
            var sale = await verify.Sales.SingleAsync();
            sale.TaxRate.Should().Be(10.00m);
            sale.TaxAmount.Should().Be(0.01m);
            sale.Total.Should().Be(100.01m);
        }
    }
}
