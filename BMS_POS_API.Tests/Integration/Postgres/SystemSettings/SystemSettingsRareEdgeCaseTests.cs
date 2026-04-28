using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.SystemSettings
{
    [Collection("Postgres")]
    public class SystemSettingsRareEdgeCaseTests : IntegrationTestBase
    {
        public SystemSettingsRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task GetSystemSettings_NoneExist_ReturnsDefaults()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.GetAsync("/api/system-settings");
            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "GET returns default SystemSettings when none exist");
        }

        [Fact]
        public async Task GetSystemSettings_IsPublic_NoAuthRequired()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            var client = factory.CreateClient();

            var response = await client.GetAsync("/api/system-settings");
            response.StatusCode.Should().Be(HttpStatusCode.OK,
                "system settings GET is AllowAnonymous");
        }

        [Fact]
        public async Task CreateOrUpdate_NoneExist_CreatesNew()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/system-settings", new
            {
                EnableReturns = true,
                RestockReturnedItems = true,
                DateFormat = "DD/MM/YYYY",
                Theme = "dark",
                AutoLogoutMinutes = 30,
                PrintReceiptAutomatically = false,
                ReturnTimeLimitDays = 14
            });
            response.StatusCode.Should().Be(HttpStatusCode.Created);
        }

        [Fact]
        public async Task CreateOrUpdate_AlreadyExists_Updates()
        {
            await ResetAndSeedAsync(seedSystemSettings: true);
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, employeeDbId: managerId);

            var response = await client.PostAsJsonAsync("/api/system-settings", new
            {
                EnableReturns = false,
                RestockReturnedItems = false,
                DateFormat = "MM/DD/YYYY",
                Theme = "light",
                AutoLogoutMinutes = 60
            });
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("enableReturns").GetBoolean().Should().BeFalse();
            doc.RootElement.GetProperty("theme").GetString().Should().Be("light");
        }

        [Fact]
        public async Task GetBusinessTime_ReturnsTimestamp()
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
        public async Task CreateOrUpdate_CashierRole_Returns403()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, role: "Cashier");

            var response = await client.PostAsJsonAsync("/api/system-settings", new
            {
                Theme = "hacker"
            });
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
    }
}
