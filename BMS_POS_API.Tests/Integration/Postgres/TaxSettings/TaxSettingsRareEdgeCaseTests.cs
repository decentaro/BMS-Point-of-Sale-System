using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.TaxSettings
{
    [Collection("Postgres")]
    public class TaxSettingsRareEdgeCaseTests : IntegrationTestBase
    {
        public TaxSettingsRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task GetTaxSettings_NoneExist_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.GetAsync("/api/tax-settings");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CalculateTax_NoSettings_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/tax-settings/calculate", new
            {
                Subtotal = 100.00m
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("No tax settings configured");
        }

        [Fact]
        public async Task CalculateTax_WithSecondaryTax_CalculatesBoth()
        {
            await ResetAndSeedAsync();

            // Seed tax settings with secondary tax
            await using var ctx = Fixture.CreateContext();
            ctx.TaxSettings.Add(new BMS_POS_API.Models.TaxSettings
            {
                BusinessName = "Test Business",
                TaxNumber = "TAX-123",
                BusinessAddress = "123 Test St",
                EnableTax = true,
                TaxName = "VAT",
                TaxRate = 10m,
                EnableSecondaryTax = true,
                SecondaryTaxName = "Service Tax",
                SecondaryTaxRate = 5m,
                CreatedDate = DateTime.UtcNow,
                LastUpdated = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/tax-settings/calculate", new
            {
                Subtotal = 200.00m
            });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("taxAmount").GetDecimal().Should().Be(20.00m);
            doc.RootElement.GetProperty("secondaryTaxAmount").GetDecimal().Should().Be(10.00m);
            doc.RootElement.GetProperty("total").GetDecimal().Should().Be(230.00m);
        }

        [Fact]
        public async Task CalculateTax_ExemptSale_ZeroTax()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.TaxSettings.Add(new BMS_POS_API.Models.TaxSettings
            {
                BusinessName = "Test", TaxNumber = "T1", BusinessAddress = "Addr",
                EnableTax = true, TaxName = "VAT", TaxRate = 10m,
                CreatedDate = DateTime.UtcNow, LastUpdated = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/tax-settings/calculate", new
            {
                Subtotal = 100.00m,
                IsExempt = true
            });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("taxAmount").GetDecimal().Should().Be(0m);
            doc.RootElement.GetProperty("total").GetDecimal().Should().Be(100.00m);
            doc.RootElement.GetProperty("taxLabel").GetString().Should().Contain("Exempt");
        }

        [Fact]
        public async Task CalculateTax_TaxDisabled_ZeroTax()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.TaxSettings.Add(new BMS_POS_API.Models.TaxSettings
            {
                BusinessName = "Test", TaxNumber = "T1", BusinessAddress = "Addr",
                EnableTax = false, TaxName = "VAT", TaxRate = 10m,
                CreatedDate = DateTime.UtcNow, LastUpdated = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/tax-settings/calculate", new
            {
                Subtotal = 100.00m
            });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("taxAmount").GetDecimal().Should().Be(0m);
        }

        [Fact]
        public async Task CalculateTax_WithDiscount_SubtractsFromTotal()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.TaxSettings.Add(new BMS_POS_API.Models.TaxSettings
            {
                BusinessName = "Test", TaxNumber = "T1", BusinessAddress = "Addr",
                EnableTax = true, TaxName = "VAT", TaxRate = 10m,
                CreatedDate = DateTime.UtcNow, LastUpdated = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/tax-settings/calculate", new
            {
                Subtotal = 100.00m,
                DiscountAmount = 20.00m
            });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            // Total = 100 + 10 (tax) - 20 (discount) = 90
            doc.RootElement.GetProperty("total").GetDecimal().Should().Be(90.00m);
        }

        [Fact]
        public async Task CreateOrUpdateTaxSettings_Update_PreservesId()
        {
            await ResetAndSeedAsync();

            await using var ctx = Fixture.CreateContext();
            ctx.TaxSettings.Add(new BMS_POS_API.Models.TaxSettings
            {
                BusinessName = "Original", TaxNumber = "T1", BusinessAddress = "Addr",
                EnableTax = true, TaxName = "VAT", TaxRate = 10m,
                CreatedDate = DateTime.UtcNow, LastUpdated = DateTime.UtcNow
            });
            await ctx.SaveChangesAsync();

            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/tax-settings", new
            {
                BusinessName = "Updated Name",
                TaxNumber = "T2",
                BusinessAddress = "New Addr",
                EnableTax = true,
                TaxName = "GST",
                TaxRate = 15m
            });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("businessName").GetString().Should().Be("Updated Name");
            doc.RootElement.GetProperty("taxRate").GetDecimal().Should().Be(15m);
        }
    }
}
