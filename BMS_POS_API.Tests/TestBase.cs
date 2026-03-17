using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace BMS_POS_API.Tests
{
    public class TestBase : IDisposable
    {
        protected BmsPosDbContext Context { get; private set; }
        protected IUserActivityService UserActivityService { get; private set; }
        protected IPinSecurityService PinSecurityService { get; private set; }
        protected Mock<IMetricsService> MockMetricsService { get; private set; }
        protected Mock<ILoginLockoutService> MockLockoutService { get; private set; }
        protected JwtSecretHolder JwtSecretHolder { get; private set; }
        protected IServiceProvider ServiceProvider { get; private set; }

        public TestBase()
        {
            var options = new DbContextOptionsBuilder<BmsPosDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;

            Context = new BmsPosDbContext(options);

            var services = new ServiceCollection();
            services.AddSingleton(_ => Context);
            ServiceProvider = services.BuildServiceProvider();

            // Real implementations — no external dependencies
            UserActivityService = new UserActivityService(ServiceProvider);
            PinSecurityService = new PinSecurityService();
            JwtSecretHolder = new JwtSecretHolder();

            // Mocked services — tests verify controller behaviour, not service internals
            MockMetricsService = new Mock<IMetricsService>();
            MockMetricsService.Setup(m => m.LogLoginAttempt(It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<string>()))
                              .Returns(Task.CompletedTask);
            MockMetricsService.Setup(m => m.LogTransaction(It.IsAny<decimal>(), It.IsAny<string>(), It.IsAny<int>()))
                              .Returns(Task.CompletedTask);
            MockMetricsService.Setup(m => m.LogSystemEvent(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>()))
                              .Returns(Task.CompletedTask);

            MockLockoutService = new Mock<ILoginLockoutService>();
            MockLockoutService.Setup(l => l.IsLockedOutAsync(It.IsAny<string>())).ReturnsAsync(false);
            MockLockoutService.Setup(l => l.RecordFailedAttemptAsync(It.IsAny<string>(), It.IsAny<int>())).Returns(Task.CompletedTask);
            MockLockoutService.Setup(l => l.ResetAttemptsAsync(It.IsAny<string>())).Returns(Task.CompletedTask);
            MockLockoutService.Setup(l => l.GetFailedAttemptsAsync(It.IsAny<string>())).ReturnsAsync(0);

            SeedDatabase();
        }

        protected virtual void SeedDatabase()
        {
            Context.Employees.AddRange(
                new Employee
                {
                    Id = 1,
                    EmployeeId = "TEST001",
                    Pin = "123456",
                    Name = "Test Manager",
                    Role = "Manager",
                    IsManager = true,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                },
                new Employee
                {
                    Id = 2,
                    EmployeeId = "TEST002",
                    Pin = "654321",
                    Name = "Test Cashier",
                    Role = "Cashier",
                    IsManager = false,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                },
                new Employee
                {
                    Id = 3,
                    EmployeeId = "TEST003",
                    Pin = "999888",
                    Name = "Test Inventory",
                    Role = "Inventory",
                    IsManager = false,
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                }
            );

            Context.Products.AddRange(
                new Product
                {
                    Id = 1,
                    Barcode = "TEST123456",
                    Name = "Test Product 1",
                    Price = 10.99m,
                    Cost = 5.50m,
                    StockQuantity = 100,
                    MinStockLevel = 10,
                    Unit = "pcs",
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                },
                new Product
                {
                    Id = 2,
                    Barcode = "TEST789012",
                    Name = "Test Product 2",
                    Price = 25.00m,
                    Cost = 15.00m,
                    StockQuantity = 50,
                    MinStockLevel = 5,
                    Unit = "pcs",
                    IsActive = true,
                    CreatedDate = DateTime.UtcNow
                }
            );

            // Seed only fields that exist in the current SystemSettings model
            Context.SystemSettings.Add(new SystemSettings
            {
                Id = 1,
                DateFormat = "MM/DD/YYYY",
                Theme = "light",
                AutoLogoutMinutes = 30,
                CreatedDate = DateTime.UtcNow
            });

            Context.SaveChanges();
        }

        public virtual void Dispose()
        {
            Context?.Dispose();
            if (ServiceProvider is IDisposable disposableProvider)
                disposableProvider.Dispose();
        }
    }
}
