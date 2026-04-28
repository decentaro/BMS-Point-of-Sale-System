using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Returns
{
    [Collection("Postgres")]
    public class ReturnIdempotencyTests : ReturnsIntegrationTestBase
    {
        public ReturnIdempotencyTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task SameIdempotencyKey_ReturnsSameReturn_NoDuplicate()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-IDEM", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 2, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Changed Mind") });

            var key = Guid.NewGuid().ToString();
            client.DefaultRequestHeaders.Add("X-Idempotency-Key", key);

            var first = await client.PostAsJsonAsync("/api/returns", payload);
            first.StatusCode.Should().Be(HttpStatusCode.Created, await first.Content.ReadAsStringAsync());

            var second = await client.PostAsJsonAsync("/api/returns", payload);
            second.StatusCode.Should().Be(HttpStatusCode.OK,
                "second request with same idempotency key should return existing record, not create a new one");

            await using var verify = Fixture.CreateContext();
            (await verify.Returns.CountAsync()).Should().Be(1);
            (await verify.ReturnItems.CountAsync()).Should().Be(1);
        }

        [Fact]
        public async Task DifferentIdempotencyKeys_CreatesSeparateReturns()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-DIFF", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 4, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            // First return with key A
            var payloadA = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "First") });
            var reqA = new HttpRequestMessage(HttpMethod.Post, "/api/returns") { Content = JsonContent.Create(payloadA) };
            reqA.Headers.Add("X-Idempotency-Key", Guid.NewGuid().ToString());
            var respA = await client.SendAsync(reqA);
            respA.StatusCode.Should().Be(HttpStatusCode.Created, await respA.Content.ReadAsStringAsync());

            // Second return with key B (different remaining quantity)
            var payloadB = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Second") });
            var reqB = new HttpRequestMessage(HttpMethod.Post, "/api/returns") { Content = JsonContent.Create(payloadB) };
            reqB.Headers.Add("X-Idempotency-Key", Guid.NewGuid().ToString());
            var respB = await client.SendAsync(reqB);
            respB.StatusCode.Should().Be(HttpStatusCode.Created, await respB.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            (await verify.Returns.CountAsync()).Should().Be(2);
        }
    }
}
