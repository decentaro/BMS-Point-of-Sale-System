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
    /// Registered as Singleton; uses IServiceScopeFactory to access the scoped DbContext.
    /// </summary>
    public class LoginLockoutService : ILoginLockoutService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

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

            return employee?.LockedUntil.HasValue == true
                   && employee.LockedUntil.Value > DateTime.UtcNow;
        }

        public async Task RecordFailedAttemptAsync(string employeeId, int maxAttempts)
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
            var employee = await context.Employees
                .FirstOrDefaultAsync(e => e.EmployeeId == employeeId);

            if (employee == null) return;

            employee.FailedLoginAttempts++;

            if (employee.FailedLoginAttempts >= maxAttempts)
            {
                employee.LockedUntil = DateTime.UtcNow.Add(LockoutDuration);
                employee.FailedLoginAttempts = 0;
            }

            await context.SaveChangesAsync();
        }

        public async Task ResetAttemptsAsync(string employeeId)
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
            var employee = await context.Employees
                .FirstOrDefaultAsync(e => e.EmployeeId == employeeId);

            if (employee == null) return;

            employee.FailedLoginAttempts = 0;
            employee.LockedUntil = null;
            await context.SaveChangesAsync();
        }

        public async Task<int> GetFailedAttemptsAsync(string employeeId)
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
            var employee = await context.Employees
                .AsNoTracking()
                .FirstOrDefaultAsync(e => e.EmployeeId == employeeId);

            return employee?.FailedLoginAttempts ?? 0;
        }
    }
}
