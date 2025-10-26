using Microsoft.EntityFrameworkCore;
using BMS_POS_API.Data;
using BMS_POS_API.Models;
using BMS_POS_API.Services;
using Microsoft.Extensions.DependencyInjection;

namespace BMS_POS_API.Tests
{
    public class TestBase : IDisposable
    {
        protected BmsPosDbContext Context { get; private set; }
        protected IUserActivityService UserActivityService { get; private set; }
        protected IServiceProvider ServiceProvider { get; private set; }

        public TestBase()
        {
            // Create in-memory database for testing
            var options = new DbContextOptionsBuilder<BmsPosDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;

            Context = new BmsPosDbContext(options);

            // Create service collection and configure services
            var services = new ServiceCollection();
            services.AddScoped(_ => Context);
            ServiceProvider = services.BuildServiceProvider();

            // Create real UserActivityService with service provider
            UserActivityService = new UserActivityService(ServiceProvider);

            SeedDatabase();
        }

        protected virtual void SeedDatabase()
        {
            // Add test employees
            Context.Employees.AddRange(
                new Employee
                {
                    Id = 1,
                    EmployeeId = "TEST001",
                    Pin = "123456",
                    Name = "Test Manager",
                    Role = "Manager",
                    IsManager = true,
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
                    CreatedDate = DateTime.UtcNow
                }
            );

            // Add test products
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

            // Add test system settings
            Context.SystemSettings.Add(new SystemSettings
            {
                Id = 1,
                Currency = "₱",
                CurrencyCode = "PHP",
                DateFormat = "MM/DD/YYYY",
                TimeZone = "UTC",
                Theme = "light",
                Language = "en",
                AutoLogoutMinutes = 30,
                CreatedDate = DateTime.UtcNow
            });

            Context.SaveChanges();
        }

        public virtual void Dispose()
        {
            Context?.Dispose();
            if (ServiceProvider is IDisposable disposableProvider)
            {
                disposableProvider.Dispose();
            }
        }
    }
}