using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.Reports
{
    [Collection("Postgres")]
    public class ZReportTests : IntegrationTestBase
    {
        public ZReportTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task GetZReport_NoSales_ReturnsZeroTotals()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var today = DateTime.Today.ToString("yyyy-MM-dd");
            var response = await client.GetAsync($"/api/reports/z-report?date={today}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalTransactions").GetInt32().Should().Be(0);
            doc.RootElement.GetProperty("grossSales").GetDecimal().Should().Be(0m);
        }

        [Fact]
        public async Task GetZReport_WithSalesAndSession_CalculatesCorrectly()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);
            var productId = await SeedProductAsync("ZR-001", 100.00m, 50);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // Open cash session
            await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 200.00m
            });

            // Make a sale
            var salePayload = new
            {
                EmployeeId = managerId,
                Subtotal = 100.00m,
                TaxRate = 10.0m,
                TaxAmount = 10.00m,
                DiscountAmount = 0m,
                DiscountReason = (string?)null,
                Total = 110.00m,
                AmountPaid = 110.00m,
                Change = 0m,
                PaymentMethod = "Cash",
                Notes = (string?)null,
                Items = new object[] { new { ProductId = productId, Quantity = 1, UnitPrice = 100.00m, LineTotal = 100.00m } }
            };
            var saleResp = await client.PostAsJsonAsync("/api/sales", salePayload);
            saleResp.StatusCode.Should().Be(HttpStatusCode.Created, await saleResp.Content.ReadAsStringAsync());

            var today = DateTime.Today.ToString("yyyy-MM-dd");
            var response = await client.GetAsync($"/api/reports/z-report?date={today}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalTransactions").GetInt32().Should().Be(1);
            doc.RootElement.GetProperty("grossSales").GetDecimal().Should().Be(100.00m);
            doc.RootElement.GetProperty("totalTax").GetDecimal().Should().Be(10.00m);
            doc.RootElement.GetProperty("cashSales").GetDecimal().Should().Be(110.00m);
            doc.RootElement.GetProperty("openingCash").GetDecimal().Should().Be(200.00m);
            doc.RootElement.GetProperty("expectedClosingCash").GetDecimal().Should().Be(310.00m);
        }

        [Fact]
        public async Task GetZReport_InvalidDate_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/reports/z-report?date=not-a-date");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task GetZReportRange_ValidDates_ReturnsRows()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var start = DateTime.Today.AddDays(-7).ToString("yyyy-MM-dd");
            var end = DateTime.Today.ToString("yyyy-MM-dd");
            var response = await client.GetAsync($"/api/reports/z-report-range?startDate={start}&endDate={end}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var rows = doc.RootElement.EnumerateArray().ToList();
            rows.Should().HaveCount(8, "7 days + today = 8 rows");
        }

        [Fact]
        public async Task GetZReportRange_EndBeforeStart_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/reports/z-report-range?startDate=2026-04-15&endDate=2026-04-10");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("on or after");
        }

        [Fact]
        public async Task GetZReportRange_Over90Days_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/reports/z-report-range?startDate=2026-01-01&endDate=2026-06-01");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("90 days");
        }

        [Fact]
        public async Task CashierCannotAccessReports_Returns403()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, role: "Cashier");

            var today = DateTime.Today.ToString("yyyy-MM-dd");
            var response = await client.GetAsync($"/api/reports/z-report?date={today}");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
    }
}
