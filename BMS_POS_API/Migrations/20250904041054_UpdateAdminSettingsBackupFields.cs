using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class UpdateAdminSettingsBackupFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LastBackupMethod",
                table: "admin_settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastBackupPath",
                table: "admin_settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastBackupSize",
                table: "admin_settings",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastBackupMethod",
                table: "admin_settings");

            migrationBuilder.DropColumn(
                name: "LastBackupPath",
                table: "admin_settings");

            migrationBuilder.DropColumn(
                name: "LastBackupSize",
                table: "admin_settings");
        }
    }
}
