using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class DropDeadSettingsFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DecimalSeparator",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "FontScaling",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "ThousandsSeparator",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "LogLevel",
                table: "admin_settings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DecimalSeparator",
                table: "system_settings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<double>(
                name: "FontScaling",
                table: "system_settings",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<string>(
                name: "ThousandsSeparator",
                table: "system_settings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "LogLevel",
                table: "admin_settings",
                type: "text",
                nullable: false,
                defaultValue: "");
        }
    }
}
