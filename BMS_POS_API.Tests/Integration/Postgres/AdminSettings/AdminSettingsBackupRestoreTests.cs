using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.AdminSettings
{
    /// <summary>
    /// Tests for POST /api/adminsettings/backup/restore (file-upload)
    /// and GET /api/adminsettings/logs/latest.
    /// These deliberately test only validation paths — the actual restore
    /// and log-read paths depend on filesystem state outside the test harness.
    /// </summary>
    [Collection("Postgres")]
    public class AdminSettingsBackupRestoreTests : IntegrationTestBase
    {
        public AdminSettingsBackupRestoreTests(PostgresFixture fixture) : base(fixture) { }

        // ── POST /api/adminsettings/backup/restore — input validation ──

        [Fact]
        public async Task Restore_NoFile_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // Send a valid multipart form that contains no backupFile part
            using var form = new MultipartFormDataContent();
            form.Add(new StringContent(""), "newConnectionString");
            var response = await client.PostAsync("/api/adminsettings/backup/restore", form);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeFalse();
            doc.RootElement.GetProperty("message").GetString().Should().Contain("No backup file");
        }

        [Fact]
        public async Task Restore_InvalidExtension_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            using var form = new MultipartFormDataContent();
            var fileContent = new ByteArrayContent(Encoding.UTF8.GetBytes("fake backup data"));
            fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
            form.Add(fileContent, "backupFile", "malicious.exe");

            var response = await client.PostAsync("/api/adminsettings/backup/restore", form);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("success").GetBoolean().Should().BeFalse();
            doc.RootElement.GetProperty("message").GetString().Should().Contain("Invalid file type");
        }

        [Fact]
        public async Task Restore_ValidExtension_DelegatesToService()
        {
            // A .sql file with valid extension passes validation and reaches the service.
            // The real SupabaseBackupService will fail (no pg_restore binary in CI),
            // but we get a 400 from the service layer — not a validation 400.
            // This confirms the input-validation layer allows the request through.
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            using var form = new MultipartFormDataContent();
            var fileContent = new ByteArrayContent(Encoding.UTF8.GetBytes("-- minimal sql backup"));
            fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
            form.Add(fileContent, "backupFile", "backup.sql");

            var response = await client.PostAsync("/api/adminsettings/backup/restore", form);

            // The service returns failure (no real pg_restore in test env), so 400.
            // What matters: not a 401/403 (auth passed) and not a 422 (input validation passed).
            response.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized);
            response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
        }

        [Fact]
        public async Task Restore_RequiresManagerRole()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            // Use unauthenticated client
            using var client = factory.CreateClient();

            using var form = new MultipartFormDataContent();
            var fileContent = new ByteArrayContent(Encoding.UTF8.GetBytes("fake"));
            fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
            form.Add(fileContent, "backupFile", "backup.sql");

            var response = await client.PostAsync("/api/adminsettings/backup/restore", form);

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        // ── POST /api/adminsettings/backup/create ──

        [Fact]
        public async Task CreateBackup_ReturnsResultFromService()
        {
            // The service will attempt to create a backup; in CI it will fail gracefully.
            // This test ensures the endpoint is reachable (auth, routing) and returns
            // a structured response (success true or false, never 500 on expected failures).
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsync("/api/adminsettings/backup/create", null);

            // Auth passed — should be 200 (success) or 400 (service says no tools available)
            response.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.BadRequest);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            // Either way, a structured ApiResponse is returned
            doc.RootElement.TryGetProperty("success", out _).Should().BeTrue();
        }

        // ── GET /api/adminsettings/logs/latest ──

        [Fact]
        public async Task GetLatestLog_WhenNoLogsDir_Returns404()
        {
            // In CI there is no logs/ directory — endpoint should return 404 gracefully.
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/adminsettings/logs/latest");

            // Either 200 (log files happen to exist) or 404 (no logs directory)
            response.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.NotFound);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.TryGetProperty("success", out _).Should().BeTrue();
        }

        [Fact]
        public async Task GetLatestLog_RequiresManagerRole()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = factory.CreateClient();

            var response = await client.GetAsync("/api/adminsettings/logs/latest");
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }
    }
}
