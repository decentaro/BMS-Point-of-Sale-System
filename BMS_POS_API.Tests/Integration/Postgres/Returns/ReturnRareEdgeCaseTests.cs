using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Returns
{
    [Collection("Postgres")]
    public class ReturnRareEdgeCaseTests : ReturnsIntegrationTestBase
    {
        public ReturnRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task ProcessReturn_EmptyReturnItems_ProcessesSale()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-EMPTY", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, _) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                OriginalSaleId = saleId,
                ProcessedByEmployeeId = managerId,
                ReturnItems = Array.Empty<object>()
            };

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            // Empty items should create a return with zero refund amount
            response.StatusCode.Should().Be(HttpStatusCode.Created);
        }

        [Fact]
        public async Task ProcessReturn_InvalidOriginalSaleId_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildReturnRequest(
                999999, managerId,
                new[] { (SaleItemId: 1, Quantity: 1, LineTotal: 10m, Condition: "good", Reason: "test") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Original sale not found");
        }

        [Fact]
        public async Task ProcessReturn_ReturnsDisabled_Returns400()
        {
            await ResetAndSeedAsync();

            // Disable returns
            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.SystemSettings.SingleAsync();
            settings.EnableReturns = false;
            await ctx.SaveChangesAsync();

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-DIS", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, 1, 50.00m, "good", "test") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("disabled");
        }

        [Fact]
        public async Task ProcessReturn_DefectiveItemWhenDisallowed_Returns400()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.SystemSettings.SingleAsync();
            settings.AllowDefectiveItemReturns = false;
            await ctx.SaveChangesAsync();

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-DEF", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, 1, 50.00m, "defective", "broken item") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Defective item returns are disabled");
        }

        [Fact]
        public async Task ProcessReturn_ExpiredReturnWindow_Returns400()
        {
            await ResetAndSeedAsync();

            // Set 0-day return limit
            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.SystemSettings.SingleAsync();
            settings.ReturnTimeLimitDays = 0;
            await ctx.SaveChangesAsync();

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-EXP", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            // Backdate the sale so it's outside the return window
            await using var ctx2 = Fixture.CreateContext();
            var sale = await ctx2.Sales.FindAsync(saleId);
            sale!.SaleDate = DateTime.UtcNow.AddDays(-5);
            await ctx2.SaveChangesAsync();

            // Re-read settings with 1-day limit for the actual test
            await using var ctx3 = Fixture.CreateContext();
            var s3 = await ctx3.SystemSettings.SingleAsync();
            s3.ReturnTimeLimitDays = 1;
            await ctx3.SaveChangesAsync();

            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, 1, 50.00m, "good", "too late") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Return period expired");
        }

        [Fact]
        public async Task ProcessReturn_OverReturnQuantity_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-OVER", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, 5, 250.00m, "good", "want more back") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Cannot return");
        }

        [Fact]
        public async Task ProcessReturn_ZeroReturnQuantity_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-ZQ", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, 0, 0m, "good", "zero qty") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid return quantity");
        }

        [Fact]
        public async Task ProcessReturn_ManagerApprovalRequired_NoPin_Returns400()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.SystemSettings.SingleAsync();
            settings.RequireManagerApprovalForReturns = true;
            await ctx.SaveChangesAsync();

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-NPIN", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, 1, 50.00m, "good", "need approval") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Manager PIN is required");
        }

        [Fact]
        public async Task ProcessReturn_ManagerApprovalRequired_WrongPin_Returns400()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.SystemSettings.SingleAsync();
            settings.RequireManagerApprovalForReturns = true;
            await ctx.SaveChangesAsync();

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-WPIN", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = new
            {
                OriginalSaleId = saleId,
                ProcessedByEmployeeId = managerId,
                ManagerPin = "000000",
                ReturnItems = new[]
                {
                    new { OriginalSaleItemId = saleItemId, ReturnQuantity = 1, LineTotal = 50.00m, Condition = "good", Reason = "test" }
                }
            };

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid manager PIN");
        }

        [Fact]
        public async Task ProcessReturn_DoubleReturnSameItems_SecondReturnsError()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-DBL", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, 2, 100.00m, "good", "first return") });

            var first = await client.PostAsJsonAsync("/api/returns", payload);
            first.StatusCode.Should().Be(HttpStatusCode.Created);

            // Same items, same quantity again — all 2 already returned
            var second = await client.PostAsJsonAsync("/api/returns", payload);
            second.StatusCode.Should().Be(HttpStatusCode.BadRequest,
                "double return should be rejected — all items already returned");
            (await second.Content.ReadAsStringAsync()).Should().Contain("Cannot return");
        }

        [Fact]
        public async Task ProcessReturn_PartialReturn_ThenReturnRemaining_Succeeds()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-PART", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 3, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            // Return 1 of 3
            var first = await client.PostAsJsonAsync("/api/returns",
                BuildReturnRequest(saleId, managerId,
                    new[] { (saleItemId, 1, 50.00m, "good", "partial") }));
            first.StatusCode.Should().Be(HttpStatusCode.Created);

            // Return remaining 2 of 3
            var second = await client.PostAsJsonAsync("/api/returns",
                BuildReturnRequest(saleId, managerId,
                    new[] { (saleItemId, 2, 100.00m, "good", "remaining") }));
            second.StatusCode.Should().Be(HttpStatusCode.Created,
                "should be able to return remaining items after partial return");
        }

        [Fact]
        public async Task GetReturn_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/returns/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task ProcessReturn_RestockGoodItem_IncrementsStock()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.SystemSettings.SingleAsync();
            settings.RestockReturnedItems = true;
            await ctx.SaveChangesAsync();

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-RSTK", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            // Stock should be 18 after selling 2
            await using var preCtx = Fixture.CreateContext();
            var preProduct = await preCtx.Products.FindAsync(productId);
            preProduct!.StockQuantity.Should().Be(18);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/returns",
                BuildReturnRequest(saleId, managerId,
                    new[] { (saleItemId, 1, 50.00m, "good", "restock test") }));
            response.StatusCode.Should().Be(HttpStatusCode.Created);

            await using var postCtx = Fixture.CreateContext();
            var postProduct = await postCtx.Products.FindAsync(productId);
            postProduct!.StockQuantity.Should().Be(19,
                "returning 1 good-condition item with RestockReturnedItems=true should add back to stock");
        }

        [Fact]
        public async Task ProcessReturn_DefectiveItem_DoesNotRestock()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            var settings = await ctx.SystemSettings.SingleAsync();
            settings.RestockReturnedItems = true;
            await ctx.SaveChangesAsync();

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-DEFNR", 50.00m, 20);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, 2, 50.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/returns",
                BuildReturnRequest(saleId, managerId,
                    new[] { (saleItemId, 1, 50.00m, "defective", "broken") }));
            response.StatusCode.Should().Be(HttpStatusCode.Created);

            await using var postCtx = Fixture.CreateContext();
            var product = await postCtx.Products.FindAsync(productId);
            product!.StockQuantity.Should().Be(18,
                "defective items should NOT be restocked even when RestockReturnedItems=true");
        }
    }
}
