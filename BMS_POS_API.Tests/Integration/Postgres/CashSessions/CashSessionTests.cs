using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace BMS_POS_API.Tests.Integration.Postgres.CashSessions
{
    [Collection("Postgres")]
    public class CashSessionTests : IntegrationTestBase
    {
        public CashSessionTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task OpenSession_ValidInput_Returns201()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 500.00m,
                Notes = "Morning shift"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Created, await response.Content.ReadAsStringAsync());

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("status").GetString().Should().Be("Open");
            doc.RootElement.GetProperty("openingCash").GetDecimal().Should().Be(500.00m);
            doc.RootElement.GetProperty("sessionCode").GetString().Should().StartWith("CS-");
        }

        [Fact]
        public async Task OpenSession_DuplicateToday_Returns409()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var first = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 500.00m
            });
            first.StatusCode.Should().Be(HttpStatusCode.Created);

            var second = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 600.00m
            });
            second.StatusCode.Should().Be(HttpStatusCode.Conflict);
        }

        [Fact]
        public async Task OpenSession_InvalidEmployeeId_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = 999999,
                OpeningCash = 500.00m
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CloseSession_ValidInput_Succeeds()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var openResp = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 500.00m
            });
            openResp.StatusCode.Should().Be(HttpStatusCode.Created);

            using var openDoc = JsonDocument.Parse(await openResp.Content.ReadAsStringAsync());
            var sessionId = openDoc.RootElement.GetProperty("id").GetInt32();

            var closeResp = await client.PutAsJsonAsync($"/api/cash-sessions/{sessionId}/close", new
            {
                ClosedByEmployeeId = managerId,
                ClosingCash = 750.00m,
                Notes = "End of day"
            });

            closeResp.StatusCode.Should().Be(HttpStatusCode.OK, await closeResp.Content.ReadAsStringAsync());

            using var closeDoc = JsonDocument.Parse(await closeResp.Content.ReadAsStringAsync());
            closeDoc.RootElement.GetProperty("status").GetString().Should().Be("Closed");
            closeDoc.RootElement.GetProperty("closingCash").GetDecimal().Should().Be(750.00m);
        }

        [Fact]
        public async Task CloseSession_AlreadyClosed_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var openResp = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 500.00m
            });
            using var openDoc = JsonDocument.Parse(await openResp.Content.ReadAsStringAsync());
            var sessionId = openDoc.RootElement.GetProperty("id").GetInt32();

            await client.PutAsJsonAsync($"/api/cash-sessions/{sessionId}/close", new
            {
                ClosedByEmployeeId = managerId,
                ClosingCash = 500.00m
            });

            var response = await client.PutAsJsonAsync($"/api/cash-sessions/{sessionId}/close", new
            {
                ClosedByEmployeeId = managerId,
                ClosingCash = 500.00m
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("already closed");
        }

        [Fact]
        public async Task GetSession_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/cash-sessions/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task GetTodaySession_NoSession_ReturnsNull()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/cash-sessions/today");
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        }

        [Fact]
        public async Task GetTodaySession_SessionExists_ReturnsIt()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 500.00m
            });

            var response = await client.GetAsync("/api/cash-sessions/today");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("status").GetString().Should().Be("Open");
        }

        [Fact]
        public async Task GetSessions_ListsAllSessions()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 500.00m
            });

            var response = await client.GetAsync("/api/cash-sessions");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().HaveCountGreaterOrEqualTo(1);
        }
    }
}
