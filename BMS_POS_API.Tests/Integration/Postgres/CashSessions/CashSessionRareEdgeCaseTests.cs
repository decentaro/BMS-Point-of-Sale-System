using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.CashSessions
{
    [Collection("Postgres")]
    public class CashSessionRareEdgeCaseTests : IntegrationTestBase
    {
        public CashSessionRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task CloseSession_NotFound_Returns404()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PutAsJsonAsync("/api/cash-sessions/999999/close", new
            {
                ClosedByEmployeeId = managerId,
                ClosingCash = 100.00m
            });
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
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
                OpeningCash = 200.00m
            });
            using var openDoc = JsonDocument.Parse(await openResp.Content.ReadAsStringAsync());
            var sessionId = openDoc.RootElement.GetProperty("id").GetInt32();

            // Close first time
            var closeResp = await client.PutAsJsonAsync($"/api/cash-sessions/{sessionId}/close", new
            {
                ClosedByEmployeeId = managerId,
                ClosingCash = 250.00m
            });
            closeResp.StatusCode.Should().Be(HttpStatusCode.OK);

            // Close again — should fail
            var secondClose = await client.PutAsJsonAsync($"/api/cash-sessions/{sessionId}/close", new
            {
                ClosedByEmployeeId = managerId,
                ClosingCash = 300.00m
            });
            secondClose.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await secondClose.Content.ReadAsStringAsync()).Should().Contain("already closed");
        }

        [Fact]
        public async Task OpenSession_Duplicate_Returns409()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var first = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 100.00m
            });
            first.StatusCode.Should().Be(HttpStatusCode.Created);

            var second = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 200.00m
            });
            second.StatusCode.Should().Be(HttpStatusCode.Conflict,
                "only one session per terminal per day is allowed");
        }

        [Fact]
        public async Task OpenSession_InvalidEmployee_Returns400()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = 999999,
                OpeningCash = 100.00m
            });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync()).Should().Contain("Invalid employee");
        }

        [Fact]
        public async Task CloseSession_InvalidEmployee_Returns400()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var openResp = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 200.00m
            });
            using var openDoc = JsonDocument.Parse(await openResp.Content.ReadAsStringAsync());
            var sessionId = openDoc.RootElement.GetProperty("id").GetInt32();

            var closeResp = await client.PutAsJsonAsync($"/api/cash-sessions/{sessionId}/close", new
            {
                ClosedByEmployeeId = 999999,
                ClosingCash = 250.00m
            });
            closeResp.StatusCode.Should().Be(HttpStatusCode.BadRequest);
            (await closeResp.Content.ReadAsStringAsync()).Should().Contain("Invalid employee");
        }

        [Fact]
        public async Task GetSessions_StatusFilter_FiltersCorrectly()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // Open a session
            await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 100.00m
            });

            // Filter for "Closed" — should return empty since session is Open
            var response = await client.GetAsync("/api/cash-sessions?status=Closed");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().BeEmpty(
                "filtering by status=Closed should exclude open sessions");
        }

        [Fact]
        public async Task GetSessionById_NotFound_Returns404()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/cash-sessions/999999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }
    }
}
