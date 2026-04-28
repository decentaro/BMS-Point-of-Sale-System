using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.InventoryCount
{
    [Collection("Postgres")]
    public class InventoryCountRareEdgeCaseTests : IntegrationTestBase
    {
        public InventoryCountRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        private async Task<int> StartCountAsync(HttpClient client, string name, string type = "FULL")
        {
            var response = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = name,
                CountType = type
            });
            response.EnsureSuccessStatusCode();
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement.GetProperty("id").GetInt32();
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
            (await response.Content.ReadAsStringAsync()).Should().Contain("Count name is required");
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
                CountName = "Bad Type Count",
                CountType = "INVALID"
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid count type");
        }

        [Fact]
        public async Task StartCount_AnotherAlreadyInProgress_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            await StartCountAsync(client, "First Count");

            var response = await client.PostAsJsonAsync("/api/inventorycount", new
            {
                CountName = "Second Count",
                CountType = "FULL"
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("already in progress");
        }

        [Fact]
        public async Task AddItem_DuplicateProduct_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("ICD-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var countId = await StartCountAsync(client, "Dup Product Test");

            // Add item first time
            var first = await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId,
                CountedQuantity = 48
            });
            first.StatusCode.Should().Be(HttpStatusCode.Created);

            // Add same product again — should fail
            var second = await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId,
                CountedQuantity = 50
            });
            second.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await second.Content.ReadAsStringAsync()).Should().Contain("already been counted");
        }

        [Fact]
        public async Task CancelCount_CompletedCount_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var countId = await StartCountAsync(client, "Complete Then Cancel");

            // Complete it
            var completeResp = await client.PutAsJsonAsync($"/api/inventorycount/{countId}/complete",
                new { ApplyAdjustments = false });
            completeResp.StatusCode.Should().Be(HttpStatusCode.OK);

            // Try to cancel completed count
            var cancelResp = await client.DeleteAsync($"/api/inventorycount/{countId}");
            cancelResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await cancelResp.Content.ReadAsStringAsync()).Should().Contain("Cannot cancel completed");
        }

        [Fact]
        public async Task AddItem_VarianceCalculation_IsCorrect()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("ICV-001", 20.00m, 100, cost: 10.00m);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var countId = await StartCountAsync(client, "Variance Test");

            var response = await client.PostAsJsonAsync($"/api/inventorycount/{countId}/items", new
            {
                ProductId = productId,
                CountedQuantity = 95,
                DiscrepancyReason = "shrinkage"
            });
            response.StatusCode.Should().Be(HttpStatusCode.Created);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("systemQuantity").GetInt32().Should().Be(100);
            doc.RootElement.GetProperty("countedQuantity").GetInt32().Should().Be(95);
            doc.RootElement.GetProperty("variance").GetInt32().Should().Be(-5);
            doc.RootElement.GetProperty("varianceValue").GetDecimal().Should().Be(-50.00m,
                "variance value = -5 units * 10.00 cost = -50.00");
        }

        [Fact]
        public async Task Summary_NoFilters_CountsAll()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            await StartCountAsync(client, "Summary Test Count");

            var response = await client.GetAsync("/api/inventorycount/summary");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalCounts").GetInt32().Should().BeGreaterOrEqualTo(1);
            doc.RootElement.GetProperty("inProgressCounts").GetInt32().Should().BeGreaterOrEqualTo(1);
        }

        [Fact]
        public async Task StartCount_AllValidTypes_Succeed()
        {
            var validTypes = new[] { "FULL", "CYCLE", "SPOT", "ANNUAL" };

            foreach (var type in validTypes)
            {
                await ResetAndSeedAsync();
                var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

                await using var factory = new PosApiFactory(Fixture);
                using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

                var response = await client.PostAsJsonAsync("/api/inventorycount", new
                {
                    CountName = $"Test {type}",
                    CountType = type
                });
                response.StatusCode.Should().Be(HttpStatusCode.Created,
                    $"count type {type} should be accepted");
            }
        }
    }
}
