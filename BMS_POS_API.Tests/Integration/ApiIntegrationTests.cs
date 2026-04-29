using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Text;
using System.Text.Json;
using Xunit;
using BMS_POS_API.Data;
using BMS_POS_API.Models;

namespace BMS_POS_API.Tests.Integration
{
    public class ApiIntegrationTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
    {
        private readonly WebApplicationFactory<Program> _factory;
        private readonly HttpClient _client;

        public ApiIntegrationTests(WebApplicationFactory<Program> factory)
        {
            _factory = factory.WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    // Remove all DbContext related services
                    var dbContextServices = services.Where(s => s.ServiceType == typeof(DbContextOptions<BmsPosDbContext>) ||
                                                                s.ServiceType == typeof(DbContextOptions) ||
                                                                s.ServiceType == typeof(BmsPosDbContext)).ToList();
                    foreach (var service in dbContextServices)
                    {
                        services.Remove(service);
                    }

                    // Remove the EF Core IDbContextOptionsConfiguration<BmsPosDbContext> registered by
                    // Program.cs's AddDbContext call. That lambda creates a NpgsqlConnectionStringBuilder
                    // that reads BMS_DB_PORT at request time — causing an ArgumentException (→ 400) if a
                    // parallel test has temporarily cleared that env var.
                    var optionsConfigs = services
                        .Where(s => s.ServiceType == typeof(IDbContextOptionsConfiguration<BmsPosDbContext>))
                        .ToList();
                    foreach (var s in optionsConfigs)
                        services.Remove(s);

                    // Remove all health check related services (including hosted publisher)
                    // then re-add a simple no-DB health check for tests
                    var healthCheckServices = services.Where(s =>
                        s.ServiceType.FullName?.Contains("HealthCheck") == true ||
                        s.ImplementationType?.FullName?.Contains("HealthCheck") == true).ToList();
                    foreach (var service in healthCheckServices)
                    {
                        services.Remove(service);
                    }
                    services.AddHealthChecks();

                    // Unique DB name per test instance prevents the shared in-memory store
                    // from being accessed by conflicting EF Core service providers when all
                    // test instances are created concurrently by xUnit.
                    // UseInternalServiceProvider is required to avoid the Npgsql/InMemory
                    // double-provider conflict in the global EF Core service provider.
                    var dbName = $"InMemoryDb_{Guid.NewGuid():N}";
                    var inMemoryProvider = new ServiceCollection()
                        .AddEntityFrameworkInMemoryDatabase()
                        .BuildServiceProvider();

                    services.AddDbContext<BmsPosDbContext>(options =>
                    {
                        options.UseInMemoryDatabase(dbName);
                        options.UseInternalServiceProvider(inMemoryProvider);
                    });

                    // Build service provider and seed the database
                    var sp = services.BuildServiceProvider();
                    using var scope = sp.CreateScope();
                    var context = scope.ServiceProvider.GetRequiredService<BmsPosDbContext>();
                    SeedTestData(context);
                });
            });

            _client = _factory.CreateClient();

            // Obtain a JWT token and attach it to all subsequent requests
            var loginJson = JsonSerializer.Serialize(new { EmployeeId = "TEST001", Pin = "123456", SelectedRole = "Manager" });
            var loginContent = new StringContent(loginJson, Encoding.UTF8, "application/json");
            var loginResponse = _client.PostAsync("/api/auth/login", loginContent).GetAwaiter().GetResult();
            if (loginResponse.IsSuccessStatusCode)
            {
                var loginBody = loginResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                var loginDoc = JsonDocument.Parse(loginBody);
                if (loginDoc.RootElement.TryGetProperty("data", out var data) &&
                    data.TryGetProperty("token", out var tokenEl))
                {
                    _client.DefaultRequestHeaders.Authorization =
                        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", tokenEl.GetString());
                }
            }
        }

        private void SeedTestData(BmsPosDbContext context)
        {
            // Clear existing data
            context.UserActivities.RemoveRange(context.UserActivities);
            context.Products.RemoveRange(context.Products);
            context.Employees.RemoveRange(context.Employees);
            context.SystemSettings.RemoveRange(context.SystemSettings);
            context.SaveChanges();

            // Add test employees
            context.Employees.AddRange(
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
                }
            );

            // Add test products
            context.Products.AddRange(
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

            // Add test system settings — only fields that exist in the current model
            context.SystemSettings.Add(new SystemSettings
            {
                Id = 1,
                DateFormat = "MM/DD/YYYY",
                Theme = "light",
                AutoLogoutMinutes = 30,
                CreatedDate = DateTime.UtcNow
            });

            context.SaveChanges();
        }

        [Fact]
        public async Task HealthCheck_ReturnsHealthy()
        {
            // Act
            var response = await _client.GetAsync("/health");

            // Assert
            response.EnsureSuccessStatusCode();
            var content = await response.Content.ReadAsStringAsync();
            Assert.Equal("Healthy", content);
        }

        [Fact]
        public async Task HealthCheckLive_ReturnsHealthy()
        {
            // Act
            var response = await _client.GetAsync("/health/live");

            // Assert
            response.EnsureSuccessStatusCode();
            var content = await response.Content.ReadAsStringAsync();
            Assert.Equal("Healthy", content);
        }

        [Fact]
        public async Task HealthCheckReady_ReturnsHealthy()
        {
            // Act
            var response = await _client.GetAsync("/health/ready");

            // Assert
            response.EnsureSuccessStatusCode();
            var content = await response.Content.ReadAsStringAsync();
            Assert.Equal("Healthy", content);
        }

        [Fact]
        public async Task AuthLogin_WithValidCredentials_ReturnsOk()
        {
            // Arrange
            var loginRequest = new { EmployeeId = "TEST001", Pin = "123456" };
            var json = JsonSerializer.Serialize(loginRequest);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            // Act
            var response = await _client.PostAsync("/api/auth/login", content);

            // Assert
            response.EnsureSuccessStatusCode();
            var responseContent = await response.Content.ReadAsStringAsync();
            Assert.NotEmpty(responseContent);

            // Verify response contains expected data (wrapped in ApiResponse<LoginResponse>)
            var responseJson = JsonDocument.Parse(responseContent);
            Assert.True(responseJson.RootElement.TryGetProperty("data", out var dataProperty));
            Assert.True(dataProperty.TryGetProperty("employee", out var employeeProperty));
            Assert.True(employeeProperty.TryGetProperty("name", out var nameProperty));
            Assert.Equal("Test Manager", nameProperty.GetString());
        }

        [Fact]
        public async Task AuthLogin_WithInvalidCredentials_ReturnsUnauthorized()
        {
            // Arrange
            var loginRequest = new { EmployeeId = "INVALID", Pin = "000000" };
            var json = JsonSerializer.Serialize(loginRequest);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            // Act
            var response = await _client.PostAsync("/api/auth/login", content);

            // Assert
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        [Fact]
        public async Task GetEmployees_ReturnsEmployeesList()
        {
            // Act
            var response = await _client.GetAsync("/api/employees");

            // Assert
            response.EnsureSuccessStatusCode();
            var content = await response.Content.ReadAsStringAsync();
            var employees = JsonSerializer.Deserialize<JsonElement[]>(content)!;

            Assert.Equal(2, employees.Length);
            Assert.Contains(employees, e => 
                e.TryGetProperty("employeeId", out var id) && 
                id.GetString() == "TEST001");
        }

        [Fact]
        public async Task GetEmployee_WithValidId_ReturnsEmployee()
        {
            // Act
            var response = await _client.GetAsync("/api/employees/1");

            // Assert
            response.EnsureSuccessStatusCode();
            var content = await response.Content.ReadAsStringAsync();
            var employee = JsonSerializer.Deserialize<JsonElement>(content);
            
            Assert.True(employee.TryGetProperty("employeeId", out var idProperty));
            Assert.Equal("TEST001", idProperty.GetString());
        }

        [Fact]
        public async Task GetEmployee_WithInvalidId_ReturnsNotFound()
        {
            // Act
            var response = await _client.GetAsync("/api/employees/999");

            // Assert
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        [Fact]
        public async Task CreateEmployee_WithValidData_ReturnsCreated()
        {
            // Arrange
            var newEmployee = new
            {
                EmployeeId = "TEST003",
                Pin = "111222",
                Name = "Integration Test Employee",
                Role = "Inventory",
                IsManager = false
            };
            var json = JsonSerializer.Serialize(newEmployee);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            // Act
            var response = await _client.PostAsync("/api/employees", content);

            // Assert
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var responseContent = await response.Content.ReadAsStringAsync();
            var employee = JsonSerializer.Deserialize<JsonElement>(responseContent);
            
            Assert.True(employee.TryGetProperty("employeeId", out var idProperty));
            Assert.Equal("TEST003", idProperty.GetString());
        }

        [Fact]
        public async Task GetProducts_ReturnsProductsList()
        {
            // Act
            var response = await _client.GetAsync("/api/products");

            // Assert
            response.EnsureSuccessStatusCode();
            var content = await response.Content.ReadAsStringAsync();
            var products = JsonSerializer.Deserialize<JsonElement[]>(content)!;

            Assert.Equal(2, products.Length);
            Assert.Contains(products, p => 
                p.TryGetProperty("barcode", out var barcode) && 
                barcode.GetString() == "TEST123456");
        }

        [Fact]
        public async Task GetProduct_WithValidId_ReturnsProduct()
        {
            // Act
            var response = await _client.GetAsync("/api/products/1");

            // Assert
            response.EnsureSuccessStatusCode();
            var content = await response.Content.ReadAsStringAsync();
            var product = JsonSerializer.Deserialize<JsonElement>(content);
            
            Assert.True(product.TryGetProperty("barcode", out var barcodeProperty));
            Assert.Equal("TEST123456", barcodeProperty.GetString());
        }

        [Fact]
        public async Task CreateProduct_WithValidData_ReturnsCreated()
        {
            // Arrange
            var newProduct = new
            {
                Barcode = "INTTEST001",
                Name = "Integration Test Product",
                Price = 15.99m,
                Cost = 8.00m,
                StockQuantity = 75,
                MinStockLevel = 15,
                Unit = "pcs",
                IsActive = true
            };
            var json = JsonSerializer.Serialize(newProduct);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            // Act
            var response = await _client.PostAsync("/api/products", content);

            // Assert
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var responseContent = await response.Content.ReadAsStringAsync();
            var product = JsonSerializer.Deserialize<JsonElement>(responseContent);
            
            Assert.True(product.TryGetProperty("barcode", out var barcodeProperty));
            Assert.Equal("INTTEST001", barcodeProperty.GetString());
        }

        [Fact]
        public async Task GetSystemSettings_ReturnsSettings()
        {
            // Act
            var response = await _client.GetAsync("/api/system-settings");

            // Assert
            response.EnsureSuccessStatusCode();
            var content = await response.Content.ReadAsStringAsync();
            var settings = JsonSerializer.Deserialize<JsonElement>(content);
            
            Assert.True(settings.TryGetProperty("dateFormat", out var dateFormatProperty));
            Assert.Equal("MM/DD/YYYY", dateFormatProperty.GetString());
        }

        [Fact]
        public async Task ApiEndpoints_HandleInvalidJson_ReturnsBadRequest()
        {
            // Arrange
            var invalidJson = "{ invalid json }";
            var content = new StringContent(invalidJson, Encoding.UTF8, "application/json");

            // Act
            var response = await _client.PostAsync("/api/auth/login", content);

            // Assert
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task ApiEndpoints_HandleEmptyBody_ReturnsBadRequest()
        {
            // Arrange
            var content = new StringContent("", Encoding.UTF8, "application/json");

            // Act
            var response = await _client.PostAsync("/api/auth/login", content);

            // Assert
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        public void Dispose()
        {
            _client?.Dispose();
        }
    }
}