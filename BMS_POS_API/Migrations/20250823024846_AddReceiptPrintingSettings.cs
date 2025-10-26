using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BMS_POS_API.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptPrintingSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultReceiptEmail",
                table: "SystemSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "EmailReceiptEnabled",
                table: "SystemSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IncludeTaxBreakdown",
                table: "SystemSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "PrintProductImages",
                table: "SystemSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "PrintReceiptAutomatically",
                table: "SystemSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "ReceiptCopies",
                table: "SystemSettings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "ReceiptFontSize",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ReceiptHeaderText",
                table: "SystemSettings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReceiptPaperSize",
                table: "SystemSettings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "ShowReceiptPreview",
                table: "SystemSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultReceiptEmail",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "EmailReceiptEnabled",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "IncludeTaxBreakdown",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "PrintProductImages",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "PrintReceiptAutomatically",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "ReceiptCopies",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "ReceiptFontSize",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "ReceiptHeaderText",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "ReceiptPaperSize",
                table: "SystemSettings");

            migrationBuilder.DropColumn(
                name: "ShowReceiptPreview",
                table: "SystemSettings");
        }
    }
}
