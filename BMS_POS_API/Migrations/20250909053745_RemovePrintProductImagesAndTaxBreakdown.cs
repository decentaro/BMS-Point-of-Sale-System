using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class RemovePrintProductImagesAndTaxBreakdown : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IncludeTaxBreakdown",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "PrintProductImages",
                table: "system_settings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IncludeTaxBreakdown",
                table: "system_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "PrintProductImages",
                table: "system_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
