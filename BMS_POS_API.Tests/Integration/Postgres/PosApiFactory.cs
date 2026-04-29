using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using BMS_POS_API.Data;

namespace BMS_POS_API.Tests.Integration.Postgres
{
    public class PosApiFactory : WebApplicationFactory<Program>
    {
        private readonly string _connectionString;

        public PosApiFactory(PostgresFixture fixture)
        {
            _connectionString = fixture.ConnectionString;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");

            builder.ConfigureTestServices(services =>
            {
                // Replace DbContext with one pointing at the test Postgres container.
                // ConfigureAppConfiguration is unreliable here because Program.cs reads
                // builder.Configuration during service registration (before Build() fires
                // those callbacks), so we override at the service level instead.
                var toRemove = services
                    .Where(s =>
                        s.ServiceType == typeof(DbContextOptions<BmsPosDbContext>) ||
                        s.ServiceType == typeof(BmsPosDbContext) ||
                        (s.ServiceType.IsGenericType &&
                         s.ServiceType.GetGenericTypeDefinition() == typeof(DbContextOptions<>)))
                    .ToList();
                foreach (var s in toRemove)
                    services.Remove(s);

                services.AddDbContext<BmsPosDbContext>(options =>
                    options.UseNpgsql(_connectionString, npgsql =>
                        npgsql.CommandTimeout(60)));

                // Replace the NpgSql health check (registered with the appsettings.json
                // template string) with a simple always-healthy check for tests.
                var healthChecks = services
                    .Where(s =>
                        s.ServiceType.FullName?.Contains("HealthCheck") == true ||
                        s.ImplementationType?.FullName?.Contains("HealthCheck") == true)
                    .ToList();
                foreach (var s in healthChecks)
                    services.Remove(s);
                services.AddHealthChecks();
            });
        }
    }
}
