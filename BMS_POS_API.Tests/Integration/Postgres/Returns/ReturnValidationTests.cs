using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Returns
{
    [Collection("Postgres")]
    public class ReturnValidationTests : ReturnsIntegrationTestBase
    {
        public ReturnValidationTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task InvalidSaleId_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var payload = BuildReturnRequest(
                originalSaleId: 999999,
                processedByEmployeeId: managerId,
                items: new[] { (SaleItemId: 1, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Test") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Original sale not found");
        }

        [Fact]
        public async Task ReturnMoreThanPurchased_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-OVER", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 2, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 5, LineTotal: 50.00m, Condition: "good", Reason: "Test") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Cannot return");

            await using var verify = Fixture.CreateContext();
            (await verify.Returns.CountAsync()).Should().Be(0, "no return should be created");
        }

        [Fact]
        public async Task ZeroReturnQuantity_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-ZERO", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 2, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 0, LineTotal: 0m, Condition: "good", Reason: "Test") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid return quantity");
        }

        [Fact]
        public async Task InvalidSaleItemId_Returns400()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-NOITEM", 10.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, _) = await CreateSaleAsync(factory, managerId, productId, quantity: 1, unitPrice: 10.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildReturnRequest(
                saleId, managerId,
                new[] { (SaleItemId: 999999, Quantity: 1, LineTotal: 10.00m, Condition: "good", Reason: "Test") });

            var response = await client.PostAsJsonAsync("/api/returns", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("not found");
        }

        [Fact]
        public async Task DoubleReturn_SameItems_SecondReturnRejectsOverReturn()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-DBL", 20.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 3, unitPrice: 20.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            // First return: 2 of 3 items
            var firstPayload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 2, LineTotal: 40.00m, Condition: "good", Reason: "Changed Mind") });
            var firstResp = await client.PostAsJsonAsync("/api/returns", firstPayload);
            firstResp.StatusCode.Should().Be(HttpStatusCode.Created, await firstResp.Content.ReadAsStringAsync());

            // Second return: try to return 2 more — only 1 remains
            var secondPayload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 2, LineTotal: 40.00m, Condition: "good", Reason: "Another return") });
            var secondResp = await client.PostAsJsonAsync("/api/returns", secondPayload);
            secondResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await secondResp.Content.ReadAsStringAsync()).Should().Contain("Cannot return");

            await using var verify = Fixture.CreateContext();
            (await verify.Returns.CountAsync()).Should().Be(1, "only the first return should exist");
        }

        [Fact]
        public async Task DoubleReturn_SecondReturnsRemainder_Succeeds()
        {
            await ResetAndSeedAsync();
            var productId = await SeedProductAsync("RET-REM", 20.00m, stock: 10);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            var (saleId, saleItemId) = await CreateSaleAsync(factory, managerId, productId, quantity: 3, unitPrice: 20.00m);

            using var client = await CreateAuthenticatedClientAsync(factory);

            // First return: 2 of 3
            var firstPayload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 2, LineTotal: 40.00m, Condition: "good", Reason: "First batch") });
            var firstResp = await client.PostAsJsonAsync("/api/returns", firstPayload);
            firstResp.StatusCode.Should().Be(HttpStatusCode.Created, await firstResp.Content.ReadAsStringAsync());

            // Second return: exactly 1 remaining
            var secondPayload = BuildReturnRequest(
                saleId, managerId,
                new[] { (saleItemId, Quantity: 1, LineTotal: 20.00m, Condition: "good", Reason: "Last one") });
            var secondResp = await client.PostAsJsonAsync("/api/returns", secondPayload);
            secondResp.StatusCode.Should().Be(HttpStatusCode.Created, await secondResp.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            (await verify.Returns.CountAsync()).Should().Be(2);

            var finalStock = await verify.Products
                .Where(p => p.Id == productId)
                .Select(p => p.StockQuantity)
                .SingleAsync();
            finalStock.Should().Be(10, "10 - 3 sold + 3 returned = 10 (full restock)");
        }
    }
}
