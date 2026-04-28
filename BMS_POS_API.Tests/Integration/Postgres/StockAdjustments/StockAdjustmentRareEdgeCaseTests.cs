using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.StockAdjustments
{
    [Collection("Postgres")]
    public class StockAdjustmentRareEdgeCaseTests : IntegrationTestBase
    {
        public StockAdjustmentRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task CreateAdjustment_ZeroQuantity_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("SAZ-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "CORRECTION",
                QuantityChange = 0,
                Reason = "zero change"
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("cannot be zero");
        }

        [Fact]
        public async Task CreateAdjustment_WouldMakeStockNegative_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("SAN-001", 10.00m, 5);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "DAMAGE",
                QuantityChange = -10,
                Reason = "would go negative"
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("negative stock");
        }

        [Fact]
        public async Task CreateAdjustment_InvalidType_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("SAT-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "INVALID_TYPE",
                QuantityChange = -1,
                Reason = "bad type"
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid adjustment type");
        }

        [Fact]
        public async Task CreateAdjustment_EmptyReason_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("SAR-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "DAMAGE",
                QuantityChange = -1,
                Reason = ""
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Reason is required");
        }

        [Fact]
        public async Task CreateAdjustment_ProductNotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = 999999,
                AdjustmentType = "CORRECTION",
                QuantityChange = 1,
                Reason = "missing product"
            });
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CreateAdjustment_TheftType_RequiresApproval()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("SATHEFT", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "THEFT",
                QuantityChange = -1,
                Reason = "theft detected"
            });
            response.StatusCode.Should().Be(HttpStatusCode.Created);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("requiresApproval").GetBoolean().Should().BeTrue(
                "THEFT type always requires manager approval");
            doc.RootElement.GetProperty("isApproved").GetBoolean().Should().BeFalse();

            // Stock should NOT change until approved
            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(50, "stock unchanged until approval");
        }

        [Fact]
        public async Task ApproveAdjustment_AlreadyApproved_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("SAA-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            // Create small adjustment (auto-approved)
            var createResp = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "DAMAGE",
                QuantityChange = -1,
                Reason = "small damage"
            });
            using var doc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var adjId = doc.RootElement.GetProperty("id").GetInt32();

            var approveResp = await client.PutAsJsonAsync($"/api/stockadjustments/{adjId}/approve",
                new { ApprovalNotes = "re-approve" });
            approveResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateAdjustment_LargeQuantity_RequiresApproval()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("SALQ-001", 10.00m, 200);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            // Default threshold is 50 — create adjustment of -60
            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "DAMAGE",
                QuantityChange = -60,
                Reason = "large batch damage"
            });
            response.StatusCode.Should().Be(HttpStatusCode.Created);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("requiresApproval").GetBoolean().Should().BeTrue(
                "quantity 60 exceeds default threshold of 50");
        }

        [Fact]
        public async Task GetAdjustments_ProductIdFilter_FiltersCorrectly()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("SADF-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "FOUND",
                QuantityChange = 5,
                Reason = "found items"
            });

            // Filter by non-existent product — should return empty
            var response = await client.GetAsync("/api/stockadjustments?productId=999999");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().BeEmpty();
        }

        [Fact]
        public async Task ApproveAdjustment_AppliesStockChange()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("SAAP-001", 10.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            // THEFT always requires approval
            var createResp = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "THEFT",
                QuantityChange = -3,
                Reason = "theft"
            });
            using var doc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var adjId = doc.RootElement.GetProperty("id").GetInt32();

            // Approve
            var approveResp = await client.PutAsJsonAsync($"/api/stockadjustments/{adjId}/approve",
                new { ApprovalNotes = "confirmed" });
            approveResp.StatusCode.Should().Be(HttpStatusCode.OK);

            // Stock should now reflect the adjustment
            await using var ctx = Fixture.CreateContext();
            var product = await ctx.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(47, "stock should decrease by 3 after approval");
        }
    }
}
