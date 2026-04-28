using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;

namespace BMS_POS_API.Tests.Integration.Postgres.UserActivity
{
    [Collection("Postgres")]
    public class UserActivityTests : IntegrationTestBase
    {
        public UserActivityTests(PostgresFixture fixture) : base(fixture) { }

        [Fact]
        public async Task GetActivities_AfterLogin_ReturnsLoginActivity()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/useractivity");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var activities = doc.RootElement.GetProperty("activities").EnumerateArray().ToList();
            activities.Should().NotBeEmpty("login should have generated activity records");
        }

        [Fact]
        public async Task GetActivities_WithActionTypeFilter_ReturnsFilteredResults()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/useractivity?actionType=LOGIN");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var activities = doc.RootElement.GetProperty("activities").EnumerateArray().ToList();
            activities.Should().AllSatisfy(a =>
                a.GetProperty("actionType").GetString().Should().Be("LOGIN"));
        }

        [Fact]
        public async Task GetActivities_LimitAndOffset_Paginated()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/useractivity?limit=1&offset=0");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var activities = doc.RootElement.GetProperty("activities").EnumerateArray().ToList();
            activities.Count.Should().BeLessOrEqualTo(1);
        }

        [Fact]
        public async Task GetSummary_ReturnsAggregatedStats()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory);

            var response = await client.GetAsync("/api/useractivity/summary");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("totalActivities").GetInt32().Should().BeGreaterOrEqualTo(0);
            doc.RootElement.TryGetProperty("activityTypes", out _).Should().BeTrue();
            doc.RootElement.TryGetProperty("topUsers", out _).Should().BeTrue();
        }

        [Fact]
        public async Task CashierCannotAccessActivityLog_Returns403()
        {
            await ResetAndSeedAsync();

            await using var factory = new PosApiFactory(Fixture);
            using var client = await CreateAuthenticatedClientAsync(factory, role: "Cashier");

            var response = await client.GetAsync("/api/useractivity");
            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }
    }
}
