using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Sales
{
    [Collection("Postgres")]
    public class IdempotencyTests : SalesIntegrationTestBase
    {
        public IdempotencyTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task SameIdempotencyKey_ReturnsSameSale_NoDuplicateWrite()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("IDEMP-A", 12.00m, stock: 10);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, quantity: 3, unitPrice: 12.00m);
            var key = Guid.NewGuid().ToString();

            var firstReq = new HttpRequestMessage(HttpMethod.Post, "/api/sales")
            {
                Content = JsonContent.Create(payload)
            };
            firstReq.Headers.Add("X-Idempotency-Key", key);
            var first = await client.SendAsync(firstReq);
            first.StatusCode.Should().Be(HttpStatusCode.Created, await first.Content.ReadAsStringAsync());

            var secondReq = new HttpRequestMessage(HttpMethod.Post, "/api/sales")
            {
                Content = JsonContent.Create(payload)
            };
            secondReq.Headers.Add("X-Idempotency-Key", key);
            var second = await client.SendAsync(secondReq);
            // Controller returns Ok (200) on replay, not Created
            second.StatusCode.Should().Be(HttpStatusCode.OK, await second.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();

            var sales = await verify.Sales.Include(s => s.SaleItems).ToListAsync();
            sales.Should().HaveCount(1, "replay with same idempotency key must not create a second sale");
            sales[0].IdempotencyKey.Should().Be(key);
            sales[0].SaleItems.Should().HaveCount(1);

            var product = await verify.Products.SingleAsync(p => p.Id == productId);
            product.StockQuantity.Should().Be(7, "stock should decrement exactly once (10 - 3), not twice");
        }

        [Fact]
        public async Task DifferentIdempotencyKey_CreatesSecondSale()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("IDEMP-B", 5.00m, stock: 10);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, quantity: 2, unitPrice: 5.00m);

            var firstReq = new HttpRequestMessage(HttpMethod.Post, "/api/sales") { Content = JsonContent.Create(payload) };
            firstReq.Headers.Add("X-Idempotency-Key", Guid.NewGuid().ToString());
            (await client.SendAsync(firstReq)).StatusCode.Should().Be(HttpStatusCode.Created);

            var secondReq = new HttpRequestMessage(HttpMethod.Post, "/api/sales") { Content = JsonContent.Create(payload) };
            secondReq.Headers.Add("X-Idempotency-Key", Guid.NewGuid().ToString());
            (await client.SendAsync(secondReq)).StatusCode.Should().Be(HttpStatusCode.Created);

            await using var verify = Fixture.CreateContext();
            var sales = await verify.Sales.ToListAsync();
            sales.Should().HaveCount(2);

            var product = await verify.Products.SingleAsync(p => p.Id == productId);
            product.StockQuantity.Should().Be(6, "stock should decrement twice (10 - 2 - 2)");
        }

        [Fact]
        public async Task NoIdempotencyKey_EachRequestCreatesDistinctSale()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("IDEMP-C", 4.00m, stock: 20);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, quantity: 1, unitPrice: 4.00m);

            (await client.PostAsJsonAsync("/api/sales", payload)).StatusCode.Should().Be(HttpStatusCode.Created);
            (await client.PostAsJsonAsync("/api/sales", payload)).StatusCode.Should().Be(HttpStatusCode.Created);

            await using var verify = Fixture.CreateContext();
            (await verify.Sales.CountAsync()).Should().Be(2);
            (await verify.Products.Where(p => p.Id == productId).Select(p => p.StockQuantity).SingleAsync())
                .Should().Be(18);
        }
    }
}
