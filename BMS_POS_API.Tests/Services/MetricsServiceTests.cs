using Microsoft.Extensions.Logging;
using Moq;
using Xunit;
using BMS_POS_API.Services;

namespace BMS_POS_API.Tests.Services
{
    public class MetricsServiceTests
    {
        private readonly Mock<ILogger<MetricsService>> _mockLogger;
        private readonly MetricsService _service;

        public MetricsServiceTests()
        {
            _mockLogger = new Mock<ILogger<MetricsService>>();
            _service = new MetricsService(_mockLogger.Object);
        }

        // ── LogLoginAttempt ───────────────────────────────────────────────────

        [Fact]
        public async Task LogLoginAttempt_SuccessfulLogin_LogsInformation()
        {
            await _service.LogLoginAttempt("EMP001", true);

            _mockLogger.Verify(
                x => x.Log(
                    LogLevel.Information,
                    It.IsAny<EventId>(),
                    It.Is<It.IsAnyType>((v, _) => v.ToString()!.Contains("EMP001")),
                    It.IsAny<Exception>(),
                    It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
                Times.Once);
        }

        [Fact]
        public async Task LogLoginAttempt_FailedLogin_LogsWithReason()
        {
            await _service.LogLoginAttempt("EMP001", false, "Invalid PIN");

            _mockLogger.Verify(
                x => x.Log(
                    LogLevel.Information,
                    It.IsAny<EventId>(),
                    It.Is<It.IsAnyType>((v, _) => v.ToString()!.Contains("EMP001")),
                    It.IsAny<Exception>(),
                    It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
                Times.Once);
        }

        [Fact]
        public async Task LogLoginAttempt_NullReason_DoesNotThrow()
        {
            await _service.LogLoginAttempt("EMP002", true, null);
        }

        [Fact]
        public async Task LogLoginAttempt_FailedNoReason_DoesNotThrow()
        {
            await _service.LogLoginAttempt("EMP003", false);
        }

        // ── LogTransaction ────────────────────────────────────────────────────

        [Fact]
        public async Task LogTransaction_StandardSale_LogsInformation()
        {
            await _service.LogTransaction(150.00m, "EMP001", 3);

            _mockLogger.Verify(
                x => x.Log(
                    LogLevel.Information,
                    It.IsAny<EventId>(),
                    It.Is<It.IsAnyType>((v, _) => v.ToString()!.Contains("EMP001")),
                    It.IsAny<Exception>(),
                    It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
                Times.Once);
        }

        [Fact]
        public async Task LogTransaction_ZeroAmount_DoesNotThrow()
        {
            await _service.LogTransaction(0m, "EMP001", 0);
        }

        [Fact]
        public async Task LogTransaction_LargeAmount_DoesNotThrow()
        {
            await _service.LogTransaction(99999.99m, "EMP001", 100);
        }

        [Fact]
        public async Task LogTransaction_SingleItem_DoesNotThrow()
        {
            await _service.LogTransaction(9.99m, "EMP002", 1);
        }

        // ── LogSystemEvent ────────────────────────────────────────────────────

        [Fact]
        public async Task LogSystemEvent_WithEmployeeId_LogsEventType()
        {
            await _service.LogSystemEvent("BACKUP_CREATED", "Backup completed successfully", "EMP001");

            _mockLogger.Verify(
                x => x.Log(
                    LogLevel.Information,
                    It.IsAny<EventId>(),
                    It.Is<It.IsAnyType>((v, _) => v.ToString()!.Contains("BACKUP_CREATED")),
                    It.IsAny<Exception>(),
                    It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
                Times.Once);
        }

        [Fact]
        public async Task LogSystemEvent_NullEmployeeId_UsesFallback()
        {
            // null employeeId should use "system" as default — should not throw
            await _service.LogSystemEvent("STARTUP", "Application started", null);

            _mockLogger.Verify(
                x => x.Log(
                    LogLevel.Information,
                    It.IsAny<EventId>(),
                    It.Is<It.IsAnyType>((v, _) => v.ToString()!.Contains("STARTUP")),
                    It.IsAny<Exception>(),
                    It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
                Times.Once);
        }

        [Fact]
        public async Task LogSystemEvent_NoEmployeeIdParam_DoesNotThrow()
        {
            await _service.LogSystemEvent("SHUTDOWN", "System shutting down");
        }

        [Fact]
        public async Task LogSystemEvent_DatabaseEvent_LogsDetails()
        {
            await _service.LogSystemEvent("DB_CONNECTED", "Database connection established", "SYSTEM");

            _mockLogger.Verify(
                x => x.Log(
                    LogLevel.Information,
                    It.IsAny<EventId>(),
                    It.Is<It.IsAnyType>((v, _) => v.ToString()!.Contains("DB_CONNECTED")),
                    It.IsAny<Exception>(),
                    It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
                Times.Once);
        }

        // ── Interface contract ────────────────────────────────────────────────

        [Fact]
        public async Task MetricsService_ImplementsIMetricsService_AllMethodsCallable()
        {
            IMetricsService service = _service;
            await service.LogLoginAttempt("EMP001", true);
            await service.LogTransaction(100m, "EMP001", 2);
            await service.LogSystemEvent("TEST_EVENT", "Integration check");
        }

        [Fact]
        public async Task LogLoginAttempt_ReturnsCompletedTask()
        {
            var task = _service.LogLoginAttempt("EMP001", true);
            await task;
            Assert.True(task.IsCompleted);
        }

        [Fact]
        public async Task LogTransaction_ReturnsCompletedTask()
        {
            var task = _service.LogTransaction(50m, "EMP001", 1);
            await task;
            Assert.True(task.IsCompleted);
        }

        [Fact]
        public async Task LogSystemEvent_ReturnsCompletedTask()
        {
            var task = _service.LogSystemEvent("TEST", "test");
            await task;
            Assert.True(task.IsCompleted);
        }
    }
}
