using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.AdminSettings
{
    [Collection("Postgres")]
    public class AdminSettingsExtendedTests : IntegrationTestBase
    {
        public AdminSettingsExtendedTests(PostgresFixture fixture) : base(fixture) { }

        // ── GET /api/adminsettings/backup/capabilities ──

        [Fact]
        public async Task GetBackupCapabilities_ReturnsStructure()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/adminsettings/backup/capabilities");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeTrue();
            var data = doc.RootElement.GetProperty("data");
            data.TryGetProperty("plan", out _).Should().BeTrue();
            data.TryGetProperty("localBackupsAvailable", out _).Should().BeTrue();
        }

        // ── GET /api/adminsettings/backup/local ──

        [Fact]
        public async Task GetLocalBackups_ReturnsStructure()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/adminsettings/backup/local");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeTrue();
            var data = doc.RootElement.GetProperty("data");
            data.TryGetProperty("totalBackups", out _).Should().BeTrue();
        }

        // ── POST /api/adminsettings/backup/restore-local — validation ──

        [Fact]
        public async Task RestoreLocal_EmptyBackupId_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/adminsettings/backup/restore-local", new
            {
                BackupId = ""
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task RestoreLocal_PathTraversal_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/adminsettings/backup/restore-local", new
            {
                BackupId = "../../../etc/passwd"
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("message").GetString().Should().Contain("Invalid");
        }

        [Fact]
        public async Task RestoreLocal_NonexistentBackupId_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/adminsettings/backup/restore-local", new
            {
                BackupId = "nonexistent-backup-2026"
            });
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        // ── GET /api/adminsettings/logs/folder ──

        [Fact]
        public async Task GetLogsFolderPath_ReturnsStructure()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/adminsettings/logs/folder");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeTrue();
            var data = doc.RootElement.GetProperty("data");
            data.TryGetProperty("folderPath", out _).Should().BeTrue();
            data.TryGetProperty("exists", out _).Should().BeTrue();
            data.TryGetProperty("fileCount", out _).Should().BeTrue();
        }

        // NOTE: ClearDatabase success path intentionally NOT tested here —
        // it drops all tables, which destroys the shared test database.
        // The validation tests (wrong phrase, wrong pin, no pin) in AdminSettingsTests
        // verify the guard logic without the destructive side effect.

        // ── PUT /api/adminsettings — not-found when no settings ──

        [Fact]
        public async Task UpdateAdminSettings_NoneExist_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync("/api/adminsettings", new
            {
                RequireStrongPins = true,
                MaxFailedLoginAttempts = 3
            });

            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }
    }
}
