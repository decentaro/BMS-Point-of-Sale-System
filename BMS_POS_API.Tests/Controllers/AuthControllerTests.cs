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
    public class AuthControllerTests : TestBase
    {
        private readonly Mock<ILogger<AuthController>> _mockLogger;
        private readonly AuthController _controller;

        public AuthControllerTests()
        {
            _mockLogger = new Mock<ILogger<AuthController>>();
            _controller = new AuthController(Context, UserActivityService);
            
            // Setup fake HttpContext
            var mockHttpContext = new Mock<HttpContext>();
            var mockConnection = new Mock<ConnectionInfo>();
            mockConnection.Setup(c => c.RemoteIpAddress).Returns(IPAddress.Parse("127.0.0.1"));
            mockHttpContext.Setup(c => c.Connection).Returns(mockConnection.Object);
            _controller.ControllerContext = new ControllerContext { HttpContext = mockHttpContext.Object };
        }

        [Fact]
        public async Task Login_WithValidCredentials_ReturnsOkResult()
        {
            // Arrange
            var request = new LoginRequest { EmployeeId = "TEST001", Pin = "123456", SelectedRole = "Manager" };

            // Act
            var result = await _controller.Login(request);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result.Result);
            var response = okResult.Value;
            Assert.NotNull(response);
            
            // User activity logging tested separately
        }

        [Fact]
        public async Task Login_WithInvalidEmployeeId_ReturnsUnauthorized()
        {
            // Arrange
            var request = new LoginRequest { EmployeeId = "INVALID", Pin = "123456", SelectedRole = "Manager" };

            // Act
            var result = await _controller.Login(request);

            // Assert
            var unauthorizedResult = Assert.IsType<UnauthorizedObjectResult>(result.Result);
            var response = unauthorizedResult.Value;
            Assert.NotNull(response);
            
            // Invalid login should not log user activity
        }

        [Fact]
        public async Task Login_WithInvalidPin_ReturnsUnauthorized()
        {
            // Arrange
            var request = new LoginRequest { EmployeeId = "TEST001", Pin = "wrongpin", SelectedRole = "Manager" };

            // Act
            var result = await _controller.Login(request);

            // Assert
            var unauthorizedResult = Assert.IsType<UnauthorizedObjectResult>(result.Result);
            var response = unauthorizedResult.Value;
            Assert.NotNull(response);
        }

        [Fact]
        public async Task Login_WithEmptyCredentials_ReturnsBadRequest()
        {
            // Arrange
            var request = new LoginRequest { EmployeeId = "", Pin = "", SelectedRole = "Manager" };

            // Act
            var result = await _controller.Login(request);

            // Assert
            var badRequestResult = Assert.IsType<BadRequestObjectResult>(result.Result);
            Assert.NotNull(badRequestResult.Value);
        }

        [Fact]
        public async Task Login_WithNullPin_ReturnsBadRequest()
        {
            // Arrange
            var request = new LoginRequest { EmployeeId = "TEST001", Pin = null!, SelectedRole = "Manager" };

            // Act
            var result = await _controller.Login(request);

            // Assert
            var badRequestResult = Assert.IsType<BadRequestObjectResult>(result.Result);
            Assert.NotNull(badRequestResult.Value);
        }

        [Fact]
        public async Task Login_WithManagerCredentials_ReturnsManagerRole()
        {
            // Arrange
            var request = new LoginRequest { EmployeeId = "TEST001", Pin = "123456", SelectedRole = "Manager" };

            // Act
            var result = await _controller.Login(request);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result.Result);
            var response = okResult.Value;
            Assert.NotNull(response);
            
            // Use reflection to check the employee data in response
            var employeeProperty = response.GetType().GetProperty("employee");
            Assert.NotNull(employeeProperty);
            var employee = employeeProperty.GetValue(response) as Employee;
            Assert.NotNull(employee);
            Assert.True(employee.IsManager);
            Assert.Equal("Manager", employee.Role);
        }

        [Fact]
        public async Task Login_WithCashierCredentials_ReturnsCashierRole()
        {
            // Arrange
            var request = new LoginRequest { EmployeeId = "TEST002", Pin = "654321", SelectedRole = "Cashier" };

            // Act
            var result = await _controller.Login(request);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result.Result);
            var response = okResult.Value;
            Assert.NotNull(response);
            
            var employeeProperty = response.GetType().GetProperty("employee");
            Assert.NotNull(employeeProperty);
            var employee = employeeProperty.GetValue(response) as Employee;
            Assert.NotNull(employee);
            Assert.False(employee.IsManager);
            Assert.Equal("Cashier", employee.Role);
        }

        [Theory]
        [InlineData("TEST001", "123456", "Manager", true)]
        [InlineData("TEST002", "654321", "Cashier", false)]
        [InlineData("TEST003", "999888", "Inventory", false)]
        public async Task Login_WithVariousRoles_ReturnsCorrectManagerStatus(string employeeId, string pin, string selectedRole, bool expectedIsManager)
        {
            // Arrange
            var request = new LoginRequest { EmployeeId = employeeId, Pin = pin, SelectedRole = selectedRole };

            // Act
            var result = await _controller.Login(request);

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result.Result);
            var response = okResult.Value;
            Assert.NotNull(response);
            
            var employeeProperty = response.GetType().GetProperty("employee");
            var employee = employeeProperty.GetValue(response) as Employee;
            Assert.Equal(expectedIsManager, employee.IsManager);
        }


        public override void Dispose()
        {
            base.Dispose();
        }
    }
}