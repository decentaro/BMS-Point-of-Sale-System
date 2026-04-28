using BMS_POS_API.Services;
using FluentAssertions;

namespace BMS_POS_API.Tests.Services
{
    public class TokenDenylistServiceTests
    {
        private TokenDenylistService New() => new TokenDenylistService();

        // ── Happy Path ────────────────────────────────────────────

        [Fact]
        public void IsRevoked_UnknownJti_ReturnsFalse()
        {
            var svc = New();
            svc.IsRevoked("unknown-jti").Should().BeFalse();
        }

        [Fact]
        public void Revoke_ThenIsRevoked_ReturnsTrue()
        {
            var svc = New();
            var jti = Guid.NewGuid().ToString();
            svc.Revoke(jti, DateTime.UtcNow.AddHours(1));
            svc.IsRevoked(jti).Should().BeTrue();
        }

        [Fact]
        public void IsRevoked_ExpiredEntry_ReturnsFalse()
        {
            var svc = New();
            var jti = Guid.NewGuid().ToString();
            // Expire immediately in the past
            svc.Revoke(jti, DateTime.UtcNow.AddSeconds(-1));
            svc.IsRevoked(jti).Should().BeFalse();
        }

        [Fact]
        public void Revoke_MultipleJtis_AllRevoked()
        {
            var svc = New();
            var jtis = Enumerable.Range(0, 5).Select(_ => Guid.NewGuid().ToString()).ToList();
            var expiry = DateTime.UtcNow.AddHours(1);

            foreach (var jti in jtis)
                svc.Revoke(jti, expiry);

            foreach (var jti in jtis)
                svc.IsRevoked(jti).Should().BeTrue($"jti {jti} should be revoked");
        }

        [Fact]
        public void Revoke_SameJtiTwice_StillRevoked()
        {
            var svc = New();
            var jti = "duplicate-jti";
            svc.Revoke(jti, DateTime.UtcNow.AddHours(1));
            svc.Revoke(jti, DateTime.UtcNow.AddHours(2)); // overwrite
            svc.IsRevoked(jti).Should().BeTrue();
        }

        // ── Prune behaviour ───────────────────────────────────────

        [Fact]
        public void Revoke_PrunesExpiredEntries_OnNextRevoke()
        {
            var svc = New();

            // Add an already-expired entry
            svc.Revoke("expired-jti", DateTime.UtcNow.AddSeconds(-1));
            svc.IsRevoked("expired-jti").Should().BeFalse();

            // Add a fresh entry — this triggers Prune()
            var freshJti = "fresh-jti";
            svc.Revoke(freshJti, DateTime.UtcNow.AddHours(1));

            // Fresh entry should still be revoked
            svc.IsRevoked(freshJti).Should().BeTrue();
            // Expired entry should still return false (it was pruned or expired)
            svc.IsRevoked("expired-jti").Should().BeFalse();
        }

        [Fact]
        public void Prune_DoesNotRemoveActiveEntries()
        {
            var svc = New();
            var activeJti = "active-jti";
            svc.Revoke(activeJti, DateTime.UtcNow.AddHours(1));

            // Trigger prune by adding more entries
            for (int i = 0; i < 5; i++)
                svc.Revoke($"expired-{i}", DateTime.UtcNow.AddSeconds(-1));

            // Trigger another prune
            svc.Revoke("trigger-prune", DateTime.UtcNow.AddHours(1));

            svc.IsRevoked(activeJti).Should().BeTrue();
        }

        // ── Edge Cases ────────────────────────────────────────────

        [Fact]
        public void IsRevoked_ExpiresExactlyNow_ReturnsFalse()
        {
            var svc = New();
            var jti = Guid.NewGuid().ToString();
            // Set expiry to past to ensure it's expired
            svc.Revoke(jti, DateTime.UtcNow.AddMilliseconds(-1));
            svc.IsRevoked(jti).Should().BeFalse();
        }

        [Fact]
        public void Revoke_EmptyStringJti_Works()
        {
            var svc = New();
            svc.Revoke("", DateTime.UtcNow.AddHours(1));
            svc.IsRevoked("").Should().BeTrue();
        }

        [Fact]
        public async Task Revoke_ConcurrentAccess_ThreadSafe()
        {
            var svc = New();
            var expiry = DateTime.UtcNow.AddHours(1);

            var tasks = Enumerable.Range(0, 50).Select(i => Task.Run(() =>
            {
                var jti = $"jti-{i}";
                svc.Revoke(jti, expiry);
                _ = svc.IsRevoked(jti);
            }));

            await Task.WhenAll(tasks);
            // No exceptions thrown = thread-safe
        }

        // ── Rare Edge Cases ───────────────────────────────────────

        [Fact]
        public void IsRevoked_MaxDateTimeExpiry_ReturnsTrue()
        {
            var svc = New();
            var jti = "long-lived-jti";
            svc.Revoke(jti, DateTime.MaxValue);
            svc.IsRevoked(jti).Should().BeTrue();
        }

        [Fact]
        public void Revoke_LargeNumberOfEntries_NoException()
        {
            var svc = New();
            var expiry = DateTime.UtcNow.AddHours(1);

            // Add 1000 entries
            for (int i = 0; i < 1000; i++)
                svc.Revoke($"jti-{i}", expiry);

            // All should be revoked
            svc.IsRevoked("jti-0").Should().BeTrue();
            svc.IsRevoked("jti-999").Should().BeTrue();
        }

        [Fact]
        public void Revoke_OverwriteExpiredWithActive_BecomesRevoked()
        {
            var svc = New();
            var jti = "reuse-jti";

            // First revoke with expired time
            svc.Revoke(jti, DateTime.UtcNow.AddSeconds(-1));
            svc.IsRevoked(jti).Should().BeFalse();

            // Re-revoke with future time
            svc.Revoke(jti, DateTime.UtcNow.AddHours(1));
            svc.IsRevoked(jti).Should().BeTrue();
        }
    }
}
