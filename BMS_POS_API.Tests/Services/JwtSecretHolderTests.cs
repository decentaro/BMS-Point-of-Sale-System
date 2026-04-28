using System.Security.Cryptography;
using BMS_POS_API.Services;
using FluentAssertions;

namespace BMS_POS_API.Tests.Services
{
    public class JwtSecretHolderTests : IDisposable
    {
        // Each test gets its own temp dir — no env-var tricks, no real AppData pollution.
        private readonly string _tempDir;

        public JwtSecretHolderTests()
        {
            _tempDir = Path.Combine(Path.GetTempPath(), $"bms_jwt_test_{Guid.NewGuid():N}");
            Directory.CreateDirectory(_tempDir);
        }

        // ── Happy Path ────────────────────────────────────────────

        [Fact]
        public void Secret_IsNotNullOrEmpty()
        {
            var holder = new JwtSecretHolder(_tempDir);
            holder.Secret.Should().NotBeNullOrWhiteSpace();
        }

        [Fact]
        public void Secret_IsAtLeast64CharactersLong()
        {
            var holder = new JwtSecretHolder(_tempDir);
            // 64 bytes → 88 base64 chars
            holder.Secret.Should().HaveLength(88);
        }

        [Fact]
        public void Secret_IsValidBase64()
        {
            var holder = new JwtSecretHolder(_tempDir);
            var act = () => Convert.FromBase64String(holder.Secret);
            act.Should().NotThrow();
        }

        [Fact]
        public void Secret_IsUnique_AcrossTwoNewInstances()
        {
            // Two independent instances with different temp dirs get different secrets
            var dir1 = Path.Combine(Path.GetTempPath(), $"bms1_{Guid.NewGuid():N}");
            var dir2 = Path.Combine(Path.GetTempPath(), $"bms2_{Guid.NewGuid():N}");
            Directory.CreateDirectory(dir1);
            Directory.CreateDirectory(dir2);

            try
            {
                var s1 = new JwtSecretHolder(dir1).Secret;
                var s2 = new JwtSecretHolder(dir2).Secret;

                s1.Should().NotBe(s2);
            }
            finally
            {
                Directory.Delete(dir1, true);
                Directory.Delete(dir2, true);
            }
        }

        [Fact]
        public void Secret_PersistsAcrossInstances_SameDir()
        {
            // First instance creates the file
            var s1 = new JwtSecretHolder(_tempDir).Secret;

            // Second instance should load from same file
            var s2 = new JwtSecretHolder(_tempDir).Secret;

            s1.Should().Be(s2);
        }

        [Fact]
        public void Secret_WhenFileExists_LoadsExistingSecret()
        {
            var secretPath = Path.Combine(_tempDir, "bms-jwt.secret");
            var knownSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
            File.WriteAllText(secretPath, knownSecret);

            var holder = new JwtSecretHolder(_tempDir);
            holder.Secret.Should().Be(knownSecret);
        }

        // ── Edge Cases ────────────────────────────────────────────

        [Fact]
        public void Secret_WhenStoredSecretTooShort_Regenerates()
        {
            File.WriteAllText(Path.Combine(_tempDir, "bms-jwt.secret"), "short");

            var holder = new JwtSecretHolder(_tempDir);
            // Should generate a new one (not return "short")
            holder.Secret.Should().NotBe("short");
            holder.Secret.Length.Should().BeGreaterThanOrEqualTo(64);
        }

        [Fact]
        public void Secret_WhenStoredSecretHasWhitespace_TrimsAndLoads()
        {
            var validSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
            // Write with surrounding whitespace (e.g., trailing newline)
            File.WriteAllText(Path.Combine(_tempDir, "bms-jwt.secret"), $"  {validSecret}  \n");

            var holder = new JwtSecretHolder(_tempDir);
            holder.Secret.Should().Be(validSecret);
        }

        [Fact]
        public void Secret_WhenDirectoryUnwritable_FallsBackToEphemeral()
        {
            // Pass a path that cannot be created (reserved system path)
            var holder = new JwtSecretHolder("/proc/no_such_dir_xyzzy");
            // Should still produce a valid secret (ephemeral fallback)
            holder.Secret.Should().NotBeNullOrWhiteSpace();
            holder.Secret.Length.Should().BeGreaterThanOrEqualTo(64);
        }

        // ── Rare Edge Cases ───────────────────────────────────────

        [Fact]
        public void TwoEphemeralSecrets_AreDifferent()
        {
            // Both point to unwritable paths — should get different ephemeral secrets
            var s1 = new JwtSecretHolder("/proc/no_such_1_xyzzy").Secret;
            var s2 = new JwtSecretHolder("/proc/no_such_2_xyzzy").Secret;

            s1.Should().NotBe(s2);
        }

        [Fact]
        public void SecretContains_SufficientEntropy()
        {
            // 64 bytes of random data → 88 base64 chars. Verify it decodes to 64 bytes.
            var holder = new JwtSecretHolder(_tempDir);
            var bytes = Convert.FromBase64String(holder.Secret);
            bytes.Length.Should().Be(64);
        }

        public void Dispose()
        {
            if (Directory.Exists(_tempDir))
                Directory.Delete(_tempDir, true);
        }
    }
}
