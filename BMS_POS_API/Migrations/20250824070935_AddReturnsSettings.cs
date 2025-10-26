using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddReturnsSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AllowDefectiveItemReturns",
                table: "system_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "EnableReturns",
                table: "system_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RequireManagerApprovalForReturns",
                table: "system_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RequireReceiptForReturns",
                table: "system_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RestockReturnedItems",
                table: "system_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "ReturnManagerApprovalAmount",
                table: "system_settings",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ReturnReasons",
                table: "system_settings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "ReturnTimeLimitDays",
                table: "system_settings",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AllowDefectiveItemReturns",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "EnableReturns",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "RequireManagerApprovalForReturns",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "RequireReceiptForReturns",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "RestockReturnedItems",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "ReturnManagerApprovalAmount",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "ReturnReasons",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "ReturnTimeLimitDays",
                table: "system_settings");
        }
    }
}
