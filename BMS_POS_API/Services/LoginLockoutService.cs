using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;

namespace BMS_POS_API.Services
{
    public interface ILoginLockoutService
    {
        Task<bool> IsLockedOutAsync(string employeeId);
        Task RecordFailedAttemptAsync(string employeeId, int maxAttempts);
        Task ResetAttemptsAsync(string employeeId);
        Task<int> GetFailedAttemptsAsync(string employeeId);
    }

    /// <summary>
    /// Database-backed login lockout service. Persists failed attempt counts and
    /// lockout expiry on the Employee row so lockouts survive process restarts.
    /// For keys that don't correspond to an employee (e.g. "manager_pin_global"),
    /// falls back to an in-memory store — sufficient for brute-force protection
    /// within a process lifetime.
    /// Registered as Singleton; uses IServiceScopeFactory to access the scoped DbContext.
    /// </summary>
    public class LoginLockoutService : ILoginLockoutService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

        private readonly ConcurrentDictionary<string, (int Attempts, DateTime? LockedUntil)> _nonEmployeeStore = new();

        public LoginLockoutService(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
        }

        public async Task<bool> IsLockedOutAsync(string employeeId)
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
            var employee = await context.Employees
                .AsNoTracking()
                .FirstOrDefaultAsync(e => e.EmployeeId == employeeId);

            if (employee != null)
                return employee.LockedUntil.HasValue && employee.LockedUntil.Value > DateTime.UtcNow;

            if (_nonEmployeeStore.TryGetValue(employeeId, out var entry))
                return entry.LockedUntil.HasValue && entry.LockedUntil.Value > DateTime.UtcNow;

            return false;
        }

        public async Task RecordFailedAttemptAsync(string employeeId, int maxAttempts)
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
            var employee = await context.Employees
                .FirstOrDefaultAsync(e => e.EmployeeId == employeeId);

            if (employee != null)
            {
                employee.FailedLoginAttempts++;
                if (employee.FailedLoginAttempts >= maxAttempts)
                {
                    employee.LockedUntil = DateTime.UtcNow.Add(LockoutDuration);
                    employee.FailedLoginAttempts = 0;
                }
                await context.SaveChangesAsync();
                return;
            }

            // Non-employee key (e.g. "manager_pin_global") — use in-memory store
            _nonEmployeeStore.AddOrUpdate(
                employeeId,
                _ => (1, null),
                (_, current) =>
                {
                    var newCount = current.Attempts + 1;
                    return newCount >= maxAttempts
                        ? (0, DateTime.UtcNow.Add(LockoutDuration))
                        : (newCount, null);
                });
        }

        public async Task ResetAttemptsAsync(string employeeId)
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
            var employee = await context.Employees
                .FirstOrDefaultAsync(e => e.EmployeeId == employeeId);

            if (employee != null)
            {
                employee.FailedLoginAttempts = 0;
                employee.LockedUntil = null;
                await context.SaveChangesAsync();
                return;
            }

            _nonEmployeeStore.TryRemove(employeeId, out _);
        }

        public async Task<int> GetFailedAttemptsAsync(string employeeId)
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
            var employee = await context.Employees
                .AsNoTracking()
                .FirstOrDefaultAsync(e => e.EmployeeId == employeeId);

            if (employee != null)
                return employee.FailedLoginAttempts;

            return _nonEmployeeStore.TryGetValue(employeeId, out var entry) ? entry.Attempts : 0;
        }
    }
}
