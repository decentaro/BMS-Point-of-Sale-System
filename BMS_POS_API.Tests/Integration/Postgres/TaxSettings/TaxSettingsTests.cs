using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.TaxSettings
{
    [Collection("Postgres")]
    public class TaxSettingsTests : IntegrationTestBase
    {
        public TaxSettingsTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task GetTaxSettings_NoneExist_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.GetAsync("/api/tax-settings");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CreateTaxSettings_ValidInput_Returns201()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/tax-settings", new
            {
                BusinessName = "BMS Pet Store",
                TaxNumber = "TAX-123",
                BusinessAddress = "123 Main St",
                EnableTax = true,
                TaxName = "VAT",
                TaxRate = 12.0m,
                EnableSecondaryTax = false,
                SecondaryTaxName = "Service Tax",
                SecondaryTaxRate = 0m,
                EnableTaxExemptions = false
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var settings = await verify.TaxSettings.SingleAsync();
            settings.BusinessName.Should().Be("BMS Pet Store");
            settings.TaxRate.Should().Be(12.0m);
        }

        [Fact]
        public async Task UpdateTaxSettings_ExistingRecord_Returns200()
        {
            await ResetAndSeedAsync();

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.TaxSettings.Add(new BMS_POS_API.Models.TaxSettings
                {
                    BusinessName = "Old Name",
                    TaxRate = 10.0m,
                    EnableTax = true,
                    TaxName = "Sales Tax",
                    CreatedDate = DateTime.UtcNow,
                    LastUpdated = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/tax-settings", new
            {
                BusinessName = "New Name",
                TaxNumber = "TAX-456",
                BusinessAddress = "456 Oak Ave",
                EnableTax = true,
                TaxName = "VAT",
                TaxRate = 15.0m,
                EnableSecondaryTax = true,
                SecondaryTaxName = "Service Tax",
                SecondaryTaxRate = 5.0m,
                EnableTaxExemptions = true
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var settings = await verify.TaxSettings.SingleAsync();
            settings.BusinessName.Should().Be("New Name");
            settings.TaxRate.Should().Be(15.0m);
            settings.EnableSecondaryTax.Should().BeTrue();
            settings.SecondaryTaxRate.Should().Be(5.0m);
        }

        [Fact]
        public async Task CalculateTax_StandardSale_CorrectAmounts()
        {
            await ResetAndSeedAsync();

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.TaxSettings.Add(new BMS_POS_API.Models.TaxSettings
                {
                    BusinessName = "Test",
                    EnableTax = true,
                    TaxName = "VAT",
                    TaxRate = 10.0m,
                    EnableSecondaryTax = false,
                    CreatedDate = DateTime.UtcNow,
                    LastUpdated = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/tax-settings/calculate", new
            {
                Subtotal = 100.00m
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("taxRate").GetDecimal().Should().Be(10.0m);
            doc.RootElement.GetProperty("taxAmount").GetDecimal().Should().Be(10.00m);
            doc.RootElement.GetProperty("total").GetDecimal().Should().Be(110.00m);
        }

        [Fact]
        public async Task CalculateTax_ExemptSale_ZeroTax()
        {
            await ResetAndSeedAsync();

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.TaxSettings.Add(new BMS_POS_API.Models.TaxSettings
                {
                    BusinessName = "Test",
                    EnableTax = true,
                    TaxName = "VAT",
                    TaxRate = 10.0m,
                    CreatedDate = DateTime.UtcNow,
                    LastUpdated = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

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
        }

        [Fact]
        public async Task CalculateTax_WithSecondaryTax_BothApplied()
        {
            await ResetAndSeedAsync();

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.TaxSettings.Add(new BMS_POS_API.Models.TaxSettings
                {
                    BusinessName = "Test",
                    EnableTax = true,
                    TaxName = "VAT",
                    TaxRate = 10.0m,
                    EnableSecondaryTax = true,
                    SecondaryTaxName = "Service Tax",
                    SecondaryTaxRate = 5.0m,
                    CreatedDate = DateTime.UtcNow,
                    LastUpdated = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

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
        }

        [Fact]
        public async Task GetTaxSettings_AllowAnonymous_NoAuthRequired()
        {
            await ResetAndSeedAsync();

            await using (var ctx = Fixture.CreateContext())
            {
                ctx.TaxSettings.Add(new BMS_POS_API.Models.TaxSettings
                {
                    BusinessName = "Anon Test",
                    EnableTax = true,
                    TaxRate = 8.0m,
                    CreatedDate = DateTime.UtcNow,
                    LastUpdated = DateTime.UtcNow
                });
                await ctx.SaveChangesAsync();
            }

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.GetAsync("/api/tax-settings");
            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "GET tax-settings is AllowAnonymous — no auth required");
        }
    }
}
