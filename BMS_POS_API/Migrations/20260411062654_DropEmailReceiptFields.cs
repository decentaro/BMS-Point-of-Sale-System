using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class DropEmailReceiptFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultReceiptEmail",
                table: "system_settings");

            migrationBuilder.DropColumn(
                name: "EmailReceiptEnabled",
                table: "system_settings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultReceiptEmail",
                table: "system_settings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "EmailReceiptEnabled",
                table: "system_settings",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
    }
}
