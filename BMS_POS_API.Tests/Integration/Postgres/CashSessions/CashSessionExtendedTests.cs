using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.CashSessions
{
    [Collection("Postgres")]
    public class CashSessionExtendedTests : IntegrationTestBase
    {
        public CashSessionExtendedTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task GetSessions_WithLimit_RespectsLimit()
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

            var response = await client.GetAsync("/api/cash-sessions?limit=1");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().HaveCountLessOrEqualTo(1);
        }

        [Fact]
        public async Task GetSessions_EmptyDatabase_ReturnsEmptyList()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/cash-sessions");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.EnumerateArray().ToList().Should().BeEmpty();
        }

        [Fact]
        public async Task CloseSession_CalculatesVariance()
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
                ClosedByEmployeeId = managerId,
                ClosingCash = 250.00m,
                Notes = "Test close"
            });
            closeResp.StatusCode.Should().Be(HttpStatusCode.OK);

            using var closeDoc = JsonDocument.Parse(await closeResp.Content.ReadAsStringAsync());
            closeDoc.RootElement.GetProperty("closingCash").GetDecimal().Should().Be(250.00m);
            closeDoc.RootElement.GetProperty("openingCash").GetDecimal().Should().Be(200.00m);
        }

        [Fact]
        public async Task OpenSession_NegativeOpeningCash_StillAccepted()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 0.00m
            });
            response.StatusCode.Should().Be(HttpStatusCode.Created,
                "zero opening cash should be allowed");
        }

        [Fact]
        public async Task GetSession_Exists_ReturnsFullDetails()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var openResp = await client.PostAsJsonAsync("/api/cash-sessions/open", new
            {
                EmployeeId = managerId,
                OpeningCash = 100.00m,
                Notes = "Detail test"
            });
            using var openDoc = JsonDocument.Parse(await openResp.Content.ReadAsStringAsync());
            var sessionId = openDoc.RootElement.GetProperty("id").GetInt32();

            var response = await client.GetAsync($"/api/cash-sessions/{sessionId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("id").GetInt32().Should().Be(sessionId);
            doc.RootElement.GetProperty("openingCash").GetDecimal().Should().Be(100.00m);
        }
    }
}
