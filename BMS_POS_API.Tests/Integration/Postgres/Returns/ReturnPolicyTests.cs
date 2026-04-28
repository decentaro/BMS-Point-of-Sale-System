using System.Net;
using System.Net.Http.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Returns
{
    [Collection("Postgres")]
    public class ReturnPolicyTests : ReturnsIntegrationTestBase
    {
        public ReturnPolicyTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task ReturnsDisabled_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-DIS", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            // Disable returns in system settings
            await using (var ctx = Fixture.CreateContext())
            {
                var settings = await ctx.SystemSettings.SingleAsync();
                settings.EnableReturns = false;
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 1, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Test") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("disabled");
        }

        [Fact]
        public async Task ReturnTimeLimitExpired_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-EXP", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            // Set 7-day limit
            await using (var ctx = Fixture.CreateContext())
            {
                var settings = await ctx.SystemSettings.SingleAsync();
                settings.ReturnTimeLimitDays = 7;
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 1, unitPrice: 10.00m);

            // Backdate the sale to 10 days ago
            await using (var ctx = Fixture.CreateContext())
            {
                var sale = await ctx.Sales.SingleAsync();
                sale.SaleDate = DateTime.UtcNow.AddDays(-10);
                await ctx.SaveChangesAsync();
            }

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Test") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("expired");
        }

        [Fact]
        public async Task ManagerApprovalRequired_NoPin_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-NOPIN", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            // Require manager approval for all returns
            await using (var ctx = Fixture.CreateContext())
            {
                var settings = await ctx.SystemSettings.SingleAsync();
                settings.RequireManagerApprovalForReturns = true;
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 1, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                items: new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Test") },
                managerPin: null);

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Manager PIN is required");
        }

        [Fact]
        public async Task ManagerApprovalRequired_WrongPin_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-BADPIN", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using (var ctx = Fixture.CreateContext())
            {
                var settings = await ctx.SystemSettings.SingleAsync();
                settings.RequireManagerApprovalForReturns = true;
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 1, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                items: new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Test") },
                managerPin: "000000");

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid manager PIN");
        }

        [Fact]
        public async Task ManagerApprovalRequired_CorrectPin_Succeeds()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-OKPIN", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using (var ctx = Fixture.CreateContext())
            {
                var settings = await ctx.SystemSettings.SingleAsync();
                settings.RequireManagerApprovalForReturns = true;
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 1, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                items: new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Test") },
                managerPin: ManagerPin);

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var ret = await verify.Returns.SingleAsync();
            ret.ManagerApprovalRequired.Should().BeTrue();
            ret.ApprovedByEmployeeId.Should().Be(managerId);
        }

        [Fact]
        public async Task AmountThresholdTriggersManagerApproval_NoPin_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-THRESH", 600.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            // Don't require approval globally, but set threshold to $500
            await using (var ctx = Fixture.CreateContext())
            {
                var settings = await ctx.SystemSettings.SingleAsync();
                settings.RequireManagerApprovalForReturns = false;
                settings.ReturnManagerApprovalAmount = 500.00m;
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 2, unitPrice: 600.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                items: new[] { (saleItemId, Quantity: 2, LineTotal: 1200.00m, Condition: "good", Reason: "Test") },
                managerPin: null);

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Manager PIN is required");
        }

        [Fact]
        public async Task DefectiveReturnsDisabled_DefectiveItem_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-NODEF", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using (var ctx = Fixture.CreateContext())
            {
                var settings = await ctx.SystemSettings.SingleAsync();
                settings.AllowDefectiveItemReturns = false;
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 1, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "defective", Reason: "Broken") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Defective item returns are disabled");
        }

        [Fact]
        public async Task RestockDisabled_GoodItem_NotRestocked()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-NORS", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using (var ctx = Fixture.CreateContext())
            {
                var settings = await ctx.SystemSettings.SingleAsync();
                settings.RestockReturnedItems = false;
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 2, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Changed Mind") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var ri = await verify.ReturnItems.SingleAsync();
            ri.RestockedToInventory.Should().BeFalse("restock is disabled in settings");

            var finalStock = await verify.Products
                .Where(p => p.Id == productId)
                .Select(p => p.StockQuantity)
                .SingleAsync();
            finalStock.Should().Be(8, "10 - 2 sold + 0 restocked (disabled) = 8");
        }

        [Fact]
        public async Task NoSystemSettings_Returns400()
        {
            await Fixture.ResetAsync();

            // Seed manager but NO system settings
            await using (var ctx = Fixture.CreateContext())
            {
                ctx.Employees.Add(new Employee
                {
                    EmployeeId = ManagerEmployeeId,
                    Pin = ManagerPin,
                    Name = "Manager",
                    Role = "Manager",
                    IsManager = true,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("RET-NOSET", 10.00m, stock: 10);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 1, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Test") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("disabled");
        }
    }
}
