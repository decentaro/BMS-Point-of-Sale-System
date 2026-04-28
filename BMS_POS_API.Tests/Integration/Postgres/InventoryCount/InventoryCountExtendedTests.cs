using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.InventoryCount
{
    [Collection("Postgres")]
    public class InventoryCountExtendedTests : IntegrationTestBase
    {
        public InventoryCountExtendedTests(PostgresFixture fixture) : base(fixture) { }

        private async Task<int> StartCountAsync(HttpClient client, string name = "Extended Test Count")
        {
            var response = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = name,
                CountType = "FULL",
                Notes = "Test"
            });
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement.GetProperty("id").GetInt32();
        }

        // ── GET /api/inventorycount ──

        [Fact]
        public async Task GetInventoryCounts_Empty_ReturnsList()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.GetAsync("/api/inventorycount");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().BeEmpty();
        }

        [Fact]
        public async Task GetInventoryCounts_WithCounts_ReturnsList()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            await StartCountAsync(client);

            var response = await client.GetAsync("/api/inventorycount");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().HaveCount(1);
        }

        // ── GET /api/inventorycount/{id} ──

        [Fact]
        public async Task GetInventoryCount_Exists_ReturnsDetails()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            var countId = await StartCountAsync(client);

            var response = await client.GetAsync($"/api/inventorycount/{countId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("id").GetInt32().Should().Be(countId);
            doc.RootElement.GetProperty("status").GetString().Should().Be("IN_PROGRESS");
        }

        [Fact]
        public async Task GetInventoryCount_NotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.GetAsync("/api/inventorycount/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── GET /api/inventorycount/{id}/items ──

        [Fact]
        public async Task GetCountItems_WithItems_ReturnsList()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("ICE-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            var countId = await StartCountAsync(client);

            await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId,
                CountedQuantity = 48,
                DiscrepancyReason = "Two damaged"
            });

            var response = await client.GetAsync($"/api/inventorycount/{countId}/items");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var items = doc.RootElement.EnumerateArray().ToList();
            items.Should().HaveCount(1);
            items[0].GetProperty("variance").GetInt32().Should().Be(-2);
        }

        [Fact]
        public async Task GetCountItems_CountNotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.GetAsync("/api/inventorycount/999999/items");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── POST /api/inventorycount/{id}/items — edge cases ──

        [Fact]
        public async Task AddCountItem_ToCompletedCount_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("CCI-001", 10.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            var countId = await StartCountAsync(client);

            await client.PutAsJsonAsync($"/api/inventorycount/{countId}/complete",
                new { ApplyAdjustments = false });

            var response = await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId,
                CountedQuantity = 18
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("completed");
        }

        [Fact]
        public async Task AddCountItem_ProductNotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            var countId = await StartCountAsync(client);

            var response = await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = 999999,
                CountedQuantity = 10
            });
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── PUT /api/inventorycount/{id}/complete ──

        [Fact]
        public async Task CompleteCount_WithAdjustments_UpdatesStock()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("CWA-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            var countId = await StartCountAsync(client);

            await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId,
                CountedQuantity = 45,
                DiscrepancyReason = "5 missing"
            });

            var response = await client.PutAsJsonAsync($"/api/inventorycount/{countId}/complete",
                new { ApplyAdjustments = true });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(45, "stock adjusted to counted quantity");

            var adjustment = await ctx.StockAdjustments
                .Where(sa => sa.ProductId == productId && sa.ReferenceNumber == $"IC-{countId}")
                .SingleAsync();
            adjustment.QuantityChange.Should().Be(-5);
            adjustment.IsApproved.Should().BeTrue();
        }

        [Fact]
        public async Task CompleteCount_WithoutAdjustments_DoesNotChangeStock()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("CNA-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            var countId = await StartCountAsync(client);

            await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId,
                CountedQuantity = 45
            });

            var response = await client.PutAsJsonAsync($"/api/inventorycount/{countId}/complete",
                new { ApplyAdjustments = false });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(50, "stock unchanged when ApplyAdjustments=false");
        }

        [Fact]
        public async Task CompleteCount_AlreadyCompleted_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            var countId = await StartCountAsync(client);

            await client.PutAsJsonAsync($"/api/inventorycount/{countId}/complete",
                new { ApplyAdjustments = false });

            var response = await client.PutAsJsonAsync($"/api/inventorycount/{countId}/complete",
                new { ApplyAdjustments = false });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("not in progress");
        }

        [Fact]
        public async Task CompleteCount_NotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PutAsJsonAsync("/api/inventorycount/999999/complete",
                new { ApplyAdjustments = false });
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── DELETE (cancel) edge cases ──

        [Fact]
        public async Task CancelCount_NotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.DeleteAsync("/api/inventorycount/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── GET /api/inventorycount/summary ──

        [Fact]
        public async Task GetSummary_Empty_ReturnsZeros()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.GetAsync("/api/inventorycount/summary");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalCounts").GetInt32().Should().Be(0);
        }

        [Fact]
        public async Task GetSummary_WithCompletedCount_AggregatesStats()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("SUM-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            var countId = await StartCountAsync(client);

            await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId, CountedQuantity = 48
            });

            await client.PutAsJsonAsync($"/api/inventorycount/{countId}/complete",
                new { ApplyAdjustments = true });

            var response = await client.GetAsync("/api/inventorycount/summary");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalCounts").GetInt32().Should().Be(1);
            doc.RootElement.GetProperty("completedCounts").GetInt32().Should().Be(1);
            doc.RootElement.GetProperty("totalDiscrepancies").GetInt32().Should().BeGreaterOrEqualTo(1);
        }
    }
}
