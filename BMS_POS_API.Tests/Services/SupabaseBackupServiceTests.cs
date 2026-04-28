using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;
using BMS_POS_API.Services;

namespace BMS_POS_API.Tests.Services
{
    public class SupabaseBackupServiceTests : IDisposable
    {
        private readonly SupabaseBackupService _sut;
        private readonly string _tempBackupsDir;

        public SupabaseBackupServiceTests()
        {
            _tempBackupsDir = Path.Combine(Path.GetTempPath(), $"bms_test_backups_{Guid.NewGuid():N}");

            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:DefaultConnection"] =
                        "Host=localhost;Port=5432;Database=testdb;Username=test;Password=test",
                    ["BackupsDirectory"] = _tempBackupsDir
                })
                .Build();

            var mockActivity = new Mock<IUserActivityService>();
            mockActivity
                .Setup(s => s.LogActivityAsync(
                    It.IsAny<int?>(), It.IsAny<string>(), It.IsAny<string>(),
                    It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                    It.IsAny<string>(), It.IsAny<string>()))
                .Returns(Task.CompletedTask);

            _sut = new SupabaseBackupService(
                NullLogger<SupabaseBackupService>.Instance,
                config,
                mockActivity.Object);
        }

        public void Dispose()
        {
            if (Directory.Exists(_tempBackupsDir))
                Directory.Delete(_tempBackupsDir, recursive: true);
        }

        // ── DetectPlanAndCapabilities ────────────────────────────────────────

        [Fact]
        public async Task DetectPlanAndCapabilities_ReturnsCapabilitiesObject()
        {
            var result = await _sut.DetectPlanAndCapabilities();

            Assert.NotNull(result);
            Assert.NotNull(result.Plan);
            Assert.NotNull(result.Message);
        }

        [Fact]
        public async Task DetectPlanAndCapabilities_ReturnsFreePlan()
        {
            var result = await _sut.DetectPlanAndCapabilities();

            Assert.Equal("Free", result.Plan);
        }

        [Fact]
        public async Task DetectPlanAndCapabilities_AutomaticBackupsFalseOnFreeTier()
        {
            var result = await _sut.DetectPlanAndCapabilities();

            Assert.False(result.AutomaticBackups);
        }

        // ── GetLocalBackups ──────────────────────────────────────────────────

        [Fact]
        public async Task GetLocalBackups_WhenNoDirExists_ReturnsEmptyList()
        {
            // _tempBackupsDir is not created → service should return empty list, not throw
            var result = await _sut.GetLocalBackups();

            Assert.NotNull(result);
            Assert.Empty(result);
        }

        [Fact]
        public async Task GetLocalBackups_WithManifest_ParsesManifestFields()
        {
            var backupDir = Path.Combine(_tempBackupsDir, $"manual_{DateTime.UtcNow:yyyyMMdd_HHmmss}_test");
            Directory.CreateDirectory(backupDir);

            var manifest = new
            {
                BackupId = Path.GetFileName(backupDir),
                CreatedAt = DateTime.UtcNow,
                Method = "Test",
                DatabaseUrl = "masked",
                Files = new[] { "schema.sql" }
            };
            await File.WriteAllTextAsync(
                Path.Combine(backupDir, "manifest.json"),
                System.Text.Json.JsonSerializer.Serialize(manifest));
            await File.WriteAllTextAsync(Path.Combine(backupDir, "schema.sql"), "--schema");

            var result = await _sut.GetLocalBackups();

            var found = result.FirstOrDefault(b => b.BackupId == Path.GetFileName(backupDir));
            Assert.NotNull(found);
            Assert.Equal("Test", found!.Method);
            Assert.True(found.HasManifest);
        }

        [Fact]
        public async Task GetLocalBackups_WithoutManifest_StillReturnsEntry()
        {
            var backupDir = Path.Combine(_tempBackupsDir, $"manual_{DateTime.UtcNow:yyyyMMdd_HHmmss}_nomanifest");
            Directory.CreateDirectory(backupDir);
            await File.WriteAllTextAsync(Path.Combine(backupDir, "data.sql"), "--data");

            var result = await _sut.GetLocalBackups();

            var found = result.FirstOrDefault(b => b.BackupId == Path.GetFileName(backupDir));
            Assert.NotNull(found);
            Assert.False(found!.HasManifest);
        }

        // ── IsSupabaseCLIAvailable ───────────────────────────────────────────

        [Fact]
        public async Task IsSupabaseCLIAvailable_ReturnsBool()
        {
            // The result depends on the host, but it must not throw
            var result = await _sut.IsSupabaseCLIAvailable();
            Assert.IsType<bool>(result);
        }
    }
}
