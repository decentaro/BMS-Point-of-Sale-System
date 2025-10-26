using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Http;
using Moq;
using Xunit;
using BMS_POS_API.Controllers;
using BMS_POS_API.Models;
using BMS_POS_API.Services;
using System.Net;

namespace BMS_POS_API.Tests.Controllers
{
    public class EmployeesControllerTests : TestBase
    {
        private readonly Mock<ILogger<EmployeesController>> _mockLogger;
        private readonly EmployeesController _controller;

        public EmployeesControllerTests()
        {
            _mockLogger = new Mock<ILogger<EmployeesController>>();
            _controller = new EmployeesController(Context, UserActivityService);
            
            // Setup fake HttpContext with headers
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
            
            _controller.ControllerContext = new ControllerContext { HttpContext = mockHttpContext.Object };
        }

        [Fact]
        public async Task GetEmployees_ReturnsAllEmployees()
        {
            // Act
            var result = await _controller.GetEmployees();

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result.Result);
            var employees = Assert.IsAssignableFrom<IEnumerable<Employee>>(okResult.Value);
            Assert.Equal(3, employees.Count());
        }

        [Fact]
        public async Task GetEmployee_WithValidId_ReturnsEmployee()
        {
            // Act
            var result = await _controller.GetEmployee(1);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result.Result);
            var employee = Assert.IsType<Employee>(okResult.Value);
            Assert.Equal("TEST001", employee.EmployeeId);
            Assert.Equal("Test Manager", employee.Name);
        }

        [Fact]
        public async Task GetEmployee_WithInvalidId_ReturnsNotFound()
        {
            // Act
            var result = await _controller.GetEmployee(999);

            // Assert
            Assert.IsType<NotFoundResult>(result.Result);
        }

        [Fact]
        public async Task CreateEmployee_WithValidData_ReturnsCreatedResult()
        {
            // Arrange
            var newEmployee = new Employee
            {
                EmployeeId = "TEST004",
                Pin = "111222",
                Name = "New Test Employee",
                Role = "Cashier",
                IsManager = false
            };

            // Act
            var result = await _controller.CreateEmployee(newEmployee);

            // Assert
            var createdResult = Assert.IsType<CreatedAtActionResult>(result.Result);
            var employee = Assert.IsType<Employee>(createdResult.Value);
            Assert.Equal("TEST004", employee.EmployeeId);
            Assert.Equal("New Test Employee", employee.Name);

            // Verify it was saved to database
            var savedEmployee = Context.Employees.FirstOrDefault(e => e.EmployeeId == "TEST004");
            Assert.NotNull(savedEmployee);
            Assert.Equal("New Test Employee", savedEmployee.Name);

            // User activity logging tested separately
        }

        [Fact]
        public async Task CreateEmployee_WithDuplicateEmployeeId_ReturnsBadRequest()
        {
            // Arrange
            var duplicateEmployee = new Employee
            {
                EmployeeId = "TEST001", // This already exists in seeded data
                Pin = "555555",
                Name = "Duplicate Employee",
                Role = "Cashier",
                IsManager = false
            };

            // Act
            var result = await _controller.CreateEmployee(duplicateEmployee);

            // Assert
            var badRequestResult = Assert.IsType<BadRequestObjectResult>(result.Result);
            Assert.NotNull(badRequestResult.Value);
        }

        [Fact]
        public async Task UpdateEmployee_WithValidData_ReturnsNoContent()
        {
            // Arrange
            var updatedEmployee = new Employee
            {
                Id = 1,
                EmployeeId = "TEST001",
                Pin = "123456",
                Name = "Updated Test Manager",
                Role = "Senior Manager",
                IsManager = true
            };

            // Act
            var result = await _controller.UpdateEmployee(1, updatedEmployee);

            // Assert
            Assert.IsType<NoContentResult>(result);

            // Verify the employee was updated
            var employee = Context.Employees.Find(1);
            Assert.Equal("Updated Test Manager", employee.Name);
            Assert.Equal("Senior Manager", employee.Role);

            // User activity logging tested separately
        }

        [Fact]
        public async Task UpdateEmployee_WithMismatchedId_ReturnsBadRequest()
        {
            // Arrange
            var employee = new Employee
            {
                Id = 2, // Different from parameter
                EmployeeId = "TEST001",
                Pin = "123456",
                Name = "Test Employee",
                Role = "Manager",
                IsManager = true
            };

            // Act
            var result = await _controller.UpdateEmployee(1, employee);

            // Assert
            Assert.IsType<BadRequestResult>(result);
        }

        [Fact]
        public async Task UpdateEmployee_WithNonExistentId_ReturnsNotFound()
        {
            // Arrange
            var employee = new Employee
            {
                Id = 999,
                EmployeeId = "TEST999",
                Pin = "123456",
                Name = "Non-existent Employee",
                Role = "Manager",
                IsManager = true
            };

            // Act
            var result = await _controller.UpdateEmployee(999, employee);

            // Assert
            Assert.IsType<NotFoundResult>(result);
        }

        [Fact]
        public async Task DeleteEmployee_WithValidId_ReturnsNoContent()
        {
            // Act
            var result = await _controller.DeleteEmployee(3);

            // Assert
            Assert.IsType<NoContentResult>(result);

            // Verify the employee was deleted
            var employee = Context.Employees.Find(3);
            Assert.Null(employee);

            // User activity logging tested separately
        }

        [Fact]
        public async Task DeleteEmployee_WithNonExistentId_ReturnsNotFound()
        {
            // Act
            var result = await _controller.DeleteEmployee(999);

            // Assert
            Assert.IsType<NotFoundResult>(result);
        }

        [Fact]
        public async Task ResetEmployeePin_WithValidEmployeeId_ReturnsOkResult()
        {
            // Arrange
            var request = new ResetPinRequest { NewPin = "999999" };

            // Act
            var result = await _controller.ResetEmployeePin(2, request);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            Assert.NotNull(okResult.Value);

            // Verify the PIN was updated
            var employee = Context.Employees.Find(2);
            Assert.NotNull(employee);
            Assert.Equal("999999", employee.Pin);

            // User activity logging tested separately
        }

        [Fact]
        public async Task ResetEmployeePin_WithInvalidEmployeeId_ReturnsNotFound()
        {
            // Arrange
            var request = new ResetPinRequest { NewPin = "999999" };

            // Act
            var result = await _controller.ResetEmployeePin(999, request);

            // Assert
            Assert.IsType<NotFoundObjectResult>(result);
        }

        [Theory]
        [InlineData("")]
        [InlineData("123")] // Too short
        [InlineData("1234567")] // Too long
        [InlineData("abcdef")] // Non-numeric
        public async Task ResetEmployeePin_WithInvalidPin_ReturnsBadRequest(string invalidPin)
        {
            // Arrange
            var request = new ResetPinRequest { NewPin = invalidPin };

            // Act
            var result = await _controller.ResetEmployeePin(2, request);

            // Assert
            Assert.IsType<BadRequestObjectResult>(result);
        }


        public override void Dispose()
        {
            base.Dispose();
        }
    }
}