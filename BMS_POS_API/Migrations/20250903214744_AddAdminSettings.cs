using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddAdminSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "admin_settings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CurrentVersion = table.Column<string>(type: "text", nullable: false),
                    UpdateStatus = table.Column<string>(type: "text", nullable: false),
                    AvailableVersion = table.Column<string>(type: "text", nullable: true),
                    UpdateDescription = table.Column<string>(type: "text", nullable: true),
                    RequireStrongPins = table.Column<bool>(type: "boolean", nullable: false),
                    MaxFailedLoginAttempts = table.Column<int>(type: "integer", nullable: false),
                    LogLevel = table.Column<string>(type: "text", nullable: false),
                    PerformanceMetricsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    CacheEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    DatabaseStatus = table.Column<string>(type: "text", nullable: false),
                    LastBackup = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastUpdated = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_admin_settings", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "admin_settings");
        }
    }
}
