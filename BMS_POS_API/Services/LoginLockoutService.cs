using Microsoft.Extensions.Caching.Memory;

namespace BMS_POS_API.Services
{
    public interface ILoginLockoutService
    {
        bool IsLockedOut(string employeeId);
        void RecordFailedAttempt(string employeeId, int maxAttempts);
        void ResetAttempts(string employeeId);
        int GetFailedAttempts(string employeeId);
    }

    public class LoginLockoutService : ILoginLockoutService
    {
        private readonly IMemoryCache _cache;
        private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);
        private const string AttemptKeyPrefix = "login_attempts_";
        private const string LockoutKeyPrefix  = "login_lockout_";

        public LoginLockoutService(IMemoryCache cache)
        {
            _cache = cache;
        }

        public bool IsLockedOut(string employeeId) =>
            _cache.TryGetValue(LockoutKeyPrefix + employeeId, out _);

        public void RecordFailedAttempt(string employeeId, int maxAttempts)
        {
            var attemptsKey = AttemptKeyPrefix + employeeId;
            var attempts = _cache.GetOrCreate(attemptsKey, e =>
            {
                e.SlidingExpiration = TimeSpan.FromMinutes(30);
                return 0;
            });

            attempts++;
            _cache.Set(attemptsKey, attempts, new MemoryCacheEntryOptions
            {
                SlidingExpiration = TimeSpan.FromMinutes(30)
            });

            if (attempts >= maxAttempts)
            {
                _cache.Set(LockoutKeyPrefix + employeeId, true, LockoutDuration);
                _cache.Remove(attemptsKey);
            }
        }

        public void ResetAttempts(string employeeId)
        {
            _cache.Remove(AttemptKeyPrefix + employeeId);
            _cache.Remove(LockoutKeyPrefix + employeeId);
        }

        public int GetFailedAttempts(string employeeId) =>
            _cache.TryGetValue(AttemptKeyPrefix + employeeId, out int attempts) ? attempts : 0;
    }
}
