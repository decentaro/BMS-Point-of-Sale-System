using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;

namespace BMS_POS_API.Services
{
    /// <summary>
    /// In-memory denylist for revoked JWT tokens, keyed by JTI claim.
    /// Entries are stored with their expiry so they can be pruned automatically,
    /// preventing unbounded memory growth on long-running instances.
    /// Note: cleared on API restart — acceptable because a restart also
    /// re-issues all tokens anyway.
    /// </summary>
    public class TokenDenylistService
    {
        private readonly ConcurrentDictionary<string, DateTime> _revoked = new();

        public void Revoke(string jti, DateTime expiresAt)
        {
            _revoked[jti] = expiresAt;
            Prune();
        }

        public bool IsRevoked(string jti) =>
            _revoked.TryGetValue(jti, out var exp) && exp > DateTime.UtcNow;

        private void Prune()
        {
            var now = DateTime.UtcNow;
            foreach (var key in _revoked.Keys)
            {
                if (_revoked.TryGetValue(key, out var exp) && exp <= now)
                    _revoked.TryRemove(key, out _);
            }
        }
    }
}
