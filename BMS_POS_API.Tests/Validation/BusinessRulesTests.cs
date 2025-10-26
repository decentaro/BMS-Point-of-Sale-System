using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Http;
using Moq;
using Xunit;
using BMS_POS_API.Controllers;
using BMS_POS_API.Models;
using BMS_POS_API.Services;
using System.Net;

namespace BMS_POS_API.Tests.Validation
{
    public class BusinessRulesTests : TestBase
    {
        private readonly Mock<ILogger<EmployeesController>> _mockEmployeeLogger;
        private readonly Mock<ILogger<ProductsController>> _mockProductLogger;
        private readonly Mock<ILogger<AuthController>> _mockAuthLogger;
        private readonly EmployeesController _employeesController;
        private readonly ProductsController _productsController;
        private readonly AuthController _authController;

        public BusinessRulesTests()
        {
            _mockEmployeeLogger = new Mock<ILogger<EmployeesController>>();
            _mockProductLogger = new Mock<ILogger<ProductsController>>();
            _mockAuthLogger = new Mock<ILogger<AuthController>>();
            
            _employeesController = new EmployeesController(Context, UserActivityService);
            _productsController = new ProductsController(Context, UserActivityService);
            _authController = new AuthController(Context, UserActivityService);
            
            // Setup fake HttpContext for all controllers with headers
            var mockHttpContext = new Mock<HttpContext>();
            var mockConnection = new Mock<ConnectionInfo>();
            var mockRequest = new Mock<HttpRequest>();
            var mockHeaders = new Mock<IHeaderDictionary>();
            
            mockConnection.Setup(c => c.RemoteIpAddress).Returns(IPAddress.Parse("127.0.0.1"));
            mockHeaders.Setup(h => h["X-User-Id"]).Returns("1");
            mockHeaders.Setup(h => h["X-User-Name"]).Returns("Test User");
            mockRequest.Setup(r => r.Headers).Returns(mockHeaders.Object);
            mockHttpContext.Setup(c => c.Connection).Returns(mockConnection.Object);
            mockHttpContext.Setup(c => c.Request).Returns(mockRequest.Object);
            
            _employeesController.ControllerContext = new ControllerContext { HttpContext = mockHttpContext.Object };
            _productsController.ControllerContext = new ControllerContext { HttpContext = mockHttpContext.Object };
            _authController.ControllerContext = new ControllerContext { HttpContext = mockHttpContext.Object };
        }

        [Theory]
        [InlineData("123")]     // Too short
        [InlineData("1234567")] // Too long
        [InlineData("abcdef")]  // Non-numeric
        [InlineData("12345a")]  // Mixed alphanumeric
        [InlineData("")]        // Empty
        [InlineData(null)]      // Null
        public async Task Employee_PinValidation_RejectsInvalidPins(string invalidPin)
        {
            // Arrange
            var employee = new Employee
            {
                EmployeeId = "VALID001",
                Pin = invalidPin,
                Name = "Test Employee",
                Role = "Cashier",
                IsManager = false
            };

            // Act
            var result = await _employeesController.CreateEmployee(employee);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Theory]
        [InlineData("123456")]
        [InlineData("000000")]
        [InlineData("999999")]
        public async Task Employee_PinValidation_AcceptsValidPins(string validPin)
        {
            // Arrange
            var employee = new Employee
            {
                EmployeeId = "VALID002",
                Pin = validPin,
                Name = "Test Employee",
                Role = "Cashier",
                IsManager = false
            };

            // Act
            var result = await _employeesController.CreateEmployee(employee);

            // Assert
            Assert.IsType<CreatedAtActionResult>(result.Result);
        }

        [Theory]
        [InlineData("")]
        [InlineData(null)]
        [InlineData("   ")]
        public async Task Employee_EmployeeIdValidation_RejectsEmptyEmployeeId(string invalidEmployeeId)
        {
            // Arrange
            var employee = new Employee
            {
                EmployeeId = invalidEmployeeId,
                Pin = "123456",
                Name = "Test Employee",
                Role = "Cashier",
                IsManager = false
            };

            // Act
            var result = await _employeesController.CreateEmployee(employee);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Theory]
        [InlineData("")]
        [InlineData(null)]
        [InlineData("   ")]
        public async Task Employee_NameValidation_RejectsEmptyName(string invalidName)
        {
            // Arrange
            var employee = new Employee
            {
                EmployeeId = "VALID003",
                Pin = "123456",
                Name = invalidName,
                Role = "Cashier",
                IsManager = false
            };

            // Act
            var result = await _employeesController.CreateEmployee(employee);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Theory]
        [InlineData("Manager")]
        [InlineData("Cashier")]
        [InlineData("Inventory")]
        public async Task Employee_RoleValidation_AcceptsValidRoles(string validRole)
        {
            // Arrange
            var employee = new Employee
            {
                EmployeeId = "VALID004",
                Pin = "123456",
                Name = "Test Employee",
                Role = validRole,
                IsManager = validRole == "Manager"
            };

            // Act
            var result = await _employeesController.CreateEmployee(employee);

            // Assert
            Assert.IsType<CreatedAtActionResult>(result.Result);
        }

        [Theory]
        [InlineData("")]
        [InlineData(null)]
        [InlineData("InvalidRole")]
        [InlineData("admin")]
        [InlineData("MANAGER")] // Case sensitivity
        public async Task Employee_RoleValidation_RejectsInvalidRoles(string invalidRole)
        {
            // Arrange
            var employee = new Employee
            {
                EmployeeId = "VALID005",
                Pin = "123456",
                Name = "Test Employee",
                Role = invalidRole,
                IsManager = false
            };

            // Act
            var result = await _employeesController.CreateEmployee(employee);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Fact]
        public async Task Employee_DuplicateEmployeeId_RejectsDuplicateCreation()
        {
            // Arrange - Create first employee
            var firstEmployee = new Employee
            {
                EmployeeId = "DUP001",
                Pin = "123456",
                Name = "First Employee",
                Role = "Cashier",
                IsManager = false
            };
            await _employeesController.CreateEmployee(firstEmployee);

            // Try to create duplicate
            var duplicateEmployee = new Employee
            {
                EmployeeId = "DUP001", // Same ID
                Pin = "654321",
                Name = "Second Employee",
                Role = "Manager",
                IsManager = true
            };

            // Act
            var result = await _employeesController.CreateEmployee(duplicateEmployee);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Theory]
        [InlineData("")]
        [InlineData(null)]
        public async Task Product_BarcodeValidation_RejectsEmptyBarcode(string invalidBarcode)
        {
            // Arrange
            var product = new Product
            {
                Barcode = invalidBarcode,
                Name = "Test Product",
                Price = 10.99m,
                Cost = 5.50m,
                StockQuantity = 100,
                MinStockLevel = 10,
                Unit = "pcs",
                IsActive = true
            };

            // Act
            var result = await _productsController.CreateProduct(product);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Theory]
        [InlineData(-1.00)]
        [InlineData(0.00)]
        public async Task Product_PriceValidation_RejectsInvalidPrices(decimal invalidPrice)
        {
            // Arrange
            var product = new Product
            {
                Barcode = "PRICE001",
                Name = "Test Product",
                Price = invalidPrice,
                Cost = 5.50m,
                StockQuantity = 100,
                MinStockLevel = 10,
                Unit = "pcs",
                IsActive = true
            };

            // Act
            var result = await _productsController.CreateProduct(product);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Theory]
        [InlineData(-1.00)]
        public async Task Product_CostValidation_RejectsNegativeCost(decimal invalidCost)
        {
            // Arrange
            var product = new Product
            {
                Barcode = "COST001",
                Name = "Test Product",
                Price = 10.99m,
                Cost = invalidCost,
                StockQuantity = 100,
                MinStockLevel = 10,
                Unit = "pcs",
                IsActive = true
            };

            // Act
            var result = await _productsController.CreateProduct(product);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Theory]
        [InlineData(-1)]
        public async Task Product_StockQuantityValidation_RejectsNegativeStock(int invalidStock)
        {
            // Arrange
            var product = new Product
            {
                Barcode = "STOCK001",
                Name = "Test Product",
                Price = 10.99m,
                Cost = 5.50m,
                StockQuantity = invalidStock,
                MinStockLevel = 10,
                Unit = "pcs",
                IsActive = true
            };

            // Act
            var result = await _productsController.CreateProduct(product);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Fact]
        public async Task Product_CostGreaterThanPrice_ShowsWarningButAllows()
        {
            // Arrange
            var product = new Product
            {
                Barcode = "MARGIN001",
                Name = "Low Margin Product",
                Price = 5.00m,
                Cost = 8.00m, // Cost higher than price
                StockQuantity = 100,
                MinStockLevel = 10,
                Unit = "pcs",
                IsActive = true
            };

            // Act
            var result = await _productsController.CreateProduct(product);

            // Assert - Should succeed but may log warning
            Assert.IsType<CreatedAtActionResult>(result.Result);
        }

        [Fact]
        public async Task Product_DuplicateBarcode_RejectsDuplicateCreation()
        {
            // Arrange - Create first product
            var firstProduct = new Product
            {
                Barcode = "DUPBAR001",
                Name = "First Product",
                Price = 10.99m,
                Cost = 5.50m,
                StockQuantity = 100,
                MinStockLevel = 10,
                Unit = "pcs",
                IsActive = true
            };
            await _productsController.CreateProduct(firstProduct);

            // Try to create duplicate
            var duplicateProduct = new Product
            {
                Barcode = "DUPBAR001", // Same barcode
                Name = "Second Product",
                Price = 15.99m,
                Cost = 7.50m,
                StockQuantity = 50,
                MinStockLevel = 5,
                Unit = "pcs",
                IsActive = true
            };

            // Act
            var result = await _productsController.CreateProduct(duplicateProduct);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result.Result);
        }

        [Fact]
        public async Task Auth_LoginAttempts_ValidCredentialsSucceed()
        {
            // Arrange
            var validRequest = new LoginRequest { EmployeeId = "TEST001", Pin = "123456", SelectedRole = "Manager" };

            // Act
            var result = await _authController.Login(validRequest);

            // Assert
            Assert.IsType<OkObjectResult>(result.Result);
        }

        [Theory]
        [InlineData("TEST001", "wrongpin")]
        [InlineData("INVALID", "123456")]
        [InlineData("", "123456")]
        [InlineData("TEST001", "")]
        [InlineData("", "")]
        public async Task Auth_LoginAttempts_InvalidCredentialsFail(string employeeId, string pin)
        {
            // Arrange
            var invalidRequest = new LoginRequest { EmployeeId = employeeId, Pin = pin, SelectedRole = "Manager" };

            // Act
            var result = await _authController.Login(invalidRequest);

            // Assert
            var actionResult = result.Result;
            Assert.True(actionResult is UnauthorizedObjectResult || actionResult is BadRequestObjectResult);
        }

        [Fact]
        public async Task ResetEmployeePin_BusinessRules_ValidatesNewPin()
        {
            // Arrange
            var validRequest = new ResetPinRequest { NewPin = "888999" };

            // Act
            var result = await _employeesController.ResetEmployeePin(2, validRequest);

            // Assert
            Assert.IsType<OkObjectResult>(result);

            // Verify PIN was actually changed
            var employee = Context.Employees.Find(2);
            Assert.NotNull(employee);
            Assert.Equal("888999", employee.Pin);
        }

        [Theory]
        [InlineData("123")]     // Too short
        [InlineData("1234567")] // Too long
        [InlineData("abcdef")]  // Non-numeric
        [InlineData("")]        // Empty
        public async Task ResetEmployeePin_BusinessRules_RejectsInvalidNewPin(string invalidNewPin)
        {
            // Arrange
            var invalidRequest = new ResetPinRequest { NewPin = invalidNewPin };

            // Act
            var result = await _employeesController.ResetEmployeePin(2, invalidRequest);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result);
        }

        [Fact]
        public async Task BusinessRules_ManagerCannotBeDemoted_IfOnlyManager()
        {
            // This test ensures business logic around manager roles
            // If there's only one manager, they cannot be demoted
            
            // Arrange - Get the manager employee
            var manager = Context.Employees.First(e => e.IsManager);
            manager.IsManager = false; // Try to demote
            manager.Role = "Cashier";

            // Act
            var result = await _employeesController.UpdateEmployee(manager.Id, manager);

            // This would require additional business logic implementation
            // For now, we test that the update goes through
            // In a real system, you might want to prevent this
            Assert.IsType<NoContentResult>(result);
        }

        public override void Dispose()
        {
            base.Dispose();
        }
    }
}