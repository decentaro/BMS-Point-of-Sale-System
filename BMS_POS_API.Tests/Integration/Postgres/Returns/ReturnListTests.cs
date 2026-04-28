using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.Returns
{
    [Collection("Postgres")]
    public class ReturnListTests : ReturnsIntegrationTestBase
    {
        public ReturnListTests(PostgresFixture fixture) : base(fixture) { }

        private async Task<int> CreateReturnAsync(PosApiFactory factory, int employeeId, int saleId, int saleItemId, decimal lineTotal)
        {
            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(saleId, employeeId,
                new[] { (saleItemId, 1, lineTotal, "good", "Test return") });

            var resp = await client.PostAsJsonAsync("/api/returns", payload);
            resp.StatusCode.Should().Be(HttpStatusCode.Created);

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            return doc.RootElement.GetProperty("id").GetInt32();
        }

        // ── GET /api/returns ──

        [Fact]
        public async Task GetReturns_NoReturns_ReturnsEmptyList()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/returns");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().BeEmpty();
        }

        [Fact]
        public async Task GetReturns_WithReturn_ReturnsListWithItem()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RL-001", 100.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 100.00m);
            await CreateReturnAsync(factory, managerId, saleId, saleItemId, 100.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var response = await client.GetAsync("/api/returns");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().HaveCountGreaterOrEqualTo(1);
        }

        [Fact]
        public async Task GetReturns_FilterBySaleId_ReturnsFiltered()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RF-001", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);
            await CreateReturnAsync(factory, managerId, saleId, saleItemId, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var filtered = await client.GetAsync($"/api/returns?saleId={saleId}");
            filtered.StatusCode.Should().Be(HttpStatusCode.OK);
            using var filteredDoc = JsonDocument.Parse(await filtered.Content.ReadAsStringAsync());
            filteredDoc.RootElement.EnumerateArray().ToList().Should().HaveCount(1);

            var noMatch = await client.GetAsync("/api/returns?saleId=999999");
            noMatch.StatusCode.Should().Be(HttpStatusCode.OK);
            using var noMatchDoc = JsonDocument.Parse(await noMatch.Content.ReadAsStringAsync());
            noMatchDoc.RootElement.EnumerateArray().ToList().Should().BeEmpty();
        }

        [Fact]
        public async Task GetReturns_Pagination_RespectsLimitOffset()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RP-001", 30.00m, 50);

            await using var factory = new PosApiFactory(Fixture);

            for (int i = 0; i < 3; i++)
            {
                var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 1, 30.00m);
                await CreateReturnAsync(factory, managerId, saleId, saleItemId, 30.00m);
            }

            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/returns?limit=2&offset=0");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().HaveCount(2);
        }

        // ── GET /api/returns/summary ──

        [Fact]
        public async Task GetReturnsSummary_NoReturns_ReturnsZeros()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/returns/summary?period=today");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalReturns").GetInt32().Should().Be(0);
            doc.RootElement.GetProperty("totalRefundAmount").GetDecimal().Should().Be(0m);
        }

        [Fact]
        public async Task GetReturnsSummary_WithReturns_AggregatesCorrectly()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RS-001", 100.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 3, 100.00m);
            await CreateReturnAsync(factory, managerId, saleId, saleItemId, 100.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var response = await client.GetAsync("/api/returns/summary?period=month");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalReturns").GetInt32().Should().Be(1);
            doc.RootElement.GetProperty("totalRefundAmount").GetDecimal().Should().Be(100.00m);
            doc.RootElement.GetProperty("period").GetString().Should().Be("Last 30 Days");
            doc.RootElement.TryGetProperty("returnsByReason", out _).Should().BeTrue();
            doc.RootElement.TryGetProperty("topReturnedProducts", out _).Should().BeTrue();
        }

        [Fact]
        public async Task GetReturnsSummary_AllPeriod_IncludesEverything()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/returns/summary?period=all");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("period").GetString().Should().Be("All Time");
        }
    }
}
