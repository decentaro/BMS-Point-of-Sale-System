using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.UserActivity
{
    [Collection("Postgres")]
    public class UserActivityRareEdgeCaseTests : IntegrationTestBase
    {
        public UserActivityRareEdgeCaseTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task GetActivities_WithUserIdFilter_RestrictsResults()
        {
            await ResetAndSeedAsync();
            var managerId = await GetEmployeeIdAsync(ManagerEmployeeId);

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // Filter by a non-existent user ID — should return empty
            var response = await client.GetAsync("/api/useractivity?userId=999999");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("activities").EnumerateArray().ToList().Should().BeEmpty();
        }

        [Fact]
        public async Task GetActivities_WithActionTypeFilter_FiltersByType()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            // Login logs a "LOGIN" action type
            var response = await client.GetAsync("/api/useractivity?actionType=LOGIN");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var activities = doc.RootElement.GetProperty("activities").EnumerateArray().ToList();
            activities.Should().AllSatisfy(a =>
                a.GetProperty("actionType").GetString().Should().Be("LOGIN"));
        }

        [Fact]
        public async Task GetActivities_WithLimitAndOffset_PaginatesCorrectly()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/useractivity?limit=1&offset=0");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("activities").EnumerateArray().ToList()
                .Should().HaveCountLessOrEqualTo(1);
        }

        [Fact]
        public async Task GetSummary_NoFilters_ReturnsStructure()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/useractivity/summary");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalActivities").GetInt32().Should().BeGreaterOrEqualTo(1,
                "login activity should be counted");
            doc.RootElement.GetProperty("uniqueUsers").GetInt32().Should().BeGreaterOrEqualTo(1);
            doc.RootElement.TryGetProperty("activityTypes", out _).Should().BeTrue();
            doc.RootElement.TryGetProperty("topUsers", out _).Should().BeTrue();
        }

        [Fact]
        public async Task GetActivities_CashierRole_Returns403()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, role: "Cashier");

            var response = await client.GetAsync("/api/useractivity");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden,
                "UserActivityController requires Manager role");
        }

        [Fact]
        public async Task GetSummary_CashierRole_Returns403()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, role: "Cashier");

            var response = await client.GetAsync("/api/useractivity/summary");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
    }
}
