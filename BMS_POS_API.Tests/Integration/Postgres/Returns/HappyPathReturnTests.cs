using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Returns
{
    [Collection("Postgres")]
    public class HappyPathReturnTests : ReturnsIntegrationTestBase
    {
        public HappyPathReturnTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task ReturnSingleItem_PersistsReturnAndRestocksInventory()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-HP1", 25.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var cashierId = await GetEmployeeIdAsync(CashierEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 3, unitPrice: 25.00m);

            // Stock should be 10 - 3 = 7 after sale
            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, cashierId,
                new[] { (saleItemId, Quantity: 2, LineTotal: 50.00m, Condition: "good", Reason: "Changed Mind") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();

            var ret = await verify.Returns.Include(r => r.ReturnItems).SingleAsync();
            ret.OriginalSaleId.Should().Be(saleId);
            ret.Status.Should().Be("Completed");
            ret.TotalRefundAmount.Should().Be(50.00m);
            ret.ProcessedByEmployeeId.Should().Be(cashierId);
            ret.ManagerApprovalRequired.Should().BeFalse();

            ret.ReturnItems.Should().HaveCount(1);
            var ri = ret.ReturnItems[0];
            ri.ReturnQuantity.Should().Be(2);
            ri.UnitPrice.Should().Be(25.00m);
            ri.LineTotal.Should().Be(50.00m);
            ri.Condition.Should().Be("good");
            ri.Reason.Should().Be("Changed Mind");
            ri.RestockedToInventory.Should().BeTrue();

            var finalStock = await verify.Products
                .Where(p => p.Id == productId)
                .Select(p => p.StockQuantity)
                .SingleAsync();
            finalStock.Should().Be(9, "10 original - 3 sold + 2 returned = 9");
        }

        [Fact]
        public async Task ReturnDefectiveItem_NotRestocked()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-DEF", 15.00m, stock: 5);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 2, unitPrice: 15.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 15.00m, Condition: "defective", Reason: "Defective Product") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var ri = await verify.ReturnItems.SingleAsync();
            ri.RestockedToInventory.Should().BeFalse("defective items should not be restocked");

            var finalStock = await verify.Products
                .Where(p => p.Id == productId)
                .Select(p => p.StockQuantity)
                .SingleAsync();
            finalStock.Should().Be(3, "5 original - 2 sold + 0 restocked (defective) = 3");
        }

        [Fact]
        public async Task PartialReturn_OnlyReturnsSomeOfPurchasedQuantity()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-PART", 10.00m, stock: 20);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 5, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 2, LineTotal: 20.00m, Condition: "good", Reason: "Wrong Size") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var ri = await verify.ReturnItems.SingleAsync();
            ri.ReturnQuantity.Should().Be(2);

            var finalStock = await verify.Products
                .Where(p => p.Id == productId)
                .Select(p => p.StockQuantity)
                .SingleAsync();
            finalStock.Should().Be(17, "20 - 5 sold + 2 returned = 17");
        }

        [Fact]
        public async Task GetReturn_ReturnsCompleteRecord()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-GET", 30.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 1, unitPrice: 30.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 30.00m, Condition: "good", Reason: "Changed Mind") });

            var createResp = await client.PostAsJsonAsync("/api/returns", payload);
            createResp.StatusCode.Should().Be(HttpStatusCode.Created, await createResp.Content.ReadAsStringAsync());

            await using var ctx = Fixture.CreateContext();
            var returnId = await ctx.Returns.Select(r => r.Id).SingleAsync();

            var getResp = await client.GetAsync($"/api/returns/{returnId}");
            getResp.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = System.Text.Json.JsonDocument.Parse(await getResp.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("status").GetString().Should().Be("Completed");
            doc.RootElement.GetProperty("totalRefundAmount").GetDecimal().Should().Be(30.00m);
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
    }
}
