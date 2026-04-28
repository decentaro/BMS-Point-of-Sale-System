using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class DropAdminSettingsDeadToggles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CacheEnabled",
                table: "admin_settings");

            migrationBuilder.DropColumn(
                name: "PerformanceMetricsEnabled",
                table: "admin_settings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "CacheEnabled",
                table: "admin_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "PerformanceMetricsEnabled",
                table: "admin_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
