using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;
using FluentAssertions;

namespace BMS_POS_API.Tests.Services
{
    /// <summary>
    /// Unit tests for LoginLockoutService using InMemory database.
    /// The DbContext is registered as singleton so all scopes share the same
    /// instance — identical to how TestBase works in this project.
    /// </summary>
    public class LoginLockoutServiceTests : IDisposable
    {
        private readonly ServiceProvider _serviceProvider;
        private readonly LoginLockoutService _svc;
        private readonly BmsPosDbContext _ctx;

        public LoginLockoutServiceTests()
        {
            var options = new DbContextOptionsBuilder<BmsPosDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options;

            _ctx = new BmsPosDbContext(options);

            // Register the same instance for all scopes (TestBase pattern)
            var services = new ServiceCollection();
            services.AddSingleton(_ => _ctx);
            _serviceProvider = services.BuildServiceProvider();

            _svc = new LoginLockoutService(_serviceProvider.GetRequiredService<IServiceScopeFactory>());

            // Seed employees
            _ctx.Employees.AddRange(
                new Employee { Id = 1, EmployeeId = "EMP001", Pin = "1234", Name = "Alice", Role = "Cashier", IsManager = false, IsActive = true, CreatedDate = DateTime.UtcNow },
                new Employee { Id = 2, EmployeeId = "EMP002", Pin = "5678", Name = "Bob", Role = "Manager", IsManager = true, IsActive = true, CreatedDate = DateTime.UtcNow }
            );
            _ctx.SaveChanges();
        }

        // ── Happy Path ────────────────────────────────────────────

        [Fact]
        public async Task IsLockedOutAsync_FreshEmployee_ReturnsFalse()
        {
            var result = await _svc.IsLockedOutAsync("EMP001");
            result.Should().BeFalse();
        }

        [Fact]
        public async Task GetFailedAttemptsAsync_FreshEmployee_ReturnsZero()
        {
            var attempts = await _svc.GetFailedAttemptsAsync("EMP001");
            attempts.Should().Be(0);
        }

        [Fact]
        public async Task RecordFailedAttemptAsync_IncrementCount()
        {
            await _svc.RecordFailedAttemptAsync("EMP001", maxAttempts: 5);
            var attempts = await _svc.GetFailedAttemptsAsync("EMP001");
            attempts.Should().Be(1);
        }

        [Fact]
        public async Task RecordFailedAttemptAsync_ReachesMaxAttempts_LocksAccount()
        {
            for (int i = 0; i < 5; i++)
                await _svc.RecordFailedAttemptAsync("EMP001", maxAttempts: 5);

            var locked = await _svc.IsLockedOutAsync("EMP001");
            locked.Should().BeTrue();
        }

        [Fact]
        public async Task RecordFailedAttemptAsync_LockedAccount_ResetsAttemptCounter()
        {
            // After lockout triggers, FailedLoginAttempts resets to 0
            for (int i = 0; i < 5; i++)
                await _svc.RecordFailedAttemptAsync("EMP001", maxAttempts: 5);

            var attempts = await _svc.GetFailedAttemptsAsync("EMP001");
            attempts.Should().Be(0);
        }

        [Fact]
        public async Task ResetAttemptsAsync_ClearsCountAndLockout()
        {
            // Lock the account
            for (int i = 0; i < 5; i++)
                await _svc.RecordFailedAttemptAsync("EMP001", maxAttempts: 5);

            await _svc.ResetAttemptsAsync("EMP001");

            (await _svc.IsLockedOutAsync("EMP001")).Should().BeFalse();
            (await _svc.GetFailedAttemptsAsync("EMP001")).Should().Be(0);
        }

        [Fact]
        public async Task ResetAttemptsAsync_AlsoRemovesLockedUntil()
        {
            for (int i = 0; i < 3; i++)
                await _svc.RecordFailedAttemptAsync("EMP001", maxAttempts: 3);

            (await _svc.IsLockedOutAsync("EMP001")).Should().BeTrue();

            await _svc.ResetAttemptsAsync("EMP001");
            (await _svc.IsLockedOutAsync("EMP001")).Should().BeFalse();
        }

        // ── Edge Cases ────────────────────────────────────────────

        [Fact]
        public async Task RecordFailedAttemptAsync_UnknownEmployeeId_NoException()
        {
            var act = () => _svc.RecordFailedAttemptAsync("NOBODY", maxAttempts: 5);
            await act.Should().NotThrowAsync();
        }

        [Fact]
        public async Task IsLockedOutAsync_UnknownEmployeeId_ReturnsFalse()
        {
            var result = await _svc.IsLockedOutAsync("NOBODY");
            result.Should().BeFalse();
        }

        [Fact]
        public async Task GetFailedAttemptsAsync_UnknownEmployeeId_ReturnsZero()
        {
            var result = await _svc.GetFailedAttemptsAsync("NOBODY");
            result.Should().Be(0);
        }

        [Fact]
        public async Task ResetAttemptsAsync_UnknownEmployeeId_NoException()
        {
            var act = () => _svc.ResetAttemptsAsync("NOBODY");
            await act.Should().NotThrowAsync();
        }

        [Fact]
        public async Task IsLockedOutAsync_LockedUntilInPast_ReturnsFalse()
        {
            // Manually set an expired lockout
            var emp = await _ctx.Employees.FirstAsync(e => e.EmployeeId == "EMP001");
            emp.LockedUntil = DateTime.UtcNow.AddMinutes(-1); // expired
            await _ctx.SaveChangesAsync();

            var locked = await _svc.IsLockedOutAsync("EMP001");
            locked.Should().BeFalse();
        }

        [Fact]
        public async Task RecordFailedAttemptAsync_MaxAttempts1_LocksOnFirstFailure()
        {
            await _svc.RecordFailedAttemptAsync("EMP001", maxAttempts: 1);
            (await _svc.IsLockedOutAsync("EMP001")).Should().BeTrue();
        }

        [Fact]
        public async Task IndependentEmployees_LockoutDoesNotCrossContaminate()
        {
            for (int i = 0; i < 5; i++)
                await _svc.RecordFailedAttemptAsync("EMP001", maxAttempts: 5);

            (await _svc.IsLockedOutAsync("EMP001")).Should().BeTrue();
            (await _svc.IsLockedOutAsync("EMP002")).Should().BeFalse();
        }

        // ── Rare Edge Cases ───────────────────────────────────────

        [Fact]
        public async Task LockoutDuration_IsApproximately15Minutes()
        {
            for (int i = 0; i < 5; i++)
                await _svc.RecordFailedAttemptAsync("EMP001", maxAttempts: 5);

            var emp = await _ctx.Employees.AsNoTracking().FirstAsync(e => e.EmployeeId == "EMP001");

            emp.LockedUntil.Should().NotBeNull();
            var duration = emp.LockedUntil!.Value - DateTime.UtcNow;
            duration.Should().BeCloseTo(TimeSpan.FromMinutes(15), TimeSpan.FromSeconds(5));
        }

        public void Dispose()
        {
            _ctx?.Dispose();
            _serviceProvider?.Dispose();
        }
    }
}
