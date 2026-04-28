using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Reports
{
    [Collection("Postgres")]
    public class ZReportRareEdgeCaseTests : IntegrationTestBase
    {
        public ZReportRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task GetZReport_NoDateParam_DefaultsToToday()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/reports/z-report");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("sessionStatus").GetString().Should().Be("No Session");
            doc.RootElement.GetProperty("totalTransactions").GetInt32().Should().Be(0);
        }

        [Fact]
        public async Task GetZReport_InvalidDateFormat_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/reports/z-report?date=not-a-date");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid date format");
        }

        [Fact]
        public async Task GetZReport_WithSalesAndReturns_CalculatesNetRevenue()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("ZRPT-001", 100.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // Open cash session
            await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 500.00m
            });

            // Make a sale: 3 items at 100 = 300 total
            var salePayload = new
            {
                EmployeeId = managerId,
                Subtotal = 300.00m,
                TaxRate = 10m,
                TaxAmount = 30.00m,
                DiscountAmount = 0m,
                Total = 330.00m,
                AmountPaid = 330.00m,
                Change = 0m,
                PaymentMethod = "Cash",
                Items = new[]
                {
                    new { ProductId = productId, Quantity = 3, UnitPrice = 100.00m, LineTotal = 300.00m }
                }
            };
            var saleResp = await client.PostAsJsonAsync("/api/sales", salePayload);
            saleResp.StatusCode.Should().Be(HttpStatusCode.Created);

            using var saleDoc = JsonDocument.Parse(await saleResp.Content.ReadAsStringAsync());
            var saleId = saleDoc.RootElement.GetProperty("id").GetInt32();

            // Get the sale item ID
            await using var ctx = Fixture.CreateContext();
            var saleItemId = await ctx.SaleItems
                .Where(si => si.SaleId == saleId)
                .Select(si => si.Id).SingleAsync();

            // Process a return for 1 item = 100 refund
            var returnPayload = new
            {
                OriginalSaleId = saleId,
                ProcessedByEmployeeId = managerId,
                ReturnItems = new[]
                {
                    new { OriginalSaleItemId = saleItemId, ReturnQuantity = 1, LineTotal = 100.00m, Condition = "good", Reason = "wrong item" }
                }
            };
            var returnResp = await client.PostAsJsonAsync("/api/returns", returnPayload);
            returnResp.StatusCode.Should().Be(HttpStatusCode.Created);

            // Get Z-report
            var today = DateTime.Today.ToString("yyyy-MM-dd");
            var zResp = await client.GetAsync($"/api/reports/z-report?date={today}");
            zResp.StatusCode.Should().Be(HttpStatusCode.OK);

            using var zDoc = JsonDocument.Parse(await zResp.Content.ReadAsStringAsync());
            var root = zDoc.RootElement;

            root.GetProperty("totalTransactions").GetInt32().Should().Be(1);
            root.GetProperty("grossSales").GetDecimal().Should().Be(300.00m);
            root.GetProperty("totalTax").GetDecimal().Should().Be(30.00m);
            root.GetProperty("totalReturns").GetInt32().Should().Be(1);
            root.GetProperty("totalRefunds").GetDecimal().Should().Be(100.00m);

            // NetRevenue = NetSales + TotalTax - TotalRefunds
            var netSales = root.GetProperty("netSales").GetDecimal();
            var netRevenue = root.GetProperty("netRevenue").GetDecimal();
            netRevenue.Should().Be(netSales + 30.00m - 100.00m,
                "net revenue = net sales + tax - refunds");

            // ExpectedClosingCash = OpeningCash + CashSales - CashRefunds
            root.GetProperty("expectedClosingCash").GetDecimal()
                .Should().Be(500.00m + 330.00m - 100.00m,
                "expected closing cash should account for cash refunds");
        }

        [Fact]
        public async Task GetZReportRange_InvalidStartDate_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/reports/z-report-range?startDate=bad&endDate=2026-04-12");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task GetZReportRange_EndBeforeStart_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/reports/z-report-range?startDate=2026-04-12&endDate=2026-04-01");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("endDate must be on or after startDate");
        }

        [Fact]
        public async Task GetZReportRange_ExceedsMaxDays_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/reports/z-report-range?startDate=2026-01-01&endDate=2026-06-01");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("90 days");
        }

        [Fact]
        public async Task GetZReportRange_SameDayRange_ReturnsSingleRow()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var today = DateTime.Today.ToString("yyyy-MM-dd");
            var response = await client.GetAsync($"/api/reports/z-report-range?startDate={today}&endDate={today}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().HaveCount(1);
        }

        [Fact]
        public async Task GetZReport_CashierRole_Returns403()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, role: "Cashier");

            var response = await client.GetAsync("/api/reports/z-report");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "ReportsController requires Manager role");
        }
    }
}
