using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Sales
{
    [Collection("Postgres")]
    public class ConcurrentSalesTests : SalesIntegrationTestBase
    {
        public ConcurrentSalesTests(PostgresFixture fixture) : base(fixture) { }

        /// <summary>
        /// Two concurrent POSTs each try to sell more than half the available stock,
        /// such that if both succeeded the product would go negative. Under SalesController's
        /// serializable isolation + stock check, exactly one must win and the other must be
        /// rejected with either 400 (stock check) or 409 (serialization_failure) — whichever
        /// path the DB takes. The final DB state must never show an oversell.
        /// </summary>
        [Fact]
        public async Task TwoParallelOversellingRequests_ExactlyOneWins_NoOversell()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("CONC-A", 10.00m, stock: 10);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);

            // Build two separate authenticated clients so neither blocks the other in HttpClient internals
            var clientA = await CreateAuthenticatedClientAsync(factory);
            var clientB = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildSingleItemSale(managerId, productId, quantity: 6, unitPrice: 10.00m);

            var taskA = clientA.PostAsJsonAsync("/api/sales", payload);
            var taskB = clientB.PostAsJsonAsync("/api/sales", payload);

            var responses = await Task.WhenAll(taskA, taskB);

            var statusBodies = await Task.WhenAll(responses.Select(async r =>
                $"{(int)r.StatusCode} {r.StatusCode}: {await r.Content.ReadAsStringAsync()}"));
            var diag = "Responses:\n  " + string.Join("\n  ", statusBodies);

            var successCount = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
            var rejectedCount = responses.Count(r =>
                r.StatusCode == HttpStatusCode.BadRequest || r.StatusCode == HttpStatusCode.Conflict);

            successCount.Should().Be(1, $"exactly one of two overselling parallel sales should commit. {diag}");
            rejectedCount.Should().Be(1, $"the other must be rejected with 400 (stock check) or 409 (serialization_failure). {diag}");

            await using var verify = Fixture.CreateContext();

            var salesCount = await verify.Sales.CountAsync();
            salesCount.Should().Be(1, "only the winning sale must be persisted");

            var winningStock = await verify.Products
                .Where(p => p.Id == productId)
                .Select(p => p.StockQuantity)
                .SingleAsync();
            winningStock.Should().Be(4, "10 available - 6 sold by the winning sale = 4 remaining; never negative");

            clientA.Dispose();
            clientB.Dispose();
        }

        /// <summary>
        /// Stress variant: 5 parallel sales each for 3 units against a 10-unit stock.
        /// Max committable = 3 sales (9 units), at least 2 must be rejected. Final stock
        /// must equal 10 - (3 * committed_count). Never negative, never oversold.
        /// </summary>
        [Fact]
        public async Task FiveParallelRequests_CommittedCountTimesThree_MatchesStockDelta()
        {
            await ResetAndSeedManagerAsync();
            var productId = await SeedProductAsync("CONC-B", 5.00m, stock: 10);
            var managerId = await GetManagerIdAsync();

            await using var factory = new PosApiFactory(Fixture);

            var clients = new List<HttpClient>();
            for (int i = 0; i < 5; i++)
                clients.Add(await CreateAuthenticatedClientAsync(factory));

            var payload = BuildSingleItemSale(managerId, productId, quantity: 3, unitPrice: 5.00m);

            var tasks = clients.Select(c => c.PostAsJsonAsync("/api/sales", payload)).ToArray();
            var responses = await Task.WhenAll(tasks);

            var statusBodies = await Task.WhenAll(responses.Select(async r =>
                $"{(int)r.StatusCode} {r.StatusCode}: {await r.Content.ReadAsStringAsync()}"));
            var diag = "Responses:\n  " + string.Join("\n  ", statusBodies);

            var committed = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
            var rejected = responses.Count(r =>
                r.StatusCode == HttpStatusCode.BadRequest || r.StatusCode == HttpStatusCode.Conflict);

            committed.Should().BeInRange(1, 3, $"at most 3 sales of 3 units can fit in 10 units of stock. {diag}");
            (committed + rejected).Should().Be(5, $"every response must be Created, BadRequest, or Conflict. {diag}");

            await using var verify = Fixture.CreateContext();

            var salesCount = await verify.Sales.CountAsync();
            salesCount.Should().Be(committed);

            var finalStock = await verify.Products
                .Where(p => p.Id == productId)
                .Select(p => p.StockQuantity)
                .SingleAsync();
            finalStock.Should().Be(10 - (committed * 3));
            finalStock.Should().BeGreaterThanOrEqualTo(0, "stock must never go negative regardless of concurrency");

            foreach (var c in clients) c.Dispose();
        }
    }
}
