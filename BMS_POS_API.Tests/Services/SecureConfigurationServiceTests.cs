using BMS_POS_API.Services;
using FluentAssertions;

namespace BMS_POS_API.Tests.Services
{
    public class SecureConfigurationServiceTests : IDisposable
    {
        private readonly SecureConfigurationService _svc = new();

        // Env vars we set during tests — cleaned up in Dispose
        private readonly List<string> _setVars = new();

        private void SetEnv(string key, string value)
        {
            Environment.SetEnvironmentVariable(key, value);
            _setVars.Add(key);
        }

        private void ClearEnv(string key)
        {
            Environment.SetEnvironmentVariable(key, null);
        }

        // ── ProcessConnectionString ───────────────────────────────

        [Fact]
        public void ProcessConnectionString_NullOrEmpty_ReturnsUnchanged()
        {
            _svc.ProcessConnectionString(null!).Should().BeNull();
            _svc.ProcessConnectionString("").Should().BeEmpty();
        }

        [Fact]
        public void ProcessConnectionString_NoPlaceholders_ReturnsUnchanged()
        {
            const string cs = "Host=localhost;Port=5432;Database=mydb";
            _svc.ProcessConnectionString(cs).Should().Be(cs);
        }

        [Fact]
        public void ProcessConnectionString_ReplacesDbUser()
        {
            SetEnv("BMS_DB_USER", "alice");
            var result = _svc.ProcessConnectionString("Username={{DB_USER}};Password=x");
            result.Should().Be("Username=alice;Password=x");
        }

        [Fact]
        public void ProcessConnectionString_ReplacesDbPassword()
        {
            SetEnv("BMS_DB_PASSWORD", "s3cr3t");
            var result = _svc.ProcessConnectionString("Password={{DB_PASSWORD}};Host=x");
            result.Should().Be("Password=s3cr3t;Host=x");
        }

        [Fact]
        public void ProcessConnectionString_ReplacesAllFivePlaceholders()
        {
            SetEnv("BMS_DB_USER", "user1");
            SetEnv("BMS_DB_PASSWORD", "pass1");
            SetEnv("BMS_DB_SERVER", "db.example.com");
            SetEnv("BMS_DB_PORT", "5433");
            SetEnv("BMS_DB_NAME", "mydb");

            const string template = "Host={{DB_SERVER}};Port={{DB_PORT}};Database={{DB_NAME}};Username={{DB_USER}};Password={{DB_PASSWORD}}";
            var result = _svc.ProcessConnectionString(template);

            result.Should().Be("Host=db.example.com;Port=5433;Database=mydb;Username=user1;Password=pass1");
        }

        [Fact]
        public void ProcessConnectionString_MissingEnvVar_LeavesPlaceholderInPlace()
        {
            // Ensure env var is not set
            ClearEnv("BMS_DB_USER");
            var result = _svc.ProcessConnectionString("Username={{DB_USER}};Password=x");
            // Placeholder stays — env var missing
            result.Should().Contain("{{DB_USER}}");
        }

        [Fact]
        public void ProcessConnectionString_PartialReplace_OnlyReplacesSetVars()
        {
            SetEnv("BMS_DB_USER", "bob");
            ClearEnv("BMS_DB_PASSWORD");

            var result = _svc.ProcessConnectionString("User={{DB_USER}};Pass={{DB_PASSWORD}}");
            result.Should().Be("User=bob;Pass={{DB_PASSWORD}}");
        }

        // ── EnsureEnvironmentVariables ────────────────────────────

        [Fact]
        public void EnsureEnvironmentVariables_SetsDefaultPort_WhenMissing()
        {
            ClearEnv("BMS_DB_PORT");
            _svc.EnsureEnvironmentVariables();
            Environment.GetEnvironmentVariable("BMS_DB_PORT").Should().Be("5432");
            _setVars.Add("BMS_DB_PORT");
        }

        [Fact]
        public void EnsureEnvironmentVariables_SetsDefaultDbName_WhenMissing()
        {
            ClearEnv("BMS_DB_NAME");
            _svc.EnsureEnvironmentVariables();
            Environment.GetEnvironmentVariable("BMS_DB_NAME").Should().Be("postgres");
            _setVars.Add("BMS_DB_NAME");
        }

        [Fact]
        public void EnsureEnvironmentVariables_DoesNotOverwrite_ExistingPort()
        {
            SetEnv("BMS_DB_PORT", "5555");
            _svc.EnsureEnvironmentVariables();
            Environment.GetEnvironmentVariable("BMS_DB_PORT").Should().Be("5555");
        }

        [Fact]
        public void EnsureEnvironmentVariables_DoesNotThrow_WhenVarsMissing()
        {
            // Missing critical vars (like BMS_DB_USER) should NOT throw — just warn
            var act = () => _svc.EnsureEnvironmentVariables();
            act.Should().NotThrow();
        }

        // ── Edge Cases ────────────────────────────────────────────

        [Fact]
        public void ProcessConnectionString_PlaceholderAppearsMultipleTimes_AllReplaced()
        {
            SetEnv("BMS_DB_USER", "admin");
            var result = _svc.ProcessConnectionString("{{DB_USER}}:{{DB_USER}}@host");
            result.Should().Be("admin:admin@host");
        }

        [Fact]
        public void ProcessConnectionString_NonMatchingPlaceholders_Ignored()
        {
            // Unknown placeholder not in the mapping dictionary
            var result = _svc.ProcessConnectionString("val={{UNKNOWN_VAR}}");
            result.Should().Contain("{{UNKNOWN_VAR}}");
        }

        public void Dispose()
        {
            foreach (var key in _setVars)
                Environment.SetEnvironmentVariable(key, null);
        }
    }
}
