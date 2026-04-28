using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Sales
{
    [Collection("Postgres")]
    public class DiscountValidationTests : SalesIntegrationTestBase
    {
        public DiscountValidationTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task NegativeDiscount_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("DISC-NEG", 10.00m, stock: 5);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, quantity: 1, unitPrice: 10.00m, discountAmount: -5.00m);

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("negative");

            await using var verify = Fixture.CreateContext();
            (await verify.Sales.CountAsync()).Should().Be(0);
        }

        [Fact]
        public async Task DiscountExceedsSubtotal_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("DISC-OVER", 10.00m, stock: 5);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, quantity: 1, unitPrice: 10.00m, discountAmount: 20.00m);

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("exceed");

            await using var verify = Fixture.CreateContext();
            (await verify.Sales.CountAsync()).Should().Be(0);
        }

        [Fact]
        public async Task DiscountReasonOver100Chars_Returns400()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("DISC-REASON", 10.00m, stock: 5);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(
                managerId, productId,
                quantity: 1, unitPrice: 10.00m,
                discountAmount: 1.00m,
                discountReason: new string('X', 101));

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("100 characters");

            await using var verify = Fixture.CreateContext();
            (await verify.Sales.CountAsync()).Should().Be(0);
        }

        [Fact]
        public async Task ValidDiscount_Persists()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("DISC-OK", 50.00m, stock: 2);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(
                managerId, productId,
                quantity: 2, unitPrice: 50.00m,
                discountAmount: 15.00m,
                discountReason: "Loyalty discount");

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var sale = await verify.Sales.SingleAsync();
            sale.DiscountAmount.Should().Be(15.00m);
            sale.DiscountReason.Should().Be("Loyalty discount");
            sale.Subtotal.Should().Be(100.00m);
            sale.Total.Should().Be(85.00m);
        }

        /// <summary>
        /// FINDING (documented, not asserted-as-required): the backend does NOT require a manager
        /// PIN for large discounts. Enforcement lives in the frontend via /api/auth/validate-manager.
        /// A direct API client can post any discount up to the subtotal without a PIN check.
        /// If that ever changes, this test will fail and needs updating alongside the new requirement.
        /// </summary>
        [Fact]
        public async Task LargeDiscount_WithoutManagerPin_CurrentlyAllowed_FindingDocumented()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("DISC-BIG", 100.00m, stock: 1);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // 99% discount — a clear "requires manager approval" threshold in most POS systems
            var payload = BuildSingleItemSale(
                managerId, productId,
                quantity: 1, unitPrice: 100.00m,
                discountAmount: 99.00m,
                discountReason: "Big discount, no PIN supplied");

            var response = await client.PostAsJsonAsync("/api/sales", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created,
                "backend currently accepts any discount up to subtotal without a PIN — frontend enforces approval");
        }
    }
}
