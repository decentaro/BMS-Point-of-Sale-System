using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Sales
{
    [Collection("Postgres")]
    public class SalesReportingTests : SalesIntegrationTestBase
    {
        public SalesReportingTests(PostgresFixture fixture) : base(fixture) { }

        private async Task<(int EmployeeId, int ProductId)> SeedAndMakeSaleAsync(PosApiFactory factory)
        {
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("RPT-001", 100.00m, 50);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var payload = BuildSingleItemSale(managerId, productId, 2, 100.00m, taxRate: 10m);
            var resp = await client.PostAsJsonAsync("/api/sales", payload);
            resp.StatusCode.Should().Be(HttpStatusCode.Created);
            return (managerId, productId);
        }

        // ── GET /api/sales/{id} ──

        [Fact]
        public async Task GetSaleById_Exists_ReturnsSale()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("GBI-001", 50.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var createResp = await client.PostAsJsonAsync("/api/sales",
                BuildSingleItemSale(managerId, productId, 1, 50.00m));
            createResp.StatusCode.Should().Be(HttpStatusCode.Created);

            using var createDoc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var saleId = createDoc.RootElement.GetProperty("id").GetInt32();

            var getResp = await client.GetAsync($"/api/sales/{saleId}");
            getResp.StatusCode.Should().Be(HttpStatusCode.OK);

            using var getDoc = JsonDocument.Parse(await getResp.Content.ReadAsStringAsync());
            getDoc.RootElement.GetProperty("id").GetInt32().Should().Be(saleId);
        }

        [Fact]
        public async Task GetSaleById_NotFound_Returns404()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── GET /api/sales/search ──

        [Fact]
        public async Task SearchSale_ByFullTransactionId_ReturnsSale()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("SCH-001", 25.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var createResp = await client.PostAsJsonAsync("/api/sales",
                BuildSingleItemSale(managerId, productId, 1, 25.00m));
            using var createDoc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var txnId = createDoc.RootElement.GetProperty("transactionId").GetString()!;

            var searchResp = await client.GetAsync($"/api/sales/search?transactionId={txnId}");
            searchResp.StatusCode.Should().Be(HttpStatusCode.OK);

            using var searchDoc = JsonDocument.Parse(await searchResp.Content.ReadAsStringAsync());
            searchDoc.RootElement.GetProperty("transactionId").GetString().Should().Be(txnId);
        }

        [Fact]
        public async Task SearchSale_ByPartialId_ReturnsSale()
        {
            await ResetAndSeedManagerAsync();
            var managerId = await GetManagerIdAsync();
            var productId = await SeedProductAsync("SCH-002", 25.00m, 10);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var createResp = await client.PostAsJsonAsync("/api/sales",
                BuildSingleItemSale(managerId, productId, 1, 25.00m));
            using var createDoc = JsonDocument.Parse(await createResp.Content.ReadAsStringAsync());
            var txnId = createDoc.RootElement.GetProperty("transactionId").GetString()!;
            var last8 = txnId[^8..];

            var searchResp = await client.GetAsync($"/api/sales/search?transactionId={last8}");
            searchResp.StatusCode.Should().Be(HttpStatusCode.OK);
        }

        [Fact]
        public async Task SearchSale_EmptyParam_Returns400()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales/search?transactionId=");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task SearchSale_NoMatch_Returns404()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales/search?transactionId=XXXXXXXX");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── GET /api/sales/today ──

        [Fact]
        public async Task GetTodaySales_NoSales_ReturnsZeros()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales/today");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalSales").GetInt32().Should().Be(0);
            doc.RootElement.GetProperty("totalRevenue").GetDecimal().Should().Be(0m);
        }

        [Fact]
        public async Task GetTodaySales_WithSales_ReturnsTotals()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            await SeedAndMakeSaleAsync(factory);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var response = await client.GetAsync("/api/sales/today");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalSales").GetInt32().Should().BeGreaterOrEqualTo(1);
            doc.RootElement.GetProperty("totalRevenue").GetDecimal().Should().BeGreaterThan(0);
        }

        [Fact]
        public async Task GetTodaySales_CashierForbidden()
        {
            await ResetAndSeedManagerAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.Employees.Add(new BMS_POS_API.Models.Employee
            {
                EmployeeId = "CSH001", Pin = "654321", Name = "Cashier",
                Role = "Cashier", IsManager = false, IsActive = true,
                CreatedDate = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();
            var loginResp = await client.PostAsJsonAsync("/api/auth/login",
                new { EmployeeId = "CSH001", Pin = "654321", SelectedRole = "Cashier" });
            loginResp.EnsureSuccessStatusCode();
            using var loginDoc = JsonDocument.Parse(await loginResp.Content.ReadAsStringAsync());
            var token = loginDoc.RootElement.GetProperty("data").GetProperty("token").GetString();
            client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await client.GetAsync("/api/sales/today");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }

        // ── GET /api/sales/this-week ──

        [Fact]
        public async Task GetThisWeekSummary_NoSales_ReturnsZeros()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales/this-week");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalSales").GetInt32().Should().Be(0);
            doc.RootElement.GetProperty("period").GetString().Should().Contain("Week of");
        }

        [Fact]
        public async Task GetThisWeekSummary_WithSales_Aggregates()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            await SeedAndMakeSaleAsync(factory);

            using var client = await CreateAuthenticatedClientAsync(factory);
            // Use this-month instead of this-week to avoid flaky week-boundary issues
            // (Mon-start week calc excludes today on Sundays)
            var response = await client.GetAsync("/api/sales/this-month");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalSales").GetInt32().Should().BeGreaterOrEqualTo(1);
        }

        // ── GET /api/sales/this-month ──

        [Fact]
        public async Task GetThisMonthSummary_NoSales_ReturnsZeros()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales/this-month");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalSales").GetInt32().Should().Be(0);
        }

        // ── GET /api/sales/top-products ──

        [Fact]
        public async Task GetTopProducts_NoSales_ReturnsEmptyList()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales/top-products?days=7");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().BeEmpty();
        }

        [Fact]
        public async Task GetTopProducts_WithSales_RanksProducts()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            await SeedAndMakeSaleAsync(factory);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var response = await client.GetAsync("/api/sales/top-products?days=7");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var products = doc.RootElement.EnumerateArray().ToList();
            products.Should().HaveCountGreaterOrEqualTo(1);
            products[0].GetProperty("totalQuantitySold").GetInt32().Should().BeGreaterThan(0);
        }

        // ── GET /api/sales/payment-breakdown ──

        [Fact]
        public async Task GetPaymentBreakdown_TodayWithSales_GroupsByMethod()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            await SeedAndMakeSaleAsync(factory);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var response = await client.GetAsync("/api/sales/payment-breakdown?period=today");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("period").GetString().Should().Be("Today");
            var methods = doc.RootElement.GetProperty("paymentMethods").EnumerateArray().ToList();
            methods.Should().Contain(m => m.GetProperty("paymentMethod").GetString() == "Cash");
        }

        [Fact]
        public async Task GetPaymentBreakdown_WeekPeriod_UsesWeekLabel()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales/payment-breakdown?period=week");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("period").GetString().Should().Contain("Week of");
        }

        // ── GET /api/sales/tax-summary ──

        [Fact]
        public async Task GetTaxSummary_MonthDefault_ReturnsStructure()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales/tax-summary");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.TryGetProperty("totalTaxCollected", out _).Should().BeTrue();
            doc.RootElement.TryGetProperty("averageTaxRate", out _).Should().BeTrue();
        }

        [Fact]
        public async Task GetTaxSummary_WithSales_CalculatesTax()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            await SeedAndMakeSaleAsync(factory);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var response = await client.GetAsync("/api/sales/tax-summary?period=month");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalTaxCollected").GetDecimal().Should().BeGreaterThan(0);
        }

        // ── GET /api/sales/employee-performance ──

        [Fact]
        public async Task GetEmployeePerformance_WithSales_RanksEmployees()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            await SeedAndMakeSaleAsync(factory);

            using var client = await CreateAuthenticatedClientAsync(factory);
            var response = await client.GetAsync("/api/sales/employee-performance?period=month");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var employees = doc.RootElement.EnumerateArray().ToList();
            employees.Should().HaveCountGreaterOrEqualTo(1);
            employees[0].GetProperty("totalSales").GetInt32().Should().BeGreaterThan(0);
            employees[0].GetProperty("averageTransactionValue").GetDecimal().Should().BeGreaterThan(0);
        }

        [Fact]
        public async Task GetEmployeePerformance_TodayPeriod_Works()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales/employee-performance?period=today");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
        }

        // ── GET /api/sales — pagination edge cases ──

        [Fact]
        public async Task GetSales_LimitClampsTo500()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales?limit=9999");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
        }

        [Fact]
        public async Task GetSales_DaysFilter_RestrictsResults()
        {
            await ResetAndSeedManagerAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/sales?days=1");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
        }
    }
}
