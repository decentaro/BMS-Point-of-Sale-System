using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.InventoryCount
{
    [Collection("Postgres")]
    public class InventoryCountTests : IntegrationTestBase
    {
        public InventoryCountTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task StartCount_ValidInput_Returns201()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "April Spot Check",
                CountType = "SPOT",
                Notes = "Quick check"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var count = await verify.InventoryCounts.SingleAsync();
            count.CountName.Should().Be("April Spot Check");
            count.CountType.Should().Be("SPOT");
            count.Status.Should().Be("IN_PROGRESS");
        }

        [Fact]
        public async Task StartCount_InvalidType_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "Bad Type",
                CountType = "RANDOM"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid count type");
        }

        [Fact]
        public async Task StartCount_EmptyName_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "",
                CountType = "FULL"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task StartCount_AnotherInProgress_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var first = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "First Count",
                CountType = "FULL"
            });
            first.StatusCode.Should().Be(HttpStatusCode.Created);

            var second = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "Second Count",
                CountType = "SPOT"
            });

            second.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await second.Content.ReadAsStringAsync()).Should().Contain("already in progress");
        }

        [Fact]
        public async Task AddCountItem_CalculatesVarianceCorrectly()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("IC-001", 10.00m, 50, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var createResp = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "Variance Test",
                CountType = "SPOT"
            });
            using var createDoc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var countId = createDoc.RootElement.GetProperty("id").GetInt32();

            var addResp = await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId,
                CountedQuantity = 47
            });

            addResp.StatusCode.Should().Be(HttpStatusCode.Created, await addResp.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var item = await verify.InventoryCountItems.SingleAsync();
            item.SystemQuantity.Should().Be(50);
            item.CountedQuantity.Should().Be(47);
            item.Variance.Should().Be(-3);
            item.VarianceValue.Should().Be(-15.00m, "-3 × $5.00 cost = -$15.00");

            var count = await verify.InventoryCounts.SingleAsync();
            count.TotalItemsCounted.Should().Be(1);
            count.TotalDiscrepancies.Should().Be(1);
            count.TotalShrinkageValue.Should().Be(15.00m);
        }

        [Fact]
        public async Task AddCountItem_NoVariance_NotCountedAsDiscrepancy()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("IC-EXACT", 10.00m, 50, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var createResp = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "Exact Match",
                CountType = "SPOT"
            });
            using var createDoc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var countId = createDoc.RootElement.GetProperty("id").GetInt32();

            await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId,
                CountedQuantity = 50
            });

            await using var verify = Fixture.CreateContext();
            var count = await verify.InventoryCounts.SingleAsync();
            count.TotalItemsCounted.Should().Be(1);
            count.TotalDiscrepancies.Should().Be(0);
        }

        [Fact]
        public async Task AddCountItem_DuplicateProduct_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("IC-DUP", 10.00m, 50);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var createResp = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "Dup Test",
                CountType = "SPOT"
            });
            using var createDoc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var countId = createDoc.RootElement.GetProperty("id").GetInt32();

            await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new { ProductId = productId, CountedQuantity = 50 });

            var dupResp = await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new { ProductId = productId, CountedQuantity = 48 });
            dupResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await dupResp.Content.ReadAsStringAsync()).Should().Contain("already been counted");
        }

        [Fact]
        public async Task CompleteCount_WithAdjustments_UpdatesStock()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("IC-COMP", 10.00m, 50, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var createResp = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "Complete With Adjust",
                CountType = "FULL"
            });
            using var createDoc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var countId = createDoc.RootElement.GetProperty("id").GetInt32();

            await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId,
                CountedQuantity = 45,
                DiscrepancyReason = "Shrinkage"
            });

            var completeResp = await client.PutAsJsonAsync($"/api/inventorycount/{countId}/complete", new
            {
                ApplyAdjustments = true
            });
            completeResp.StatusCode.Should().Be(HttpStatusCode.OK, await completeResp.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var count = await verify.InventoryCounts.SingleAsync();
            count.Status.Should().Be("COMPLETED");

            var product = await verify.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(45, "stock should be adjusted to counted quantity");

            var adj = await verify.StockAdjustments.SingleAsync();
            adj.AdjustmentType.Should().Be("CORRECTION");
            adj.QuantityChange.Should().Be(-5);
        }

        [Fact]
        public async Task CancelCount_Succeeds()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var createResp = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "Cancel Me",
                CountType = "SPOT"
            });
            using var createDoc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var countId = createDoc.RootElement.GetProperty("id").GetInt32();

            var cancelResp = await client.DeleteAsync($"/api/inventorycount/{countId}");
            cancelResp.StatusCode.Should().Be(HttpStatusCode.NoContent);

            await using var verify = Fixture.CreateContext();
            var count = await verify.InventoryCounts.SingleAsync();
            count.Status.Should().Be("CANCELLED");
        }

        [Fact]
        public async Task CancelCompletedCount_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var createResp = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "Completed Count",
                CountType = "SPOT"
            });
            using var createDoc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var countId = createDoc.RootElement.GetProperty("id").GetInt32();

            await client.PutAsJsonAsync($"/api/inventorycount/{countId}/complete", new { ApplyAdjustments = false });

            var cancelResp = await client.DeleteAsync($"/api/inventorycount/{countId}");
            cancelResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await cancelResp.Content.ReadAsStringAsync()).Should().Contain("Cannot cancel completed");
        }

        [Fact]
        public async Task GetSummary_ReturnsAggregatedData()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "Summary Test",
                CountType = "SPOT"
            });

            var response = await client.GetAsync("/api/inventorycount/summary");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalCounts").GetInt32().Should().BeGreaterOrEqualTo(1);
            doc.RootElement.GetProperty("inProgressCounts").GetInt32().Should().Be(1);
        }
    }
}
