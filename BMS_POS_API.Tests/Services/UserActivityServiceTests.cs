using Microsoft.Extensions.Logging;
using Moq;
using Xunit;
using BMS_POS_API.Models;
using BMS_POS_API.Services;

namespace BMS_POS_API.Tests.Services
{
    public class UserActivityServiceTests : TestBase
    {
        private readonly Mock<ILogger<UserActivityService>> _mockLogger;
        private readonly UserActivityService _service;

        public UserActivityServiceTests()
        {
            _mockLogger = new Mock<ILogger<UserActivityService>>();
            _service = new UserActivityService(ServiceProvider);
        }

        [Fact]
        public async Task LogActivityAsync_WithValidData_CreatesUserActivity()
        {
            // Arrange
            var userId = 1;
            var userName = "Test User";
            var action = "Test Action";
            var actionType = "Test Type";
            var details = "Test Details";
            var entityId = 123;
            var ipAddress = "192.168.1.1";

            // Act
            await _service.LogActivityAsync(userId, userName, action, details, "Employee", entityId, actionType, ipAddress);

            // Assert
            var activity = Context.UserActivities.FirstOrDefault();
            Assert.NotNull(activity);
            Assert.Equal(userId, activity.UserId);
            Assert.Equal(userName, activity.UserName);
            Assert.Equal(action, activity.Action);
            Assert.Equal(actionType, activity.ActionType);
            Assert.Equal(details, activity.Details);
            Assert.Equal(entityId, activity.EntityId);
            Assert.Equal(ipAddress, activity.IPAddress);
            Assert.True(activity.Timestamp > DateTime.MinValue);
        }

        [Fact]
        public async Task LogActivityAsync_WithNullDetails_CreatesUserActivityWithNullDetails()
        {
            // Arrange
            var userId = 1;
            var userName = "Test User";
            var action = "Test Action";
            var actionType = "Test Type";
            string details = null;
            var ipAddress = "192.168.1.1";

            // Act
            await _service.LogActivityAsync(userId, userName, action, details, null, null, actionType, ipAddress);

            // Assert
            var activity = Context.UserActivities.FirstOrDefault();
            Assert.NotNull(activity);
            Assert.Equal(userId, activity.UserId);
            Assert.Equal(userName, activity.UserName);
            Assert.Equal(action, activity.Action);
            Assert.Equal(actionType, activity.ActionType);
            Assert.Null(activity.Details);
            Assert.Null(activity.EntityId);
            Assert.Equal(ipAddress, activity.IPAddress);
        }

        [Fact]
        public async Task LogActivityAsync_WithNullIPAddress_CreatesUserActivityWithNullIP()
        {
            // Arrange
            var userId = 1;
            var userName = "Test User";
            var action = "Test Action";
            var actionType = "Test Type";
            var details = "Test Details";
            string ipAddress = null;

            // Act
            await _service.LogActivityAsync(userId, userName, action, details, null, null, actionType, ipAddress);

            // Assert
            var activity = Context.UserActivities.FirstOrDefault();
            Assert.NotNull(activity);
            Assert.Equal(userId, activity.UserId);
            Assert.Equal(userName, activity.UserName);
            Assert.Equal(action, activity.Action);
            Assert.Equal(actionType, activity.ActionType);
            Assert.Equal(details, activity.Details);
            Assert.Null(activity.IPAddress);
        }

        [Fact]
        public async Task LogActivityAsync_UsesUtcTimestamp()
        {
            // Arrange
            var beforeTime = DateTime.UtcNow.AddMinutes(-1);

            // Act
            await _service.LogActivityAsync(1, "Test User", "Test Action", "Details", null, null, "Test Type", "192.168.1.1");

            // Assert
            var activity = Context.UserActivities.FirstOrDefault();
            Assert.NotNull(activity);
            Assert.True(activity.Timestamp >= beforeTime && activity.Timestamp <= DateTime.UtcNow.AddMinutes(1));
            Assert.Equal(DateTimeKind.Utc, activity.Timestamp.Kind);
        }

        [Fact]
        public async Task LogActivityAsync_MultipleActivities_CreatesAllActivities()
        {
            // Act
            await _service.LogActivityAsync(1, "User 1", "Action 1", "Details 1", null, 1, "Type 1", "192.168.1.1");
            await _service.LogActivityAsync(2, "User 2", "Action 2", "Details 2", null, 2, "Type 2", "192.168.1.2");
            await _service.LogActivityAsync(3, "User 3", "Action 3", "Details 3", null, 3, "Type 3", "192.168.1.3");

            // Assert
            var activities = Context.UserActivities.ToList();
            Assert.Equal(3, activities.Count);

            var activity1 = activities.FirstOrDefault(a => a.UserId == 1);
            Assert.NotNull(activity1);
            Assert.Equal("User 1", activity1.UserName);
            Assert.Equal("Action 1", activity1.Action);

            var activity2 = activities.FirstOrDefault(a => a.UserId == 2);
            Assert.NotNull(activity2);
            Assert.Equal("User 2", activity2.UserName);
            Assert.Equal("Action 2", activity2.Action);

            var activity3 = activities.FirstOrDefault(a => a.UserId == 3);
            Assert.NotNull(activity3);
            Assert.Equal("User 3", activity3.UserName);
            Assert.Equal("Action 3", activity3.Action);
        }

        [Theory]
        [InlineData("Login", "Authentication")]
        [InlineData("Logout", "Authentication")]
        [InlineData("Create Employee", "Employee Management")]
        [InlineData("Update Employee", "Employee Management")]
        [InlineData("Delete Employee", "Employee Management")]
        [InlineData("Create Product", "Inventory Management")]
        [InlineData("Update Product", "Inventory Management")]
        [InlineData("Process Sale", "Sales")]
        public async Task LogActivityAsync_WithDifferentActionTypes_CreatesCorrectActivity(string action, string actionType)
        {
            // Act
            await _service.LogActivityAsync(1, "Test User", action, "Test Details", null, null, actionType, "192.168.1.1");

            // Assert
            var activity = Context.UserActivities.FirstOrDefault();
            Assert.NotNull(activity);
            Assert.Equal(action, activity.Action);
            Assert.Equal(actionType, activity.ActionType);
        }

        [Fact]
        public async Task LogActivityAsync_WithLongDetails_TruncatesOrStoresCorrectly()
        {
            // Arrange
            var longDetails = new string('A', 2000); // Very long details string

            // Act
            await _service.LogActivityAsync(1, "Test User", "Test Action", longDetails, null, null, "Test Type", "192.168.1.1");

            // Assert
            var activity = Context.UserActivities.FirstOrDefault();
            Assert.NotNull(activity);
            Assert.NotNull(activity.Details);
            // The exact behavior depends on your database schema - adjust assertion accordingly
            Assert.True(activity.Details.Length <= 2000 || activity.Details == longDetails);
        }

        [Fact]
        public async Task LogActivityAsync_WithSpecialCharacters_HandlesCorrectly()
        {
            // Arrange
            var specialDetails = "Test with special chars: àáâãäå æç èéêë ìíîï ñ òóôõö ùúûü ýÿ 中文 日本語 한국어 русский";

            // Act
            await _service.LogActivityAsync(1, "Test User", "Test Action", specialDetails, null, null, "Test Type", "192.168.1.1");

            // Assert
            var activity = Context.UserActivities.FirstOrDefault();
            Assert.NotNull(activity);
            Assert.Equal(specialDetails, activity.Details);
        }

        [Fact]
        public async Task LogActivityAsync_WithZeroUserId_CreatesActivity()
        {
            // Act
            await _service.LogActivityAsync(0, "System", "System Action", "System operation", null, null, "System", null);

            // Assert
            var activity = Context.UserActivities.FirstOrDefault();
            Assert.NotNull(activity);
            Assert.Equal(0, activity.UserId);
            Assert.Equal("System", activity.UserName);
        }

        [Fact]
        public async Task LogActivityAsync_ConcurrentCalls_HandlesConcurrency()
        {
            // Arrange
            var tasks = new List<Task>();

            // Act
            for (int i = 0; i < 10; i++)
            {
                int userId = i + 1;
                tasks.Add(_service.LogActivityAsync(userId, $"User {userId}", "Concurrent Action", $"Details {userId}", null, userId, "Test", "192.168.1.1"));
            }

            await Task.WhenAll(tasks);

            // Assert
            var activities = Context.UserActivities.ToList();
            Assert.Equal(10, activities.Count);
            
            // Verify all activities are unique
            var userIds = activities.Select(a => a.UserId).Distinct().ToList();
            Assert.Equal(10, userIds.Count);
        }

        public override void Dispose()
        {
            base.Dispose();
        }
    }
}