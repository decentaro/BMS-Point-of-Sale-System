using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.StockAdjustments
{
    [Collection("Postgres")]
    public class StockAdjustmentExtendedTests : IntegrationTestBase
    {
        public StockAdjustmentExtendedTests(PostgresFixture fixture) : base(fixture) { }

        private async Task<int> CreateAdjustmentAsync(HttpClient client, int productId, int qty, string type = "CORRECTION")
        {
            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = type,
                QuantityChange = qty,
                Reason = "Test adjustment"
            });
            response.StatusCode.Should().BeOneOf(HttpStatusCode.Created, HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            return doc.RootElement.GetProperty("id").GetInt32();
        }

        // ── GET /api/stockadjustments ──

        [Fact]
        public async Task GetStockAdjustments_NoAdjustments_ReturnsEmptyList()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);

            await using var factory = new PosApiFactory(Fixture);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.GetAsync("/api/stockadjustments");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().BeEmpty();
        }

        [Fact]
        public async Task GetStockAdjustments_WithAdjustment_ReturnsList()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("GAL-001", 50.00m, 100);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            await CreateAdjustmentAsync(client, productId, -5);

            var response = await client.GetAsync("/api/stockadjustments");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().HaveCountGreaterOrEqualTo(1);
        }

        [Fact]
        public async Task GetStockAdjustments_FilterByProductId()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var product1 = await SeedProductAsync("FP-001", 10.00m, 50);
            var product2 = await SeedProductAsync("FP-002", 20.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            await CreateAdjustmentAsync(client, product1, -3);
            await CreateAdjustmentAsync(client, product2, -2);

            var response = await client.GetAsync($"/api/stockadjustments?productId={product1}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var items = doc.RootElement.EnumerateArray().ToList();
            items.Should().HaveCount(1);
            items[0].GetProperty("productId").GetInt32().Should().Be(product1);
        }

        // ── GET /api/stockadjustments/{id} ──

        [Fact]
        public async Task GetStockAdjustment_Exists_ReturnsAdjustment()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("GSA-001", 30.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            var adjId = await CreateAdjustmentAsync(client, productId, -5);

            var response = await client.GetAsync($"/api/stockadjustments/{adjId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("id").GetInt32().Should().Be(adjId);
            doc.RootElement.GetProperty("quantityChange").GetInt32().Should().Be(-5);
        }

        [Fact]
        public async Task GetStockAdjustment_NotFound_Returns404()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.GetAsync("/api/stockadjustments/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── GET /api/stockadjustments/product/{productId} ──

        [Fact]
        public async Task GetProductAdjustments_WithHistory_ReturnsList()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("GPA-001", 20.00m, 100);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            await CreateAdjustmentAsync(client, productId, -3);
            await CreateAdjustmentAsync(client, productId, 5, "FOUND");

            var response = await client.GetAsync($"/api/stockadjustments/product/{productId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().HaveCount(2);
        }

        [Fact]
        public async Task GetProductAdjustments_ProductNotFound_Returns404()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.GetAsync("/api/stockadjustments/product/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── Approve edge cases ──

        [Fact]
        public async Task ApproveAdjustment_NotFound_Returns404()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PutAsJsonAsync("/api/stockadjustments/999999/approve",
                new { ApprovalNotes = "test" });
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task ApproveAdjustment_NoApprovalRequired_Returns400()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("NAR-001", 1.00m, 100);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);
            var adjId = await CreateAdjustmentAsync(client, productId, -1);

            var response = await client.PutAsJsonAsync($"/api/stockadjustments/{adjId}/approve",
                new { ApprovalNotes = "not needed" });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
    }
}
