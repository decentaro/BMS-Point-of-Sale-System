using BMS_POS_API.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Respawn;

namespace BMS_POS_API.Tests.Integration.Postgres
{
    public class PostgresFixture : IAsyncLifetime
    {
        public string ConnectionString { get; private set; } = string.Empty;

        private Respawner _respawner = null!;
        private NpgsqlConnection _respawnConnection = null!;

        public async Task InitializeAsync()
        {
            var host = Environment.GetEnvironmentVariable("BMS_TEST_DB_HOST") ?? "localhost";
            var port = Environment.GetEnvironmentVariable("BMS_TEST_DB_PORT") ?? "5432";
            var user = Environment.GetEnvironmentVariable("BMS_TEST_DB_USER") ?? "bms_test";
            var password = Environment.GetEnvironmentVariable("BMS_TEST_DB_PASSWORD") ?? "bms_test";
            var database = Environment.GetEnvironmentVariable("BMS_TEST_DB_NAME") ?? "bms_pos_test";

            ConnectionString =
                $"Host={host};Port={port};Username={user};Password={password};Database={database};" +
                "Include Error Detail=true;Timeout=15;Command Timeout=60";

            var options = new DbContextOptionsBuilder<BmsPosDbContext>()
                .UseNpgsql(ConnectionString)
                .Options;

            await using (var ctx = new BmsPosDbContext(options))
            {
                await ctx.Database.MigrateAsync();
            }

            _respawnConnection = new NpgsqlConnection(ConnectionString);
            await _respawnConnection.OpenAsync();

            _respawner = await Respawner.CreateAsync(_respawnConnection, new RespawnerOptions
            {
                DbAdapter = DbAdapter.Postgres,
                SchemasToInclude = new[] { "public" },
                TablesToIgnore = new Respawn.Graph.Table[]
                {
                    new("__EFMigrationsHistory")
                }
            });
        }

        public async Task ResetAsync()
        {
            if (_respawnConnection.State != System.Data.ConnectionState.Open)
                await _respawnConnection.OpenAsync();
            await _respawner.ResetAsync(_respawnConnection);
        }

        public BmsPosDbContext CreateContext()
        {
            var options = new DbContextOptionsBuilder<BmsPosDbContext>()
                .UseNpgsql(ConnectionString)
                .Options;
            return new BmsPosDbContext(options);
        }

        public async Task DisposeAsync()
        {
            if (_respawnConnection != null)
            {
                await _respawnConnection.DisposeAsync();
            }
        }
    }

    [CollectionDefinition("Postgres")]
    public class PostgresCollection : ICollectionFixture<PostgresFixture>
    {
    }
}
