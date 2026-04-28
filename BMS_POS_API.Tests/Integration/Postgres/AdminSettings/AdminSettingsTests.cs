using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BMS_POS_API.Models;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.AdminSettings
{
    [Collection("Postgres")]
    public class AdminSettingsTests : IntegrationTestBase
    {
        public AdminSettingsTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task GetAdminSettings_NoneExist_CreatesDefaults()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/adminsettings");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeTrue();
            var data = doc.RootElement.GetProperty("data");
            data.GetProperty("maxFailedLoginAttempts").GetInt32().Should().Be(5);
            data.GetProperty("requireStrongPins").GetBoolean().Should().BeFalse();
        }

        [Fact]
        public async Task UpdateAdminSettings_ValidInput_Succeeds()
        {
            await ResetAndSeedAsync(seedAdminSettings: true);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync("/api/adminsettings", new
            {
                RequireStrongPins = true,
                MaxFailedLoginAttempts = 3
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());

            await using var verify = Fixture.CreateContext();
            var settings = await verify.AdminSettings.SingleAsync();
            settings.RequireStrongPins.Should().BeTrue();
            settings.MaxFailedLoginAttempts.Should().Be(3);
        }

        [Fact]
        public async Task TestDatabaseConnection_ReturnsConnected()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsync("/api/adminsettings/test-connection", null);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeTrue();
            doc.RootElement.GetProperty("data").GetProperty("connected").GetBoolean().Should().BeTrue();
        }

        [Fact]
        public async Task ClearDatabase_NoConfirmationPhrase_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/adminsettings/clear-database", new
            {
                ManagerPin = ManagerPin,
                ConfirmationPhrase = "wrong phrase"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task ClearDatabase_NoManagerPin_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/adminsettings/clear-database", new
            {
                ConfirmationPhrase = "CLEAR DATABASE"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task ClearDatabase_WrongPin_Returns401()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/adminsettings/clear-database", new
            {
                ManagerPin = "000000",
                ConfirmationPhrase = "CLEAR DATABASE"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        [Fact]
        public async Task CashierCannotAccessAdminSettings_Returns403()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, role: "Cashier");

            var response = await client.GetAsync("/api/adminsettings");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
    }
}
