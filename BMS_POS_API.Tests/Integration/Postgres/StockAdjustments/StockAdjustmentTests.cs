using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.StockAdjustments
{
    [Collection("Postgres")]
    public class StockAdjustmentTests : IntegrationTestBase
    {
        public StockAdjustmentTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task CreateAdjustment_SmallCorrection_AutoApproved_StockUpdated()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-001", 10.00m, 50, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "DAMAGE",
                QuantityChange = -3,
                Reason = "Found 3 damaged items"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var adj = await verify.StockAdjustments.SingleAsync();
            adj.QuantityBefore.Should().Be(50);
            adj.QuantityAfter.Should().Be(47);
            adj.RequiresApproval.Should().BeFalse();
            adj.IsApproved.Should().BeTrue();

            var product = await verify.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(47);
        }

        [Fact]
        public async Task CreateAdjustment_LargeQuantity_RequiresApproval_StockNotUpdated()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-BIG", 10.00m, 200, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "CORRECTION",
                QuantityChange = -100,
                Reason = "Inventory correction"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var adj = await verify.StockAdjustments.SingleAsync();
            adj.RequiresApproval.Should().BeTrue();
            adj.IsApproved.Should().BeFalse();

            var product = await verify.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(200, "stock should NOT change until approved");
        }

        [Fact]
        public async Task CreateAdjustment_TheftType_AlwaysRequiresApproval()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-THF", 10.00m, 50, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "THEFT",
                QuantityChange = -1,
                Reason = "Suspected theft"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var adj = await verify.StockAdjustments.SingleAsync();
            adj.RequiresApproval.Should().BeTrue("THEFT type always requires approval regardless of quantity");
        }

        [Fact]
        public async Task ApproveAdjustment_AppliesStockChange()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-APR", 10.00m, 200, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var createResp = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "CORRECTION",
                QuantityChange = -100,
                Reason = "Major correction"
            });
            createResp.StatusCode.Should().Be(HttpStatusCode.Created);

            await using var getCtx = Fixture.CreateContext();
            var adjId = await getCtx.StockAdjustments.Select(a => a.Id).SingleAsync();

            var approveResp = await client.PutAsJsonAsync($"/api/stockadjustments/{adjId}/approve", new
            {
                ApprovalNotes = "Verified"
            });
            approveResp.StatusCode.Should().Be(HttpStatusCode.OK, await approveResp.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var adj = await verify.StockAdjustments.SingleAsync();
            adj.IsApproved.Should().BeTrue();
            adj.ApprovedByEmployeeId.Should().Be(managerId);

            var product = await verify.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(100, "200 - 100 = 100 after approval");
        }

        [Fact]
        public async Task ApproveAdjustment_AlreadyApproved_Returns400()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-AA", 10.00m, 50, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "DAMAGE",
                QuantityChange = -1,
                Reason = "Small damage"
            });

            await using var getCtx = Fixture.CreateContext();
            var adjId = await getCtx.StockAdjustments.Select(a => a.Id).SingleAsync();

            var response = await client.PutAsJsonAsync($"/api/stockadjustments/{adjId}/approve", new { });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("already approved");
        }

        [Fact]
        public async Task CreateAdjustment_ZeroChange_Returns400()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-ZERO", 10.00m, 50);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "CORRECTION",
                QuantityChange = 0,
                Reason = "No change"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("cannot be zero");
        }

        [Fact]
        public async Task CreateAdjustment_EmptyReason_Returns400()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-NOREASON", 10.00m, 50);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

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
        public async Task CreateAdjustment_InvalidType_Returns400()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-BADTYPE", 10.00m, 50);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "NONSENSE",
                QuantityChange = -1,
                Reason = "Test"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid adjustment type");
        }

        [Fact]
        public async Task CreateAdjustment_WouldGoNegative_Returns400()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-NEGSTK", 10.00m, 5);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "DAMAGE",
                QuantityChange = -10,
                Reason = "Too many damaged"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("negative stock");
        }

        [Fact]
        public async Task CreateAdjustment_NonexistentProduct_Returns404()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = 999999,
                AdjustmentType = "DAMAGE",
                QuantityChange = -1,
                Reason = "Ghost product"
            });

            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CreateAdjustment_PositiveChange_Found_IncreasesStock()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-FOUND", 10.00m, 50, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId,
                AdjustmentType = "FOUND",
                QuantityChange = 10,
                Reason = "Found extra stock"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var product = await verify.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(60);
        }

        [Fact]
        public async Task GetPendingApprovals_ReturnsOnlyPending()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-PEND", 10.00m, 200, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            await client.PostAsJsonAsync("/api/stockadjustments", new
            {
                ProductId = productId, AdjustmentType = "THEFT", QuantityChange = -1, Reason = "Theft"
            });

            var response = await client.GetAsync("/api/stockadjustments/pending-approval");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var items = doc.RootElement.EnumerateArray().ToList();
            items.Should().HaveCount(1);
            items[0].GetProperty("requiresApproval").GetBoolean().Should().BeTrue();
            items[0].GetProperty("isApproved").GetBoolean().Should().BeFalse();
        }

        [Fact]
        public async Task IdempotencyKey_DuplicateReturnsExisting()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var productId = await SeedProductAsync("ADJ-IDEM", 10.00m, 50, cost: 5.00m);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var key = Guid.NewGuid().ToString();
            client.DefaultRequestHeaders.Add("X-Idempotency-Key", key);

            var payload = new
            {
                ProductId = productId,
                AdjustmentType = "DAMAGE",
                QuantityChange = -2,
                Reason = "Damaged"
            };

            var first = await client.PostAsJsonAsync("/api/stockadjustments", payload);
            first.StatusCode.Should().Be(HttpStatusCode.Created);

            var second = await client.PostAsJsonAsync("/api/stockadjustments", payload);
            second.StatusCode.Should().Be(HttpStatusCode.OK);

            await using var verify = Fixture.CreateContext();
            (await verify.StockAdjustments.CountAsync()).Should().Be(1);
        }
    }
}
