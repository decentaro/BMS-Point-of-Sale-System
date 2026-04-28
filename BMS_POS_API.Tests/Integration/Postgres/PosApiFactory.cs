using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

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
            builder.UseEnvironment("Development");

            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:DefaultConnection"] = _connectionString
                });
            });
        }
    }
}
