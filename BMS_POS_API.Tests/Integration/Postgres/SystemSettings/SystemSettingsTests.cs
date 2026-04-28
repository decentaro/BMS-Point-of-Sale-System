using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.SystemSettings
{
    [Collection("Postgres")]
    public class SystemSettingsTests : IntegrationTestBase
    {
        public SystemSettingsTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task GetSystemSettings_NoneExist_ReturnsDefaults()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.GetAsync("/api/system-settings");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("theme").GetString().Should().Be("light");
            doc.RootElement.GetProperty("autoLogoutMinutes").GetInt32().Should().Be(30);
        }

        [Fact]
        public async Task CreateSystemSettings_NewRecord_Returns201()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/system-settings", new BMS_POS_API.Models.SystemSettings
            {
                Theme = "dark",
                AutoLogoutMinutes = 15,
                DefaultPaymentMethod = "Card",
                EnableReturns = true,
                ReturnTimeLimitDays = 14,
                DateFormat = "DD/MM/YYYY"
            });

            response.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.Created);

            await using var verify = Fixture.CreateContext();
            var settings = await verify.SystemSettings.SingleAsync();
            settings.Theme.Should().Be("dark");
            settings.AutoLogoutMinutes.Should().Be(15);
        }

        [Fact]
        public async Task UpdateSystemSettings_ExistingRecord_Returns200()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            await using (var ctx = Fixture.CreateContext())
            {
                var existing = await ctx.SystemSettings.SingleAsync();

                var update = new BMS_POS_API.Models.SystemSettings
                {
                    Id = existing.Id,
                    Theme = "dark",
                    AutoLogoutMinutes = 60,
                    DefaultPaymentMethod = "Card",
                    DateFormat = "YYYY-MM-DD",
                    EnableReturns = true,
                    ReturnTimeLimitDays = 14,
                    ReceiptPaperSize = "58mm",
                    ReceiptTemplateLayout = "Compact"
                };

                var response = await client.PostAsJsonAsync("/api/system-settings", update);
                response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
            }

            await using var verify = Fixture.CreateContext();
            var settings = await verify.SystemSettings.SingleAsync();
            settings.Theme.Should().Be("dark");
            settings.AutoLogoutMinutes.Should().Be(60);
        }

        [Fact]
        public async Task GetBusinessTime_ReturnsCurrentTime()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/system-settings/business-time");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var timeStr = doc.RootElement.GetProperty("businessTime").GetString();
            timeStr.Should().NotBeNullOrEmpty();
            DateTime.TryParse(timeStr, out _).Should().BeTrue();
        }

        [Fact]
        public async Task GetSystemSettings_AllowAnonymous_NoAuthRequired()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.GetAsync("/api/system-settings");
            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "GET system-settings is AllowAnonymous — no auth required");
        }

        [Fact]
        public async Task CashierCannotUpdateSystemSettings_Returns403()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, role: "Cashier");

            var response = await client.PostAsJsonAsync("/api/system-settings", new BMS_POS_API.Models.SystemSettings
            {
                Theme = "dark"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
    }
}
